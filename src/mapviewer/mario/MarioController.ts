import { RS_TO_RADIANS } from "../../rs/MathConstants";
import { clamp } from "../../util/MathUtil";
import { Camera, ProjectionType } from "../Camera";
import { InputManager, getAxisDeadzone } from "../InputManager";
import { CollisionSquare, collectMarioSurfaces } from "./CollisionGeometry";
import { LibSM64, createLibSM64, validateMarioRom } from "./LibSM64";
import { MarioAudio } from "./MarioAudio";
import { MARIO_SIZE_MULTIPLIER, MARIO_UNITS_PER_TILE as SCALE } from "./MarioScale";

const STEP = 1000 / 30;

export class MarioController {
    module?: LibSM64;
    texture?: Uint8Array;
    audio?: MarioAudio;
    status = "Choose a US SM64 ROM to play as Mario.";
    loading = false;
    spawned = false;
    originX = 0;
    originZ = 0;
    position = [0, 0, 0];
    private generation = 0;
    private accumulator = 0;
    private collisionX = Infinity;
    private collisionZ = Infinity;
    private collisionMaps: CollisionSquare[] = [];
    private spawnHeight = 0;
    private previousProjection?: ProjectionType;

    constructor(
        readonly camera: Camera,
        readonly input: InputManager,
    ) {}

    get active(): boolean {
        return !!this.module;
    }

    async start(file: File): Promise<void> {
        this.stop();
        const generation = this.generation;
        this.loading = true;
        this.status = "Loading Mario…";
        let module: LibSM64 | undefined;
        let initialized = false;
        try {
            this.audio = new MarioAudio(() => this.input.isGameplayFocused());
            // Nothing from the file is uploaded, persisted, or included in the build.
            const rom = new Uint8Array(await file.arrayBuffer());
            await validateMarioRom(rom);
            if (generation !== this.generation) return;
            module = await createLibSM64();
            if (generation !== this.generation) return;
            const pointer = module._malloc(rom.length);
            if (!pointer) throw new Error("Not enough memory to load the ROM.");
            try {
                module.HEAPU8.set(rom, pointer);
                const texturePointer = module._rs64_init(pointer);
                initialized = true;
                this.texture = module.HEAPU8.slice(texturePointer, texturePointer + 704 * 64 * 4);
            } finally {
                module._free(pointer);
            }
            this.module = module;
            module._rs64_music(1);
            this.previousProjection = this.camera.projectionType;
            this.camera.setProjectionType(ProjectionType.PERSPECTIVE);
            this.position = Array.from(this.camera.pos);
            this.originX = Math.floor(this.position[0] / 32) * 32;
            this.originZ = Math.floor(this.position[2] / 32) * 32;
            this.spawnHeight = -this.position[1] * SCALE;
            this.status = "Waiting for map collision…";
            this.input.element?.focus();
        } catch (error) {
            if (initialized) module?._rs64_terminate();
            if (generation === this.generation) {
                this.audio?.dispose();
                this.audio = undefined;
                this.module = undefined;
                this.texture = undefined;
                this.status = error instanceof Error ? error.message : "Could not load Mario.";
            }
        } finally {
            if (generation === this.generation) this.loading = false;
        }
    }

    stop(): void {
        this.generation++;
        this.audio?.dispose();
        this.audio = undefined;
        this.module?._rs64_terminate();
        this.module = undefined;
        this.texture = undefined;
        this.loading = false;
        this.spawned = false;
        this.accumulator = 0;
        this.collisionX = this.collisionZ = Infinity;
        this.collisionMaps = [];
        if (this.previousProjection !== undefined) {
            this.camera.setProjectionType(this.previousProjection);
            this.previousProjection = undefined;
        }
        this.status = "Choose a US SM64 ROM to play as Mario.";
    }

    respawn(): void {
        this.audio?.pause();
        this.spawned = false;
        this.accumulator = 0;
        // Try the nearest floor above the current position after a fall or death.
        this.spawnHeight = -this.position[1] * SCALE + 2000;
    }

    update(deltaTime: number, maps: Iterable<CollisionSquare>): void {
        const m = this.module;
        if (!m) return;
        const nearby = Array.from(maps).filter(
            (map) =>
                Math.abs(map.mapX * 64 + 32 - this.position[0]) <= 80 &&
                Math.abs(map.mapY * 64 + 32 - this.position[2]) <= 80,
        );
        const [x, , z] = this.position;
        if (
            !nearby.some(
                (map) => Math.floor(x / 64) === map.mapX && Math.floor(z / 64) === map.mapY,
            )
        ) {
            this.audio?.pause();
            this.status = "Waiting for map collision…";
            this.accumulator = 0;
            return;
        }
        const rebase = Math.abs(x - this.originX) > 32 || Math.abs(z - this.originZ) > 32;
        if (rebase) {
            this.originX = Math.floor(x / 32) * 32;
            this.originZ = Math.floor(z / 32) * 32;
        }
        if (
            rebase ||
            Math.abs(x - this.collisionX) >= 2 ||
            Math.abs(z - this.collisionZ) >= 2 ||
            nearby.length !== this.collisionMaps.length ||
            nearby.some((map, i) => map !== this.collisionMaps[i])
        ) {
            const vertices = collectMarioSurfaces(nearby, this.originX, this.originZ, x, z);
            const pointer = m._malloc(vertices.byteLength);
            if (!pointer) throw new Error("Not enough memory for Mario collision.");
            try {
                m.HEAP32.set(vertices, pointer / 4);
                if (!m._rs64_surfaces(pointer, vertices.length / 9))
                    throw new Error("Could not load Mario collision.");
            } finally {
                m._free(pointer);
            }
            if (rebase && this.spawned)
                m._rs64_move(
                    (x - this.originX) * SCALE,
                    -this.position[1] * SCALE,
                    (z - this.originZ) * SCALE,
                );
            this.collisionX = x;
            this.collisionZ = z;
            this.collisionMaps = nearby;
        }
        if (!this.spawned) {
            const sx = (x - this.originX) * SCALE;
            const sz = (z - this.originZ) * SCALE;
            const floor = m._rs64_floor(sx, this.spawnHeight + 100, sz);
            if (floor <= -10000 || m._rs64_spawn(sx, floor + 30, sz) < 0) {
                this.status =
                    "No floor here. Return to camera and choose a position above solid ground.";
                return;
            }
            this.spawned = true;
            this.spawnHeight = floor + 1000;
            this.camera.pitch = -160;
        }
        if (document.hidden || !this.input.isGameplayFocused()) {
            this.audio?.pause();
            this.status = "Paused — click the map to resume.";
            this.accumulator = 0;
            return;
        }
        const pad = this.input.getGamepad();
        const axis = (i: number) => getAxisDeadzone(pad?.axes[i] ?? 0, 0.15) / 0.85;
        const button = (i: number) => !!pad?.buttons[i]?.pressed;
        const key = (code: string) => this.input.isKeyDown(code);
        this.camera.updateYaw(this.camera.yaw, axis(2) * Math.min(deltaTime, 100) * 0.7);
        this.camera.pitch = clamp(
            this.camera.pitch - axis(3) * Math.min(deltaTime, 100) * 0.5,
            -400,
            -30,
        );
        const stickX = clamp(axis(0) + Number(key("KeyD")) - Number(key("KeyA")), -1, 1);
        const stickY = clamp(axis(1) + Number(key("KeyS")) - Number(key("KeyW")), -1, 1);
        const magnitude = Math.max(1, Math.hypot(stickX, stickY));
        const yaw = this.camera.yaw * RS_TO_RADIANS;
        this.accumulator += Math.min(deltaTime, 100);
        while (this.accumulator >= STEP) {
            m._rs64_tick(
                Math.sin(yaw),
                Math.cos(yaw),
                // Match libsm64's horizontal convention to the viewer's camera coordinates.
                -stickX / magnitude,
                stickY / magnitude,
                Number(button(0) || key("Space")),
                Number(button(2) || button(1) || key("KeyX")),
                Number(button(6) || button(7) || key("ShiftLeft") || key("ShiftRight")),
            );
            this.accumulator -= STEP;
        }
        const pointer = m._rs64_position() / 4;
        this.position = [
            m.HEAPF32[pointer] / SCALE + this.originX,
            -m.HEAPF32[pointer + 1] / SCALE,
            m.HEAPF32[pointer + 2] / SCALE + this.originZ,
        ];
        if (
            !this.position.every(Number.isFinite) ||
            m.HEAPF32[pointer + 1] < -10000 ||
            (m._rs64_health() > 0 && m._rs64_health() < 0x100)
        ) {
            this.position = [this.collisionX, -this.spawnHeight / SCALE, this.collisionZ];
            this.respawn();
            return;
        }
        // The same yaw convention as Camera.move: view-forward is (+sin yaw, +cos yaw).
        const distance = 4;
        const pitch = this.camera.pitch * RS_TO_RADIANS;
        this.camera.pos[0] = this.position[0] - Math.sin(yaw) * Math.cos(pitch) * distance;
        this.camera.pos[1] =
            this.position[1] - 0.5 * MARIO_SIZE_MULTIPLIER + Math.sin(pitch) * distance;
        this.camera.pos[2] = this.position[2] - Math.cos(yaw) * Math.cos(pitch) * distance;
        this.camera.updated = this.camera.updatedPosition = true;
        this.audio?.play(m);
        this.status = pad
            ? "Mario — controller connected"
            : "Mario — WASD / Space / X / Shift; press a gamepad button to connect.";
    }
}
