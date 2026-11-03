import { Scene } from "../../rs/scene/Scene";
import { ContourGroundType, SceneModel } from "../webgl/buffer/SceneBuffer";
import { MARIO_UNITS_PER_TILE } from "./MarioScale";

/** Map-local RuneScape coordinates, 128 units per tile, Y pointing down. */
export function buildMarioCollision(
    scene: Scene,
    border: number,
    maxLevel: number,
    models: SceneModel[],
): Int32Array {
    const vertices: number[] = [];
    const offset = border * 128;
    const add = (a: number[], b: number[], c: number[]) => {
        // Both sides: upper floors also act as ceilings, and thin walls are solid.
        vertices.push(...a, ...b, ...c, ...c, ...b, ...a);
    };
    for (let level = 0; level <= maxLevel && level < scene.levels; level++) {
        for (let x = border; x < border + 64; x++) {
            for (let z = border; z < border + 64; z++) {
                const tile = scene.tiles[level][x][z]?.tileModel;
                for (const face of tile?.faces ?? []) {
                    const [a, b, c] = face.vertices.map((v) => [v.x - offset, v.y, v.z - offset]);
                    add(a, b, c);
                }
            }
        }
    }
    for (const entry of models) {
        if (entry.level > maxLevel) continue;
        const model = entry.model;
        const ys = model.contourVerticesY ?? model.verticesY;
        const vertex = (i: number) => {
            const height = entry.contourGround === ContourGroundType.NONE ? 0 : entry.sceneHeight;
            return [
                model.verticesX[i] + entry.sceneX,
                ys[i] + height,
                model.verticesZ[i] + entry.sceneZ,
            ];
        };
        for (let i = 0; i < model.faceCount; i++) {
            if (model.faceColors3[i] === -2 || (model.faceAlphas?.[i] ?? 0) > 240) continue;
            add(vertex(model.indices1[i]), vertex(model.indices2[i]), vertex(model.indices3[i]));
        }
    }
    return new Int32Array(vertices);
}

export interface CollisionSquare {
    mapX: number;
    mapY: number;
    marioCollision: Int32Array;
    marioCollisionChunks?: Uint32Array[];
}

/** Index triangle offsets by 8×8-tile cells in the worker, including overlapping triangles. */
export function indexMarioCollision(vertices: Int32Array): Uint32Array[] {
    const cells: number[][] = Array.from({ length: 64 }, () => []);
    const cell = (value: number) => Math.max(0, Math.min(7, Math.floor(value / 1024)));
    for (let i = 0; i < vertices.length; i += 9) {
        const minX = cell(Math.min(vertices[i], vertices[i + 3], vertices[i + 6]));
        const maxX = cell(Math.max(vertices[i], vertices[i + 3], vertices[i + 6]));
        const minZ = cell(Math.min(vertices[i + 2], vertices[i + 5], vertices[i + 8]));
        const maxZ = cell(Math.max(vertices[i + 2], vertices[i + 5], vertices[i + 8]));
        for (let z = minZ; z <= maxZ; z++)
            for (let x = minX; x <= maxX; x++) cells[z * 8 + x].push(i);
    }
    return cells.map((indices) => new Uint32Array(indices));
}

function* collisionOffsets(
    map: CollisionSquare,
    x: number,
    z: number,
    radius: number,
): Iterable<number> {
    if (!map.marioCollisionChunks) {
        for (let i = 0; i < map.marioCollision.length; i += 9) yield i;
        return;
    }
    const cell = (value: number) => Math.max(0, Math.min(7, Math.floor(value / 8)));
    const minX = cell(x - radius - map.mapX * 64);
    const maxX = cell(x + radius - map.mapX * 64);
    const minZ = cell(z - radius - map.mapY * 64);
    const maxZ = cell(z + radius - map.mapY * 64);
    const seen = new Set<number>();
    for (let cz = minZ; cz <= maxZ; cz++)
        for (let cx = minX; cx <= maxX; cx++) {
            for (const offset of map.marioCollisionChunks[cz * 8 + cx]) {
                if (!seen.has(offset)) {
                    seen.add(offset);
                    yield offset;
                }
            }
        }
}

/** Keep collision local to Mario to avoid SM64's position limits and scanning an entire world. */
export function collectMarioSurfaces(
    maps: Iterable<CollisionSquare>,
    originX: number,
    originZ: number,
    x: number,
    z: number,
    radius = 8,
): Int32Array {
    const result: number[] = [];
    for (const map of maps) {
        const baseX = map.mapX * 64;
        const baseZ = map.mapY * 64;
        if (
            baseX > x + radius ||
            baseX + 64 < x - radius ||
            baseZ > z + radius ||
            baseZ + 64 < z - radius
        )
            continue;
        const src = map.marioCollision;
        for (const i of collisionOffsets(map, x, z, radius)) {
            const xs = [src[i] / 128 + baseX, src[i + 3] / 128 + baseX, src[i + 6] / 128 + baseX];
            const zs = [
                src[i + 2] / 128 + baseZ,
                src[i + 5] / 128 + baseZ,
                src[i + 8] / 128 + baseZ,
            ];
            if (
                Math.min(...xs) > x + radius ||
                Math.max(...xs) < x - radius ||
                Math.min(...zs) > z + radius ||
                Math.max(...zs) < z - radius
            )
                continue;
            // Reflect Y and reverse winding to preserve the source surface normals.
            for (const v of [2, 1, 0]) {
                result.push(
                    Math.round((xs[v] - originX) * MARIO_UNITS_PER_TILE),
                    Math.round((-src[i + v * 3 + 1] / 128) * MARIO_UNITS_PER_TILE),
                    Math.round((zs[v] - originZ) * MARIO_UNITS_PER_TILE),
                );
            }
        }
    }
    return new Int32Array(result);
}
