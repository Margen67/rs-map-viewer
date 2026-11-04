import { broadWalkable, tinyScenery } from "./BlockingFlags";
import { withSupportCaps } from "./CollisionSupport";

test("wall tops and ceilings receive bounded upward support while originals stay intact", () => {
    const wall = new Int32Array([0, 0, 0, 128, 0, 0, 0, -128, 0]);
    const result = withSupportCaps(wall);
    expect(result.subarray(0, 9)).toEqual(wall);
    expect(result.length).toBeGreaterThan(9);
    for (let i = 10; i < result.length; i += 3) expect(result[i]).toBe(-129);
    const ceiling = new Int32Array([0, 0, 0, 0, 0, 128, 128, 0, 0]);
    expect(withSupportCaps(ceiling)).toHaveLength(18);
});
test("low grass and rubble are omitted while paving and thin roofs are preserved", () => {
    const model = (x: number, y: number, z: number) => ({
        verticesX: [0, x],
        verticesY: [0, y],
        verticesZ: [0, z],
    });
    expect(tinyScenery(model(75, 20, 65))).toBe(true);
    expect(tinyScenery(model(108, 12, 108))).toBe(true);
    expect(tinyScenery(model(128, 6, 128))).toBe(false);
    expect(broadWalkable(model(128, 6, 128))).toBe(true);
    expect(tinyScenery(model(16, 2, 16), true)).toBe(false);
});
