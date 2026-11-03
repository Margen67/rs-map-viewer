import { MarioParticles } from "./MarioParticles";

test("native dust/star flags emit bounded particles that move and expire", () => {
    const effects = new MarioParticles();
    effects.movement(1 | 8, [10, 0, 20], 1.5);
    expect(effects.particles.filter((p) => p.effect === "dust")).toHaveLength(1);
    expect(effects.particles.filter((p) => p.effect === "spark")).toHaveLength(3);
    effects.update(0.1);
    expect(effects.particles[0].position[1]).toBeLessThan(0);
    effects.emit("poof", [0, 0, 0], 1.5, 200);
    expect(effects.particles).toHaveLength(128);
    effects.update(1);
    expect(effects.particles).toHaveLength(0);
});
