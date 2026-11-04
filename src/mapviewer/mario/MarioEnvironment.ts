import { CollisionSquare } from "./CollisionGeometry";

// Vanilla OSRS liquid materials. Match source colors, never lit/blended blue floor colors.
const WATER_RGB = new Set([0x3f6181, 0x557799, 0x7296b7, 0x44886e]);
export function liquidKind(texture: number, primaryRgb = -1): number {
    if (
        [1, 24, 25].includes(texture) ||
        (texture >= 130 && texture <= 164) ||
        (texture >= 170 && texture <= 174)
    )
        return 1;
    if (texture === 31 || texture === 56) return 2;
    return texture === -1 && WATER_RGB.has(primaryRgb) ? 1 : 0;
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
        for (const data of [map.marioLiquids, map.marioAnimatedLiquids]) {
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
                const area = Math.abs(determinant);
                const edgeA = Math.hypot(bx - cx, bz - cz),
                    edgeB = Math.hypot(cx - ax, cz - az),
                    edgeC = Math.hypot(ax - bx, az - bz);
                if (a * area < -2 * edgeA || b * area < -2 * edgeB || c * area < -2 * edgeC)
                    continue;
                const height = -(a * data[i + 2] + b * data[i + 5] + c * data[i + 8]) / 128 || 0;
                if (data[i] === 1 && height <= -y + SWIM_DEPTH + 1) water = Math.max(water, height);
                if (data[i] === 2 && height <= -y + 0.5) lava = Math.max(lava, height);
            }
        }
    }
    return { water, bottom: water - SWIM_DEPTH, lava };
}

/** A finite 4-map-unit seabed skirt covers rounding/contact gaps along liquid edges. */
export function expandLiquidBed(points: number[][]): number[][] {
    const area =
        (points[1][0] - points[0][0]) * (points[2][2] - points[0][2]) -
        (points[1][2] - points[0][2]) * (points[2][0] - points[0][0]);
    const sign = Math.sign(area);
    if (!sign) return points;
    const edges = points.map((p, i) => {
        const q = points[(i + 1) % 3],
            dx = q[0] - p[0],
            dz = q[2] - p[2],
            length = Math.hypot(dx, dz);
        const nx = (sign * dz) / length,
            nz = (-sign * dx) / length;
        return { nx, nz, c: nx * p[0] + nz * p[2] + 4 };
    });
    return points.map((p, i) => {
        const a = edges[(i + 2) % 3],
            b = edges[i],
            det = a.nx * b.nz - b.nx * a.nz;
        if (Math.abs(det) < 1e-8) return p;
        const x = (a.c * b.nz - b.c * a.nz) / det,
            z = (a.nx * b.c - b.nx * a.c) / det;
        return [Math.round(x), p[1], Math.round(z)];
    });
}
