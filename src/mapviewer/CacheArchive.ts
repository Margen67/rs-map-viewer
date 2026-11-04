import JSZip from "jszip";

import { CacheFiles, ProgressListener } from "../rs/cache/CacheFiles";
import { CacheInfo } from "../rs/cache/CacheInfo";

const allowedFile =
    /^(main_file_cache\.(dat2?|idx\d+)|models|title|config|media|textures|maps\.json|keys\.json|maps\/[ml]\d+_\d+)$/;
const basePath = `${process.env.PUBLIC_URL || ""}/caches/`;
function archiveUrl(value: string): string {
    return /^https:\/\//.test(value) ? value : `${process.env.PUBLIC_URL || ""}/${value}`;
}
function sharedBuffer(buffer: ArrayBuffer): ArrayBuffer {
    if (typeof SharedArrayBuffer === "undefined") return buffer;
    const result = new SharedArrayBuffer(buffer.byteLength);
    new Uint8Array(result).set(new Uint8Array(buffer));
    return result;
}
function normalizeKeys(value: unknown): Map<number, number[]> {
    const entries: [string, number[]][] = Array.isArray(value)
        ? value.map((entry) => [String(entry.group), entry.key])
        : Object.entries(value as Record<string, number[]>);
    return new Map(entries.map(([key, value]) => [Number(key), value]));
}
async function request(url: string, signal?: AbortSignal): Promise<Response> {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`Could not download cache: HTTP ${response.status}`);
    return response;
}

/** Load only the selected snapshot and retain its unpacked files in the browser cache. */
export async function loadCacheArchive(
    info: CacheInfo,
    signal?: AbortSignal,
    progress?: ProgressListener,
): Promise<{ files: CacheFiles; xteas: Map<number, number[]> }> {
    const cache = await caches.open(info.name);
    const prefix = basePath + info.name + "/";
    const completeKey = prefix + "archive-complete.json";
    const source = info.archiveUrl!;
    const completed = await cache.match(completeKey);
    if (completed) {
        const manifest = await completed.json();
        if (manifest.source === source) {
            const files = new Map<string, ArrayBuffer>();
            let intact = true;
            for (const name of manifest.files as string[]) {
                const response = await cache.match(prefix + name);
                if (!response) {
                    intact = false;
                    break;
                }
                files.set(name, sharedBuffer(await response.arrayBuffer()));
            }
            if (intact)
                return { files: new CacheFiles(files), xteas: normalizeKeys(manifest.keys) };
        }
    }
    const response = await request(archiveUrl(source), signal);
    const reader = response.body!.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    const total = Number(response.headers.get("Content-Length")) || info.size;
    progress?.({ current: 0, total, part: new Uint8Array(0) });
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        size += value.byteLength;
        progress?.({ current: size, total: Math.max(total, size), part: new Uint8Array(0) });
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    chunks.length = 0;
    const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
    let keyData: unknown = {};
    const keysEntry = zip.file("keys.json") || zip.file("cache/keys.json");
    if (info.keysUrl) keyData = await (await request(info.keysUrl, signal)).json();
    else if (keysEntry) keyData = JSON.parse(await keysEntry.async("string"));
    const keys = normalizeKeys(keyData);
    const files = new Map<string, ArrayBuffer>();
    let persistent = true;
    for (const [name, entry] of Object.entries(zip.files)) {
        const filename = name.replace(/^cache\//, "");
        if (entry.dir || filename === "keys.json" || !allowedFile.test(filename)) continue;
        if (signal?.aborted) throw new DOMException("Cache download cancelled", "AbortError");
        const buffer = await entry.async("arraybuffer");
        files.set(filename, sharedBuffer(buffer));
        try {
            await cache.put(prefix + filename, new Response(buffer));
        } catch {
            persistent = false;
        }
    }
    if (
        !files.has("main_file_cache.dat2") &&
        !files.has("main_file_cache.dat") &&
        !files.has("models")
    )
        throw new Error("Cache archive has no supported data files");
    if (persistent) {
        try {
            await cache.put(
                completeKey,
                new Response(
                    JSON.stringify({
                        source,
                        files: [...files.keys()],
                        keys: Object.fromEntries(keys),
                    }),
                ),
            );
        } catch {}
    }
    progress?.({ current: size, total: size, part: new Uint8Array(0) });
    return { files: new CacheFiles(files), xteas: keys };
}
