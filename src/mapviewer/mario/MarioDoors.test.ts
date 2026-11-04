import { LocType } from "../../rs/config/loctype/LocType";
import { Model } from "../../rs/model/Model";
import { SceneBuffer, SceneModel } from "../webgl/buffer/SceneBuffer";
import { LocAnimated } from "../webgl/loc/LocAnimated";
import { createMarioDoor, isMarioDoor } from "./MarioDoors";

test("opening a door rotates matching visible and solid frames around a fixed hinge", () => {
    const model = Object.assign(new Model(), {
        verticesCount: 3,
        faceCount: 1,
        verticesX: new Int32Array([0, 128, 0]),
        verticesY: new Int32Array([0, 0, -200]),
        verticesZ: new Int32Array(3),
        indices1: new Int32Array([0]),
        indices2: new Int32Array([1]),
        indices3: new Int32Array([2]),
        faceColors3: new Int32Array([0]),
    });
    const type = { id: 1, name: "Door", actions: ["Open"] } as LocType;
    expect(isMarioDoor(type)).toBe(true);
    expect(isMarioDoor({ ...type, name: "Chest" })).toBe(false);
    const rendered: Model[] = [];
    const buffer = {
        addModelAnimFrame: (m: Model) => {
            rendered.push(m);
            return [0, 3];
        },
    } as unknown as SceneBuffer;
    const door = createMarioDoor(
        {
            model,
            sceneX: 128,
            sceneZ: 128,
            sceneHeight: 0,
            level: 0,
            marioSolid: true,
        } as SceneModel,
        type,
        buffer,
    );
    const frames = door.anim.marioCollisionFrames!;
    expect(Array.from(frames[0])).toEqual([0, 0, 0, 128, 0, 0, 0, -200, 0]);
    expect(Array.from(frames[8])).toEqual([0, 0, 0, 0, 0, 128, 0, -200, 0]);
    expect(rendered[8].verticesZ[1]).toBe(128);
    const loc = new LocAnimated(0, 0, 0, 0, 0, 0, 0, 0, door.anim, undefined, 0, false);
    loc.toggleDoor();
    loc.update({} as any, 4);
    loc.update({} as any, 8);
    expect(loc.frame).toBe(8);
    loc.toggleDoor();
    loc.update({} as any, 12);
    loc.update({} as any, 16);
    expect(loc.frame).toBe(0);
});
