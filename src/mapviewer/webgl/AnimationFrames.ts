import { DrawRange } from "./DrawRange";

export type AnimationFrames = {
    frames: DrawRange[];
    framesAlpha: DrawRange[] | undefined;
    marioCollisionFrames?: Int32Array[];
};
