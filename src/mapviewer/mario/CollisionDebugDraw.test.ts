import { collisionDebugLines } from "./CollisionDebugDraw";

test("wireframe matches native coordinates, winding classifications, and all three edges", () => {
    const triangles = new Int32Array([
        0, 0, 0, 0, 0, 2, 2, 0, 0, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2,
    ]);
    const { positions, colors } = collisionDebugLines(triangles, 10, 20, 2);
    expect(positions.length).toBe(54);
    expect(Array.from(positions.subarray(0, 6))).toEqual([10, 0, 20, 10, 0, 21]);
    expect(positions[18 + 5]).toBe(20);
    expect(positions[18 + 13]).toBe(-1);
    expect(Array.from(colors.subarray(0, 3))).toEqual(Array.from(new Float32Array([0.2, 1, 0.3])));
    expect(Array.from(colors.subarray(18, 21))).toEqual(
        Array.from(new Float32Array([1, 0.55, 0.1])),
    );
    expect(Array.from(colors.subarray(36, 39))).toEqual(
        Array.from(new Float32Array([0.8, 0.4, 1])),
    );
    expect(collisionDebugLines(new Int32Array(9), 0, 0, 1).positions).toHaveLength(0);
});

test("debug distinguishes steep sliding floors from walls using the native cutoff", () => {
    const lines = collisionDebugLines(new Int32Array([0, 0, 0, 128, 256, 0, 0, 0, -128]), 0, 0, 1);
    expect(Array.from(lines.colors.subarray(0, 3))).toEqual(
        Array.from(new Float32Array([1, 1, 0.15])),
    );
});

test("gentle floors remain green, steep floors are yellow, and near-vertical faces are orange", () => {
    const color = (rise: number) =>
        Array.from(
            collisionDebugLines(
                new Int32Array([0, 0, 0, 10000, Math.round(rise), 0, 0, 0, -10000]),
                0,
                0,
                1,
            ).colors.subarray(0, 3),
        );
    expect(color(10000 * Math.tan((37 * Math.PI) / 180))).toEqual(
        Array.from(new Float32Array([0.2, 1, 0.3])),
    );
    expect(color(10000 * Math.tan((40 * Math.PI) / 180))).toEqual(
        Array.from(new Float32Array([1, 1, 0.15])),
    );
    expect(color(2000000)).toEqual(Array.from(new Float32Array([1, 0.55, 0.1])));
});
