export type MarioEffect = "dust" | "stomp" | "spark" | "poof";
export interface MarioParticle {
    position: number[];
    velocity: number[];
    age: number;
    duration: number;
    size: number;
    effect: MarioEffect;
}

export class MarioParticles {
    particles: MarioParticle[] = [];

    emit(effect: MarioEffect, position: number[], scale: number, count = 1): void {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = effect === "dust" ? 0.1 : (0.3 + Math.random() * 0.5) * scale;
            this.particles.push({
                position: [...position],
                velocity: [Math.cos(angle) * speed, -0.3 * scale, Math.sin(angle) * speed],
                age: 0,
                duration: effect === "poof" ? 0.5 : 0.35,
                size: (effect === "poof" ? 0.7 : effect === "spark" ? 0.25 : 0.3) * scale,
                effect,
            });
        }
        if (this.particles.length > 128) this.particles.splice(0, this.particles.length - 128);
    }

    movement(flags: number, position: number[], scale: number): void {
        if (flags & (1 | (1 << 13) | (1 << 14) | (1 << 15) | (1 << 17)))
            this.emit("dust", position, scale);
        if (flags & (2 | 8 | 16 | (1 << 18)))
            this.emit("spark", [position[0], position[1] - 0.4 * scale, position[2]], scale, 3);
        if (flags & (1 << 16)) this.emit("poof", position, scale, 5);
    }

    update(seconds: number): void {
        for (const particle of this.particles) {
            particle.age += seconds;
            for (let i = 0; i < 3; i++) particle.position[i] += particle.velocity[i] * seconds;
        }
        this.particles = this.particles.filter((particle) => particle.age < particle.duration);
    }

    clear(): void {
        this.particles = [];
    }
}
