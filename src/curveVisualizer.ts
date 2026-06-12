import { compileCurve } from "./compileCurve.js";
import { sampleCurve } from "./sample.js";
import { computeFrenetFrames } from "./frenet.js";
import type { CurveDefinition, CurveSamples, Vec3 } from "./curveTypes.js";

// @ts-ignore
import * as THREE from "three";
// @ts-ignore
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

type FrenetFrame = {
  T: Vec3;
  N: Vec3;
  B: Vec3;
  curvature?: number; 
  torsion?: number;   
};

export function runCurveVisualizer(math: any) {
  let lastStatsUpdate = 0;
  const statsUpdateInterval = 100; 

  const presets: CurveDefinition[] = [
    { name: "Helix", xExpr: "cos(t)", yExpr: "sin(t)", zExpr: "lambda * t / (2*pi)", tMin: 0, tMax: 6 * Math.PI },
    { name: "Circle in XY", xExpr: "lambda * cos(t)", yExpr: "lambda * sin(t)", zExpr: "0", tMin: 0, tMax: 2 * Math.PI },
    { name: "Parabola in XZ", xExpr: "t", yExpr: "0", zExpr: "lambda * (t^2 / 4)", tMin: -4, tMax: 4 },
    { name: "Twisted Cubic", xExpr: "t", yExpr: "lambda * t^2", zExpr: "t^3 / 4", tMin: -2, tMax: 2 },
    { name: "3D Sine Wave", xExpr: "t", yExpr: "lambda * sin(t)", zExpr: "lambda * cos(t)", tMin: -4 * Math.PI, tMax: 4 * Math.PI },
    { name: "Figure-8 Lissajous", xExpr: "lambda * cos(t)", yExpr: "lambda * sin(2*t)", zExpr: "0.3 * lambda * sin(t)", tMin: 0, tMax: 2 * Math.PI },
  ];

  const canvasEl = document.getElementById("canvas") as HTMLCanvasElement | null;
  const presetSelect = document.getElementById("curvePreset") as HTMLSelectElement | null;
  const xInput = document.getElementById("xExpr") as HTMLInputElement | null;
  const yInput = document.getElementById("yExpr") as HTMLInputElement | null;
  const zInput = document.getElementById("zExpr") as HTMLInputElement | null;

  const statT = document.getElementById("stat-t");
  const statPos = document.getElementById("stat-pos");
  const statSpeed = document.getElementById("stat-speed");
  const statKappa = document.getElementById("stat-kappa");
  const statTau = document.getElementById("stat-tau");
  const statTvec = document.getElementById("stat-T");
  const statNvec = document.getElementById("stat-N");
  const statBvec = document.getElementById("stat-B");

  const morphSlider = document.getElementById("morphSlider") as HTMLInputElement | null;
  const speedSlider = document.getElementById("speedSlider") as HTMLInputElement | null;

  const statXExpr = document.getElementById("stat-xexpr");
  const statYExpr = document.getElementById("stat-yexpr");
  const statZExpr = document.getElementById("stat-zexpr");

  const errorBanner = document.getElementById("errorBanner");
  const errorText = document.getElementById("errorText");

  if (!canvasEl) return;
  const canvas: HTMLCanvasElement = canvasEl;

  // Render Setup
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(canvas.width, canvas.height, false);
  renderer.setPixelRatio(window.devicePixelRatio);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d1117); 

  const camera = new THREE.PerspectiveCamera(60, canvas.width / canvas.height, 0.1, 100);
  camera.position.set(4, 4, 8);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  // Environment Lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);
  const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
  dirLight.position.set(10, 20, 10);
  scene.add(dirLight);

  // Grid & Axes
  const gridHelper = new THREE.GridHelper(20, 20, 0x444444, 0x222222);
  scene.add(gridHelper);
  const axes = new THREE.AxesHelper(3);
  scene.add(axes);

  let currentDef: CurveDefinition = presets[0];
  let samples!: CurveSamples;
  let frames: FrenetFrame[] = [];
  let curveMesh: THREE.Mesh | null = null;
  let marker: THREE.Mesh | null = null;
  const frameArrows: THREE.ArrowHelper[] = [];
  let idx = 0;

  let morphValue = 1;
  let playbackSpeed = 1;

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
    let s = expr.replace(/\blambda\b/g, "λ").replace(/\bpi\b/g, "π").replace(/\*/g, "·");
    const superscripts: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };
    return s.replace(/\^(\d)/g, (_, d) => superscripts[d] ?? `^${d}`);
  }

  function showError(message: string) {
    if (errorBanner) errorBanner.style.display = "block";
    if (errorText) errorText.textContent = message;
  }

  function clearError() {
    if (errorBanner) errorBanner.style.display = "none";
  }

  function buildCurve(def: CurveDefinition) {
    currentDef = def;

    if (xInput) xInput.value = def.xExpr;
    if (yInput) yInput.value = def.yExpr;
    if (zInput) zInput.value = def.zExpr;

    if (statXExpr) statXExpr.textContent = formatExprForDisplay(def.xExpr);
    if (statYExpr) statYExpr.textContent = formatExprForDisplay(def.yExpr);
    if (statZExpr) statZExpr.textContent = formatExprForDisplay(def.zExpr);

    try {
      clearError();
      const compiled = compileCurve(math, def);
      samples = sampleCurve(compiled, 400, morphValue) as CurveSamples;
      frames = computeFrenetFrames(samples) as FrenetFrame[];

      const pts = samples.r.map((p: Vec3) => new THREE.Vector3(p.x, p.y, p.z));
      
      const path = new THREE.CatmullRomCurve3(pts);
      const geom = new THREE.TubeGeometry(path, 400, 0.06, 8, false);
      const mat = new THREE.MeshStandardMaterial({ 
        color: 0x0fd3b5, 
        roughness: 0.2, 
        metalness: 0.5 
      });

      if (curveMesh) scene.remove(curveMesh);
      curveMesh = new THREE.Mesh(geom, mat);
      scene.add(curveMesh);

      if (!marker) {
        const sphereGeom = new THREE.SphereGeometry(0.12, 32, 32);
        const sphereMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x444444 });
        marker = new THREE.Mesh(sphereGeom, sphereMat);
        scene.add(marker);
      }

      if (frameArrows.length === 0) {
        const colors = [0xff4444, 0x44ff44, 0x4444ff]; 
        const origin = new THREE.Vector3(0, 0, 0);
        const defaultDir = new THREE.Vector3(1, 0, 0); 
        for (let i = 0; i < 3; i++) {
          const arrow = new THREE.ArrowHelper(defaultDir, origin.clone(), 1.2, colors[i], 0.2, 0.15);
          frameArrows.push(arrow);
          scene.add(arrow);
        }
      }
      idx = 0;
    } catch (err: any) {
      console.error("Error building curve:", err);
      showError("Invalid curve expression: " + (err?.message ?? String(err)));
      if (curveMesh) { scene.remove(curveMesh); curveMesh = null; }
    }
  }

  function updateStatsUI(k: number) {
    const p = samples.r[k] as Vec3;
    const f = frames[k] ?? ({} as FrenetFrame);
    const T = f.T ?? { x: 1, y: 0, z: 0 };
    const N = f.N ?? { x: 0, y: 1, z: 0 };
    const B = f.B ?? { x: 0, y: 0, z: 1 };
    
    const v = (samples as any).r1 ? ((samples as any).r1[k] as Vec3) : undefined;
    const speed = v != null ? Math.hypot(v.x, v.y, v.z) : undefined;
    const tArr = (samples as any).t as number[] | undefined;
    const tVal = tArr ? tArr[k] : undefined;

    const fmtVec = (u: Vec3) => `(${u.x.toFixed(2)}, ${u.y.toFixed(2)}, ${u.z.toFixed(2)})`;

    if (statT) statT.textContent = tVal != null ? tVal.toFixed(3) : "-";
    if (statPos) statPos.textContent = fmtVec(p);
    if (statSpeed) statSpeed.textContent = speed != null ? speed.toFixed(3) : "-";
    if (statKappa) statKappa.textContent = f.curvature != null ? f.curvature.toFixed(4) : "-";
    if (statTau) statTau.textContent = f.torsion != null ? f.torsion.toFixed(4) : "-";
    if (statTvec) statTvec.textContent = fmtVec(T);
    if (statNvec) statNvec.textContent = fmtVec(N);
    if (statBvec) statBvec.textContent = fmtVec(B);
  }

  function updateFrenetArrows(i: number) {
    const p = samples.r[i] as Vec3;
    const f = frames[i] ?? ({} as FrenetFrame);
    const dirs = [
      f.T ?? { x: 1, y: 0, z: 0 },
      f.N ?? { x: 0, y: 1, z: 0 },
      f.B ?? { x: 0, y: 0, z: 1 }
    ];

    for (let j = 0; j < 3; j++) {
      const arrow = frameArrows[j];
      arrow.position.set(p.x, p.y, p.z);
      const dirVec = new THREE.Vector3(dirs[j].x, dirs[j].y, dirs[j].z);
      if (dirVec.lengthSq() < 1e-8) dirVec.set(1, 0, 0);
      dirVec.normalize();
      arrow.setDirection(dirVec);
    }
  }

  function updateFrameAt(i: number) {
    if (!marker || !samples || samples.r.length === 0) return;
    const p = samples.r[i] as Vec3;
    marker.position.set(p.x, p.y, p.z);
    updateFrenetArrows(i);

    const now = performance.now();
    if (now - lastStatsUpdate < statsUpdateInterval) return;
    lastStatsUpdate = now;
    updateStatsUI(i);
  }

  function resizeRendererToDisplaySize() {
    const width = canvas.clientWidth || canvas.width;
    const height = canvas.clientHeight || canvas.height;
    if (canvas.width !== width || canvas.height !== height) {
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
  }

  if (presetSelect) presetSelect.addEventListener("change", () => buildCurve(presets[Number(presetSelect.value)] ?? presets[0]));
  
  function rebuildFromInputs() {
    if (!xInput || !yInput || !zInput) return;
    buildCurve({
      name: "Custom", xExpr: xInput.value || "0", yExpr: yInput.value || "0", zExpr: zInput.value || "0",
      tMin: currentDef.tMin, tMax: currentDef.tMax,
    });
  }

  [xInput, yInput, zInput].forEach(input => input?.addEventListener("input", rebuildFromInputs));

  if (speedSlider) speedSlider.addEventListener("input", () => playbackSpeed = parseFloat(speedSlider.value) || 1);
  if (morphSlider) morphSlider.addEventListener("input", () => {
    morphValue = parseFloat(morphSlider.value) || 1;
    buildCurve(currentDef);
  });

  buildCurve(presets[0]);

  function animate() {
    requestAnimationFrame(animate);
    resizeRendererToDisplaySize();
    controls.update(); 

    if (samples && samples.r.length > 0) {
      idx = (idx + playbackSpeed) % samples.r.length;
      updateFrameAt(Math.floor(idx));
    }
    renderer.render(scene, camera);
  }
  animate();
}