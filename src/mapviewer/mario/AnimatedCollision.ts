import { AnimationFrames } from "../webgl/AnimationFrames";
import { ContourGroundType } from "../webgl/buffer/SceneBuffer";
import { withSupportCaps } from "./CollisionSupport";

export interface AnimatedCollisionInfo {
    sceneX: number;
    sceneZ: number;
    level: number;
    contourGround: ContourGroundType;
    heightOffset: number;
}
export interface AnimatedCollisionLoc {
    frame: number;
    anim: AnimationFrames;
    marioCollisionInfo?: AnimatedCollisionInfo;
}

/** Use the same current frame and terrain-contour transform as the scenery shader. */
export function animatedMarioCollision(
    locs: AnimatedCollisionLoc[],
    x: number,
    z: number,
    height: (level: number, x: number, z: number) => number,
): Int32Array {
    const output: number[] = [];
    for (const loc of locs) {
        const info = loc.marioCollisionInfo;
        const frame = loc.anim.marioCollisionFrames?.[loc.frame | 0];
        if (
            !info ||
            !frame ||
            Math.abs(info.sceneX / 128 - x) > 12 ||
            Math.abs(info.sceneZ / 128 - z) > 12
        )
            continue;
        for (let i = 0; i < frame.length; i += 3) {
            const vx = frame[i] + info.sceneX,
                vz = frame[i + 2] + info.sceneZ;
            const h =
                info.contourGround === ContourGroundType.NONE
                    ? 0
                    : height(
                          info.level,
                          info.contourGround === ContourGroundType.VERTEX ? vx : info.sceneX,
                          info.contourGround === ContourGroundType.VERTEX ? vz : info.sceneZ,
                      );
            output.push(vx, Math.round(frame[i + 1] - info.heightOffset + h), vz);
        }
    }
    return withSupportCaps(new Int32Array(output));
}
