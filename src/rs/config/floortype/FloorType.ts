import { Type } from "../Type";

export interface FloorType extends Type {
    rgbColor?: number;
    primaryRgb?: number;
    hue: number;
    saturation: number;
    lightness: number;

    isOverlay: boolean;

    getHueBlend(): number;

    getHueMultiplier(): number;
}
