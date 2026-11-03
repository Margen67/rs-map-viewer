/* A Pages artifact needs actual map data; the development server's /caches route is absent. */
const fs = require("node:fs/promises");
const path = require("node:path");
const AdmZip = require("adm-zip");

const CACHE_ID = 1447;
const CACHE_NAME = "osrs-215_2023-07-26";
const archive = "https://archive.openrs2.org";
const cacheDir = path.resolve(process.env.PAGES_CACHE_DIR || ".cache/pages/openrs2-1447");
const cacheFile = /^main_file_cache\.(dat2|idx\d+)$/;

async function request(url) {
    const response = await fetch(url, { signal: AbortSignal.timeout(180000) });
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return response;
}

async function validateCache() {
    const info = JSON.parse(await fs.readFile(path.join(cacheDir, "info.json"), "utf8"));
    if (info.id !== CACHE_ID || info.game !== "oldschool" || info.builds[0]?.major !== 215) {
        throw new Error("Unexpected Pages cache revision");
    }
    const keys = JSON.parse(await fs.readFile(path.join(cacheDir, "keys.json"), "utf8"));
    if (!Object.keys(keys).length) throw new Error("Missing map decryption keys");
    for (const name of [
        "main_file_cache.dat2",
        "main_file_cache.idx0",
        "main_file_cache.idx5",
        "main_file_cache.idx255",
    ]) {
        if (!(await fs.stat(path.join(cacheDir, name))).size)
            throw new Error(`Empty cache file: ${name}`);
    }
    return info;
}

async function prepare() {
    await fs.access("build/index.html");
    try {
        await validateCache();
    } catch {
        await fs.mkdir(cacheDir, { recursive: true });
        const [metadata, zip, keyEntries] = await Promise.all([
            request(`${archive}/caches.json`).then((r) => r.json()),
            request(`${archive}/caches/runescape/${CACHE_ID}/disk.zip`).then((r) =>
                r.arrayBuffer(),
            ),
            request(`${archive}/caches/runescape/${CACHE_ID}/keys.json`).then((r) => r.json()),
        ]);
        const info = metadata.find((entry) => entry.id === CACHE_ID);
        if (!info) throw new Error(`OpenRS2 cache ${CACHE_ID} is unavailable`);
        // Extract only known data filenames. Never copy arbitrary archive paths or local files.
        for (const entry of new AdmZip(Buffer.from(zip)).getEntries()) {
            const name = entry.entryName.replace(/^cache\//, "");
            if (!entry.isDirectory && cacheFile.test(name)) {
                await fs.writeFile(path.join(cacheDir, name), entry.getData());
            }
        }
        await fs.writeFile(
            path.join(cacheDir, "keys.json"),
            JSON.stringify(Object.fromEntries(keyEntries.map((e) => [e.group, e.key]))),
        );
        await fs.writeFile(path.join(cacheDir, "info.json"), JSON.stringify(info));
    }
    const info = await validateCache();
    const output = path.join("build", "caches", CACHE_NAME);
    await fs.mkdir(output, { recursive: true });
    for (const name of await fs.readdir(cacheDir)) {
        if (cacheFile.test(name) || name === "keys.json") {
            await fs.copyFile(path.join(cacheDir, name), path.join(output, name));
        }
    }
    await fs.writeFile(
        "build/caches/caches.json",
        JSON.stringify([
            {
                name: CACHE_NAME,
                game: info.game,
                environment: info.environment,
                revision: 215,
                timestamp: info.timestamp,
                size: info.size,
            },
        ]),
    );
    await fs.writeFile("build/.nojekyll", "");
    console.log(`Pages artifact prepared with OpenRS2 cache ${CACHE_ID} (${CACHE_NAME}).`);
}

prepare().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
