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
- `ETHERSOUND_URL` : EtherSound WebSocket URL
- `ETHERSOUND_SESSION` : persistent ID (GUID) of the EtherSound session
- `ETHERSOUND_SECRET` : EtherSound WebSocket pre-shared secret (may actually be optional depending on the ES WS config)
