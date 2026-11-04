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
