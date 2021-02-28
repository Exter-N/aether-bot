import { EtherSoundClient } from "./ethersound";
import { stop } from "./stop";

if (null == process.env.ETHERSOUND_URL) {
    throw new Error('Missing environment variable ETHERSOUND_URL');
}
if (null == process.env.ETHERSOUND_SESSION) {
    throw new Error('Missing environment variable ETHERSOUND_SESSION');
}

export const client = EtherSoundClient.create(process.env.ETHERSOUND_URL!);

export const session = client.then(async cl => {
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