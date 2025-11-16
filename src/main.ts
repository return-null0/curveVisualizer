import { runCurveVisualizer } from "./curveVisualizer.js";

export function main(math:  any) {
  console.log("math.js loaded:", !!math);
  runCurveVisualizer(math);
}