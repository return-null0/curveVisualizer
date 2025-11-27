import type { CompiledCurve } from "./compileCurve.js";
import type { CurveSamples, Vec3 } from "./curveTypes.js";

export function sampleCurve(
  compiled: CompiledCurve,
  N: number,
  morphValue: number = 1   // NEW
): CurveSamples {
  const { tMin, tMax } = compiled.def;

  const t: number[] = [];
  const r: Vec3[] = [];
  const r1: Vec3[] = [];
  const r2: Vec3[] = [];
  const r3: Vec3[] = [];

  for (let i = 0; i < N; i++) {
    const ti = tMin + (i / (N - 1)) * (tMax - tMin);

    const scope = { t: ti, lambda: morphValue, λ: morphValue };

    t.push(ti);

    r.push({
      x: compiled.x.evaluate(scope),
      y: compiled.y.evaluate(scope),
      z: compiled.z.evaluate(scope),
    });

    r1.push({
      x: compiled.x1.evaluate(scope),
      y: compiled.y1.evaluate(scope),
      z: compiled.z1.evaluate(scope),
    });

    r2.push({
      x: compiled.x2.evaluate(scope),
      y: compiled.y2.evaluate(scope),
      z: compiled.z2.evaluate(scope),
    });

    r3.push({
      x: compiled.x3.evaluate(scope),
      y: compiled.y3.evaluate(scope),
      z: compiled.z3.evaluate(scope),
    });
  }

  const s = computeArcLengths(r1);
  return { t, r, r1, r2, r3, s };
}

// simple numerical method trapezoid-rule arc length
function computeArcLengths(vel: Vec3[]): number[] {
  const s: number[] = [];
  let total = 0;

  s.push(0);

  for (let i = 1; i < vel.length; i++) {
    const v0 = vel[i - 1];
    const v1 = vel[i];
    const mag0 = Math.sqrt(v0.x * v0.x + v0.y * v0.y + v0.z * v0.z);
    const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y + v1.z * v1.z);

    const ds = 0.5 * (mag0 + mag1);
    total += ds;
    s.push(total);
  }

  return s;
}