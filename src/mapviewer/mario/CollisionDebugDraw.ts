import { mat4 } from "gl-matrix";
import { App, DrawCall, PicoGL, Program, VertexArray, VertexBuffer } from "picogl";

/** Convert the actual native collision triangles to colored, world-space wireframe edges. */
export function collisionDebugLines(
    vertices: Int32Array,
    originX: number,
    originZ: number,
    units: number,
): { positions: Float32Array; colors: Float32Array } {
    const positions: number[] = [],
        colors: number[] = [];
    for (let i = 0; i < vertices.length; i += 9) {
        const ax = vertices[i + 3] - vertices[i],
            ay = vertices[i + 4] - vertices[i + 1],
            az = vertices[i + 5] - vertices[i + 2];
        const bx = vertices[i + 6] - vertices[i],
            by = vertices[i + 7] - vertices[i + 1],
            bz = vertices[i + 8] - vertices[i + 2];
        const nx = ay * bz - az * by,
            ny = az * bx - ax * bz,
            nz = ax * by - ay * bx;
        const length = Math.hypot(nx, ny, nz);
        if (!length) continue;
        const color =
            ny / length > 0.01
                ? [0.2, 1, 0.3]
                : ny / length < -0.01
                ? [0.8, 0.4, 1]
                : [1, 0.55, 0.1];
        for (const v of [0, 1, 1, 2, 2, 0]) {
            positions.push(
                vertices[i + v * 3] / units + originX,
                -vertices[i + v * 3 + 1] / units || 0,
                vertices[i + v * 3 + 2] / units + originZ,
            );
            colors.push(...color);
        }
    }
    return { positions: new Float32Array(positions), colors: new Float32Array(colors) };
}
const vertex = `#version 300 es
precision highp float;
layout(location=0) in vec3 a_position;
layout(location=1) in vec3 a_color;
uniform mat4 u_viewProj;
out vec3 v_color;
void main(){gl_Position=u_viewProj*vec4(a_position,1.);gl_Position.z-=0.0001*gl_Position.w;v_color=a_color;}`;
const fragment = `#version 300 es
precision highp float;
in vec3 v_color;
layout(location=0) out vec4 outColor;
void main(){outColor=vec4(v_color,.8);}`;

export class CollisionDebugDraw {
    private program: Program;
    private buffers: VertexBuffer[] = [];
    private array?: VertexArray;
    private call?: DrawCall;
    private capacity = 0;
    private count = 0;
    private key = "";
    constructor(private app: App) {
        this.program = app.createProgram(vertex, fragment);
    }
    draw(
        vertices: Int32Array,
        key: string,
        originX: number,
        originZ: number,
        units: number,
        matrix: mat4,
        through: boolean,
        extra?: { positions: Float32Array; colors: Float32Array },
    ): void {
        if (key !== this.key) {
            this.key = key;
            const data = collisionDebugLines(vertices, originX, originZ, units);
            if (extra) {
                const positions = new Float32Array(data.positions.length + extra.positions.length);
                positions.set(data.positions);
                positions.set(extra.positions, data.positions.length);
                const colors = new Float32Array(data.colors.length + extra.colors.length);
                colors.set(data.colors);
                colors.set(extra.colors, data.colors.length);
                data.positions = positions;
                data.colors = colors;
            }
            this.count = data.positions.length / 3;
            if (this.count > this.capacity) {
                this.array?.delete();
                this.buffers.forEach((b) => b.delete());
                this.capacity = 2 ** Math.ceil(Math.log2(Math.max(1, this.count)));
                this.buffers = [0, 1].map(() =>
                    this.app.createVertexBuffer(
                        PicoGL.FLOAT,
                        3,
                        new Float32Array(this.capacity * 3),
                        PicoGL.DYNAMIC_DRAW,
                    ),
                );
                this.array = this.app
                    .createVertexArray()
                    .vertexAttributeBuffer(0, this.buffers[0])
                    .vertexAttributeBuffer(1, this.buffers[1]);
                this.call = this.app
                    .createDrawCall(this.program, this.array)
                    .primitive(PicoGL.LINES);
            }
            if (this.count) {
                this.buffers[0].data(data.positions);
                this.buffers[1].data(data.colors);
            }
        }
        if (!this.count || !this.call) return;
        const gl = this.app.gl as WebGL2RenderingContext;
        const depth = gl.isEnabled(gl.DEPTH_TEST),
            mask = gl.getParameter(gl.DEPTH_WRITEMASK);
        // Debug lines must not overwrite the scene's object-picking attachment.
        gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.NONE]);
        this.app.depthMask(false);
        if (through) this.app.disable(PicoGL.DEPTH_TEST);
        this.call
            .uniform("u_viewProj", matrix as Float32Array)
            .drawRanges([0, this.count])
            .draw();
        if (depth) this.app.enable(PicoGL.DEPTH_TEST);
        this.app.depthMask(mask);
        gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    }
    delete(): void {
        this.array?.delete();
        this.buffers.forEach((b) => b.delete());
        this.program.delete();
    }
}
