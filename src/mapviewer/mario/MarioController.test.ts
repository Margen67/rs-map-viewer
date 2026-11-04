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
        _rs64_surfaces: jest.fn(() => 1),
        _rs64_floor: () => 0,
        _rs64_spawn: () => 0,
        _rs64_tick: tick,
        _rs64_triangles: () => 0,
        _rs64_buffer: () => 0,
        _rs64_volumes: jest.fn(),
        _rs64_speed: jest.fn(),
        _rs64_environment: jest.fn(),
        _rs64_position: () => 64,
        _rs64_health: () => 0x880,
        _rs64_particles: () => 0,
        _rs64_action: () => 0,
        _rs64_shore_jump: jest.fn(() => 0),
        _rs64_velocity: () => 0,
        _rs64_terminate: jest.fn(),
        _rs64_move: jest.fn(),
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

test("changing size rescales simulation coordinates while preserving Mario's world position", () => {
    const { input, controller, maps } = setup();
    controller.update(34, maps);
    const before = [...controller.position];
    controller.setSize(3);
    expect(controller.unitsPerTile).toBeCloseTo(256 / 3);
    expect(controller.position).toEqual(before);
    const args = (controller.module!._rs64_move as jest.Mock).mock.calls[0];
    expect(args[0] / controller.unitsPerTile).toBeCloseTo(before[0]);
    expect(-args[1] / controller.unitsPerTile).toBeCloseTo(before[1]);
    expect(args[2] / controller.unitsPerTile).toBeCloseTo(before[2]);
    input.cleanUp();
});

test("animated collision changes refresh native surfaces even when Mario stands still", () => {
    const { input, controller, maps } = setup();
    const map = { ...maps[0], marioCollisionVersion: 1 };
    controller.update(34, [map]);
    expect(controller.module!._rs64_surfaces).toHaveBeenCalledTimes(1);
    map.marioCollisionVersion++;
    controller.update(34, [map]);
    expect(controller.module!._rs64_surfaces).toHaveBeenCalledTimes(2);
    controller.update(34, [map]);
    expect(controller.module!._rs64_surfaces).toHaveBeenCalledTimes(2);
    input.cleanUp();
});

test("resizing a paused fresh spawn uses the floor position rather than the loading camera", () => {
    const { input, canvas, controller, maps } = setup();
    canvas.blur();
    controller.update(34, maps);
    expect(controller.spawned).toBe(true);
    expect(controller.position[1]).toBeCloseTo(-30 / controller.unitsPerTile);
    const y = controller.position[1];
    controller.setSize(2);
    const args = (controller.module!._rs64_move as jest.Mock).mock.calls[0];
    expect(-args[1] / controller.unitsPerTile).toBeCloseTo(y);
    input.cleanUp();
});

test("movement speed leaves the 30Hz clock unchanged and updates native movement", () => {
    const { input, controller, tick, maps } = setup();
    expect(controller.speed).toBe(0.8);
    controller.setSpeed(2);
    controller.update(100, maps);
    expect(tick).toHaveBeenCalledTimes(2);
    expect(controller.module!._rs64_speed).toHaveBeenCalledWith(2);
    input.cleanUp();
});

test("door interaction triggers on press, not on every held frame", () => {
    const { input, controller, maps } = setup();
    controller.onDoorInteract = jest.fn();
    input.keys.set("KeyE", true);
    controller.update(34, maps);
    controller.update(34, maps);
    expect(controller.onDoorInteract).toHaveBeenCalledTimes(1);
    input.keys.delete("KeyE");
    controller.update(34, maps);
    input.keys.set("KeyE", true);
    controller.update(34, maps);
    expect(controller.onDoorInteract).toHaveBeenCalledTimes(2);
    input.cleanUp();
});

test("spawning over water starts at the surface rather than on the deep seabed", () => {
    const { input, canvas, controller, maps } = setup();
    canvas.blur();
    controller.module!._rs64_floor = () => -700;
    controller.module!._rs64_spawn = jest.fn(() => 0);
    const map = {
        ...maps[0],
        marioLiquids: new Int32Array([
            1,
            9 * 128,
            0,
            9 * 128,
            11 * 128,
            0,
            11 * 128,
            11 * 128,
            0,
            9 * 128,
        ]),
    };
    controller.update(34, [map]);
    expect((controller.module!._rs64_spawn as jest.Mock).mock.calls[0][1]).toBe(-80);
    expect(controller.position[1]).toBeCloseTo(80 / controller.unitsPerTile);
    input.cleanUp();
});

test("swimming into dry terrain requests a shore jump toward movement without snapping upward", () => {
    const { input, controller, maps } = setup();
    const m = controller.module!;
    m._rs64_action = () => 0x2000;
    m.HEAPF32[17] = -80;
    const jump = jest.fn((_x: number, _z: number, _water: number) => 1);
    m._rs64_shore_jump = jump;
    input.keys.set("KeyW", true);
    const map = {
        ...maps[0],
        marioLiquids: new Int32Array([
            1,
            9 * 128,
            0,
            9 * 128,
            11 * 128,
            0,
            10.25 * 128,
            11 * 128,
            0,
            9 * 128,
            1,
            9 * 128,
            0,
            9 * 128,
            9 * 128,
            0,
            10.25 * 128,
            11 * 128,
            0,
            10.25 * 128,
        ]),
    };
    controller.update(34, [map]);
    expect(jump).toHaveBeenCalledTimes(1);
    expect(jump.mock.calls[0][0]).toBeCloseTo(10 * controller.unitsPerTile);
    expect(jump.mock.calls[0][1]).toBeCloseTo(10.65 * controller.unitsPerTile);
    expect(m._rs64_move).not.toHaveBeenCalled();
    input.cleanUp();
});

test("interpolation uses the same sub-tick position for the mesh and follow camera, and can be disabled", () => {
    const { input, controller, tick, maps } = setup();
    const m = controller.module!;
    m._rs64_triangles = () => 1;
    m._rs64_buffer = () => 128;
    tick.mockImplementation(() => {
        m.HEAPF32[16] += 10;
        m.HEAPF32[32] = m.HEAPF32[16];
    });
    controller.update(34, maps);
    controller.update(34, maps);
    expect(controller.renderAlpha).toBeGreaterThan(0);
    expect(controller.renderAlpha).toBeLessThan(1);
    const blended =
        controller.previousPosePositions![0] +
        (controller.posePositions![0] - controller.previousPosePositions![0]) *
            controller.renderAlpha;
    expect(controller.camera.pos[0]).toBeCloseTo(blended / controller.unitsPerTile);
    const ticks = tick.mock.calls.length;
    controller.interpolation = false;
    controller.update(1, maps);
    expect(controller.renderAlpha).toBe(1);
    expect(tick).toHaveBeenCalledTimes(ticks);
    expect(controller.camera.pos[0]).toBeCloseTo(controller.position[0]);
    input.cleanUp();
});

test("a swimmer coasting past a water edge stays on the finite wet-side floor even without input", () => {
    const { input, controller, maps } = setup();
    const m = controller.module!;
    m._rs64_action = () => 0x2000;
    m.HEAPF32[17] = -80;
    m._rs64_move = jest.fn((x, y, z) => {
        m.HEAPF32.set([x, y, z], 16);
    });
    const map = {
        ...maps[0],
        marioLiquids: new Int32Array([
            1,
            9 * 128,
            0,
            9 * 128,
            11 * 128,
            0,
            11 * 128,
            11 * 128,
            0,
            9 * 128,
        ]),
    };
    controller.update(34, [map]);
    m.HEAPF32[16] = 12 * controller.unitsPerTile;
    controller.update(34, [map]);
    expect(m._rs64_move).toHaveBeenCalled();
    expect(controller.position[0]).toBeCloseTo(10);
    expect(controller.position[1]).toBeCloseTo(80 / controller.unitsPerTile);
    input.cleanUp();
});
