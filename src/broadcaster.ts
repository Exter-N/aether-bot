import { VoiceChannel, VoiceConnection } from "discord.js";
import { client as discordClient } from "./discord-client";
import { client as etherSoundClient, session as etherSoundSession } from "./ethersound-client";
import { Readable } from 'stream';
import { EtherSoundClient, EtherSoundSession } from "./ethersound";
import { stop } from "./stop";

const connections = new Map<string, VoiceConnection>();

const broadcast = discordClient.voice!.createBroadcast();

export async function join(channel: VoiceChannel): Promise<void> {
    if (connections.has(channel.id)) {
        return;
    }

    const connection = await channel.join();
    connections.set(channel.id, connection);
    connection.play(broadcast);
}

export function leave(channel: VoiceChannel): void {
    if (!connections.has(channel.id)) {
        return;
    }
    const connection = connections.get(channel.id)!;
    connections.delete(channel.id);
    connection.disconnect();
}

export async function move(fromChannel: VoiceChannel, toChannel: VoiceChannel): Promise<void> {
    if (connections.has(toChannel.id) || !connections.has(fromChannel.id)) {
        return;
    }
    const fromConnection = connections.get(fromChannel.id)!;
    const toConnection = await toChannel.join();
    connections.delete(fromChannel.id);
    connections.set(toChannel.id, toConnection);
    if (fromConnection !== toConnection) {
        fromConnection.disconnect();
        toConnection.play(broadcast);
    }
}

class EtherSoundTapStream extends Readable {
    client: EtherSoundClient;
    session: EtherSoundSession;
    started: boolean;
    remaining: number;
    constructor(client: EtherSoundClient, session: EtherSoundSession) {
        super();
        this.client = client;
        this.session = session;
        this.started = false;
        this.onTapData = this.onTapData.bind(this);
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
            const blockAlign = channels * 4;
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
            this.push(header);
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

(async function () {
    const esClient = await etherSoundClient;
    const esSession = await etherSoundSession;

    await esClient.watchSessionProperty(esSession.id, 'sampleRate');
    await esClient.watchSessionProperty(esSession.id, 'channelMask');

    await esClient.openTapStream(esSession.id);

    function play() {
        const stream = new EtherSoundTapStream(esClient, esSession);

        broadcast.play(stream, {
            type: 'unknown',
            volume: false,
            bitrate: 'auto',
            highWaterMark: 1,
        });

        stream.on('end', () => {
            stream.destroy();
            play();
        });
    }

    play();
})();