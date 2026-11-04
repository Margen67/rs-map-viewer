import {
    buildMarioCollision,
    collectMarioSurfaces,
    indexMarioCollision,
} from "./CollisionGeometry";
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

test("terrain exports one upward surface rather than coincident floor/ceiling pairs", () => {
    const a = { x: 0, y: 0, z: 0 },
        b = { x: 128, y: 0, z: 128 },
        c = { x: 128, y: 0, z: 0 };
    const tiles = Array.from({ length: 64 }, () => new Array(64));
    tiles[0][0] = {
        minLevel: 0,
        tileModel: { faces: [{ vertices: [a, b, c] }, { vertices: [c, b, a] }] },
    };
    const geometry = buildMarioCollision({ levels: 1, tiles: [tiles] } as any, 0, 0, []);
    expect(geometry.length).toBe(9);
    const native = collectMarioSurfaces(
        [{ mapX: 0, mapY: 0, marioCollision: geometry }],
        0,
        0,
        0,
        0,
    );
    const yNormal =
        (native[5] - native[2]) * (native[6] - native[0]) -
        (native[3] - native[0]) * (native[8] - native[2]);
    expect(yNormal).toBeGreaterThan(0);
});

test("visible upper-plane bridges remain solid when the selected map level is zero", () => {
    const tiles = Array.from({ length: 2 }, () => Array.from({ length: 64 }, () => new Array(64)));
    const face = {
        vertices: [
            { x: 0, y: -240, z: 0 },
            { x: 128, y: -240, z: 128 },
            { x: 128, y: -240, z: 0 },
        ],
    };
    tiles[1][0][0] = { minLevel: 0, tileModel: { faces: [face] } };
    expect(buildMarioCollision({ levels: 2, tiles } as any, 0, 0, [])).toHaveLength(9);
    tiles[1][0][0].minLevel = 1;
    expect(buildMarioCollision({ levels: 2, tiles } as any, 0, 0, [])).toHaveLength(0);
});

test("non-blocking scenery contributes no collision triangles", () => {
    const scene = { levels: 0, tiles: [] } as any;
    const model = {
        model: {
            verticesX: [0, 128, 0],
            verticesY: [0, 0, 0],
            verticesZ: [0, 0, 128],
            faceCount: 1,
            indices1: [0],
            indices2: [1],
            indices3: [2],
            faceColors3: [0],
        },
        sceneX: 0,
        sceneZ: 0,
        heightOffset: 0,
        sceneHeight: 0,
        contourGround: 0,
        marioSolid: false,
    } as any;
    expect(buildMarioCollision(scene, 0, 0, [model])).toHaveLength(0);
    model.marioSolid = true;
    expect(buildMarioCollision(scene, 0, 0, [model])).toHaveLength(9);
});

test("tiny blocking geometry collides, but fully transparent signed-alpha faces do not", () => {
    const scene = { levels: 0, tiles: [] } as any;
    const model = {
        model: {
            verticesX: [0, 8, 0],
            verticesY: [0, -8, 0],
            verticesZ: [0, 0, 8],
            faceCount: 1,
            indices1: [0],
            indices2: [1],
            indices3: [2],
            faceColors3: [0],
            faceAlphas: new Int8Array([0]),
        },
        sceneX: 0,
        sceneZ: 0,
        heightOffset: 0,
        sceneHeight: 0,
        contourGround: 0,
        marioSolid: true,
    } as any;
    expect(buildMarioCollision(scene, 0, 0, [model])).toHaveLength(9);
    model.model.faceAlphas[0] = -15; // 241: faint but visible
    expect(buildMarioCollision(scene, 0, 0, [model])).toHaveLength(9);
    model.model.faceAlphas[0] = -1;
    expect(buildMarioCollision(scene, 0, 0, [model])).toHaveLength(0);
});
