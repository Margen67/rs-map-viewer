import { Scene } from "../../rs/scene/Scene";
import { ContourGroundType, SceneModel } from "../webgl/buffer/SceneBuffer";
import { broadWalkable, tinyScenery } from "./BlockingFlags";
import { withSupportCaps } from "./CollisionSupport";
import { SWIM_DEPTH, expandLiquidBed, liquidKind } from "./MarioEnvironment";
import { MARIO_UNITS_PER_TILE } from "./MarioScale";

/** Map-local RuneScape coordinates, 128 units per tile, Y pointing down. */
export function buildMarioCollision(
    scene: Scene,
    border: number,
    maxLevel: number,
    models: SceneModel[],
    liquids: number[] = [],
    classifyLiquids = true,
    worldBaseX = 0,
    worldBaseZ = 0,
): Int32Array {
    const vertices: number[] = [];
    const seen = new Set<string>();
    const offset = border * 128;
    const add = (a: number[], b: number[], c: number[]) => {
        const ab = b.map((v, i) => v - a[i]);
        const ac = c.map((v, i) => v - a[i]);
        if (
            Math.hypot(
                ab[1] * ac[2] - ab[2] * ac[1],
                ab[2] * ac[0] - ab[0] * ac[2],
                ab[0] * ac[1] - ab[1] * ac[0],
            ) < 1
        )
            return;
        const key = [a.join(","), b.join(","), c.join(",")].sort().join(";");
        if (seen.has(key)) return;
        seen.add(key);
        // Preserve the outward mesh winding: reversed coincident faces fight each other.
        vertices.push(...a, ...b, ...c);
    };
    for (let level = 0; level < scene.levels; level++) {
        for (let x = border; x < border + 64; x++) {
            for (let z = border; z < border + 64; z++) {
                const sceneTile = scene.tiles[level][x][z];
                if (!sceneTile || sceneTile.minLevel > maxLevel) continue;
                const tile = sceneTile.tileModel;
                for (const face of tile?.faces ?? []) {
                    let [a, b, c] = face.vertices.map((v) => [v.x - offset, v.y, v.z - offset]);
                    const kind = classifyLiquids ? liquidKind(face.vertices[0].textureId) : 0;
                    if (kind) liquids.push(kind, ...a, ...b, ...c);
                    if (kind === 1) {
                        a[1] += SWIM_DEPTH * 128;
                        b[1] += SWIM_DEPTH * 128;
                        c[1] += SWIM_DEPTH * 128;
                        [a, b, c] = expandLiquidBed([a, b, c]);
                    }
                    const normalY = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
                    if (normalY > 0) add(c, b, a);
                    else add(a, b, c);
                }
            }
        }
    }
    for (const entry of models) {
        const walkable = entry.marioWalkable || broadWalkable(entry.model);
        if ((entry.marioSolid === false && !walkable) || tinyScenery(entry.model, walkable))
            continue;
        // Scene models are already visibility-filtered, including upper-plane bridges.
        const model = entry.model;
        const ys = model.contourVerticesY ?? model.verticesY;
        const vertex = (i: number) => {
            let height =
                entry.contourGround === ContourGroundType.NONE
                    ? -entry.heightOffset
                    : entry.sceneHeight;
            // Instanced models without pre-contoured vertices follow the same bilinear height as the shader.
            if (!model.contourVerticesY && entry.contourGround === ContourGroundType.VERTEX) {
                const x = (model.verticesX[i] + entry.sceneX) / 128 + border;
                const z = (model.verticesZ[i] + entry.sceneZ) / 128 + border;
                const tx = Math.floor(x),
                    tz = Math.floor(z),
                    fx = x - tx,
                    fz = z - tz;
                const map = scene.tileHeights[entry.level];
                if (map[tx]?.[tz] !== undefined && map[tx + 1]?.[tz + 1] !== undefined) {
                    height =
                        (map[tx][tz] * (1 - fx) + map[tx + 1][tz] * fx) * (1 - fz) +
                        (map[tx][tz + 1] * (1 - fx) + map[tx + 1][tz + 1] * fx) * fz;
                }
            }
            return [
                model.verticesX[i] + entry.sceneX,
                ys[i] + height,
                model.verticesZ[i] + entry.sceneZ,
            ];
        };
        for (let i = 0; i < model.faceCount; i++) {
            if (model.faceColors3[i] === -2 || ((model.faceAlphas?.[i] ?? 0) & 255) === 255)
                continue;
            const a = vertex(model.indices1[i]),
                b = vertex(model.indices2[i]),
                c = vertex(model.indices3[i]);
            const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
            const texture = model.faceTextures?.[i] ?? -1;
            const color = model.faceColors?.[i] ?? model.faceColors1?.[i] ?? 0;
            const wilderness =
                worldBaseX + entry.sceneX / 128 >= 2944 &&
                worldBaseX + entry.sceneX / 128 <= 3392 &&
                worldBaseZ + entry.sceneZ / 128 >= 3520;
            const lava =
                walkable &&
                (texture === 31 || texture === 56 || (wilderness && color >> 7 === 9164 >> 7));
            if (lava && Math.abs(ny) > 1) liquids.push(2, ...a, ...b, ...c);
            if (entry.marioSolid === false) {
                if (!ny) continue;
                if (ny > 0) add(c, b, a);
                else add(a, b, c);
            } else add(a, b, c);
        }
    }
    return withSupportCaps(new Int32Array(vertices));
}

export interface CollisionSquare {
    mapX: number;
    mapY: number;
    marioCollision: Int32Array;
    marioCollisionChunks?: Uint32Array[];
    marioAnimatedCollision?: Int32Array;
    marioCollisionVersion?: number;
    marioLiquids?: Int32Array;
    marioAnimatedLiquids?: Int32Array;
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

function* collisionTriangles(map: CollisionSquare): Iterable<[Int32Array, number]> {
    // Static geometry is spatially indexed; the selected animated frames are already nearby.
    for (let i = 0; i < (map.marioAnimatedCollision?.length ?? 0); i += 9)
        yield [map.marioAnimatedCollision!, i];
}

/** Keep collision local to Mario to avoid SM64's position limits and scanning an entire world. */
export function collectMarioSurfaces(
    maps: Iterable<CollisionSquare>,
    originX: number,
    originZ: number,
    x: number,
    z: number,
    radius = 8,
    unitsPerTile = MARIO_UNITS_PER_TILE,
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
        function* triangles(): Iterable<[Int32Array, number]> {
            for (const i of collisionOffsets(map, x, z, radius)) yield [map.marioCollision, i];
            yield* collisionTriangles(map);
        }
        for (const [src, i] of triangles()) {
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
                    Math.round((xs[v] - originX) * unitsPerTile),
                    Math.round((-src[i + v * 3 + 1] / 128) * unitsPerTile),
                    Math.round((zs[v] - originZ) * unitsPerTile),
                );
            }
        }
    }
    return new Int32Array(result);
}
