import { blocksMario } from "./BlockingFlags";

test("floor decorations use the actual player-blocking rule rather than their default clip value", () => {
    for (const clip of [0, 1, 2]) {
        expect(blocksMario(22, clip)).toBe(clip === 1);
        for (let type = 0; type < 22; type++) expect(blocksMario(type, clip)).toBe(clip !== 0);
    }
});
