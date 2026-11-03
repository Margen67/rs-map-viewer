import { collectMarioSurfaces, indexMarioCollision } from "./CollisionGeometry";
import { MARIO_UNITS_PER_TILE } from "./MarioScale";

test("converts map-local triangles to nearby SM64 coordinates, preserving winding", () => {
    const result = collectMarioSurfaces(
        [
            {
                mapX: 50,
                mapY: 50,
                marioCollision: new Int32Array([0, -64, 0, 128, -64, 128, 128, -64, 0]),
            },
        ],
        3200,
        3200,
        3200,
        3200,
    );
    expect(Array.from(result)).toEqual([171, 85, 0, 171, 85, 171, 0, 85, 0]);
});

test("keeps a triangle crossing the collision window and excludes distant geometry", () => {
    const result = collectMarioSurfaces(
        [
            {
                mapX: 0,
                mapY: 0,
                marioCollision: new Int32Array([
                    0,
                    0,
                    0,
                    128 * 40,
                    0,
                    0,
                    128 * 40,
                    0,
                    128,
                    128 * 50,
                    0,
                    0,
                    128 * 51,
                    0,
                    0,
                    128 * 51,
                    0,
                    128,
                ]),
            },
        ],
        0,
        0,
        10,
        0,
        2,
    );
    expect(result.length).toBe(9);
    expect(
        collectMarioSurfaces([{ mapX: 50, mapY: 50, marioCollision: result }], 0, 0, 0, 0).length,
    ).toBe(0);
});

test("origin rebasing changes local coordinates without moving world geometry", () => {
    const maps = [
        { mapX: 1, mapY: 1, marioCollision: new Int32Array([0, 0, 0, 128, 0, 128, 128, 0, 0]) },
    ];
    const a = collectMarioSurfaces(maps, 32, 32, 64, 64);
    const b = collectMarioSurfaces(maps, 64, 64, 64, 64);
    for (let i = 0; i < a.length; i += 3) {
        expect(Math.abs(a[i] - b[i] - 32 * MARIO_UNITS_PER_TILE)).toBeLessThanOrEqual(1);
        expect(a[i + 1]).toBe(b[i + 1]);
        expect(Math.abs(a[i + 2] - b[i + 2] - 32 * MARIO_UNITS_PER_TILE)).toBeLessThanOrEqual(1);
    }
});

test("spatial indexing keeps overlapping triangles exactly once and matches the full scan", () => {
    const vertices = new Int32Array([
        0, 0, 0, 5000, 0, 0, 5000, 0, 5000, 1000, -64, 1000, 1100, -64, 1000, 1100, -64, 1100, 7000,
        0, 7000, 7100, 0, 7000, 7100, 0, 7100,
    ]);
    const map = { mapX: 0, mapY: 0, marioCollision: vertices };
    const indexed = { ...map, marioCollisionChunks: indexMarioCollision(vertices) };
    expect(indexed.marioCollisionChunks.filter((cell) => cell.includes(0)).length).toBeGreaterThan(
        1,
    );
    const triangles = (data: Int32Array) =>
        Array.from({ length: data.length / 9 }, (_, i) =>
            Array.from(data.subarray(i * 9, i * 9 + 9)).join(","),
        ).sort();
    for (const [x, z] of [
        [0, 0],
        [8, 8],
        [30, 30],
        [56, 56],
    ]) {
        expect(triangles(collectMarioSurfaces([indexed], 0, 0, x, z))).toEqual(
            triangles(collectMarioSurfaces([map], 0, 0, x, z)),
        );
    }
});
