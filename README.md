# God's Eye View

A spy-satellite simulator in the browser — live aircraft, modeled ships,
satellites, earthquakes, fires, and launches on a 3D globe. The data is public.
The cockpit is the point.

**Inspired by [Bilawal Sidhu](https://github.com/bilawalsidhu)’s
[God's Eye View](https://github.com/bilawalsidhu/gods-eye-view)** (MIT).
The original is the source of the concept, the name, and the feeling. This
repository is a separate web recreation, not a copy of that source tree. If
you like this, go star his project.

> Public data · not for navigation.

## Try it

- First mission: **Live contacts**, **Space missions**, **Environmental**, or explore empty
- Drag to orbit, scroll to zoom, click a contact to lock it
- **Cockpit** for first person · **D** detection boxes · **1–6** optical / CRT / NVG / FLIR / Noir / Snow
- Command bar: `take me to Tokyo`, `track nearest aircraft`, `night vision`
- Share copies the camera and layers

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

See [CREDITS.md](./CREDITS.md). Original project:
[github.com/bilawalsidhu/gods-eye-view](https://github.com/bilawalsidhu/gods-eye-view).

## License

[MIT](./LICENSE) for this source. Third-party feeds and imagery stay under
their own terms.
