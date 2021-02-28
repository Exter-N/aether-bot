import { client } from './discord-client';

export function stop(graceful: boolean): never {
    try {
        client.destroy();
    } catch (e) { }
    process.exit(graceful ? 0 : 1);
}

process.on('uncaughtException', error => {
    console.error(error);
    stop(false);
});
process.on('unhandledRejection', reason => {
    console.error(reason);
    stop(false);
});

process.on('SIGINT', () => {
    stop(true);
});