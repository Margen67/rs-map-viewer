import { blocksMario } from "./BlockingFlags";

test("only the no-blocking flag excludes geometry, independent of size or placement type", () => {
    for (let type = 0; type <= 22; type++)
        for (const clip of [0, 1, 2]) expect(blocksMario(type, clip)).toBe(clip !== 0);
});
