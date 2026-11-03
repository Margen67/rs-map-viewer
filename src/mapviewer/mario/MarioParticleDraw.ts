import { App, DrawCall, PicoGL, Program, Texture, VertexArray, VertexBuffer } from "picogl";

import { Camera } from "../Camera";
import { MarioParticles } from "./MarioParticles";

const vertex = `#version 300 es
precision highp float;
layout(location=0) in vec3 a_position;
layout(location=1) in vec2 a_uv;
layout(location=2) in float a_alpha;
uniform mat4 u_viewProj;
out vec2 v_uv;
out float v_alpha;
void main() { gl_Position = u_viewProj * vec4(a_position, 1.); v_uv = a_uv; v_alpha = a_alpha; }`;
const fragment = `#version 300 es
precision highp float;
uniform sampler2D u_texture;
in vec2 v_uv;
in float v_alpha;
layout(location=0) out vec4 outColor;
layout(location=1) out vec4 outInteraction;
void main() {
    vec4 texel = texture(u_texture, v_uv);
    texel.a *= v_alpha;
    if (texel.a < .01) discard;
    outColor = texel; outInteraction = vec4(0.);
}`;

/** Billboards use only textures extracted from the local ROM, never RuneScape sprites. */
export class MarioParticleDraw {
    private program: Program;
    private buffers: VertexBuffer[];
    private array: VertexArray;
    private texture: Texture;
    private call: DrawCall;
    constructor(
        private app: App,
        readonly pixels: Uint8Array,
    ) {
        this.program = app.createProgram(vertex, fragment);
        this.buffers = [3, 2, 1].map((size) =>
            app.createVertexBuffer(
                PicoGL.FLOAT,
                size,
                new Float32Array(128 * 6 * size),
                PicoGL.DYNAMIC_DRAW,
            ),
        );
        this.array = app.createVertexArray();
        this.buffers.forEach((buffer, i) => this.array.vertexAttributeBuffer(i, buffer));
        this.texture = app.createTexture2D(pixels, 640, 32, {
            internalFormat: PicoGL.RGBA8,
            minFilter: PicoGL.LINEAR,
            magFilter: PicoGL.LINEAR,
            wrapS: PicoGL.CLAMP_TO_EDGE,
            wrapT: PicoGL.CLAMP_TO_EDGE,
        });
        this.call = app.createDrawCall(this.program, this.array).texture("u_texture", this.texture);
    }
    draw(effects: MarioParticles, camera: Camera): void {
        const positions: number[] = [],
            uvs: number[] = [],
            alphas: number[] = [];
        for (const p of effects.particles) {
            const progress = p.age / p.duration;
            const frame =
                p.effect === "dust"
                    ? Math.min(6, Math.floor(progress * 7))
                    : p.effect === "stomp"
                    ? 7 + Math.min(5, Math.floor(progress * 6))
                    : p.effect === "spark"
                    ? 13 + Math.min(5, Math.floor(progress * 6))
                    : 19;
            const size = p.size * (1 + progress);
            for (const [x, y, u, v] of [
                [-1, -1, 0, 1],
                [1, -1, 1, 1],
                [1, 1, 1, 0],
                [-1, -1, 0, 1],
                [1, 1, 1, 0],
                [-1, 1, 0, 0],
            ]) {
                for (let axis = 0; axis < 3; axis++)
                    positions.push(
                        p.position[axis] +
                            ((camera.cameraMatrix[axis] * x + camera.cameraMatrix[4 + axis] * y) *
                                size) /
                                2,
                    );
                uvs.push((frame * 32 + 0.5 + u * 31) / 640, (0.5 + v * 31) / 32);
                alphas.push(1 - progress);
            }
        }
        if (!alphas.length) return;
        this.buffers[0].data(new Float32Array(positions));
        this.buffers[1].data(new Float32Array(uvs));
        this.buffers[2].data(new Float32Array(alphas));
        this.app.enable(PicoGL.BLEND).disable(PicoGL.CULL_FACE).depthMask(false);
        this.call
            .uniform("u_viewProj", camera.viewProjMatrix as Float32Array)
            .drawRanges([0, alphas.length])
            .draw();
    }
    delete(): void {
        this.array.delete();
        this.buffers.forEach((buffer) => buffer.delete());
        this.texture.delete();
        this.program.delete();
    }
}
