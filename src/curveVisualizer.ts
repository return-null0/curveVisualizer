import { compileCurve } from "./compileCurve.js";
import { sampleCurve } from "./sample.js";
import { computeFrenetFrames } from "./frenet.js";
import type { CurveDefinition, CurveSamples, Vec3 } from "./curveTypes.js";

// @ts-ignore – resolved by importmap in index.html
import * as THREE from "three";

type FrenetFrame = {
  T: Vec3;
  N: Vec3;
  B: Vec3;
  curvature?: number; // κ
  torsion?: number;   // τ
};

export function runCurveVisualizer(math: any) {
  let lastStatsUpdate = 0;
  const statsUpdateInterval = 100; // ms (100ms = 10 updates/sec)

  const presets: CurveDefinition[] = [
    {
      name: "Helix",
      xExpr: "cos(t)",
      yExpr: "sin(t)",
      zExpr: "lambda * t / (2*pi)",   // λ controls pitch (height per turn)
      tMin: 0,
      tMax: 6 * Math.PI,
    },
    {
      name: "Circle in XY",
      xExpr: "lambda * cos(t)",       // λ scales radius
      yExpr: "lambda * sin(t)",
      zExpr: "0",
      tMin: 0,
      tMax: 2 * Math.PI,
    },
    {
      name: "Parabola in XZ",
      xExpr: "t",
      yExpr: "0",
      zExpr: "lambda * (t^2 / 4)",    // λ scales curvature / steepness
      tMin: -4,
      tMax: 4,
    },
    {
      name: "Twisted Cubic",
      xExpr: "t",
      yExpr: "lambda * t^2",          // λ is how “steep” the curve rises
      zExpr: "t^3 / 4",
      tMin: -2,
      tMax: 2,
    },
    {
      name: "3D Sine Wave",
      xExpr: "t",
      yExpr: "lambda * sin(t)",       // λ controls wave amplitude
      zExpr: "lambda * cos(t)",       // λ in both axes → expanding spiral wave
      tMin: -4 * Math.PI,
      tMax: 4 * Math.PI,
    },
    {
      name: "Figure-8 Lissajous",
      xExpr: "lambda * cos(t)",       // λ scales whole figure-8
      yExpr: "lambda * sin(2*t)",
      zExpr: "0.3 * lambda * sin(t)",
      tMin: 0,
      tMax: 2 * Math.PI,
    },
  ];

  // DOM refs
  const canvasEl = document.getElementById("canvas") as HTMLCanvasElement | null;
  const presetSelect = document.getElementById("curvePreset") as HTMLSelectElement | null;
  const xInput = document.getElementById("xExpr") as HTMLInputElement | null;
  const yInput = document.getElementById("yExpr") as HTMLInputElement | null;
  const zInput = document.getElementById("zExpr") as HTMLInputElement | null;

  const statT = document.getElementById("stat-t") as HTMLSpanElement | null;
  const statPos = document.getElementById("stat-pos") as HTMLSpanElement | null;
  const statSpeed = document.getElementById("stat-speed") as HTMLSpanElement | null;
  const statKappa = document.getElementById("stat-kappa") as HTMLSpanElement | null;
  const statTau = document.getElementById("stat-tau") as HTMLSpanElement | null;
  const statTvec = document.getElementById("stat-T") as HTMLSpanElement | null;
  const statNvec = document.getElementById("stat-N") as HTMLSpanElement | null;
  const statBvec = document.getElementById("stat-B") as HTMLSpanElement | null;

  const morphSlider = document.getElementById("morphSlider") as HTMLInputElement | null;
  const speedSlider = document.getElementById("speedSlider") as HTMLInputElement | null;
  const orientationSlider = document.getElementById("orientationSlider") as HTMLInputElement | null;
  const autoRotateCheckbox = document.getElementById("autoRotate") as HTMLInputElement | null;

  const statXExpr = document.getElementById("stat-xexpr") as HTMLSpanElement | null;
  const statYExpr = document.getElementById("stat-yexpr") as HTMLSpanElement | null;
  const statZExpr = document.getElementById("stat-zexpr") as HTMLSpanElement | null;

  const errorBanner = document.getElementById("errorBanner") as HTMLDivElement | null;
  const errorText = document.getElementById("errorText") as HTMLSpanElement | null;

  // Orientation row div (whole row, not just input)
  const orientationRow = document.getElementById("orientationRow") as HTMLDivElement | null;

  if (!canvasEl) {
    console.error("Canvas with id 'canvas' not found");
    return;
  }
  const canvas: HTMLCanvasElement = canvasEl;

  // Three.js setup
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(canvas.width, canvas.height, false);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf5f5fa); // soft light grey

  const camera = new THREE.PerspectiveCamera(
    60,
    canvas.width / canvas.height,
    0.1,
    100
  );
  camera.position.set(0, 0, 8);

  const axes = new THREE.AxesHelper(2);
  scene.add(axes);

  // Curve/Frenet state
  let currentDef: CurveDefinition = presets[0];
  let samples!: CurveSamples;
  let frames: FrenetFrame[] = [];
  let curveLine: THREE.Line | null = null;
  let marker: THREE.Mesh | null = null;
  const frameArrows: THREE.ArrowHelper[] = [];
  let idx = 0;

  let morphValue = 1;
  let playbackSpeed = 1;   // samples per frame
  let orientationDeg = 0;  // orientation angle in degrees
  let autoRotate = true;

  // Populate preset select
  if (presetSelect) {
    presets.forEach((c, i) => {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = c.name;
      presetSelect.appendChild(opt);
    });
  }

  function formatExprForDisplay(expr: string): string {
    if (!expr) return "–";

    let s = expr;

    // lambda -> λ
    s = s.replace(/\blambda\b/g, "λ");

    // pi -> π
    s = s.replace(/\bpi\b/g, "π");

    // * -> · (nice multiplication dot)
    s = s.replace(/\*/g, "·");

    // basic superscripts for ^2, ^3, ^4, etc.
    const superscripts: Record<string, string> = {
      "0": "⁰",
      "1": "¹",
      "2": "²",
      "3": "³",
      "4": "⁴",
      "5": "⁵",
      "6": "⁶",
      "7": "⁷",
      "8": "⁸",
      "9": "⁹",
    };

    // convert ^<digit> to superscript
    s = s.replace(/\^(\d)/g, (_, d: string) => superscripts[d] ?? `^${d}`);

    return s;
  }

  function showError(message: string) {
    if (errorBanner) errorBanner.style.display = "block";
    if (errorText) errorText.textContent = message;
  }

  function clearError() {
    if (errorBanner) errorBanner.style.display = "none";
  }

  // Show/hide Orientation row based on autoRotate
  function updateOrientationRowVisibility() {
    if (!orientationRow) return;
    if (autoRotate) {
      orientationRow.style.display = "none";
    } else {
      orientationRow.style.display = "";
    }
  }

  // Build curve + geometry
  function buildCurve(def: CurveDefinition) {
    currentDef = def;

    // sync inputs
    if (xInput) xInput.value = def.xExpr;
    if (yInput) yInput.value = def.yExpr;
    if (zInput) zInput.value = def.zExpr;

    // sync parameterization stats (formatted)
    if (statXExpr) statXExpr.textContent = formatExprForDisplay(def.xExpr);
    if (statYExpr) statYExpr.textContent = formatExprForDisplay(def.yExpr);
    if (statZExpr) statZExpr.textContent = formatExprForDisplay(def.zExpr);

    try {
      clearError();

      const compiled = compileCurve(math, def);
      // pass morphValue (λ) into sampling
      samples = sampleCurve(compiled, 400, morphValue) as CurveSamples;
      frames = computeFrenetFrames(samples) as FrenetFrame[];
      console.log("Frenet sample[0]:", frames[0]);

      // curve line
      const pts = samples.r.map((p: Vec3) => new THREE.Vector3(p.x, p.y, p.z));
      const geom = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({ color: 0x00ff99 });

      if (curveLine) scene.remove(curveLine);
      curveLine = new THREE.Line(geom, mat);
      scene.add(curveLine);

      // marker sphere
      if (!marker) {
        const sphereGeom = new THREE.SphereGeometry(0.06, 16, 16);
        const sphereMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        marker = new THREE.Mesh(sphereGeom, sphereMat);
        scene.add(marker);
      }

      // Frenet frame arrows (T, N, B)
      if (frameArrows.length === 0) {
        const colors = [0xff0000, 0x00ff00, 0x0000ff]; // T,N,B
        const origin = new THREE.Vector3(0, 0, 0);
        const defaultDir = new THREE.Vector3(1, 0, 0); // placeholder

        for (let i = 0; i < 3; i++) {
          const arrow = new THREE.ArrowHelper(
            defaultDir,
            origin.clone(),
            0.6,
            colors[i]
          );
          frameArrows.push(arrow);
          scene.add(arrow);
        }
      }

      idx = 0;
    } catch (err: any) {
      console.error("Error building curve:", err);
      showError("Invalid curve expression: " + (err?.message ?? String(err)));

      if (curveLine) {
        scene.remove(curveLine);
        curveLine = null;
      }
    }
  }

  function updateStatsUI(k: number) {
    const p = samples.r[k] as Vec3;
    const f = frames[k] ?? ({} as FrenetFrame);

    const T = f.T ?? { x: 1, y: 0, z: 0 };
    const N = f.N ?? { x: 0, y: 1, z: 0 };
    const B = f.B ?? { x: 0, y: 0, z: 1 };
    const kappa = f.curvature;
    const tau = f.torsion;

    const v: Vec3 | undefined = (samples as any).r1
      ? ((samples as any).r1[k] as Vec3)
      : undefined;

    const speed =
      v != null ? Math.hypot(v.x, v.y, v.z) : undefined;

    const tArr = (samples as any).t as number[] | undefined;
    const tVal = tArr ? tArr[k] : undefined;

    const fmtVec = (u: Vec3) =>
      `(${u.x.toFixed(2)}, ${u.y.toFixed(2)}, ${u.z.toFixed(2)})`;

    if (statT) statT.textContent = tVal != null ? tVal.toFixed(3) : "-";
    if (statPos) statPos.textContent = fmtVec(p);
    if (statSpeed) statSpeed.textContent = speed != null ? speed.toFixed(3) : "-";
    if (statKappa) statKappa.textContent = kappa != null ? kappa.toFixed(4) : "-";
    if (statTau) statTau.textContent = tau != null ? tau.toFixed(4) : "-";

    if (statTvec) statTvec.textContent = fmtVec(T);
    if (statNvec) statNvec.textContent = fmtVec(N);
    if (statBvec) statBvec.textContent = fmtVec(B);
  }

  function updateFrenetArrows(i: number) {
    const p = samples.r[i] as Vec3;
    const f = frames[i] ?? ({} as FrenetFrame);
    const T = f.T ?? { x: 1, y: 0, z: 0 };
    const N = f.N ?? { x: 0, y: 1, z: 0 };
    const B = f.B ?? { x: 0, y: 0, z: 1 };

    const dirs = [T, N, B];
    const scale = 0.7;

    for (let j = 0; j < 3; j++) {
      const arrow = frameArrows[j];
      const origin = new THREE.Vector3(p.x, p.y, p.z);
      arrow.position.copy(origin);

      const dirVec = new THREE.Vector3(dirs[j].x, dirs[j].y, dirs[j].z);
      if (dirVec.lengthSq() < 1e-8) dirVec.set(1, 0, 0);
      dirVec.normalize();

      arrow.setDirection(dirVec);
      arrow.setLength(scale, 0.2 * scale, 0.12 * scale);
    }
  }

  // Update moving point + Frenet frame
  function updateFrameAt(i: number) {
    if (!marker || !samples || samples.r.length === 0) return;

    const now = performance.now();
    const p = samples.r[i] as Vec3;

    // move marker to the current point
    marker.position.set(p.x, p.y, p.z);

    // always update 3D geometry instantly (smooth)
    updateFrenetArrows(i);

    // only update UI occasionally
    if (now - lastStatsUpdate < statsUpdateInterval) {
      return; // skip UI update
    }
    lastStatsUpdate = now;

    updateStatsUI(i);
  }

  // Resize helper
  function resizeRendererToDisplaySize() {
    const width = canvas.clientWidth || canvas.width;
    const height = canvas.clientHeight || canvas.height;
    const needResize = canvas.width !== width || canvas.height !== height;

    if (needResize) {
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
  }

  // UI: presets + custom param
  if (presetSelect) {
    presetSelect.addEventListener("change", () => {
      const i = Number(presetSelect.value);
      const def = presets[i] ?? presets[0];
      buildCurve(def);
    });
  }

  function rebuildFromInputs() {
    if (!xInput || !yInput || !zInput) return;

    const custom: CurveDefinition = {
      name: "Custom",
      xExpr: xInput.value || "cos(t)",
      yExpr: yInput.value || "sin(t)",
      zExpr: zInput.value || "0",
      tMin: currentDef.tMin,
      tMax: currentDef.tMax,
    };

    buildCurve(custom);
  }

  // trigger on each change / keystroke
  if (xInput) {
    xInput.addEventListener("input", rebuildFromInputs);
  }
  if (yInput) {
    yInput.addEventListener("input", rebuildFromInputs);
  }
  if (zInput) {
    zInput.addEventListener("input", rebuildFromInputs);
  }


  if (speedSlider) {
    playbackSpeed = parseFloat(speedSlider.value) || 1;
    speedSlider.addEventListener("input", () => {
      const v = parseFloat(speedSlider.value);
      playbackSpeed = Number.isFinite(v) ? v : 1;
    });
  }


  if (orientationSlider) {
    orientationDeg = parseFloat(orientationSlider.value) || 0;
    orientationSlider.addEventListener("input", () => {
      const v = parseFloat(orientationSlider.value);
      orientationDeg = Number.isFinite(v) ? v : 0;
    });
  }


  if (autoRotateCheckbox) {
    autoRotate = autoRotateCheckbox.checked;
    updateOrientationRowVisibility(); // initial state (plus HTML default)

    autoRotateCheckbox.addEventListener("change", () => {
      autoRotate = !!autoRotateCheckbox.checked;
      updateOrientationRowVisibility();
    });
  } else {
    updateOrientationRowVisibility();
  }


  if (morphSlider) {
    morphValue = parseFloat(morphSlider.value) || 1;

    morphSlider.addEventListener("input", () => {
      const v = parseFloat(morphSlider.value);
      morphValue = Number.isFinite(v) ? v : 1;

      // Rebuild curve geometry + Frenet with new λ
      buildCurve(currentDef);
    });
  }

  // Initial curve
  buildCurve(presets[0]);

  // Animation loop
  function animate() {
    requestAnimationFrame(animate);
    resizeRendererToDisplaySize();

    if (samples && samples.r.length > 0) {
      // allow fractional index for smooth speed changes
      idx = (idx + playbackSpeed) % samples.r.length;
      const i = Math.floor(idx);
      updateFrameAt(i);
    }

    // Orientation: either auto-rotate or use slider-defined orientation
    if (autoRotate) {
      scene.rotation.y += 0.002;
    } else {
      const orientationRad = (orientationDeg * Math.PI) / 180;
      scene.rotation.y = orientationRad;
    }

    renderer.render(scene, camera);
  }

  animate();
}