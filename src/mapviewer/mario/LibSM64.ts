export interface LibSM64 {
    HEAPU8: Uint8Array;
    HEAP32: Int32Array;
    HEAP16: Int16Array;
    HEAPF32: Float32Array;
    _malloc(bytes: number): number;
    _free(pointer: number): void;
    _rs64_init(rom: number): number;
    _rs64_terminate(): void;
    _rs64_surfaces(vertices: number, count: number): number;
    _rs64_floor(x: number, y: number, z: number): number;
    _rs64_spawn(x: number, y: number, z: number): number;
    _rs64_tick(
        camX: number,
        camZ: number,
        x: number,
        y: number,
        a: number,
        b: number,
        z: number,
    ): void;
    _rs64_move(x: number, y: number, z: number): void;
    _rs64_position(): number;
    _rs64_health(): number;
    _rs64_triangles(): number;
    _rs64_buffer(index: number): number;
    _rs64_audio_buffer(): number;
    _rs64_audio_tick(queuedFrames: number): number;
    _rs64_music(enabled: number): void;
    _rs64_volumes(effects: number, music: number): void;
    _rs64_song(sequence: number): void;
    _rs64_speed(multiplier: number): void;
    _rs64_shore_jump(x: number, z: number, water: number): number;
    _rs64_environment(water: number, bottom: number, lava: number): void;
    _rs64_effects(): number;
    _rs64_velocity(): number;
    _rs64_particles(): number;
    _rs64_action(): number;
    _rs64_attack(x: number, y: number, z: number, height: number): number;
    _rs64_stomp(x: number, y: number, z: number): void;
    _rs64_enemy_sound(): void;
    _rs64_door_sound(open: number): void;
    _rs64_push(dx: number, dz: number): void;
}

type Factory = (options: { locateFile: (file: string) => string }) => Promise<LibSM64>;
declare global {
    interface Window {
        createLibSM64?: Factory;
    }
}

let loadingScript: Promise<void> | undefined;
// Keep the native ABI pair together across GitHub Pages/browser caches.
const RUNTIME_VERSION = "indexed-collision-7";
export async function createLibSM64(): Promise<LibSM64> {
    const base = `${process.env.PUBLIC_URL || ""}/libsm64/`;
    if (!window.createLibSM64) {
        if (!loadingScript) {
            loadingScript = new Promise<void>((resolve, reject) => {
                const script = document.createElement("script");
                script.src = base + "libsm64.js?v=" + RUNTIME_VERSION;
                script.onload = () => resolve();
                script.onerror = () => {
                    script.remove();
                    reject(
                        new Error("Could not load libsm64. Rebuild it with yarn build-libsm64."),
                    );
                };
                document.head.appendChild(script);
            }).catch((error) => {
                loadingScript = undefined;
                throw error;
            });
        }
        await loadingScript;
    }
    if (!window.createLibSM64) throw new Error("The libsm64 runtime did not load.");
    return window.createLibSM64({ locateFile: (file) => base + file + "?v=" + RUNTIME_VERSION });
}

/** Validate before passing any untrusted ROM offsets to the native asset loader. */
export async function validateMarioRom(bytes: Uint8Array): Promise<void> {
    if (
        bytes.length !== 8 * 1024 * 1024 ||
        bytes[0] !== 0x80 ||
        bytes[1] !== 0x37 ||
        bytes[2] !== 0x12 ||
        bytes[3] !== 0x40
    ) {
        throw new Error(
            "Select an unmodified US Super Mario 64 ROM in big-endian .z64 format (8 MiB).",
        );
    }
    const digest = await crypto.subtle.digest("SHA-1", bytes);
    const hash = Array.from(new Uint8Array(digest), (v) => v.toString(16).padStart(2, "0")).join(
        "",
    );
    if (hash !== "9bef1128717f958171a4afac3ed78ee2bb4e86ce") {
        throw new Error("This ROM is not the supported unmodified US Super Mario 64 release.");
    }
}
