To run :
```sh
npm install
npx tsc
npm start
```

To stop : Ctrl+C

Required environment variables :
- `DISCORD_TOKEN` : the Discord bot's token
- `FOLLOW_USER` : numerical ID of the user to follow

Environment variables if using an EtherSound source :
- `ETHERSOUND_URL` : EtherSound WebSocket URL
- `ETHERSOUND_SESSION` : persistent ID (GUID) of the EtherSound session
- `ETHERSOUND_SECRET` : EtherSound WebSocket pre-shared secret (may actually be optional depending on the ES WS config)

Environment variables if using a PulseAudio source :
- `PULSEAUDIO_SOURCE` : PulseAudio source name
- `PULSEAUDIO_SAMPLERATE` : Sample rate (for example 44100 or 48000)
- `PULSEAUDIO_CHANNELS` : Number of channels (optional, defaults to 2)
