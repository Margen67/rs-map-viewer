/* Optional integration checks against a user-owned ROM; never used by public CI. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const crypto = require("node:crypto");
const createLibSM64 = require("../../public/libsm64/libsm64.js");

(async () => {
    if (!process.argv[2])
        throw new Error("Usage: node scripts/libsm64/rom-smoke.cjs /path/to/US.z64");
    const rom = fs.readFileSync(process.argv[2]);
    assert.equal(
        crypto.createHash("sha1").update(rom).digest("hex"),
        "9bef1128717f958171a4afac3ed78ee2bb4e86ce",
        "supported US ROM",
    );
    const m = await createLibSM64();
    const pointer = m._malloc(rom.length);
    m.HEAPU8.set(rom, pointer);
    m._rs64_init(pointer);
    m._free(pointer);
    try {
        const atlas = m._rs64_effects();
        for (let frame = 0; frame < 20; frame++) {
            let alpha = 0;
            for (let y = 0; y < 32; y++)
                for (let x = 0; x < 32; x++)
                    alpha += m.HEAPU8[atlas + (y * 640 + frame * 32 + x) * 4 + 3];
            assert.ok(alpha > 0, `ROM effect frame ${frame}`);
        }
        function surfaces(vertices) {
            const data = Int32Array.from(vertices),
                p = m._malloc(data.byteLength);
            m.HEAP32.set(data, p / 4);
            assert.equal(m._rs64_surfaces(p, data.length / 9), 1);
            m._free(p);
        }
        function tick(x = 0, y = 0, b = 0) {
            m._rs64_tick(0, 1, x, y, 0, b, 0);
        }
        const position = () =>
            Array.from(m.HEAPF32.subarray(m._rs64_position() / 4, m._rs64_position() / 4 + 3));
        const floor = [
            -6000, 0, -6000, 6000, 0, 6000, 6000, 0, -6000, -6000, 0, -6000, -6000, 0, 6000, 6000,
            0, 6000,
        ];
        surfaces(floor);
        function movementTrace(speed) {
            m._rs64_speed(speed);
            assert.ok(m._rs64_spawn(0, 30, 0) >= 0);
            for (let i = 0; i < 30; i++) tick();
            const start = position();
            const distance = [];
            for (let i = 0; i < 60; i++) {
                tick(0, -1);
                distance.push(Math.hypot(position()[0] - start[0], position()[2] - start[2]));
            }
            assert.ok(m._rs64_spawn(0, 30, 0) >= 0);
            for (let i = 0; i < 30; i++) tick();
            const jump = [];
            for (let i = 0; i < 60; i++) {
                tick(0, 0, i === 0 ? 1 : 0);
                jump.push([position()[1], m._rs64_action()]);
            }
            return { distance, jump };
        }
        const normalMovement = movementTrace(1),
            fastMovement = movementTrace(2);
        for (const frame of [4, 9, 29, 59])
            assert.ok(
                Math.abs(fastMovement.distance[frame] - normalMovement.distance[frame] * 2) < 0.1,
                `speed scales acceleration and travel at frame ${frame}`,
            );
        assert.deepEqual(
            fastMovement.jump,
            normalMovement.jump,
            "speed does not change jump height, gravity or action timing",
        );
        m._rs64_speed(1);
        for (const slope of [0.0875, 0.364, 0.7]) {
            const tilted = floor.map((v, i) =>
                i % 3 === 1 ? Math.round(floor[i - 1] * slope) : v,
            );
            surfaces(tilted);
            assert.ok(m._rs64_spawn(0, 30, 0) >= 0);
            for (let i = 0; i < 90; i++) tick();
            const start = position();
            for (let i = 0; i < 90; i++) tick();
            assert.ok(
                Math.hypot(position()[0] - start[0], position()[2] - start[2]) < 2,
                `idle grip on slope ${slope}`,
            );
        }
        // Stock floor behavior: steeper surfaces slide, but are still finite floors.
        for (const gradient of [1.0, 2.0]) {
            const tilted = floor.map((value, i) =>
                i % 3 === 1 ? Math.round(floor[i - 1] * gradient) : value,
            );
            surfaces(tilted);
            assert.ok(
                Math.abs(m._rs64_floor(100, 100 * gradient + 100, 0) - 100 * gradient) < 1,
                "steep floor follows its actual plane",
            );
            assert.ok(m._rs64_spawn(500, 500 * gradient + 30, 0) >= 0);
            const start = position();
            let slid = false;
            for (let i = 0; i < 60; i++) {
                tick();
                if (m._rs64_action() & 0x40000) slid = true;
            }
            assert.ok(slid, `native slide action on gradient ${gradient}`);
            assert.ok(position()[0] < start[0] - 100, `downhill movement on gradient ${gradient}`);
        }
        surfaces([
            ...floor,
            -1000,
            0,
            300,
            1000,
            300,
            301,
            1000,
            0,
            300,
            -1000,
            0,
            300,
            -1000,
            300,
            301,
            1000,
            300,
            301,
        ]);
        for (const [start, direction] of [
            [0, -1],
            [600, 1],
        ]) {
            assert.ok(m._rs64_spawn(0, 30, start) >= 0);
            for (let i = 0; i < 90; i++) tick();
            for (let i = 0; i < 90; i++) tick(0, direction);
            assert.ok(
                start === 0 ? position()[2] < 290 : position()[2] > 340,
                "near-vertical wall blocks from either side",
            );
        }
        // A finite wall below Mario must not become an infinitely tall blocker.
        surfaces([
            ...floor.map((value, i) => (i % 3 === 1 ? 600 : value)),
            -1000,
            0,
            300,
            1000,
            300,
            300,
            1000,
            0,
            300,
            -1000,
            0,
            300,
            -1000,
            300,
            300,
            1000,
            300,
            300,
        ]);
        assert.ok(m._rs64_spawn(0, 630, 0) >= 0);
        for (let i = 0; i < 90; i++) tick(0, -1);
        assert.ok(position()[2] > 400, "walks above the top of a finite wall");
        surfaces(floor.map((value, i) => (i % 3 === 1 ? -700 : value)));
        assert.ok(m._rs64_spawn(0, -300, 0) >= 0);
        for (let i = 0; i < 90; i++) {
            m._rs64_environment(0, -700, -11000);
            tick(0, 0, i % 10 === 0 ? 1 : 0);
            assert.ok(position()[1] >= -700, "swimming remains above the seabed");
        }
        assert.ok(m._rs64_action() & 0x2000, "native swimming action");
        assert.ok(position()[1] <= -75 && position()[1] > -150, "swims at the water surface");
        m._rs64_move(position()[0], -900, position()[2]);
        m._rs64_environment(0, -700, -11000);
        tick();
        assert.ok(position()[1] >= -700, "cannot swim through the bottom of the world");
        surfaces([
            ...floor.map((value, i) => (i % 3 === 1 ? -700 : value)),
            -1000,
            0,
            100,
            1000,
            0,
            2000,
            1000,
            0,
            100,
            -1000,
            0,
            100,
            -1000,
            0,
            2000,
            1000,
            0,
            2000,
        ]);
        assert.ok(m._rs64_spawn(0, -80, 0) >= 0);
        for (let i = 0; i < 30; i++) {
            m._rs64_environment(0, -700, -11000);
            tick();
        }
        const beforeShore = position();
        assert.equal(m._rs64_shore_jump(0, 150, 0), 1, "reachable bank starts a water jump");
        assert.deepEqual(position(), beforeShore, "shore jump does not teleport upward");
        m._rs64_environment(0, -700, -11000);
        tick();
        assert.ok(
            position()[1] > beforeShore[1] && position()[1] - beforeShore[1] <= 44,
            "shore exit rises through native jump physics",
        );
        for (let i = 0; i < 50; i++) {
            m._rs64_environment(position()[2] < 100 ? 0 : -11000, -700, -11000);
            tick();
        }
        assert.ok(
            position()[2] > 100 && Math.abs(position()[1]) < 1,
            "water jump lands on the bank",
        );
        assert.ok(m._rs64_spawn(0, -350, 0) >= 0);
        for (let i = 0; i < 30; i++) {
            m._rs64_environment(0, -700, -11000);
            tick();
        }
        m._rs64_move(0, -350, 0);
        const deepStart = position()[1];
        assert.equal(
            m._rs64_shore_jump(0, 150, 0),
            2,
            "deep swimmers ascend toward a reachable bank first",
        );
        for (let i = 0; i < 100; i++) {
            m._rs64_environment(position()[2] < 100 ? 0 : -11000, -700, -11000);
            m._rs64_shore_jump(0, 150, 0);
            tick();
        }
        assert.ok(
            position()[1] > deepStart && position()[2] > 100 && Math.abs(position()[1]) < 1,
            "deep swimmer rises and jumps onto the bank",
        );
        surfaces([
            ...floor.map((value, i) => (i % 3 === 1 ? -700 : value)),
            -1000,
            135,
            100,
            1000,
            135,
            2000,
            1000,
            135,
            100,
            -1000,
            135,
            100,
            -1000,
            135,
            2000,
            1000,
            135,
            2000,
        ]);
        assert.ok(m._rs64_spawn(0, -80, 0) >= 0);
        for (let i = 0; i < 30; i++) {
            m._rs64_environment(0, -700, -11000);
            tick();
        }
        assert.equal(m._rs64_shore_jump(0, 150, 0), 1, "jumps toward a raised reachable bank");
        for (let i = 0; i < 50; i++) {
            m._rs64_environment(position()[2] < 100 ? 0 : -11000, -700, -11000);
            tick();
        }
        assert.ok(
            position()[2] > 100 && Math.abs(position()[1] - 135) < 1,
            "lands on a raised bank",
        );
        surfaces(floor);
        assert.ok(m._rs64_spawn(0, 30, 0) >= 0);
        let burned = false;
        for (let i = 0; i < 45; i++) {
            m._rs64_environment(-11000, -11000, 0);
            tick();
            if (m._rs64_action() === 0x010208b7) burned = true; // ACT_LAVA_BOOST
        }
        assert.ok(burned, "native lava boost");
        assert.ok(m._rs64_health() < 0x880, "lava deals damage");
        m._rs64_environment(-11000, -11000, -11000);
        surfaces(floor);
        m._rs64_spawn(0, 30, 0);
        for (let i = 0; i < 90; i++) tick();
        let hit = false,
            peak = 0,
            flags = 0;
        for (let i = 0; i < 100; i++) {
            tick(0, 0, i === 0 ? 1 : 0);
            if (!hit && m._rs64_attack(0, 0, 100, 180)) {
                hit = true;
                m._rs64_enemy_sound();
            }
            flags |= m._rs64_particles();
            const frames = m._rs64_audio_tick(0),
                p = m._rs64_audio_buffer() / 2;
            for (const sample of m.HEAP16.subarray(p, p + frames * 2))
                peak = Math.max(peak, Math.abs(sample));
        }
        assert.ok(hit && peak > 0, "native punch window and ROM hit/death sounds");
        assert.ok(flags & 1, "native movement dust flag");
        const triangles = m._rs64_triangles();
        m._rs64_move(100, 0, 0);
        assert.equal(m._rs64_triangles(), triangles, "paused resize retains the last render pose");
        m._rs64_stomp(0, 180, 0);
        assert.equal(m.HEAPF32[m._rs64_velocity() / 4 + 1], 30, "stomp bounce");
        function audioPeak(ticks) {
            let peak = 0;
            for (let i = 0; i < ticks; i++) {
                const frames = m._rs64_audio_tick(0),
                    p = m._rs64_audio_buffer() / 2;
                for (const sample of m.HEAP16.subarray(p, p + frames * 2))
                    peak = Math.max(peak, Math.abs(sample));
            }
            return peak;
        }
        m._rs64_volumes(0, 0);
        audioPeak(120);
        assert.ok(audioPeak(3) <= 2, "both native mixer gains mute their own sources");
        m._rs64_song(3);
        m._rs64_music(1);
        m._rs64_volumes(0, 1);
        assert.ok(audioPeak(30) > 0, "music remains audible with effects muted");
        m._rs64_volumes(1, 0);
        audioPeak(120);
        m._rs64_enemy_sound();
        assert.ok(audioPeak(20) > 0, "effects remain audible with music muted");
        m._rs64_music(0);
        m._rs64_volumes(0.5, 0.3);
        surfaces([
            ...floor,
            -1000,
            300,
            -1000,
            1000,
            300,
            -1000,
            1000,
            300,
            1000,
            -1000,
            300,
            -1000,
            1000,
            300,
            1000,
            -1000,
            300,
            1000,
            -1000,
            301,
            -1000,
            1000,
            301,
            1000,
            1000,
            301,
            -1000,
            -1000,
            301,
            -1000,
            -1000,
            301,
            1000,
            1000,
            301,
            1000,
        ]);
        assert.ok(m._rs64_spawn(0, 400, 0) >= 0);
        for (let i = 0; i < 90; i++) tick();
        assert.ok(
            Math.abs(position()[1] - 301) < 1,
            "upward support above a ceiling prevents roof leakage",
        );
        console.log(
            "ROM checks passed: 20 effect frames, slope grip and native sliding, two-sided near-vertical walls, attacks, dust, audio, pose retention, stomp bounce, swimming, finite seabed, shore jumps, movement speed, separate mixer gains, support caps, and lava burn passed.",
        );
    } finally {
        m._rs64_terminate();
    }
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
