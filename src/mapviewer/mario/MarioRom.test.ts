import JSZip from "jszip";

import { validateMarioRom } from "./LibSM64";
import { readMarioRom } from "./MarioRom";

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
