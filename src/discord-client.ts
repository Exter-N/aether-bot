import { Client, Intents } from 'discord.js';

if (null == process.env.DISCORD_TOKEN) {
    throw new Error('Missing environment variable DISCORD_TOKEN');
}

export const client: Client = new Client({
    messageCacheLifetime: 900,
    messageSweepInterval: 300,
    partials: [ 'MESSAGE', 'CHANNEL', 'REACTION', 'USER', 'GUILD_MEMBER' ],
    ws: {
        intents: Intents.FLAGS.GUILDS | Intents.FLAGS.GUILD_VOICE_STATES,
    },
});

process.nextTick(() => {
    client.login(process.env.DISCORD_TOKEN!);
});

export const ready: Promise<void> = new Promise<void>(resolve => {
    if (null != client.readyAt) {
        console.info('Discord bot @' + client.user!.tag + ' <' + client.user!.id + '> ready');
        resolve();
    } else {
        client.once('ready', () => {
            console.info('Discord bot @' + client.user!.tag + ' <' + client.user!.id + '> ready');
            resolve();
        });
    }
});
