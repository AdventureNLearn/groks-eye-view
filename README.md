# Grok's Eye View

A meme spy-satellite cockpit over a real 3D Earth. Live aircraft, modeled ships,
satellites, quakes, fires, launches. The data is public. Grok is just being
dramatic about it.

**Inspired by [Bilawal Sidhu](https://github.com/bilawalsidhu)’s
[God's Eye View](https://github.com/bilawalsidhu/gods-eye-view)** (MIT).
The original is the source of the idea and the feeling. This is a separate web
recreation with a Grok-shaped personality, not a copy of that source tree.
If you like the concept, go star his project.

> Public data · not for navigation.

## Try it

- First look: **Planes, please**, **Space junk**, **The planet is yelling**, or just the globe
- Drag to orbit, scroll to zoom, click a contact to lock it
- **Cockpit** = you are the plane now · **D** detection boxes · **1–6** optical / CRT / NVG / FLIR / Noir / Snow
- Command bar: `yo tokyo`, `find a plane`, `night vision`
- Share copies the camera for the group chat

## Run

```bash
npm install
npm run dev
```

Cesium assets are copied from `node_modules/cesium` at dev/build time. No
Google 3D tiles, no accounts, no database.

Optional: `XAI_API_KEY` on the server lets the command bar parse free-form
language. Local parsers still work without it.

## Stack

TanStack Start · React 19 · CesiumJS · satellite.js · Zustand

## Credits

See [CREDITS.md](./CREDITS.md). Original:
[github.com/bilawalsidhu/gods-eye-view](https://github.com/bilawalsidhu/gods-eye-view).

## License

[MIT](./LICENSE) for this source. Third-party feeds and imagery stay under
their own terms.
