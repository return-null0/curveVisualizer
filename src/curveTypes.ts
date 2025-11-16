export interface CurveDefinition {
  name: string;
  xExpr: string;
  yExpr: string;
  zExpr: string;
  tMin: number;
  tMax: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface CurveSamples {
  t: number[];
  r: Vec3[];
  r1: Vec3[];
  r2: Vec3[];
  r3: Vec3[];
  s: number[];
}

export interface FrenetFrame {
  index: number;
  t: number;
  s: number;
  position: Vec3;

  T: Vec3;
  N: Vec3;
  B: Vec3;

  curvature: number;
  torsion: number;
}