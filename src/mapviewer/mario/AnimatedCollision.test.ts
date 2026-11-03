import { ContourGroundType } from "../webgl/buffer/SceneBuffer";
import { animatedMarioCollision } from "./AnimatedCollision";
import { collectMarioSurfaces } from "./CollisionGeometry";

test("animated solid scenery follows its current frame and per-vertex terrain contour", () => {
    const loc = {
        frame: 0,
        anim: {
            frames: [],
            framesAlpha: undefined,
            marioCollisionFrames: [
                new Int32Array([0, 0, 0, 128, 0, 0, 0, -128, 0]),
                new Int32Array([0, 0, 0, 0, 0, 128, 0, -128, 0]),
            ],
        },
        marioCollisionInfo: {
            sceneX: 128,
            sceneZ: 256,
            level: 0,
            contourGround: ContourGroundType.VERTEX,
            heightOffset: 0,
        },
    };
    const height = (_level: number, x: number) => -x / 4;
    const closed = animatedMarioCollision([loc], 1, 2, height);
    expect(Array.from(closed)).toEqual([128, -32, 256, 256, -64, 256, 128, -160, 256]);
    loc.frame = 1;
    const open = animatedMarioCollision([loc], 1, 2, height);
    expect(Array.from(open)).toEqual([128, -32, 256, 128, -32, 384, 128, -160, 256]);
    expect(animatedMarioCollision([loc], 40, 40, height)).toHaveLength(0);
    const native = collectMarioSurfaces(
        [{ mapX: 0, mapY: 0, marioCollision: new Int32Array(0), marioAnimatedCollision: open }],
        0,
        0,
        1,
        2,
    );
    expect(native.length).toBe(9);
});
