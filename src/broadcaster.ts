import { VoiceChannel } from "discord.js";
import { NoSubscriberBehavior, StreamType, createAudioPlayer, createAudioResource, getVoiceConnection, joinVoiceChannel } from "@discordjs/voice";
import { get as getEtherSound } from "./ethersound-client";
import { Readable } from 'stream';
import { spawn, ChildProcess } from 'child_process';
import { EtherSoundClient, EtherSoundSession } from "./ethersound";

const broadcast = createAudioPlayer({
    behaviors: {
        noSubscriber: NoSubscriberBehavior.Play,
    }
});

export async function join(channel: VoiceChannel): Promise<void> {
    joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator,
    }).subscribe(broadcast);
}

export function leave(channel: VoiceChannel): void {
    getVoiceConnection(channel.guild.id)?.destroy();
}

function createWavHeader(channels: number, sampleRate: number, bytesPerSample: number): Buffer {
    const blockAlign = channels * bytesPerSample;
    const byteRate = blockAlign * sampleRate;

    const header = Buffer.alloc(44);
    header.writeUInt32LE(0x46464952,  0); // Chunk ID         = "RIFF"
    header.writeUInt32LE(0xFFFFFFFF,  4); // Chunk size
    header.writeUInt32LE(0x45564157,  8); // Format           = "WAVE"
    header.writeUInt32LE(0x20746D66, 12); // Sub-chunk 1 ID   = "fmt "
    header.writeUInt32LE(        16, 16); // Sub-chunk 1 size
    header.writeUInt16LE(         3, 20); // Audio format     = floating point (3)
    header.writeUInt16LE(  channels, 22); // Channel count
    header.writeUInt32LE(sampleRate, 24); // Sample rate
    header.writeUInt32LE(  byteRate, 28); // Bytes per second
    header.writeUInt16LE(blockAlign, 32); // Block alignment
    header.writeUInt16LE(        32, 34); // Bits per sample
    header.writeUInt32LE(0x61746164, 36); // Sub-chunk 2 ID   = "data"
    header.writeUInt32LE(0xFFFFFFFF, 40); // Sub-chunk 2 size

    return header;
}

class EtherSoundTapStream extends Readable {
    readonly client: EtherSoundClient;
    readonly session: EtherSoundSession;
    started: boolean;
    remaining: number;
    constructor(client: EtherSoundClient, session: EtherSoundSession) {
        super();
        this.client = client;
        this.session = session;
        this.onTapData = this.onTapData.bind(this);
        this.started = false;
        this.remaining = 0;
    }
    onTapData(session: number, data: Buffer) {
        if (session !== this.session.id) {
            return;
        }

        this.remaining -= data.length;
        if (this.remaining < 0) {
            this.push(null);
        }
        this.push(data);
    }
    _read(size: number): void {
        if (!this.started) {
            const sampleRate = this.session.sampleRate!;
            let channelMask = this.session.channelMask!;
            let channels = 0;
            while (0 != channelMask) {
                ++channels;
                channelMask &= channelMask - 1;
            }
            this.push(createWavHeader(channels, sampleRate, 4));
            this.remaining = 0xFFFFFFFF - 44;
            this.client.on('tapData', this.onTapData);
            this.started = true;
        }
    }
    _destroy(error: Error | null, callback: (error: Error | null) => void): void {
        if (this.started) {
            this.client.off('tapData', this.onTapData);
            this.started = false;
        }
        callback(error);
    }
}

class PulseAudioMonitorStream extends Readable {
    readonly sourceName: string;
    readonly sampleRate: number;
    readonly channels: number;
    child: ChildProcess | null;
    pid: number | null;
    started: boolean;
    remaining: number;
    constructor(sourceName: string, sampleRate: number, channels: number) {
        super();
        this.sourceName = sourceName;
        this.sampleRate = sampleRate;
        this.channels = channels;
        this.onExit = this.onExit.bind(this);
        this.onStdoutData = this.onStdoutData.bind(this);
        this.onStderrData = this.onStderrData.bind(this);
        this.child = null;
        this.pid = null;
        this.started = false;
        this.remaining = 0;
    }
    onExit(code: number | null, signal: string | null): void {
        console.error('Reaping exited PaMon (' + this.pid + ')');
        this.push(null);
    }
    onStdoutData(data: Buffer): void {
        this.remaining -= data.length;
        if (this.remaining < 0) {
            this.push(null);
        }

        this.push(data);
    }
    onStderrData(data: Buffer): void {
        process.stderr.write(data);
    }
    _read(size: number): void {
        if (!this.started) {
            this.child = spawn('pamon', [
                '-d', this.sourceName,
                '-n', 'Æther',
                '--rate=' + this.sampleRate,
                '--format=float32le',
                '--channels=' + this.channels,
                '--latency=' + this.calculateBufferSize(),
                '--volume=65536',
            ], {
                stdio: [ 0, 'pipe', 'pipe' ],
            });
            this.push(createWavHeader(this.channels, this.sampleRate, 4));
            this.remaining = 0xFFFFFFFF - 44;
            this.child.on('exit', this.onExit);
            this.child.stdout.on('data', this.onStdoutData);
            this.child.stderr.on('data', this.onStderrData);
            this.pid = this.child.pid;
            this.started = true;
        }
    }
    _destroy(error: Error | null, callback: (error: Error | null) => void): void {
        if (this.started) {
            this.child?.kill();
            this.child = null;
            this.started = false;
        }
        callback(error);
    }
    private calculateBufferSize() {
        let size = Math.ceil(this.sampleRate * this.channels / 100);

        return 1 << (32 - Math.clz32(size));
    }
}

async function playWithEtherSound() {
    const { client: etherSoundClient, session: etherSoundSession } = getEtherSound();

    const esClient = await etherSoundClient;
    const esSession = await etherSoundSession;

    await esClient.watchSessionProperty(esSession.id, 'sampleRate');
    await esClient.watchSessionProperty(esSession.id, 'channelMask');

    await esClient.openTapStream(esSession.id);

    function play() {
        const stream = new EtherSoundTapStream(esClient, esSession);

        broadcast.play(createAudioResource(stream, {
            inlineVolume: false,
            silencePaddingFrames: 0,
        }));

        stream.on('end', () => {
            stream.destroy();
            play();
        });
    }

    play();
}

async function playWithPulseAudio() {
    const sourceName = process.env.PULSEAUDIO_SOURCE;
    if (null == sourceName) {
        throw new Error('Missing environment variable PULSEAUDIO_SOURCE');
    }

    const rawSampleRate = process.env.PULSEAUDIO_SAMPLERATE;
    if (null == rawSampleRate) {
        throw new Error('Missing environment variable PULSEAUDIO_SAMPLERATE');
    }
    const sampleRate = parseInt(rawSampleRate);
    if (isNaN(sampleRate)) {
        throw new Error('Environment variable PULSEAUDIO_SAMPLERATE must be an integer');
    }

    const rawChannels = process.env.PULSEAUDIO_CHANNELS;
    const channels = (null == rawChannels || '' === rawChannels) ? 2 : parseInt(rawChannels);
    if (isNaN(channels)) {
        throw new Error('Environment variable PULSEAUDIO_CHANNELS must be an integer');
    }

    function play() {
        const stream = new PulseAudioMonitorStream(sourceName!, sampleRate, channels);

        broadcast.play(createAudioResource(stream, {
            inlineVolume: false,
            silencePaddingFrames: 0,
        }));

        stream.on('end', () => {
            stream.destroy();
            play();
        });
    }

    play();
}

if (null != process.env.ETHERSOUND_URL) {
    playWithEtherSound();
} else if (null != process.env.PULSEAUDIO_SOURCE) {
    playWithPulseAudio();
} else {
    throw new Error('Missing environment variables ETHERSOUND_* and PULSEAUDIO_*');
}
