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
        surfaces([
            ...floor,
            -1000,
            0,
            300,
            1000,
            300,
            400,
            1000,
            0,
            300,
            -1000,
            0,
            300,
            -1000,
            300,
            400,
            1000,
            300,
            400,
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
                "slanted wall blocks from either side",
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
        console.log(
            "ROM checks passed: 20 effect frames, slope grip, two-sided slanted walls, attacks, dust, audio, pose retention and stomp bounce.",
        );
    } finally {
        m._rs64_terminate();
    }
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
