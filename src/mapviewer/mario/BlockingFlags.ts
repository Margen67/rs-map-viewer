import { LocModelType } from "../../rs/config/loctype/LocModelType";

/** Match SceneBuilder's player-blocking rules, not size, projectile flags, or visual occlusion. */
export function blocksMario(type: LocModelType, clipType: number): boolean {
    if (type === LocModelType.FLOOR_DECORATION) return clipType === 1;
    if (
        type >= LocModelType.WALL_DECORATION_INSIDE &&
        type <= LocModelType.WALL_DECORATION_DIAGONAL_DOUBLE
    )
        return false;
    if (type >= LocModelType.ROOF_SLOPED) return false;
    return clipType !== 0;
}

/** Only tiny ground clutter: at most 1/8 tile high and 1/4 tile across both axes. */
export function isTinyMarioObstacle(model: {
    verticesX: ArrayLike<number>;
    verticesY: ArrayLike<number>;
    verticesZ: ArrayLike<number>;
}): boolean {
    const extent = (values: ArrayLike<number>) => {
        let min = Infinity,
            max = -Infinity;
        for (let i = 0; i < values.length; i++) {
            min = Math.min(min, values[i]);
            max = Math.max(max, values[i]);
        }
        return max - min;
    };
    return (
        extent(model.verticesY) <= 16 &&
        extent(model.verticesX) <= 32 &&
        extent(model.verticesZ) <= 32
    );
}
