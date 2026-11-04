import { DrawRange } from "./DrawRange";

export type AnimationFrames = {
    frames: DrawRange[];
    framesAlpha: DrawRange[] | undefined;
    marioDoor?: boolean;
    marioCollisionFrames?: Int32Array[];
};
