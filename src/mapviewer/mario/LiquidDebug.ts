import { CollisionSquare } from "./CollisionGeometry";

/** Visible liquid surfaces only: cyan water and red lava, never navigation flags. */
export function liquidDebugLines(
    maps: Iterable<CollisionSquare>,
    x: number,
    z: number,
    radius = 8,
): { positions: Float32Array; colors: Float32Array } {
    const positions: number[] = [],
        colors: number[] = [];
    for (const map of maps)
        for (const data of [map.marioLiquids, map.marioAnimatedLiquids]) {
            if (!data) continue;
            for (let i = 0; i < data.length; i += 10) {
                const xs = [data[i + 1], data[i + 4], data[i + 7]].map(
                        (v) => v / 128 + map.mapX * 64,
                    ),
                    zs = [data[i + 3], data[i + 6], data[i + 9]].map(
                        (v) => v / 128 + map.mapY * 64,
                    );
                if (
                    Math.min(...xs) > x + radius ||
                    Math.max(...xs) < x - radius ||
                    Math.min(...zs) > z + radius ||
                    Math.max(...zs) < z - radius
                )
                    continue;
                const color = data[i] === 1 ? [0.1, 0.85, 1] : [1, 0.1, 0.1];
                for (const v of [0, 1, 1, 2, 2, 0]) {
                    positions.push(xs[v], data[i + v * 3 + 2] / 128 - 0.01, zs[v]);
                    colors.push(...color);
                }
            }
        }
    return { positions: new Float32Array(positions), colors: new Float32Array(colors) };
}
