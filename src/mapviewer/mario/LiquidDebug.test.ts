import { liquidDebugLines } from "./LiquidDebug";

test("cyan and red represent only real water and lava triangles", () => {
    const map = {
        mapX: 0,
        mapY: 0,
        marioCollision: new Int32Array(0),
        marioLiquids: new Int32Array([
            1, 0, 0, 0, 128, 0, 128, 128, 0, 0, 2, 128, -128, 0, 256, -128, 128, 256, -128, 0,
        ]),
    };
    const lines = liquidDebugLines([map], 1, 1);
    expect(lines.positions).toHaveLength(36);
    expect(lines.colors[0]).toBeCloseTo(0.1);
    expect(lines.colors[2]).toBe(1);
    expect(lines.colors[18]).toBe(1);
    expect(lines.colors[20]).toBeCloseTo(0.1);
});
