import { EtherSoundClient, EtherSoundSession } from "./ethersound";
import { stop } from "./stop";

let cached: Exports | null = null;

interface Exports {
    client: Promise<EtherSoundClient>;
    session: Promise<EtherSoundSession>;
}

export function get(): Exports {
    if (null != cached) {
        return cached;
    }

    if (null == process.env.ETHERSOUND_URL) {
        throw new Error('Missing environment variable ETHERSOUND_URL');
    }
    if (null == process.env.ETHERSOUND_SESSION) {
        throw new Error('Missing environment variable ETHERSOUND_SESSION');
    }

    const client = EtherSoundClient.create(process.env.ETHERSOUND_URL!);

    const session = client.then(async cl => {
        cl.on('close', () => stop(false));

        if (process.env.ETHERSOUND_SECRET && cl.canAuthenticate) {
            await cl.authenticate(process.env.ETHERSOUND_SECRET);
        }

        await cl.watchSessionProperty(null, 'persistentId');

        const session = cl.root.sessions.find(s => s.persistentId === process.env.ETHERSOUND_SESSION);
        if (null == session) {
            throw new Error('EtherSound session not found');
        }

        return session;
    });

    cached = {
        client,
        session,
    };

    return cached;
}
