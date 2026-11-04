import { RS_TO_RADIANS } from "../../rs/MathConstants";
import { clamp } from "../../util/MathUtil";
import { Camera, ProjectionType } from "../Camera";
import { InputManager, getAxisDeadzone } from "../InputManager";
import { CollisionSquare, collectMarioSurfaces } from "./CollisionGeometry";
import { LibSM64, createLibSM64 } from "./LibSM64";
import { MarioAudio } from "./MarioAudio";
import { MarioCombat, MarioNpcTarget } from "./MarioCombat";
import { SWIM_DEPTH, sampleMarioEnvironment } from "./MarioEnvironment";
import { MARIO_SONGS } from "./MarioMusic";
import { MarioParticles } from "./MarioParticles";
import { readMarioRom } from "./MarioRom";
import { MARIO_SIZE_MULTIPLIER } from "./MarioScale";

const STEP = 1000 / 30;

export class MarioController {
    module?: LibSM64;
    texture?: Uint8Array;
    audio?: MarioAudio;
    effectTexture?: Uint8Array;
    readonly particles = new MarioParticles();
    readonly combat = new MarioCombat(this.particles);
    size = MARIO_SIZE_MULTIPLIER;
    volume = 0.5;
    musicVolume = 0.3;
    song: number = 3;
    private songSelected = false;
    chooseSong(id: number): void {
        if (!MARIO_SONGS.some((s) => s[0] === id)) return;
        this.songSelected = true;
        this.song = id;
        this.module?._rs64_song(id);
        this.module?._rs64_music(Number(this.audio?.music ?? true));
    }
    cycleSong(direction: number): void {
        const i = MARIO_SONGS.findIndex((s) => s[0] === this.song);
        this.chooseSong(MARIO_SONGS[(i + direction + MARIO_SONGS.length) % MARIO_SONGS.length][0]);
    }
    setMusicVolume(value: number): void {
        this.musicVolume = clamp(value, 0, 1);
        this.module?._rs64_volumes(this.volume, this.musicVolume);
    }

    speed = 0.8;
    showCollision = false;
    showMapCollision = true;
    collisionThroughScenery = true;
    collisionVertices = new Int32Array(0);
    collisionRevision = 0;
    private rom?: Uint8Array;
    get hasRom(): boolean {
        return !!this.rom;
    }
    setSpeed(value: number): void {
        this.speed = clamp(value, 0.25, 3);
        this.module?._rs64_speed(this.speed);
    }
    onDoorInteract?: () => void;
    private doorHeld = false;
    private waterLevel = -11000;
    private lastWaterPosition?: number[];

    get unitsPerTile(): number {
        return 256 / this.size;
    }

    setSize(value: number): void {
        const previous = this.unitsPerTile;
        this.size = clamp(value, 0.5, 3);
        this.spawnHeight = (this.spawnHeight / previous) * this.unitsPerTile;
        this.collisionX = this.collisionZ = Infinity;
        if (this.spawned)
            this.module?._rs64_move(
                (this.position[0] - this.originX) * this.unitsPerTile,
                -this.position[1] * this.unitsPerTile,
                (this.position[2] - this.originZ) * this.unitsPerTile,
            );
        this.capturePose(true);
    }

    setVolume(value: number): void {
        this.volume = clamp(value, 0, 1);
        this.module?._rs64_volumes(this.volume, this.musicVolume);
    }
    status = "Choose a US SM64 ROM to play as Mario.";
    loading = false;
    spawned = false;
    originX = 0;
    originZ = 0;
    position = [0, 0, 0];
    private generation = 0;
    private accumulator = 0;
    interpolation = true;
    renderAlpha = 1;
    posePositions?: Float32Array;
    previousPosePositions?: Float32Array;
    private renderPreviousPosition = [0, 0, 0];
    private capturePose(reset = false): void {
        const m = this.module;
        if (!m) return;
        const count = m._rs64_triangles() * 9;
        if (!count) return;
        this.previousPosePositions = reset ? undefined : this.posePositions;
        const start = m._rs64_buffer(0) / 4;
        this.posePositions = m.HEAPF32.slice(start, start + count);
    }

    private collisionX = Infinity;
    private collisionZ = Infinity;
    private collisionMaps: CollisionSquare[] = [];
    private collisionVersions: (number | undefined)[] = [];
    private spawnHeight = 0;
    private previousProjection?: ProjectionType;

    constructor(
        readonly camera: Camera,
        readonly input: InputManager,
    ) {}

    get active(): boolean {
        return !!this.module;
    }

    async start(file?: File): Promise<void> {
        this.stop();
        const generation = this.generation;
        this.loading = true;
        this.status = "Loading Mario…";
        let module: LibSM64 | undefined;
        let initialized = false;
        try {
            this.audio = new MarioAudio(() => this.input.isGameplayFocused());
            this.audio.setVolume(1);
            // Nothing from the file is uploaded, persisted, or included in the build.
            const rom = file ? await readMarioRom(file) : this.rom;
            if (!rom) throw new Error("Choose a US SM64 ROM first.");
            if (generation !== this.generation) return;
            this.rom = rom;
            module = await createLibSM64();
            if (generation !== this.generation) return;
            const pointer = module._malloc(rom.length);
            if (!pointer) throw new Error("Not enough memory to load the ROM.");
            try {
                module.HEAPU8.set(rom, pointer);
                const texturePointer = module._rs64_init(pointer);
                initialized = true;
                this.texture = module.HEAPU8.slice(texturePointer, texturePointer + 704 * 64 * 4);
                const effects = module._rs64_effects();
                this.effectTexture = module.HEAPU8.slice(effects, effects + 640 * 32 * 4);
            } finally {
                module._free(pointer);
            }
            this.module = module;
            module._rs64_speed(this.speed);
            if (!this.songSelected)
                this.song = MARIO_SONGS[Math.floor(Math.random() * MARIO_SONGS.length)][0];
            module._rs64_song(this.song);
            module._rs64_volumes(this.volume, this.musicVolume);
            module._rs64_music(1);
            this.previousProjection = this.camera.projectionType;
            this.camera.setProjectionType(ProjectionType.PERSPECTIVE);
            this.position = Array.from(this.camera.pos);
            this.originX = Math.floor(this.position[0] / 32) * 32;
            this.originZ = Math.floor(this.position[2] / 32) * 32;
            this.spawnHeight = -this.position[1] * this.unitsPerTile;
            this.status = "Waiting for map collision…";
            this.input.element?.focus();
        } catch (error) {
            if (initialized) module?._rs64_terminate();
            if (generation === this.generation) {
                this.audio?.dispose();
                this.audio = undefined;
                this.module = undefined;
                this.texture = undefined;
                this.effectTexture = undefined;
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
        this.effectTexture = undefined;
        this.combat.reset();
        this.particles.clear();
        this.loading = false;
        this.spawned = false;
        this.accumulator = 0;
        this.posePositions = this.previousPosePositions = undefined;
        this.collisionX = this.collisionZ = Infinity;
        this.collisionVertices = new Int32Array(0);
        this.collisionRevision++;
        this.collisionMaps = [];
        this.collisionVersions = [];
        if (this.previousProjection !== undefined) {
            this.camera.setProjectionType(this.previousProjection);
            this.previousProjection = undefined;
        }
        this.doorHeld = false;
        this.waterLevel = -11000;
        this.lastWaterPosition = undefined;
        this.status = this.hasRom
            ? "Ready to play — ROM loaded for this session."
            : "Choose a US SM64 ROM to play as Mario.";
    }

    dispose(): void {
        this.stop();
        this.rom = undefined;
    }

    respawn(): void {
        this.audio?.pause();
        this.spawned = false;
        this.accumulator = 0;
        // Try the nearest floor above the current position after a fall or death.
        this.spawnHeight = -this.position[1] * this.unitsPerTile + 2000;
    }

    update(
        deltaTime: number,
        maps: Iterable<CollisionSquare>,
        targets: MarioNpcTarget[] = [],
    ): void {
        this.renderAlpha = 1;
        const SCALE = this.unitsPerTile;
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
            nearby.some(
                (map, i) =>
                    map !== this.collisionMaps[i] ||
                    map.marioCollisionVersion !== this.collisionVersions[i],
            )
        ) {
            const vertices = collectMarioSurfaces(
                nearby,
                this.originX,
                this.originZ,
                x,
                z,
                8,
                SCALE,
            );
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
            if (rebase) this.capturePose(true);
            this.collisionVertices = vertices;
            this.collisionRevision++;
            this.collisionX = x;
            this.collisionZ = z;
            this.collisionMaps = nearby;
            this.collisionVersions = nearby.map((map) => map.marioCollisionVersion);
        }
        if (!this.spawned) {
            const sx = (x - this.originX) * SCALE;
            const sz = (z - this.originZ) * SCALE;
            const floor = m._rs64_floor(sx, this.spawnHeight + 100, sz);
            const environment = sampleMarioEnvironment(nearby, x, this.position[1], z);
            const spawnY =
                environment.water > -10000 && environment.water * SCALE > floor + 100
                    ? environment.water * SCALE - 80
                    : floor + 30;
            if (floor <= -10000 || m._rs64_spawn(sx, spawnY, sz) < 0) {
                this.status =
                    "No floor here. Return to camera and choose a position above solid ground.";
                return;
            }
            this.spawned = true;
            this.position = [x, -spawnY / SCALE, z];
            this.renderPreviousPosition = [...this.position];
            this.posePositions = this.previousPosePositions = undefined;
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
        const door = button(3) || key("KeyE");
        if (door && !this.doorHeld) this.onDoorInteract?.();
        this.doorHeld = door;
        this.accumulator += Math.min(deltaTime, 100);
        while (this.accumulator >= STEP) {
            const statePointer = m._rs64_position() / 4;
            const previous = [
                m.HEAPF32[statePointer] / SCALE + this.originX,
                -m.HEAPF32[statePointer + 1] / SCALE,
                m.HEAPF32[statePointer + 2] / SCALE + this.originZ,
            ];
            const environment = sampleMarioEnvironment(
                nearby,
                previous[0],
                previous[1],
                previous[2],
            );
            const swimming = !!(m._rs64_action() & 0x2000);
            const moveLength = Math.hypot(stickX, stickY);
            const dx = (stickX * Math.cos(yaw) - stickY * Math.sin(yaw)) / Math.max(1, moveLength);
            const dz = (-stickX * Math.sin(yaw) - stickY * Math.cos(yaw)) / Math.max(1, moveLength);
            if (environment.water > -10000) this.lastWaterPosition = [...previous];
            if (
                swimming &&
                environment.water <= -10000 &&
                this.waterLevel > -10000 &&
                this.lastWaterPosition
            ) {
                previous[0] = this.lastWaterPosition[0];
                previous[2] = this.lastWaterPosition[2];
                m._rs64_move(
                    (previous[0] - this.originX) * SCALE,
                    -previous[1] * SCALE,
                    (previous[2] - this.originZ) * SCALE,
                );
                environment.water = this.waterLevel;
                environment.bottom = this.waterLevel - SWIM_DEPTH;
            }
            const velocityPointer = m._rs64_velocity() / 4;
            const horizontalSpeed = Math.hypot(
                m.HEAPF32[velocityPointer],
                m.HEAPF32[velocityPointer + 2],
            );
            if (swimming && (moveLength > 0.15 || horizontalSpeed > 1)) {
                const water = environment.water > -10000 ? environment.water : this.waterLevel;
                if (water > -10000) {
                    const velocity = m._rs64_velocity() / 4;
                    const reach = Math.max(
                        0.65,
                        (Math.hypot(m.HEAPF32[velocity], m.HEAPF32[velocity + 2]) * this.speed) /
                            SCALE +
                            0.3,
                    );
                    const moveX =
                        moveLength > 0.15 ? dx : m.HEAPF32[velocityPointer] / horizontalSpeed;
                    const moveZ =
                        moveLength > 0.15 ? dz : m.HEAPF32[velocityPointer + 2] / horizontalSpeed;
                    const targetX = previous[0] + moveX * reach,
                        targetZ = previous[2] + moveZ * reach;
                    const target = sampleMarioEnvironment(nearby, targetX, previous[1], targetZ);
                    if (target.water <= -10000 && target.lava <= -10000) {
                        // Stay on the wet side of the bank while initiating a real native jump.
                        if (environment.water <= -10000 && this.lastWaterPosition) {
                            environment.water = water;
                            environment.bottom = water - SWIM_DEPTH;
                            m._rs64_move(
                                (this.lastWaterPosition[0] - this.originX) * SCALE,
                                -previous[1] * SCALE,
                                (this.lastWaterPosition[2] - this.originZ) * SCALE,
                            );
                        }
                        m._rs64_shore_jump(
                            (targetX - this.originX) * SCALE,
                            (targetZ - this.originZ) * SCALE,
                            water * SCALE,
                        );
                    }
                }
            }
            this.waterLevel = environment.water;
            m._rs64_environment(
                environment.water > -10000 ? environment.water * SCALE : -11000,
                environment.bottom > -10000 ? environment.bottom * SCALE : -11000,
                environment.lava > -10000 ? environment.lava * SCALE : -11000,
            );
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
            const current = [
                m.HEAPF32[statePointer] / SCALE + this.originX,
                -m.HEAPF32[statePointer + 1] / SCALE,
                m.HEAPF32[statePointer + 2] / SCALE + this.originZ,
            ];
            this.particles.update(STEP / 1000);
            this.combat.update(STEP / 1000);
            this.particles.movement(m._rs64_particles(), current, this.size);
            this.combat.interact(
                m,
                targets,
                previous,
                current,
                this.originX,
                this.originZ,
                SCALE,
                this.size,
            );
            this.renderPreviousPosition = previous;
            this.capturePose();
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
        this.renderAlpha = this.interpolation ? this.accumulator / STEP : 1;
        const renderPosition = this.position.map(
            (value, i) =>
                this.renderPreviousPosition[i] +
                (value - this.renderPreviousPosition[i]) * this.renderAlpha,
        );
        // The same yaw convention as Camera.move: view-forward is (+sin yaw, +cos yaw).
        const distance = 4;
        const pitch = this.camera.pitch * RS_TO_RADIANS;
        this.camera.pos[0] = renderPosition[0] - Math.sin(yaw) * Math.cos(pitch) * distance;
        this.camera.pos[1] = renderPosition[1] - 0.5 * this.size + Math.sin(pitch) * distance;
        this.camera.pos[2] = renderPosition[2] - Math.cos(yaw) * Math.cos(pitch) * distance;
        this.camera.updated = this.camera.updatedPosition = true;
        this.audio?.play(m);
        this.status = pad
            ? "Mario — controller connected"
            : "Mario — WASD / Space / X / Shift; press a gamepad button to connect.";
    }
}
