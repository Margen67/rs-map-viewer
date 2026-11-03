import { LibSM64 } from "./LibSM64";
import { MarioCombat, MarioEnemy, MarioNpcTarget } from "./MarioCombat";
import { MarioParticles } from "./MarioParticles";

function setup() {
    const particles = new MarioParticles();
    const combat = new MarioCombat(particles);
    const heap = new Float32Array(4);
    heap[1] = -10;
    const module = {
        HEAPF32: heap,
        _rs64_velocity: () => 0,
        _rs64_position: () => 0,
        _rs64_action: jest.fn(() => 0),
        _rs64_attack: jest.fn(() => 1),
        _rs64_stomp: jest.fn(),
        _rs64_push: jest.fn(),
        _rs64_enemy_sound: jest.fn(),
    } as unknown as LibSM64;
    const npc: MarioEnemy = {};
    const target: MarioNpcTarget = { npc, position: [0, 0, 0], radius: 0.5, height: 1 };
    return { particles, combat, module, npc, target };
}

test("crossing a head while descending bounces Mario, squashes once, then poofs", () => {
    const { particles, combat, module, npc, target } = setup();
    combat.interact(module, [target], [0, -1.1, 0], [0, -0.9, 0], 0, 0, 170, 1.5);
    expect(module._rs64_stomp).toHaveBeenCalledWith(0, 170, 0);
    expect(module._rs64_enemy_sound).toHaveBeenCalledTimes(1);
    expect(npc.marioReaction?.kind).toBe("stomp");
    combat.update(0.1);
    expect(npc.marioReaction?.scaleY).toBeCloseTo(0.5);
    combat.update(0.31);
    expect(npc.marioReaction?.hidden).toBe(true);
    expect(particles.particles.some((p) => p.effect === "poof")).toBe(true);
    combat.interact(module, [target], [0, -1.1, 0], [0, -0.9, 0], 0, 0, 170, 1.5);
    expect(module._rs64_enemy_sound).toHaveBeenCalledTimes(1);
    combat.reset();
    expect(npc.marioReaction).toBeUndefined();
});

test("side contact cannot become a stomp or idle attack, and pushes Mario outside the body", () => {
    const { combat, module, npc, target } = setup();
    combat.interact(module, [target], [0.6, -0.2, 0], [0.6, -0.1, 0], 0, 0, 170, 1.5);
    expect(module._rs64_stomp).not.toHaveBeenCalled();
    expect(module._rs64_attack).not.toHaveBeenCalled();
    expect(module._rs64_push).toHaveBeenCalled();
    expect(npc.marioReaction).toBeUndefined();
});

test("nearby native attack hits knock back and poof, but out-of-range targets never get hit", () => {
    const { combat, module, npc, target } = setup();
    (module._rs64_action as jest.Mock).mockReturnValue(1 << 23);
    combat.interact(module, [target], [10, 0, 0], [10, 0, 0], 0, 0, 170, 1.5);
    expect(module._rs64_attack).not.toHaveBeenCalled();
    combat.interact(module, [target], [0.8, -0.2, 0], [0.8, -0.2, 0], 0, 0, 170, 1.5);
    expect(module._rs64_attack).toHaveBeenCalledWith(0, -0, 0, 170);
    expect(npc.marioReaction?.kind).toBe("hit");
    combat.update(0.15);
    expect(npc.marioReaction!.offset[0]).toBeLessThan(0);
    expect(npc.marioReaction!.offset[1]).toBeLessThan(0);
    combat.update(0.21);
    expect(npc.marioReaction?.hidden).toBe(true);
});

test("an upward crossing of a head does not stomp an enemy", () => {
    const { combat, module, npc, target } = setup();
    module.HEAPF32[1] = 10;
    combat.interact(module, [target], [0, -0.9, 0], [0, -1.1, 0], 0, 0, 170, 1.5);
    expect(module._rs64_stomp).not.toHaveBeenCalled();
    expect(npc.marioReaction).toBeUndefined();
});
