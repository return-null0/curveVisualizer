import type { CurveSamples, FrenetFrame, Vec3 } from "./curveTypes.js";

// vector ops
function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}
function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z + a.z * b.y,
    y: -(a.x * b.z) + a.z * b.x,
    z: a.x * b.y - a.y * b.x,
  };
}
function norm(a: Vec3): number {
  return Math.sqrt(dot(a, a));
}
function normalize(a: Vec3): Vec3 {
  const n = norm(a);
  return n === 0 ? { x: 0, y: 0, z: 0 } : { x: a.x / n, y: a.y / n, z: a.z / n };
}
function det3(a: Vec3, b: Vec3, c: Vec3): number {
  return (
    a.x * (b.y * c.z - b.z * c.y) -
    a.y * (b.x * c.z - b.z * c.x) +
    a.z * (b.x * c.y - b.y * c.x)
  );
}

export function computeFrenetFrames(samples: CurveSamples): FrenetFrame[] {
  const frames: FrenetFrame[] = [];

  const { t, r, r1, r2, r3, s } = samples;

  for (let i = 0; i < t.length; i++) {
    const pos = r[i];
    const r1v = r1[i];
    const r2v = r2[i];
    const r3v = r3[i];

    // T = r' / |r'|
    const T = normalize(r1v);

    // curvature κ = |r' x r''| / |r'|^3
    const cross12 = cross(r1v, r2v);
    const curvature =
      norm(cross12) /
      Math.pow(norm(r1v), 3);

    // Normal: project r'' onto plane orthogonal to T
    let N = { x: 0, y: 0, z: 0 };
    if (curvature > 1e-6) {
      const r2_par_T = dot(r2v, T);
      const perp = sub(r2v, {
        x: r2_par_T * T.x,
        y: r2_par_T * T.y,
        z: r2_par_T * T.z,
      });
      N = normalize(perp);
    }

    // Binormal: B = T x N
    const B = cross(T, N);

    // torsion τ = det(r', r'', r''') / |r' x r''|^2
    const denom = Math.pow(norm(cross12), 2);
    const torsion = denom > 1e-12 ? det3(r1v, r2v, r3v) / denom : 0;

    frames.push({
      index: i,
      t: t[i],
      s: s[i],
      position: pos,
      T,
      N,
      B,
      curvature,
      torsion,
    });
  }

  return frames;
}