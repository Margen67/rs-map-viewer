import { LocModelType } from "../../rs/config/loctype/LocModelType";
import { LocType } from "../../rs/config/loctype/LocType";
import { Model } from "../../rs/model/Model";
import { LocEntity } from "../../rs/scene/entity/LocEntity";
import { ContourGroundType, SceneBuffer, SceneModel } from "../webgl/buffer/SceneBuffer";
import { LocAnimatedGroup } from "../webgl/loc/LocAnimatedGroup";

export function isMarioDoor(type: Pick<LocType, "name" | "actions">): boolean {
    return (
        /door|gate/i.test(type.name) &&
        type.actions.some((action) => action?.toLowerCase() === "open")
    );
}

/** Bake hinge rotation into matching render/collision frames, never a disappearing collider. */
export function createMarioDoor(
    model: SceneModel,
    type: LocType,
    buffer: SceneBuffer,
): LocAnimatedGroup {
    const source = model.model;
    const extent = (values: Int32Array) => {
        let min = Infinity,
            max = -Infinity;
        for (const value of values) {
            min = Math.min(min, value);
            max = Math.max(max, value);
        }
        return [min, max];
    };
    const [minX, maxX] = extent(source.verticesX),
        [minZ, maxZ] = extent(source.verticesZ);
    const alongX = maxX - minX >= maxZ - minZ;
    const hingeX = alongX ? minX : (minX + maxX) / 2;
    const hingeZ = alongX ? (minZ + maxZ) / 2 : minZ;
    const models = Array.from({ length: 9 }, (_, frame) => {
        const copy = Model.copyAnimated(source, true, true);
        copy.contourVerticesY = undefined;
        copy.verticesY = new Int32Array(source.contourVerticesY ?? source.verticesY);
        const angle = (frame * Math.PI) / 16,
            cos = Math.cos(angle),
            sin = Math.sin(angle);
        for (let i = 0; i < copy.verticesCount; i++) {
            const x = source.verticesX[i] - hingeX,
                z = source.verticesZ[i] - hingeZ;
            copy.verticesX[i] = Math.round(hingeX + x * cos - z * sin);
            copy.verticesZ[i] = Math.round(hingeZ + x * sin + z * cos);
        }
        return copy;
    });
    const frames = models.map((m) => buffer.addModelAnimFrame(m, false));
    const framesAlpha = models.map((m) => buffer.addModelAnimFrame(m, true));
    const marioCollisionFrames =
        model.marioSolid === false
            ? undefined
            : models.map((m) => {
                  const triangles: number[] = [];
                  for (let f = 0; f < m.faceCount; f++) {
                      if (m.faceColors3[f] === -2 || ((m.faceAlphas?.[f] ?? 0) & 255) === 255)
                          continue;
                      for (const v of [m.indices1[f], m.indices2[f], m.indices3[f]])
                          triangles.push(m.verticesX[v], m.verticesY[v], m.verticesZ[v]);
                  }
                  return new Int32Array(triangles);
              });
    return {
        anim: { frames, framesAlpha, marioCollisionFrames, marioDoor: true },
        locs: [
            {
                ...model,
                contourGround: ContourGroundType.CENTER_TILE,
                entity: new LocEntity(type.id, LocModelType.WALL, 0, model.level, 0, 0, -1, false),
                sceneLoc: {
                    tag: BigInt(0),
                    flags: 0,
                    x: model.sceneX,
                    y: model.sceneZ,
                    height: model.sceneHeight,
                },
            },
        ],
    };
}
