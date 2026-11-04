import JSZip from "jszip";

import { validateMarioRom } from "./LibSM64";

const MAX_ROM_FILE = 32 * 1024 * 1024;
export async function readMarioRom(source: File): Promise<Uint8Array> {
    if (typeof source === "string") throw new Error("Choose a local .z64 or ZIP ROM file.");
    if (source.size > MAX_ROM_FILE) throw new Error("ROM file is too large (maximum 32 MiB).");
    const bytes = new Uint8Array(await source.arrayBuffer());
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
        const zip = await JSZip.loadAsync(bytes);
        const candidates = Object.values(zip.files).filter((f) => !f.dir && /\.z64$/i.test(f.name));
        if (!candidates.length) throw new Error("The ZIP contains no big-endian .z64 ROM.");
        for (const file of candidates) {
            const size = (file as any)._data?.uncompressedSize;
            if (size !== 8 * 1024 * 1024) continue;
            const rom = await file.async("uint8array");
            try {
                await validateMarioRom(rom);
                return rom;
            } catch {}
        }
        throw new Error("The ZIP contains no supported unmodified US SM64 .z64 ROM.");
    }
    await validateMarioRom(bytes);
    return bytes;
}
