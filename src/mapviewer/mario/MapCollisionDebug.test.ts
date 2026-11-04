import { CollisionFlag } from "../../rs/pathfinder/flag/CollisionFlag";
import { CollisionMap } from "../../rs/scene/CollisionMap";
import { mapCollisionDebugLines } from "./MapCollisionDebug";

test("map diagnostics draw blocked tiles and directional walls without modifying flags", () => {
    const grid = new CollisionMap(66, 66);
    grid.setFlag(1, 1, CollisionFlag.OBJECT | CollisionFlag.WALL_NORTH);
    grid.setFlag(2, 2, CollisionFlag.OBJECT_PROJECTILE_BLOCKER);
    const before = grid.flags.slice();
    const map = {
        mapX: 10,
        mapY: 20,
        borderSize: 1,
        collisionMaps: [grid],
        sampleHeight: () => -2,
    };
    const lines = mapCollisionDebugLines([map], 640, 1280, 0);
    expect(lines.positions).toHaveLength(30);
    expect(lines.positions[0]).toBe(640);
    expect(lines.positions[1]).toBeCloseTo(-2.03);
    expect(lines.positions[2]).toBe(1280);
    expect(Array.from(lines.positions.subarray(24, 30)).filter((_, i) => i % 3 !== 1)).toEqual([
        640, 1281, 641, 1281,
    ]);
    expect(grid.flags).toEqual(before);
    expect(mapCollisionDebugLines([map], 0, 0, 0).positions).toHaveLength(0);
});
