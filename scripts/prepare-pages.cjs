/* Publish catalog metadata only. Cache payloads download externally in the browser. */
const fs = require("node:fs/promises");
const archive = "https://archive.openrs2.org";
const original = "https://osrs.world/caches/";
async function request(url) {
    const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return response.json();
}
function cacheName(c) {
    return `${c.game === "oldschool" ? (c.environment === "beta" ? "osrs-beta" : "osrs") : "rs2"}-${
        c.builds?.[0]?.major
    }_${c.timestamp?.split("T")[0]}`;
}
function matchArchive(info, entries) {
    return entries
        .filter(
            (entry) =>
                entry.scope === "runescape" &&
                entry.language === "en" &&
                entry.game === info.game &&
                entry.environment === info.environment &&
                cacheName(entry) === info.name,
        )
        .sort((a, b) => b.valid_groups - a.valid_groups || b.valid_keys - a.valid_keys)[0];
}
function makeCatalog(normal, entries) {
    if (!Array.isArray(normal) || normal.length < 2)
        throw new Error("Original cache catalog is unavailable");
    return normal.map((info) => {
        const entry = matchArchive(info, entries);
        return entry
            ? {
                  ...info,
                  archiveUrl: `${archive}/caches/${entry.scope}/${entry.id}/disk.zip`,
                  keysUrl: `${archive}/caches/${entry.scope}/${entry.id}/keys.json`,
              }
            : {
                  ...info,
                  unavailableReason:
                      "This snapshot is not on OpenRS2. Its original host does not allow browser downloads from this site. Please choose another snapshot.",
              };
    });
}
async function prepare() {
    await fs.access("build/index.html");
    const [normal, entries] = await Promise.all([
        request(original + "caches.json"),
        request(archive + "/caches.json"),
    ]);
    const catalog = makeCatalog(normal, entries);
    // Also remove payloads left by any previous build. Pages contains metadata only.
    await fs.rm("build/caches", { recursive: true, force: true });
    await fs.mkdir("build/caches", { recursive: true });
    await fs.writeFile("build/caches/caches.json", JSON.stringify(catalog));
    await fs.writeFile("build/.nojekyll", "");
    console.log(
        `Pages catalog: ${catalog.length} snapshots (${
            catalog.filter((c) => c.archiveUrl).length
        } externally available). No cache payloads included.`,
    );
}
if (require.main === module)
    prepare().catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
module.exports = { cacheName, matchArchive, makeCatalog };
