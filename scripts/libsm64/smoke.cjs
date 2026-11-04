/* Exercise the real compiled WASM collision API without requiring copyrighted ROM assets. */
const assert = require("node:assert/strict");
const createLibSM64 = require("../../public/libsm64/libsm64.js");

(async () => {
    const m = await createLibSM64();
    function surfaces(vertices) {
        const data = Int32Array.from(vertices);
        const pointer = m._malloc(data.byteLength);
        m.HEAP32.set(data, pointer / 4);
        assert.equal(m._rs64_surfaces(pointer, data.length / 9), 1);
        m._free(pointer);
    }
    surfaces([-500, 0, -500, 500, 0, 500, 500, 0, -500, -500, 0, -500, -500, 0, 500, 500, 0, 500]);
    assert.ok(Math.abs(m._rs64_floor(0, 100, 0)) < 0.001, "floor at the origin");
    assert.ok(m._rs64_floor(1000, 100, 0) < -10000, "no invented floor outside geometry");
    surfaces([
        -500, 0, -500, 500, 100, 500, 500, 100, -500, -500, 0, -500, -500, 0, 500, 500, 100, 500,
    ]);
    assert.ok(
        Math.abs(m._rs64_floor(0, 200, 0) - 50) < 0.001,
        "sloped floor after collision replacement",
    );
    surfaces([
        -500, 0, 300, 500, 300, 400, 500, 0, 300, -500, 0, 300, -500, 300, 400, 500, 300, 400,
    ]);
    assert.ok(
        Math.abs(m._rs64_floor(0, 200, 350) - 150) < 0.001,
        "a steep slope remains a floor at its actual height",
    );
    assert.ok(
        m._rs64_floor(1000, 1000, 350) < -10000,
        "steep floors do not extend outside their triangle footprint",
    );
    surfaces([-500, 0, 300, 500, 300, 300, 500, 0, 300]);
    assert.ok(m._rs64_floor(0, 500, 300) < -10000, "a vertical wall remains a wall");
    // Cell edges, negative coordinates and the brute-force path outside the index.
    for (const center of [-33000, -32768, -129, -128, -1, 0, 127, 128, 32767, 33000]) {
        surfaces([
            center - 200, 25, -200, center + 200, 25, 200, center + 200, 25, -200,
            center - 200, 25, -200, center - 200, 25, 200, center + 200, 25, 200,
        ]);
        for (const offset of [-199, -128, -1, 0, 1, 128, 199]) {
            assert.equal(m._rs64_floor(center + offset, 100, 0), 25, "indexed floor across cell boundaries");
        }
        assert.ok(m._rs64_floor(center, 100, 201) < -10000, "index never invents geometry");
    }
    m._rs64_terminate();
    console.log(
        "libsm64 WASM: flat floor, missing floor, sloped floor, replacement and teardown passed.",
    );
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
