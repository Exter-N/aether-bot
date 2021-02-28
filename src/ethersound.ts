import WebSocket from 'ws';
import BSON from 'bson';
import { EventEmitter } from 'events';

interface JsonRpcNotification {
    method: string;
    params: any;
}

export interface WASDevice {
    Id: string;
    FriendlyName: string;
    Flow: number;
    State: number;
    SampleRate: number;
    Channels: number;
    DefaultFor: number;
}

export interface WASSourceConfiguration {
    Id?: string | null;
    FriendlyName?: string | null;
    Flow?: number;
    Role?: number;
}

export interface WASSinkConfiguration {
    Id?: string | null;
    FriendlyName?: string | null;
    Role?: number;
}

export interface NetworkSinkConfiguration {
    BindAddress?: string | null;
    PeerAddress?: string | null;
    PeerService?: string | null;
}

export interface SessionConfiguration {
    SampleRate?: number | null;
    Channels?: number;
    Source?: WASSourceConfiguration;
    WASSink?: WASSinkConfiguration | null;
    NetworkSink?: NetworkSinkConfiguration | null;
}

type EtherSoundRootWritableProperty = 'muted';
type EtherSoundRootReadableProperty = 'masterVolume' | EtherSoundRootWritableProperty;

export class EtherSoundRoot {
    sessions: EtherSoundSession[];
    masterVolume?: number;
    muted?: boolean;
    constructor() {
        this.sessions = [];
    }
}

type EtherSoundSessionWritableProperty = 'color' | 'masterVolume' | 'muted' | 'maxMasterVolume' | 'silenceThreshold' | 'averagingWeight' | 'saturationThreshold' | 'saturationDebounceFactor' | 'saturationRecoveryFactor';
type EtherSoundSessionReadableProperty = 'persistentId' | 'name' | 'valid' | 'sampleRate' | 'channelMask' | 'monitorVolume' | 'tapWriteCursorDelta' | EtherSoundSessionWritableProperty;

export class EtherSoundSession {
    id: number;
    channels: Map<number, EtherSoundChannel>;
    persistentId?: string;
    name?: string;
    valid?: boolean;
    color?: number;
    masterVolume?: number;
    muted?: boolean;
    sampleRate?: number;
    channelMask?: number;
    maxMasterVolume?: number;
    silenceThreshold?: number;
    averagingWeight?: number;
    saturationThreshold?: number;
    saturationDebounceFactor?: number;
    saturationRecoveryFactor?: number;
    monitorVolume?: number;
    tapWriteCursorDelta?: number;
    constructor(id: number) {
        this.id = id;
        this.channels = new Map();
    }
}

type EtherSoundChannelWritableProperty = 'volume';
type EtherSoundChannelReadableProperty = EtherSoundChannelWritableProperty;

export class EtherSoundChannel {
    id: number;
    volume?: number;
    constructor(id: number) {
        this.id = id;
    }
}

export class EtherSoundClient extends EventEmitter {
    private _last: number;
    private _ongoing: Map<number, { resolve: (value: any) => void, reject: (reason?: any) => void }>;
    private _socket: WebSocket;
    permissions: number;
    canAuthenticate: boolean;
    root: EtherSoundRoot;
    sessionIds: number[];
    sessions: Map<number, EtherSoundSession>;
    constructor(url: string) {
        super();
        this._last = 0;
        this._ongoing = new Map();
        this._socket = new WebSocket(url, "ethersound");
        this._socket.binaryType = "arraybuffer";
        this._socket.onopen = event => this._onOpen(event);
        this._socket.onclose = event => this._onClose(event);
        this._socket.onmessage = event => this._onMessage(event);
        this._socket.onerror = event => this._onError(event);
        this.permissions = 0;
        this.canAuthenticate = false;
        this.root = new EtherSoundRoot();
        this.sessionIds = [];
        this.sessions = new Map();
    }

    static create(url: string): Promise<EtherSoundClient> {
        return new Promise<EtherSoundClient>((resolve, reject) => {
            const client = new EtherSoundClient(url);
            let pending = 2;
            function unsub() {
                client.off('permissionsChanged', maybeResolve);
                client.off('sessionsChanged', maybeResolve);
                client.off('error', maybeReject);
            }
            function maybeResolve() {
                if (--pending === 0) {
                    resolve(client);
                    unsub();
                }
            }
            function maybeReject(event: WebSocket.ErrorEvent) {
                reject(event);
                unsub();
            }

            client.once('permissionsChanged', maybeResolve);
            client.once('sessionsChanged', maybeResolve);
            client.once('error', maybeReject);
        });
    }

    _onOpen(event: WebSocket.OpenEvent): void {
        this.emit('open', event);
    }
    _onClose(event: WebSocket.CloseEvent): void {
        this.emit('close', event);
    }
    _onMessage(event: WebSocket.MessageEvent): void {
        const data = (event.data instanceof ArrayBuffer)
            ? BSON.deserialize(event.data)
            : JSON.parse(event.data as string);
        if ('id' in data && this._ongoing.has(data.id)) {
            const { resolve, reject } = this._ongoing.get(data.id)!;
            this._ongoing.delete(data.id);
            if ('error' in data) {
                reject(data.error);
            } else {
                resolve(data.result);
            }
        } else {
            this._onNotification(data);
        }
    }
    _onError(event: WebSocket.ErrorEvent): void {
        if (!this.emit('error', event)) {
            console.error(event);
        }
    }
    _onNotification(data: JsonRpcNotification): void {
        const { method, params } = data;
        switch (method) {
            case 'PermissionsChanged':
                this._onPermissionsChanged(params.Permissions, params.CanAuthenticate);
                break;
            case 'SessionsChanged':
                this._onSessionsChanged(params.Ids);
                break;
            case 'RootPropertyChanged':
                this._onRootPropertyChanged(params.Property, params.Value);
                break;
            case 'SessionPropertyChanged':
                this._onSessionPropertyChanged(params.Session, params.Property, params.Value);
                break;
            case 'ChannelPropertyChanged':
                this._onChannelPropertyChanged(params.Session, params.Channel, params.Property, params.Value);
                break;
            case 'TapData':
                this._onTapData(params.Session, params.Data.buffer);
                break;
            default:
                this.emit('notification', method, params);
                break;
        }
    }

    _onPermissionsChanged(permissions: number, canAuthenticate: boolean): void {
        this.permissions = permissions;
        this.canAuthenticate = canAuthenticate;

        this.emit('permissionsChanged', permissions, canAuthenticate);
    }

    _onSessionsChanged(ids: number[]): void {
        this.sessionIds = ids;
        const expiredIds = [];
        for (const id of this.sessions.keys()) {
            if (ids.indexOf(id) < 0) {
                expiredIds.push(id);
            }
        }
        for (const id of expiredIds) {
            this.sessions.delete(id);
        }
        for (const id of ids) {
            if (!this.sessions.has(id)) {
                this.sessions.set(id, new EtherSoundSession(id));
            }
        }
        this.root.sessions = ids.map(id => this.sessions.get(id)!);

        this.emit('sessionsChanged', ids);
    }

    _onRootPropertyChanged(property: string, value: any): void {
        property = property.charAt(0).toLowerCase() + property.slice(1);
        const previous = (this.root as any)[property];
        (this.root as any)[property] = value;

        this.emit('rootPropertyChanged', property, value, previous);
    }
    _onSessionPropertyChanged(session: number, property: string, value: any): void {
        const s = this.sessions.get(session);
        if (!s) {
            return;
        }
        property = property.charAt(0).toLowerCase() + property.slice(1);
        const previous = (s as any)[property];
        (s as any)[property] = value;
        if (property === 'channelMask') {
            const ids = [];
            let ch = value;
            while (0 !== ch) {
                ids.push(ch & -ch);
                ch &= ch - 1;
            }
            const expiredIds = [];
            for (const id of s.channels.keys()) {
                if (ids.indexOf(id) < 0) {
                    expiredIds.push(id);
                }
            }
            for (const id of expiredIds) {
                s.channels.delete(id);
            }
            for (const id of ids) {
                if (!s.channels.has(id)) {
                    s.channels.set(id, new EtherSoundChannel(id));
                }
            }
        }

        this.emit('sessionPropertyChanged', session, property, value, previous);
    }
    _onChannelPropertyChanged(session: number, channel: number, property: string, value: any): void {
        const s = this.sessions.get(session);
        if (!s) {
            return;
        }
        property = property.charAt(0).toLowerCase() + property.slice(1);
        let c = s.channels.get(channel);
        if (!c) {
            c = new EtherSoundChannel(channel);
            s.channels.set(channel, c);
        }
        const previous = (c as any)[property];
        (c as any)[property] = value;

        this.emit('channelPropertyChanged', session, property, value, previous);
    }

    _onTapData(session: number, data: Buffer): void {
        this.emit('tapData', session, data);
    }

    invoke(method: string, params: any): Promise<any> {
        const id = ++this._last;
        this._socket.send(JSON.stringify({ method, params, id }));

        return new Promise<any>((resolve, reject) => {
            this._ongoing.set(id, { resolve, reject });
        });
    }
    get isOpen(): boolean {
        return this._socket.readyState === 1;
    }
    close(): void {
        this._socket.close();
    }

    authenticate(secret: string): Promise<boolean> {
        return this.invoke('Authenticate', { Secret: secret });
    }

    watchRootProperty(property: EtherSoundRootReadableProperty): Promise<void> {
        return this.invoke('WatchRootProperty', { Property: property.charAt(0).toUpperCase() + property.slice(1) });
    }
    watchSessionProperty(session: number | null, property: EtherSoundSessionReadableProperty): Promise<void> {
        return this.invoke('WatchSessionProperty', { Session: session, Property: property.charAt(0).toUpperCase() + property.slice(1) });
    }
    watchChannelProperty(session: number | null, property: EtherSoundChannelReadableProperty): Promise<void> {
        return this.invoke('WatchChannelProperty', { Session: session, Property: property.charAt(0).toUpperCase() + property.slice(1) });
    }
    unwatchRootProperty(property: EtherSoundRootReadableProperty): Promise<void> {
        return this.invoke('UnwatchRootProperty', { Property: property.charAt(0).toUpperCase() + property.slice(1) });
    }
    unwatchSessionProperty(session: number | null, property: EtherSoundSessionReadableProperty): Promise<void> {
        return this.invoke('UnwatchSessionProperty', { Session: session, Property: property.charAt(0).toUpperCase() + property.slice(1) });
    }
    unwatchChannelProperty(session: number | null, property: EtherSoundChannelReadableProperty): Promise<void> {
        return this.invoke('UnwatchChannelProperty', { Session: session, Property: property.charAt(0).toUpperCase() + property.slice(1) });
    }

    setRootProperty(property: EtherSoundRootWritableProperty, value: Exclude<EtherSoundRoot[typeof property], undefined>): Promise<void> {
        return this.invoke('SetRootProperty', { Property: property.charAt(0).toUpperCase() + property.slice(1), Value: value });
    }
    setSessionProperty(session: number, property: EtherSoundSessionWritableProperty, value: Exclude<EtherSoundSession[typeof property], undefined>): Promise<void> {
        return this.invoke('SetSessionProperty', { Session: session, Property: property.charAt(0).toUpperCase() + property.slice(1), Value: value });
    }
    setChannelProperty(session: number, channel: number, property: EtherSoundChannelWritableProperty, value: Exclude<EtherSoundChannel[typeof property], undefined>): Promise<void> {
        return this.invoke('SetChannelProperty', { Session: session, Channel: channel, Property: property.charAt(0).toUpperCase() + property.slice(1), Value: value });
    }

    addSession(params: SessionConfiguration): Promise<number> {
        return this.invoke('AddSession', Object.assign({ }, params));
    }
    removeSession(session: number): Promise<void> {
        return this.invoke('RemoveSession', { Session: session });
    }
    querySessionConfiguration(session: number): Promise<SessionConfiguration> {
        return this.invoke('QuerySessionConfiguration', { Session: session });
    }
    configureSession(session: number, params: SessionConfiguration): Promise<any> {
        return this.invoke('ConfigureSession', Object.assign({ }, params, { Session: session }));
    }
    setSessionPosition(session: number, position: number): Promise<void> {
        return this.invoke('SetSessionPosition', { Session: session, Position: position });
    }
    restartSession(session: number): Promise<void> {
        return this.invoke('RestartSession', { Session: session });
    }
    restartAllSessions(): Promise<void> {
        return this.invoke('RestartAllSessions', { });
    }
    enumerateDevices(): Promise<WASDevice[]> {
        return this.invoke('EnumerateDevices', { });
    }

    openTapStream(session: number): Promise<void> {
        return this.invoke('OpenTapStream', { Session: session });
    }
    closeTapStream(session: number): Promise<void> {
        return this.invoke('CloseTapStream', { Session: session });
    }
}