# RuneScape Map Viewer

[Website](https://osrs.world) | [Discord](https://discord.gg/WfEWPE5wUd)

A webapp for exploring current and historical versions of RuneScape.

<img src="screenshots/lumbridge.png" alt="Lumbridge">

## Running locally

```
$ git clone https://github.com/dennisdev/rs-map-viewer.git
$ cd rs-map-viewer
$ yarn install
$ yarn run download-caches
$ yarn start
```

## Mario and controllers

With the WebGL renderer selected, use **Play as Mario → Choose ROM** to select your
own unmodified US Super Mario 64 `.z64` ROM (8 MiB, SHA-1
`9bef1128717f958171a4afac3ed78ee2bb4e86ce`). The file is checked and read locally;
it is never uploaded or saved. Mario spawns on a floor beneath the camera after
the map loads. **Return to camera** leaves Mario mode; **Respawn** resets Mario
near his current position. Changing cache, map detail, or renderer leaves Mario
mode, so choose the ROM again afterward.

Connect a standard Xbox/PlayStation-compatible controller, press a button, and
click the map to give it focus. Controllers already connected at startup and
reconnections are detected automatically.

| Action                | Controller               | Keyboard / mouse    |
| --------------------- | ------------------------ | ------------------- |
| Move Mario            | Left stick               | WASD                |
| Orbit camera          | Right stick              | Drag / pointer lock |
| Jump / swim           | A / Cross                | Space               |
| Attack                | X / Square or B / Circle | X                   |
| Crouch / ground pound | Either trigger           | Shift               |

Mario's voice, footsteps, effects, and optional background music are synthesized
by libsm64 from the locally supplied ROM and played as stereo audio through Web
Audio. Use **Enable audio** if the browser requires another click before playback.
**Mute** silences all audio; **Music** toggles background music while preserving
effects. Losing map focus or hiding the tab pauses simulation and queued audio.
Leaving Mario mode closes the audio context.

Terrain and static map geometry provide collision, and Mario shares the map's
depth buffer. Animated scenery, NPC interactions, water volumes, and camera-wall
collision are not implemented. Older caches may be needed when newer revisions
use opcodes the viewer does not yet support; revision 215 (2023-07-26) was used
for integration checks.

### Rebuilding libsm64

The generated browser runtime is included under `public/libsm64`, with no ROM or
extracted textures/audio assets. It is built from
[libsm64](https://github.com/libsm64/libsm64) revision
`fd11813208272b4271d92bd92feb8f3fdbe61be5`; its CC0 license is included alongside it.
To rebuild, install Git, Make, Python 3, and Emscripten **4.0.19**, activate the SDK
(`source /path/to/emsdk/emsdk_env.sh`), then run:

```sh
yarn build-libsm64
node scripts/libsm64/smoke.cjs
yarn test --watchAll=false --runInBand
yarn build
```

The build fetches the pinned source into ignored `.cache/libsm64` and upstream's
pinned Mario geometry definitions. `LIBSM64_SOURCE=/path/to/libsm64` can reuse a
checkout at the same revision. ROM-dependent animation, gameplay, and sound must
also be checked with a supported local ROM; automated checks cover input mapping,
simulation timing, pausing, collision conversion, stereo PCM scheduling, and real
WASM floor queries without ROM assets.

ROM-backed smoke checks also verified Mario geometry, movement, jumping, and
sound effects without music. Browser checks with a simulated standard gamepad
verified movement on a real map, nonzero Web Audio output, mute/music controls,
and audio-context shutdown. No ROM assets are included in the repository.

## GitHub Pages

The `Deploy GitHub Pages` workflow builds, tests, and publishes on pushes to
`master` or `feature/libsm64`, and supports `workflow_dispatch`. Both branches
publish to the same Pages site.

In repository **Settings → Pages**, set **Source** to **GitHub Actions**. If the
`github-pages` environment restricts deployment branches, allow `feature/libsm64`
as well as `master`. Push the branch to run the workflow; its deployment job
reports the published URL. No personal access token is needed.

The workflow uses Node 24.19.0 and Yarn 1.22.22, checks types and tests, and builds
with the base path supplied by GitHub Pages. Existing ESLint warnings remain
visible without failing the production build; test, type, and compilation errors
still fail deployment. The checked-in libsm64 browser runtime is used directly.

`scripts/prepare-pages.cjs` downloads OpenRS2 cache **1447**, revision **215**
(2023-07-26), caches it between builds, and copies only map data and keys into
the Pages artifact. This is the compatible cache used for Mario integration
checks. The published artifact is about 143 MiB and contains no SM64 ROM assets.
Users select their own ROM locally after opening the site.

To reproduce a project-site build locally:

```sh
PUBLIC_URL=/rs-map-viewer CI=false yarn build
node scripts/prepare-pages.cjs
```

Serve `build/` at `/rs-map-viewer/` on a static server. Root-domain/custom-domain
deployments use an empty `PUBLIC_URL`. Cache and asset paths follow this base
path, and ordinary buffers are copied to workers when the host cannot enable
shared memory with cross-origin isolation headers.

## Credits

-   Jagex
-   [libsm64](https://github.com/libsm64/libsm64) and the [SM64 decompilation project](https://github.com/n64decomp/sm64) - Mario simulation, geometry, and audio engine
-   [RuneLite](https://github.com/runelite/runelite)
-   [OpenRS2 Archive](https://archive.openrs2.org/) - Caches
-   [RuneScape Archive](https://rs-archive.github.io/) - Caches
-   [OSRS Wiki](https://oldschool.runescape.wiki/) - Item spawns
-   [2004scape](https://github.com/2004scape/Server) - Npc spawns
-   [2009scape](https://gitlab.com/2009scape/2009scape) - Npc spawns
-   [RuneStar](https://github.com/RuneStar/fonts) - Fonts
-   [Blurite](https://github.com/blurite/pathfinder) - Some pathfinding stuff
-   [RuneApps Model Viewer](https://github.com/skillbert/rsmv) - Some procedural texture stuff
