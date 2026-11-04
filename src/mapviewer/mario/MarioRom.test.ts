import JSZip from "jszip";

import { validateMarioRom } from "./LibSM64";
import { marioRomDownloadUrl, readMarioRom } from "./MarioRom";

jest.mock("./LibSM64", () => ({ validateMarioRom: jest.fn().mockResolvedValue(undefined) }));
function file(data: Uint8Array): File {
    return { size: data.length, arrayBuffer: async () => data.buffer } as File;
}
test("unpacks and validates an 8 MiB z64 from ZIP without selecting unrelated files", async () => {
    const zip = new JSZip();
    zip.file("readme.txt", "ignored");
    const rom = new Uint8Array(8 * 1024 * 1024);
    rom.set([0x80, 0x37, 0x12, 0x40]);
    zip.file("folder/US.Z64", rom);
    const bytes = await zip.generateAsync({ type: "uint8array" });
    const result = await readMarioRom(file(bytes));
    expect(result).toEqual(rom);
    expect(validateMarioRom).toHaveBeenCalledWith(result);
});
test("rejects unsupported URLs and archives without a z64", async () => {
    await expect(readMarioRom("javascript:alert(1)")).rejects.toThrow(/HTTP/);
    const zip = new JSZip();
    zip.file("readme.txt", "none");
    await expect(
        readMarioRom(file(await zip.generateAsync({ type: "uint8array" }))),
    ).rejects.toThrow(/no big-endian/);
});

test("converts sharing pages to direct downloads without changing arbitrary signed URLs", () => {
    expect(
        marioRomDownloadUrl("https://github.com/owner/repo/blob/main/folder/US.zip?raw=1").href,
    ).toBe("https://raw.githubusercontent.com/owner/repo/main/folder/US.zip");
    expect(
        marioRomDownloadUrl("https://www.dropbox.com/scl/fi/id/US.zip?rlkey=key&dl=0").href,
    ).toBe("https://dl.dropboxusercontent.com/scl/fi/id/US.zip?rlkey=key");
    const signed = "https://example.com/US.zip?signature=abc&expires=123";
    expect(marioRomDownloadUrl(signed).href).toBe(signed);
});

test("explains blocked downloads, preserves cancellation, and requests readable CORS responses", async () => {
    const original = global.fetch;
    const fetchMock = jest.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    global.fetch = fetchMock;
    try {
        await expect(readMarioRom("https://example.com/US.zip")).rejects.toThrow(/Choose ROM/);
        expect(fetchMock).toHaveBeenCalledWith("https://example.com/US.zip", {
            signal: undefined,
            credentials: "omit",
            mode: "cors",
        });
        const controller = new AbortController();
        controller.abort();
        const abort = new DOMException("Cancelled", "AbortError");
        fetchMock.mockRejectedValue(abort);
        await expect(readMarioRom("https://example.com/US.zip", controller.signal)).rejects.toBe(
            abort,
        );
    } finally {
        global.fetch = original;
    }
});
