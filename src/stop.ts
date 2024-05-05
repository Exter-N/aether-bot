import { client } from './discord-client';

let stopping = false;

export function stop(graceful: boolean): void {
    if (stopping) {
        process.exit(1);
    }
    stopping = true;

    try {
        client.destroy()
            .then(() => {
                process.exit(graceful ? 0 : 1);
            })
            .catch(() => {
                process.exit(1);
            });
    } catch (e) {
        process.exit(1);
    }
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
process.on('SIGTERM', () => {
    stop(true);
});
process.on('SIGHUP', () => {
    stop(true);
});
