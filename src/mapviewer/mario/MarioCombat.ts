import { LibSM64 } from "./LibSM64";
import { MarioParticles } from "./MarioParticles";

export interface NpcReaction {
    kind: "stomp" | "hit";
    age: number;
    scaleY: number;
    offset: number[];
    direction: number[];
    hidden: boolean;
    position: number[];
    scale: number;
}
export interface MarioEnemy {
    marioReaction?: NpcReaction;
}
export interface MarioNpcTarget {
    npc: MarioEnemy;
    position: number[];
    radius: number;
    height: number;
}

export class MarioCombat {
    private enemies = new Set<MarioEnemy>();
    constructor(private effects: MarioParticles) {}

    update(seconds: number): void {
        for (const npc of this.enemies) {
            const r = npc.marioReaction;
            if (!r || r.hidden) continue;
            r.age += seconds;
            if (r.kind === "stomp") r.scaleY = Math.max(0.12, 1 - r.age / 0.2);
            else {
                r.offset[0] = r.direction[0] * r.age * 2 * r.scale;
                r.offset[2] = r.direction[2] * r.age * 2 * r.scale;
                r.offset[1] = -Math.sin(Math.min(1, r.age / 0.4) * Math.PI) * 0.6 * r.scale;
            }
            if (r.age >= (r.kind === "stomp" ? 0.4 : 0.35)) {
                r.hidden = true;
                this.effects.emit(
                    "poof",
                    r.position.map((v, i) => v + r.offset[i]),
                    r.scale,
                    7,
                );
            }
        }
    }

    interact(
        m: LibSM64,
        targets: MarioNpcTarget[],
        previous: number[],
        current: number[],
        originX: number,
        originZ: number,
        units: number,
        size: number,
    ): void {
        const velocity = m.HEAPF32[m._rs64_velocity() / 4 + 1];
        for (const target of targets) {
            if (target.npc.marioReaction) continue;
            const [x, y, z] = target.position;
            const head = y - target.height;
            const distance = Math.hypot(current[0] - x, current[2] - z);
            const stomp =
                velocity < 0 &&
                distance <= target.radius + 35 / units &&
                previous[1] <= head + 12 / units &&
                current[1] >= head - 12 / units;
            const near =
                distance <= target.radius + 85 / units &&
                current[1] >= head - 80 / units &&
                current[1] - 140 / units <= y;
            if (!stomp && !near) continue;
            const sx = (x - originX) * units,
                sy = -y * units,
                sz = (z - originZ) * units;
            if (stomp)
                m._rs64_stomp(
                    (current[0] - originX) * units,
                    -head * units,
                    (current[2] - originZ) * units,
                );
            else if (
                !(m._rs64_action() & (1 << 23)) ||
                !m._rs64_attack(sx, sy, sz, target.height * units)
            ) {
                const radius = target.radius + 37 / units;
                if (distance < radius && current[1] > head && current[1] - 140 / units < y) {
                    const dx = distance > 0.001 ? (current[0] - x) / distance : 1;
                    const dz = distance > 0.001 ? (current[2] - z) / distance : 0;
                    m._rs64_push(
                        dx * (radius - distance) * units,
                        dz * (radius - distance) * units,
                    );
                    const position = m._rs64_position() / 4;
                    current[0] = m.HEAPF32[position] / units + originX;
                    current[2] = m.HEAPF32[position + 2] / units + originZ;
                }
                continue;
            }
            m._rs64_enemy_sound();
            const norm = Math.max(0.001, distance);
            target.npc.marioReaction = {
                kind: stomp ? "stomp" : "hit",
                age: 0,
                scaleY: 1,
                offset: [0, 0, 0],
                direction: [(x - current[0]) / norm, 0, (z - current[2]) / norm],
                hidden: false,
                position: [...target.position],
                scale: size,
            };
            this.enemies.add(target.npc);
            this.effects.emit(
                stomp ? "stomp" : "spark",
                [x, stomp ? head : y - target.height / 2, z],
                size,
                stomp ? 4 : 3,
            );
            break; // One target per simulation step; native attack windows decide subsequent hits.
        }
    }

    reset(): void {
        for (const npc of this.enemies) npc.marioReaction = undefined;
        this.enemies.clear();
    }
}
