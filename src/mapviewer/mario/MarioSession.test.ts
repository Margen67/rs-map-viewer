import { Camera } from "../Camera";
import { InputManager } from "../InputManager";
import { createLibSM64, validateMarioRom } from "./LibSM64";
import { MarioController } from "./MarioController";

jest.mock("./LibSM64", () => ({
    createLibSM64: jest.fn(),
    validateMarioRom: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("./MarioAudio", () => ({
    MarioAudio: class {
        setVolume() {}
        dispose() {}
    },
}));
test("camera mode retains validated ROM in memory and resume chooses another song without reading the file", async () => {
    const module = {
        HEAPU8: new Uint8Array(1024),
        _malloc: () => 32,
        _free: jest.fn(),
        _rs64_init: () => 0,
        _rs64_effects: () => 0,
        _rs64_music: jest.fn(),
        _rs64_song: jest.fn(),
        _rs64_terminate: jest.fn(),
    };
    (createLibSM64 as jest.Mock).mockResolvedValue(module);
    const read = jest.fn().mockResolvedValue(new ArrayBuffer(16));
    const controller = new MarioController(new Camera(10, -2, 10, -160, 0), new InputManager());
    const random = jest.spyOn(Math, "random").mockReturnValueOnce(0).mockReturnValueOnce(0.99);
    await controller.start({ arrayBuffer: read } as unknown as File);
    expect(controller.active).toBe(true);
    controller.stop();
    expect(controller.hasRom).toBe(true);
    expect(controller.active).toBe(false);
    await controller.start();
    expect(controller.active).toBe(true);
    expect(read).toHaveBeenCalledTimes(1);
    expect(validateMarioRom).toHaveBeenCalledTimes(1);
    expect(module._rs64_song.mock.calls[0][0]).not.toBe(module._rs64_song.mock.calls[1][0]);
    controller.dispose();
    expect(controller.hasRom).toBe(false);
    random.mockRestore();
});
