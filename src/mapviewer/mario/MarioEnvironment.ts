import { CollisionSquare } from "./CollisionGeometry";

// Vanilla OSRS terrain texture IDs (including newer ocean materials); no pathfinding flags.
export function liquidKind(texture: number): number {
    if ([1, 24, 25].includes(texture) || (texture >= 130 && texture <= 164)) return 1;
    if (texture === 31 || texture === 56) return 2;
    return 0;
}
export const SWIM_DEPTH = 4; // tiles; finite seabed beneath the visible water triangles

/** Records are kind followed by three map-local XYZ vertices, in RuneScape map units. */
export function sampleMarioEnvironment(
    maps: Iterable<CollisionSquare>,
    x: number,
    y: number,
    z: number,
): { water: number; bottom: number; lava: number } {
    let water = -11000,
        lava = -11000;
    for (const map of maps) {
        const px = (x - map.mapX * 64) * 128,
            pz = (z - map.mapY * 64) * 128;
        const data = map.marioLiquids;
        if (!data) continue;
        for (let i = 0; i < data.length; i += 10) {
            const ax = data[i + 1],
                az = data[i + 3],
                bx = data[i + 4],
                bz = data[i + 6],
                cx = data[i + 7],
                cz = data[i + 9];
            const determinant = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
            if (!determinant) continue;
            const a = ((bz - cz) * (px - cx) + (cx - bx) * (pz - cz)) / determinant;
            const b = ((cz - az) * (px - cx) + (ax - cx) * (pz - cz)) / determinant;
            const c = 1 - a - b;
            if (a < -0.00001 || b < -0.00001 || c < -0.00001) continue;
            const height = -(a * data[i + 2] + b * data[i + 5] + c * data[i + 8]) / 128 || 0;
            if (data[i] === 1 && height <= -y + SWIM_DEPTH + 1) water = Math.max(water, height);
            if (data[i] === 2 && height <= -y + 0.5) lava = Math.max(lava, height);
        }
    }
    return { water, bottom: water - SWIM_DEPTH, lava };
}
