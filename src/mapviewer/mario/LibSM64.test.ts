import { webcrypto } from "crypto";

import { validateMarioRom } from "./LibSM64";

test("rejects malformed and modified ROMs before native asset extraction", async () => {
    await expect(validateMarioRom(new Uint8Array(16))).rejects.toThrow(/8 MiB/);
    const original = Object.getOwnPropertyDescriptor(globalThis, "crypto");
    Object.defineProperty(globalThis, "crypto", {
        configurable: true,
        value: webcrypto,
    });
    try {
        const bytes = new Uint8Array(8 * 1024 * 1024);
        bytes.set([0x80, 0x37, 0x12, 0x40]);
        await expect(validateMarioRom(bytes)).rejects.toThrow(/not the supported/);
    } finally {
        if (original) Object.defineProperty(globalThis, "crypto", original);
        else Reflect.deleteProperty(globalThis, "crypto");
    }
});
