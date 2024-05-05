import { client, ready } from './discord-client';
import { VoiceChannel } from 'discord.js';
import { join, leave } from './broadcaster';
import './stop';
import './ethersound-client';

if (null == process.env.FOLLOW_USER) {
    throw new Error('Missing environment variable FOLLOW_USER');
}
if (null == process.env.ETHERSOUND_SESSION && null == process.env.PULSEAUDIO_SOURCE) {
    throw new Error('Missing environment variables ETHERSOUND_SESSION and PULSEAUDIO_SOURCE');
}

if (!(0 | process.env.DEBUG as any)) {
    console.debug = function (): void { };
}

function processVoiceChannel(channel: VoiceChannel): void {
    if (channel.members.has(process.env.FOLLOW_USER!) && channel.joinable) {
        join(channel);
    }
}

client.on('channelCreate', channel => {
    if (channel instanceof VoiceChannel) {
        processVoiceChannel(channel);
    }
});

client.on('channelDelete', channel => {
    if (channel instanceof VoiceChannel) {
        leave(channel);
    }
});

client.on('voiceStateUpdate', (oldState, newState) => {
    if (oldState.id === newState.id && oldState.channelId === newState.channelId) {
        return;
    }
    let leaving: VoiceChannel | null = null;
    let joining: VoiceChannel | null = null;
    if (oldState.id === process.env.FOLLOW_USER && null != oldState.channelId) {
        const channel = client.channels.cache.get(oldState.channelId);
        if (channel instanceof VoiceChannel) {
            leaving = channel;
        }
    }
    if (newState.id === process.env.FOLLOW_USER && null != newState.channelId) {
        const channel = client.channels.cache.get(newState.channelId);
        if (channel instanceof VoiceChannel && channel.joinable) {
            joining = channel;
        }
    }
    if (leaving && (!joining || leaving.guild !== joining.guild)) {
        leave(leaving);
    }
    if (joining) {
        join(joining);
    }
});

(async function () {
    await ready;

    for (const channel of client.channels.cache.values()) {
        if (channel instanceof VoiceChannel) {
            processVoiceChannel(channel);
        }
    }
})();
