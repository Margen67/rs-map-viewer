import { LocModelType } from "../../rs/config/loctype/LocModelType";
import { blocksMario, isTinyMarioObstacle } from "./BlockingFlags";

test("matches scene player-blocking flags for walls, scenery, roofs and decorations", () => {
    for (let type = 0; type <= 22; type++) {
        for (const clip of [0, 1, 2]) {
            const expected =
                type === 22
                    ? clip === 1
                    : type <= 3 || type === 9 || type === 10 || type === 11
                    ? clip !== 0
                    : false;
            expect(blocksMario(type, clip)).toBe(expected);
        }
    }
    expect(blocksMario(LocModelType.FLOOR_DECORATION, 2)).toBe(false);
});

test("tiny clutter filter requires small bounds on all three axes", () => {
    const model = (x: number, y: number, z: number) => ({
        verticesX: [0, x],
        verticesY: [-y, 0],
        verticesZ: [0, z],
    });
    expect(isTinyMarioObstacle(model(32, 16, 32))).toBe(true);
    expect(isTinyMarioObstacle(model(33, 16, 32))).toBe(false);
    expect(isTinyMarioObstacle(model(32, 17, 32))).toBe(false);
    expect(isTinyMarioObstacle(model(32, 16, 33))).toBe(false);
    expect(isTinyMarioObstacle(model(128, 1, 128))).toBe(false);
});
