import type { CurveDefinition } from "./curveTypes.js";

export interface CompiledCurve {
  def: CurveDefinition;

  x: any;
  y: any;
  z: any;

  x1: any;
  y1: any;
  z1: any;

  x2: any;
  y2: any;
  z2: any;

  x3: any;
  y3: any;
  z3: any;
}

export function compileCurve(math: any, def: CurveDefinition): CompiledCurve {
  const tVar = "t";

  const xNode = math.parse(def.xExpr);
  const yNode = math.parse(def.yExpr);
  const zNode = math.parse(def.zExpr);

  const x1Node = math.derivative(xNode, tVar);
  const y1Node = math.derivative(yNode, tVar);
  const z1Node = math.derivative(zNode, tVar);

  const x2Node = math.derivative(x1Node, tVar);
  const y2Node = math.derivative(y1Node, tVar);
  const z2Node = math.derivative(z1Node, tVar);

  const x3Node = math.derivative(x2Node, tVar);
  const y3Node = math.derivative(y2Node, tVar);
  const z3Node = math.derivative(z2Node, tVar);

  return {
    def,
    x: xNode.compile(),
    y: yNode.compile(),
    z: zNode.compile(),

    x1: x1Node.compile(),
    y1: y1Node.compile(),
    z1: z1Node.compile(),

    x2: x2Node.compile(),
    y2: y2Node.compile(),
    z2: z2Node.compile(),

    x3: x3Node.compile(),
    y3: y3Node.compile(),
    z3: z3Node.compile(),
  };
}