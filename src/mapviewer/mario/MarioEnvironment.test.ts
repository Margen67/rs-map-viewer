import { buildMarioCollision } from "./CollisionGeometry";
import { SWIM_DEPTH, liquidKind, sampleMarioEnvironment } from "./MarioEnvironment";

const vertices = [
    { x: 0, y: 0, z: 0, textureId: 1 },
    { x: 128, y: 0, z: 128, textureId: 1 },
    { x: 128, y: 0, z: 0, textureId: 1 },
];
test("only visible textured water receives a finite seabed; navigation flags cannot invent walls", () => {
    const tiles = Array.from({ length: 64 }, () => new Array(64));
    tiles[0][0] = { minLevel: 0, tileModel: { faces: [{ vertices }] } };
    const liquids: number[] = [];
    const collision = buildMarioCollision({ levels: 1, tiles: [tiles] } as any, 0, 0, [], liquids);
    expect(collision).toHaveLength(9);
    for (let i = 1; i < 9; i += 3) expect(collision[i]).toBe(SWIM_DEPTH * 128);
    const map = {
        mapX: 0,
        mapY: 0,
        marioCollision: collision,
        marioLiquids: new Int32Array(liquids),
    };
    expect(sampleMarioEnvironment([map], 0.75, 1, 0.25)).toEqual({
        water: 0,
        bottom: -4,
        lava: -11000,
    });
    expect(sampleMarioEnvironment([map], 0.25, 1, 0.75).water).toBe(-11000);
    expect(sampleMarioEnvironment([map], 4, 1, 4).water).toBe(-11000);
    expect(liquidKind(31)).toBe(2);
    expect(liquidKind(56)).toBe(2);
    expect(liquidKind(2)).toBe(0);
});

test("water-edge tolerance has finite overlapping seabed support", () => {
    const tiles = Array.from({ length: 64 }, () => new Array(64));
    tiles[0][0] = { minLevel: 0, tileModel: { faces: [{ vertices }] } };
    const liquids: number[] = [];
    const collision = buildMarioCollision({ levels: 1, tiles: [tiles] } as any, 0, 0, [], liquids);
    const map = {
        mapX: 0,
        mapY: 0,
        marioCollision: collision,
        marioLiquids: new Int32Array(liquids),
    };
    expect(sampleMarioEnvironment([map], 1.01, 1, 0.25).water).toBe(0);
    expect(Math.max(...Array.from(collision).filter((_, i) => i % 3 === 0))).toBeGreaterThan(128);
    expect(sampleMarioEnvironment([map], 1.1, 1, 0.25).water).toBe(-11000);
});

test("recognizes reported ocean textures and exact untextured water materials", () => {
    for (const texture of [170, 171, 172, 173, 174, 176, 208]) expect(liquidKind(texture)).toBe(1);
    for (const color of [0x3f6181, 0x557799, 0x7296b7, 0x44886e])
        expect(liquidKind(-1, color)).toBe(1);
    for (const color of [0x3d2b0b, 0x282828, 0xff00ff, 0x0000ff])
        expect(liquidKind(-1, color)).toBe(0);
    expect(liquidKind(3, 0x557799)).toBe(0);
});

test("uses visible overlay materials without flooding blue underlays around lily ponds", () => {
    const tiles = Array.from({ length: 64 }, () => new Array(64));
    tiles[0][0] = {
        minLevel: 0,
        tileModel: {
            overlayPrimaryRgb: 0x3f6181,
            underlayPrimaryRgb: 0x3d2b0b,
            faces: [
                { isOverlay: true, vertices: vertices.map((v) => ({ ...v, textureId: -1 })) },
                {
                    isOverlay: false,
                    vertices: [vertices[0], { x: 0, y: 0, z: 128 }, vertices[1]].map((v) => ({
                        ...v,
                        textureId: -1,
                    })),
                },
            ],
        },
    };
    const liquids: number[] = [];
    const collision = buildMarioCollision({ levels: 1, tiles: [tiles] } as any, 0, 0, [], liquids);
    expect(liquids).toHaveLength(10);
    expect(
        Array.from(collision)
            .filter((_, i) => i % 3 === 1)
            .sort((a, b) => a - b),
    ).toEqual([0, 0, 0, 512, 512, 512]);
    tiles[0][0].tileModel.overlayPrimaryRgb = 0x3d2b0b;
    tiles[0][0].tileModel.underlayPrimaryRgb = 0x557799;
    const underlayLiquids: number[] = [];
    const land = buildMarioCollision(
        { levels: 1, tiles: [tiles] } as any,
        0,
        0,
        [],
        underlayLiquids,
    );
    expect(underlayLiquids).toHaveLength(0);
    expect(Array.from(land).filter((_, i) => i % 3 === 1)).toEqual([0, 0, 0, 0, 0, 0]);
});

test("non-blocking scenery water gets a finite bed without colliding at the visible surface", () => {
    const entry = {
        model: {
            verticesX: [0, 128, 128],
            verticesY: [0, 0, 0],
            verticesZ: [0, 128, 0],
            faceCount: 1,
            indices1: [0],
            indices2: [1],
            indices3: [2],
            faceColors3: [0],
            faceTextures: [24],
        },
        sceneX: 0,
        sceneZ: 0,
        sceneHeight: 0,
        heightOffset: 0,
        contourGround: 0,
        marioSolid: false,
        marioGroundDecoration: true,
    } as any;
    for (const untexturedTemple of [false, true]) {
        entry.interactId = untexturedTemple ? 38383 : 10459;
        entry.model.faceTextures = [untexturedTemple ? -1 : 24];
        const liquids: number[] = [];
        const collision = buildMarioCollision({ levels: 0 } as any, 0, 0, [entry], liquids);
        expect(liquids).toHaveLength(10);
        expect(collision).toHaveLength(9);
        for (let i = 1; i < 9; i += 3) expect(collision[i]).toBe(512);
    }
});
