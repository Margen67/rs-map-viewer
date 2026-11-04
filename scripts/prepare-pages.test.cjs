const assert = require("node:assert/strict");
const { test } = require("node:test");
const { matchArchive, makeCatalog } = require("./prepare-pages.cjs");
test("matches exact snapshot and prefers complete archives", () => {
    const info = { name: "osrs-215_2023-07-26", game: "oldschool", environment: "live" };
    const entry = {
        scope: "runescape",
        language: "en",
        game: "oldschool",
        environment: "live",
        builds: [{ major: 215 }],
        timestamp: "2023-07-26T00:00:00Z",
        valid_groups: 10,
        valid_keys: 1,
    };
    assert.equal(
        matchArchive(info, [
            { ...entry, id: 1 },
            { ...entry, id: 2, valid_groups: 12 },
            { ...entry, id: 3, language: "de", valid_groups: 20 },
        ]).id,
        2,
    );
    assert.equal(matchArchive({ ...info, name: "custom" }, [entry]), undefined);
});
test("catalog uses external archives and retains unavailable snapshot names", () => {
    const base = { name: "osrs-215_2023-07-26", game: "oldschool", environment: "live" };
    const entry = {
        id: 1447,
        scope: "runescape",
        language: "en",
        game: "oldschool",
        environment: "live",
        builds: [{ major: 215 }],
        timestamp: "2023-07-26T00:00:00Z",
    };
    const result = makeCatalog([base, { ...base, name: "custom" }], [entry]);
    assert.equal(result.length, 2);
    assert.equal(
        result[0].archiveUrl,
        "https://archive.openrs2.org/caches/runescape/1447/disk.zip",
    );
    assert.equal(result[1].archiveUrl, undefined);
    assert.match(result[1].unavailableReason, /not on OpenRS2/);
});
