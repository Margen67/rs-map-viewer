/** Bounded upward support for wall tops and one-sided undersides, retaining their original faces. */
export function withSupportCaps(source: Int32Array): Int32Array {
    const output = Array.from(source);
    const seen = new Set<string>();
    const add = (a: number[], b: number[], c: number[]) => {
        const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
        if (Math.abs(ny) < 1) return;
        if (ny > 0) [a, c] = [c, a]; // RuneScape Y points down; native floor normals point up.
        const key = [a.join(","), b.join(","), c.join(",")].sort().join(";");
        if (seen.has(key)) return;
        seen.add(key);
        output.push(...a, ...b, ...c);
    };
    for (let i = 0; i < source.length; i += 9) {
        const a = Array.from(source.subarray(i, i + 3)),
            b = Array.from(source.subarray(i + 3, i + 6)),
            c = Array.from(source.subarray(i + 6, i + 9));
        const ax = b[0] - a[0],
            ay = b[1] - a[1],
            az = b[2] - a[2],
            bx = c[0] - a[0],
            by = c[1] - a[1],
            bz = c[2] - a[2];
        const nx = ay * bz - az * by,
            ny = az * bx - ax * bz,
            nz = ax * by - ay * bx,
            normal = -ny / Math.hypot(nx, ny, nz);
        if (!Number.isFinite(normal) || normal > 0.5) continue;
        if (normal < -0.5) {
            add(
                a.map((v, j) => (j === 1 ? v - 1 : v)),
                b.map((v, j) => (j === 1 ? v - 1 : v)),
                c.map((v, j) => (j === 1 ? v - 1 : v)),
            );
            continue;
        }
        const top = Math.min(a[1], b[1], c[1]) - 1;
        if (Math.abs(ny) >= 1) {
            add([a[0], top, a[2]], [b[0], top, b[2]], [c[0], top, c[2]]);
            continue;
        }
        const pairs = [
            [a, b],
            [b, c],
            [c, a],
        ].sort(
            (p, q) =>
                Math.hypot(q[0][0] - q[1][0], q[0][2] - q[1][2]) -
                Math.hypot(p[0][0] - p[1][0], p[0][2] - p[1][2]),
        );
        const [p, q] = pairs[0],
            length = Math.hypot(q[0] - p[0], q[2] - p[2]);
        if (length < 1) continue;
        const dx = -(q[2] - p[2]) / length,
            dz = (q[0] - p[0]) / length;
        const v = [
            [p[0] + dx, top, p[2] + dz],
            [q[0] + dx, top, q[2] + dz],
            [q[0] - dx, top, q[2] - dz],
            [p[0] - dx, top, p[2] - dz],
        ].map((v) => v.map(Math.round));
        add(v[0], v[1], v[2]);
        add(v[0], v[2], v[3]);
    }
    return new Int32Array(output);
}
