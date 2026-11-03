import { mat4 } from "gl-matrix";
import { App, DrawCall, PicoGL, Program, Texture, VertexArray, VertexBuffer } from "picogl";

import { MarioController } from "./MarioController";

const vertexShader = `#version 300 es
precision highp float;
layout(location=0) in vec3 a_position;
layout(location=1) in vec3 a_normal;
layout(location=2) in vec3 a_color;
layout(location=3) in vec2 a_uv;
uniform mat4 u_viewProj;
uniform vec2 u_origin;
out vec3 v_color;
out vec3 v_normal;
out vec2 v_uv;
void main() {
    vec3 position = a_position * vec3(1., -1., 1.) / 256.;
    position.xz += u_origin;
    gl_Position = u_viewProj * vec4(position, 1.);
    v_normal = a_normal * vec3(1., -1., 1.);
    v_color = a_color;
    v_uv = a_uv;
}`;
const fragmentShader = `#version 300 es
precision highp float;
uniform sampler2D u_texture;
in vec3 v_color;
in vec3 v_normal;
in vec2 v_uv;
layout(location=0) out vec4 outColor;
layout(location=1) out vec4 outInteraction;
void main() {
    vec4 texel = texture(u_texture, v_uv);
    vec3 color = mix(v_color, texel.rgb, texel.a);
    float light = .55 + .45 * max(0., dot(normalize(v_normal), normalize(vec3(-1., -1., -1.))));
    outColor = vec4(color * light, 1.);
    outInteraction = vec4(0.);
}`;

/** Draw into the map's existing depth buffer, so terrain and buildings occlude Mario. */
export class MarioDraw {
    private program: Program;
    private buffers: VertexBuffer[];
    private array: VertexArray;
    private texture: Texture;
    private drawCall: DrawCall;

    constructor(
        readonly app: App,
        readonly pixels: Uint8Array,
    ) {
        this.program = app.createProgram(vertexShader, fragmentShader);
        this.buffers = [3, 3, 3, 2].map((size) =>
            app.createVertexBuffer(
                PicoGL.FLOAT,
                size,
                new Float32Array(1024 * 3 * size),
                PicoGL.DYNAMIC_DRAW,
            ),
        );
        this.array = app.createVertexArray();
        this.buffers.forEach((buffer, i) => this.array.vertexAttributeBuffer(i, buffer));
        this.texture = app.createTexture2D(pixels, 704, 64, {
            internalFormat: PicoGL.RGBA8,
            minFilter: PicoGL.LINEAR,
            magFilter: PicoGL.LINEAR,
            wrapS: PicoGL.CLAMP_TO_EDGE,
            wrapT: PicoGL.CLAMP_TO_EDGE,
            flipY: false,
        });
        this.drawCall = app
            .createDrawCall(this.program, this.array)
            .texture("u_texture", this.texture);
    }

    draw(mario: MarioController, matrix: mat4): void {
        const m = mario.module;
        if (!m || !mario.spawned) return;
        const count = m._rs64_triangles() * 3;
        if (!count) return;
        this.buffers.forEach((buffer, i) => {
            const start = m._rs64_buffer(i) / 4;
            buffer.data(m.HEAPF32.subarray(start, start + count * (i === 3 ? 2 : 3)));
        });
        this.app.disable(PicoGL.CULL_FACE);
        this.drawCall
            .uniform("u_viewProj", matrix as Float32Array)
            .uniform("u_origin", new Float32Array([mario.originX, mario.originZ]))
            .drawRanges([0, count])
            .draw();
    }

    delete(): void {
        this.array.delete();
        this.buffers.forEach((buffer) => buffer.delete());
        this.texture.delete();
        this.program.delete();
    }
}
