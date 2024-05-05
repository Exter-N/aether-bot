import { Client, GatewayIntentBits, Partials } from 'discord.js';

if (null == process.env.DISCORD_TOKEN) {
    throw new Error('Missing environment variable DISCORD_TOKEN');
}

export const client: Client = new Client({
    partials: [ Partials.Message, Partials.Channel, Partials.User, Partials.GuildMember ],
    intents: [ GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates ],
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
