import { LocModelType } from "../../rs/config/loctype/LocModelType";

export function blocksMario(type: LocModelType, clipType: number): boolean {
    // SceneBuilder only blocks floor decorations for clipType 1; 2 is the default decoration value.
    if (type === LocModelType.FLOOR_DECORATION) return clipType === 1;
    return clipType !== 0;
}
export function keepsWalkableCollision(type: LocModelType, name = ""): boolean {
    return (
        (type >= 12 && type <= 21) ||
        /roof|platform|bridge|floor|walkway|stairs|steps|paving|pavement/i.test(name)
    );
}
interface BoundsModel {
    verticesX: ArrayLike<number>;
    verticesY: ArrayLike<number>;
    verticesZ: ArrayLike<number>;
}
function dimensions(model: BoundsModel): number[] {
    return [model.verticesX, model.verticesY, model.verticesZ].map((values) => {
        let min = Infinity,
            max = -Infinity;
        for (let i = 0; i < values.length; i++) {
            min = Math.min(min, values[i]);
            max = Math.max(max, values[i]);
        }
        return max - min;
    });
}
/** Keep roofs, broad paving and genuinely flat platforms; do not mistake thinness for clutter. */
export function broadWalkable(model: BoundsModel): boolean {
    const [x, y, z] = dimensions(model);
    return (
        (x >= 120 && z >= 120 && y <= 64) ||
        (Math.max(x, z) >= 120 && Math.min(x, z) >= 16 && y <= 20) ||
        (x >= 32 && z >= 32 && y <= 2)
    );
}
/** Roughly 1/8-tile-high grass/pebbles/debris; four map units of tolerance for cache rounding. */
export function tinyScenery(model: BoundsModel, walkable = false): boolean {
    if (walkable || broadWalkable(model)) return false;
    const [x, y, z] = dimensions(model);
    return y <= 20 && Math.max(x, z) < 120;
}
