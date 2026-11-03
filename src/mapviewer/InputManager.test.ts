import { InputManager } from "./InputManager";

test("discovers a previously connected pad, survives disconnects and ignores nonstandard pads", () => {
    const input = new InputManager();
    const first = { index: 1, connected: true, mapping: "standard" } as Gamepad;
    let pads: (Gamepad | null)[] = [null, first];
    Object.defineProperty(navigator, "getGamepads", { configurable: true, value: () => pads });
    expect(input.getGamepad()).toBe(first);
    pads = [{ index: 0, connected: true, mapping: "" } as Gamepad, null];
    expect(input.getGamepad()).toBeNull();
    const next = { index: 2, connected: true, mapping: "standard" } as Gamepad;
    pads.push(next);
    expect(input.getGamepad()).toBe(next);
    Object.defineProperty(navigator, "getGamepads", {
        configurable: true,
        value: () => {
            throw new Error("denied");
        },
    });
    expect(input.getGamepad()).toBeNull();
    delete (navigator as Partial<Navigator>).getGamepads;
});
