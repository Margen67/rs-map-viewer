import { CollisionFlag } from "../../rs/pathfinder/flag/CollisionFlag";
import { CollisionMap } from "../../rs/scene/CollisionMap";

export interface MapCollisionDebugSquare {
    mapX: number;
    mapY: number;
    borderSize: number;
    collisionMaps: CollisionMap[];
    sampleHeight(level: number, x: number, z: number): number;
}
/** A flat diagnostic of the cache's pathfinding flags; never passed to Mario's collision API. */
export function mapCollisionDebugLines(
    maps: Iterable<MapCollisionDebugSquare>,
    x: number,
    z: number,
    maxLevel: number,
    radius = 8,
): { positions: Float32Array; colors: Float32Array } {
    const positions: number[] = [],
        colors: number[] = [];
    for (const map of maps)
        for (let level = 0; level <= maxLevel && level < map.collisionMaps.length; level++) {
            const grid = map.collisionMaps[level];
            const bx = map.mapX * 64,
                bz = map.mapY * 64;
            const minX = Math.max(0, Math.floor(x - radius - bx)),
                maxX = Math.min(63, Math.ceil(x + radius - bx));
            const minZ = Math.max(0, Math.floor(z - radius - bz)),
                maxZ = Math.min(63, Math.ceil(z + radius - bz));
            for (let tx = minX; tx <= maxX; tx++)
                for (let tz = minZ; tz <= maxZ; tz++) {
                    const flags = grid.getFlag(tx + map.borderSize, tz + map.borderSize);
                    const line = (
                        ax: number,
                        az: number,
                        cx: number,
                        cz: number,
                        color: number[],
                    ) => {
                        for (const [dx, dz] of [
                            [ax, az],
                            [cx, cz],
                        ]) {
                            positions.push(
                                bx + tx + dx,
                                map.sampleHeight(level, (tx + dx) * 128, (tz + dz) * 128) - 0.03,
                                bz + tz + dz,
                            );
                            colors.push(...color);
                        }
                    };
                    if (
                        flags &
                        (CollisionFlag.OBJECT |
                            CollisionFlag.FLOOR_BLOCKED |
                            CollisionFlag.BLOCK_PLAYERS)
                    ) {
                        for (const [a, b, c, d] of [
                            [0, 0, 1, 0],
                            [1, 0, 1, 1],
                            [1, 1, 0, 1],
                            [0, 1, 0, 0],
                        ])
                            line(a, b, c, d, [1, 0.15, 0.2]);
                    }
                    for (const [flag, a, b, c, d] of [
                        [CollisionFlag.WALL_NORTH, 0, 1, 1, 1],
                        [CollisionFlag.WALL_EAST, 1, 0, 1, 1],
                        [CollisionFlag.WALL_SOUTH, 0, 0, 1, 0],
                        [CollisionFlag.WALL_WEST, 0, 0, 0, 1],
                        [CollisionFlag.WALL_NORTH_WEST, 0.5, 0.5, 0, 1],
                        [CollisionFlag.WALL_NORTH_EAST, 0.5, 0.5, 1, 1],
                        [CollisionFlag.WALL_SOUTH_EAST, 0.5, 0.5, 1, 0],
                        [CollisionFlag.WALL_SOUTH_WEST, 0.5, 0.5, 0, 0],
                    ])
                        if (flags & flag) line(a, b, c, d, [0.1, 0.85, 1]);
                }
        }
    return { positions: new Float32Array(positions), colors: new Float32Array(colors) };
}
