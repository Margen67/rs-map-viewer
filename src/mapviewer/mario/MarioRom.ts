import JSZip from "jszip";

import { validateMarioRom } from "./LibSM64";

const MAX_ROM_DOWNLOAD = 32 * 1024 * 1024;
export async function readMarioRom(
    source: File | string,
    signal?: AbortSignal,
): Promise<Uint8Array> {
    let bytes: Uint8Array;
    if (typeof source === "string") {
        const url = new URL(source, window.location.href);
        if (!["https:", "http:"].includes(url.protocol))
            throw new Error("Use an HTTP or HTTPS ROM URL.");
        const response = await fetch(url.href, { signal, credentials: "omit" });
        if (!response.ok) throw new Error(`ROM download failed: HTTP ${response.status}`);
        if (Number(response.headers.get("Content-Length")) > MAX_ROM_DOWNLOAD)
            throw new Error("ROM download is too large (maximum 32 MiB).");
        const reader = response.body?.getReader();
        if (!reader) throw new Error("ROM response has no data.");
        const parts: Uint8Array[] = [];
        let length = 0;
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            length += value.length;
            if (length > MAX_ROM_DOWNLOAD) {
                await reader.cancel();
                throw new Error("ROM download is too large (maximum 32 MiB).");
            }
            parts.push(value);
        }
        bytes = new Uint8Array(length);
        let offset = 0;
        for (const part of parts) {
            bytes.set(part, offset);
            offset += part.length;
        }
    } else {
        if (source.size > MAX_ROM_DOWNLOAD)
            throw new Error("ROM file is too large (maximum 32 MiB).");
        bytes = new Uint8Array(await source.arrayBuffer());
    }
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
