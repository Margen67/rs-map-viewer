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
own unmodified US Super Mario 64 `.z64` ROM (or a ZIP containing it) (8 MiB, SHA-1
`9bef1128717f958171a4afac3ed78ee2bb4e86ce`). The file is checked and read locally;
it is never uploaded or saved. Mario spawns on a floor beneath the camera after
the map loads. **Return to camera** leaves Mario mode; **Respawn** resets Mario
near his current position. Changing cache, map detail, or renderer leaves Mario
mode. The validated ROM stays in memory for the session; use **Play as Mario**
to return without choosing it again. Changing renderer releases that memory.

The picker also accepts a **ROM URL**. For automatic loading, use
`?rom=` followed by the URL encoded with `encodeURIComponent`, for example
`?rom=https%3A%2F%2Fexample.com%2Fmario.zip`. The remote server must allow CORS.
ZIPs are opened locally and the extracted US ROM is validated before native
loading; no ROM is uploaded or saved. The `rom` parameter remains in the URL when
the camera moves.

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

**E** or **Y / Triangle** opens or closes a nearby door or gate. The door swings
with its collision mesh and plays the ROM door sound.

Mario's voice, footsteps, effects, and optional background music are synthesized
by libsm64 from the locally supplied ROM and played as stereo audio through Web
Audio. Use **Enable audio** if the browser requires another click before playback.
**Mute** silences all audio; **Music** toggles background music while preserving
effects. Losing map focus or hiding the tab pauses simulation and queued audio.
Leaving Mario mode closes the audio context. Entering Mario mode selects a
random SM64 background song. Use the song menu and **Previous / Next** to choose
or cycle tracks; a manually chosen song is retained when re-entering Mario mode.

The **Mario size** slider ranges from 0.5× to 3× (default 1.9×), updating the mesh,
collision scale, and camera target together. **Mario speed** ranges from 0.25×
to 3× and scales horizontal movement speed and acceleration on the ground, in the
air, and while swimming. Physics stays at 30 Hz; gravity, jump height, and action
timers keep their normal timing. Separate **Sound effects** and **Music volume**
sliders default to 50% and 30%; mute silences both without changing their levels.
Gains are applied independently to native sound and music sequence players.

**Mario interpolation** is enabled by default. The rendered mesh and follow
camera use the same interpolated position between the unchanged 30 Hz physics
steps. Turn it off to inspect raw simulation poses.

Enable **Show collision** in Mario controls to overlay the mesh wireframe. Green
marks gentle floors, yellow steep/sliding slopes (about 38° and above), orange
near-vertical walls, and purple ceilings. **Show through
scenery** reveals occluded triangles, including the seabed. In Mario mode this
uses the exact streamed native mesh and updates with doors and animations; in
camera mode it previews nearby collision without needing a ROM. This overlay
covers mesh collision, not NPC combat hitboxes. **Water and lava** shows actual
liquid surface triangles in cyan and red. RuneScape navigation flags are no longer
shown in these colors and never create Mario collision.

Ordinary floors use SM64's default surface class: gentle slopes grip, and steep
slopes slide at the native threshold of roughly 38 degrees. The native near-vertical
wall cutoff (normal Y ±0.01) is preserved. Collision keeps one
outward face per triangle and handles slanted walls and thin fences from either
side. Dust, stomp smoke, sparkles, and poof clouds are extracted from your ROM at
runtime; no extracted assets are included in the site.

Native attack windows knock nearby NPCs back and poof them with ROM sounds and
particles. Landing on a head while descending squashes the NPC, bounces Mario,
and produces stomp smoke followed by a dust poof. NPC body contact blocks
movement. Reactions pause with Mario and reset when leaving Mario mode or
reloading the map. RuneScape death animations and effects are not used.

Terrain, static geometry, and solid animated scenery provide collision. Animated
colliders follow the rendered frame and terrain contour, and Mario shares the
map's depth buffer. Static and animated objects follow the scene's player-blocking
flags, without collision generated from pathfinding barriers. Roughly 1/8-tile
high clutter is omitted, including low grass, debris, pebbles and lava bubbles;
roofs, broad paving and genuinely thin walkable platforms retain support.
Terrain uses the original rendered triangles without raised support caps. Scenery
wall tops and roof undersides retain bounded support; sloped faces are never
flattened into platforms. Non-blocking
paving provides foot support without adding side walls.
Only visible mesh faces collide; steep surfaces and scenery have finite bounds.
Hidden NPCs do not create contact blockers. Vanilla OSRS water textures provide
native swimming with a finite seabed four tiles below the rendered surface, a
small overlap at tile edges, and wet-side recovery to prevent edge fall-through. Mario
automatically jumps toward a reachable bank while swimming into it. Vanilla lava textures and the wilderness's untextured lava surfaces trigger SM64's burn bounce,
damage, sounds and animation. Unrecognized/custom liquid materials need explicit
classification. Camera-wall collision is not implemented; moving platforms do
not yet carry Mario automatically. Older caches may be needed when newer revisions
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

The build applies `scripts/libsm64/patch-collision.py` to a generated copy of the
pinned native collision source to adapt wall classification and contact
resolution to RuneScape meshes. The upstream source file is left intact.
ROM effect offsets follow `n64decomp/sm64` asset metadata at
`9921382a68bb0c865e5e45eb594d9c64db59b1af`. Optional ROM checks exercise slope grip,
walls from both sides, particle frames, hit sounds, and bounce behavior:

```sh
node scripts/libsm64/rom-smoke.cjs /path/to/your/US.z64
```

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

`scripts/prepare-pages.cjs` publishes the complete normal viewer catalog (currently
972 snapshots). Available snapshots download on demand from OpenRS2 and remain in
the browser cache. Currently 954 have an exact OpenRS2 match; the remaining 18
stay listed with an availability message because their original host blocks
cross-origin browser reads. No cache payloads are committed or included in Pages.
Mario's audio and effects come from the ROM users select locally; no ROM assets
are published. Large snapshots use one worker on hosts without shared memory to
avoid making four copies of cache data.

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
