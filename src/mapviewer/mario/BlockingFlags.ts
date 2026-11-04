import { LocModelType } from "../../rs/config/loctype/LocModelType";

/** Collision comes only from visible mesh geometry whose loc has player blocking enabled. */
export function blocksMario(_type: LocModelType, clipType: number): boolean {
    return clipType !== 0;
}
