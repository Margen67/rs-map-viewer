import { SeqType } from "../../../rs/config/seqtype/SeqType";
import { SeqFrameLoader } from "../../../rs/model/seq/SeqFrameLoader";
import { AnimatedCollisionInfo } from "../../mario/AnimatedCollision";
import { AnimationFrames } from "../AnimationFrames";

export class LocAnimated {
    seqType?: SeqType;

    frame = 0;
    cycleStart: number;
    doorOpen = false;
    toggleDoor(): void {
        this.doorOpen = !this.doorOpen;
    }

    constructor(
        readonly drawRangeIndex: number,
        readonly drawRangeAlphaIndex: number,

        readonly drawRangeLodIndex: number,
        readonly drawRangeLodAlphaIndex: number,

        readonly drawRangeInteractIndex: number,
        readonly drawRangeInteractAlphaIndex: number,

        readonly drawRangeInteractLodIndex: number,
        readonly drawRangeInteractLodAlphaIndex: number,

        readonly anim: AnimationFrames,
        seqType: SeqType | undefined,
        cycle: number,
        randomStart: boolean,
        readonly marioCollisionInfo?: AnimatedCollisionInfo,
    ) {
        this.seqType = seqType;
        this.cycleStart = cycle - 1;

        if (seqType && randomStart && seqType.frameStep !== -1) {
            if (seqType.isSkeletalSeq()) {
                this.frame = Math.floor(Math.random() * seqType.getSkeletalDuration());
            } else {
                this.frame = Math.floor(Math.random() * seqType.frameIds.length);
                this.cycleStart -= Math.floor(Math.random() * seqType.frameLengths[this.frame]);
            }
        }
    }

    getDrawRangeIndex(isAlpha: boolean, isInteract: boolean, isLod: boolean) {
        if (isInteract) {
            if (isLod) {
                return isAlpha
                    ? this.drawRangeInteractLodAlphaIndex
                    : this.drawRangeInteractLodIndex;
            } else {
                return isAlpha ? this.drawRangeInteractAlphaIndex : this.drawRangeInteractIndex;
            }
        } else {
            if (isLod) {
                return isAlpha ? this.drawRangeLodAlphaIndex : this.drawRangeLodIndex;
            } else {
                return isAlpha ? this.drawRangeAlphaIndex : this.drawRangeIndex;
            }
        }
    }

    update(seqFrameLoader: SeqFrameLoader, cycle: number): number {
        if (this.anim.marioDoor) {
            const steps = Math.max(0, Math.min(4, Math.floor(cycle - this.cycleStart)));
            const target = this.doorOpen ? this.anim.frames.length - 1 : 0;
            this.frame +=
                Math.sign(target - this.frame) * Math.min(steps, Math.abs(target - this.frame));
            if (steps) this.cycleStart = cycle;
            return this.frame;
        }
        if (!this.seqType) {
            return 0;
        }

        let elapsed = cycle - this.cycleStart;
        if (elapsed > 100 && this.seqType.frameStep > 0) {
            elapsed = 100;
        }

        if (this.seqType.isSkeletalSeq()) {
            const duration = this.seqType.getSkeletalDuration();
            this.frame += elapsed;
            elapsed = 0;
            if (this.frame >= duration) {
                this.frame = duration - this.seqType.frameStep;
                if (this.frame < 0 || this.frame > duration) {
                    this.frame = 0;
                    this.seqType = undefined;
                    return 0;
                }
            }
        } else {
            while (elapsed > this.seqType.getFrameLength(seqFrameLoader, this.frame)) {
                elapsed -= this.seqType.getFrameLength(seqFrameLoader, this.frame);
                this.frame++;
                if (this.frame >= this.seqType.frameLengths.length) {
                    this.frame -= this.seqType.frameStep;
                    if (this.frame < 0 || this.frame >= this.seqType.frameLengths.length) {
                        this.frame = 0;
                        this.cycleStart = cycle - 1;
                        this.seqType = undefined;
                        return 0;
                    }
                    continue;
                }
            }
        }

        this.cycleStart = cycle - elapsed;

        return this.frame;
    }
}
