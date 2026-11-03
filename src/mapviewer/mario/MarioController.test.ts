import { Camera } from "../Camera";
import { InputManager } from "../InputManager";
import { LibSM64 } from "./LibSM64";
import { MarioController } from "./MarioController";
import { MARIO_UNITS_PER_TILE } from "./MarioScale";

function setup() {
    const input = new InputManager();
    const canvas = document.createElement("canvas");
    canvas.tabIndex = 0;
    document.body.appendChild(canvas);
    input.init(canvas);
    canvas.focus();
    const camera = new Camera(10, -2, 10, -160, 0);
    const controller = new MarioController(camera, input);
    controller.position = [10, -2, 10];
    const heap = new Float32Array(4096);
    heap.set([10 * MARIO_UNITS_PER_TILE, 2 * MARIO_UNITS_PER_TILE, 10 * MARIO_UNITS_PER_TILE], 16);
    const tick = jest.fn();
    controller.module = {
        HEAPF32: heap,
        HEAP32: new Int32Array(heap.buffer),
        _malloc: () => 1024,
        _free: jest.fn(),
        _rs64_surfaces: () => 1,
        _rs64_floor: () => 0,
        _rs64_spawn: () => 0,
        _rs64_tick: tick,
        _rs64_position: () => 64,
        _rs64_health: () => 0x880,
        _rs64_terminate: jest.fn(),
    } as unknown as LibSM64;
    const maps = [{ mapX: 0, mapY: 0, marioCollision: new Int32Array(9) }];
    return { input, canvas, controller, tick, maps };
}

afterEach(() => document.body.replaceChildren());

test("ticks at 30Hz, maps standard buttons, and normalizes diagonal movement", () => {
    const { input, controller, tick, maps } = setup();
    jest.spyOn(input, "getGamepad").mockReturnValue({
        axes: [1, -1, 0, 0],
        buttons: Array.from({ length: 8 }, (_, i) => ({ pressed: [0, 2, 6].includes(i) })),
    } as unknown as Gamepad);
    controller.update(20, maps);
    expect(tick).not.toHaveBeenCalled();
    controller.update(20, maps);
    expect(tick).toHaveBeenCalledTimes(1);
    const args = tick.mock.calls[0];
    expect(args[0]).toBe(0);
    expect(args[1]).toBe(1);
    expect(args[2]).toBeCloseTo(-Math.SQRT1_2);
    expect(args[3]).toBeCloseTo(-Math.SQRT1_2);
    expect(args.slice(4)).toEqual([1, 1, 1]);
    controller.update(5000, maps);
    expect(tick.mock.calls.length).toBeLessThanOrEqual(4);
    input.cleanUp();
});

test("pauses when the map loses focus and waits for real collision data", () => {
    const { input, canvas, controller, tick, maps } = setup();
    controller.update(100, []);
    expect(tick).not.toHaveBeenCalled();
    canvas.blur();
    controller.update(100, maps);
    expect(tick).not.toHaveBeenCalled();
    expect(controller.status).toMatch(/Paused/);
    canvas.focus();
    input.keys.set("KeyW", true);
    input.keys.set("Space", true);
    controller.update(34, maps);
    expect(tick).toHaveBeenCalledTimes(1);
    expect(tick.mock.calls[0][2]).toBeCloseTo(0);
    expect(tick.mock.calls[0].slice(3)).toEqual([-1, 1, 0, 0]);
    controller.stop();
    expect(controller.active).toBe(false);
    input.cleanUp();
});

test.each([
    ["right", 1, "KeyD", -1],
    ["left", -1, "KeyA", 1],
])(
    "maps %s on the left stick and keyboard to libsm64's horizontal convention",
    (_, axis, code, expected) => {
        const { input, controller, tick, maps } = setup();
        const getPad = jest
            .spyOn(input, "getGamepad")
            .mockReturnValue({ axes: [axis, 0, 0, 0], buttons: [] } as unknown as Gamepad);
        controller.update(34, maps);
        expect(tick.mock.calls[0][2]).toBe(expected);
        getPad.mockReturnValue(null);
        input.keys.set(code as string, true);
        controller.update(34, maps);
        expect(tick.mock.calls[1][2]).toBe(expected);
        input.cleanUp();
    },
);
