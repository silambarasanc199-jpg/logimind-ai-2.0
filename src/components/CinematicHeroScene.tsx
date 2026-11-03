import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export type CameraMode = 'coastal' | 'chase' | 'overview';

export interface CinematicHeroSceneProps {
  theme: 'dark' | 'light';
  cameraMode: CameraMode;
  isPaused: boolean;
  pulseBoost: number;
  dpr: [number, number];
  enableShadows: boolean;
  onSelect: (key: string) => void;
  onFrameSample?: (fps: number, frameTimeMs: number) => void;
}

// Pre-allocated module-scope math scratch objects (Zero GC in render loop)
const _vec3A = new THREE.Vector3();
const _vec3B = new THREE.Vector3();
const _vec3C = new THREE.Vector3();
const _upVec = new THREE.Vector3(0, 1, 0);
const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _scaleVec = new THREE.Vector3();
const _color = new THREE.Color();

/**
 * Software WebGL detection from GPU renderer string per Three.js skill guidelines
 */
function detectSoftwareWebGL(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function createSkyTexture(
  isLight: boolean,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  if (isLight) {
    grad.addColorStop(0, '#0369A1');
    grad.addColorStop(0.38, '#0284C7');
    grad.addColorStop(0.68, '#38BDF8');
    grad.addColorStop(0.88, '#7DD3FC');
    grad.addColorStop(1, '#FDE68A');
  } else {
    grad.addColorStop(0, '#030812');
    grad.addColorStop(0.32, '#071527');
    grad.addColorStop(0.62, '#0C2D48');
    grad.addColorStop(0.84, '#134E5E');
    grad.addColorStop(0.95, '#D97706');
    grad.addColorStop(1, '#FDBA74');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 512);

  const sun = ctx.createRadialGradient(740, 390, 8, 740, 390, 180);
  sun.addColorStop(0, 'rgba(255, 251, 235, 0.95)');
  sun.addColorStop(0.25, 'rgba(251, 191, 36, 0.55)');
  sun.addColorStop(0.6, 'rgba(244, 114, 182, 0.18)');
  sun.addColorStop(1, 'rgba(12, 45, 72, 0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, 1024, 512);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createOceanTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 512, 512);
  g.addColorStop(0, '#042f4b');
  g.addColorStop(0.4, '#0891b2');
  g.addColorStop(0.7, '#0d9488');
  g.addColorStop(1, '#064e3b');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 28; i++) {
    const rx = (i * 97) % 512;
    const ry = (i * 151) % 512;
    const rg = ctx.createRadialGradient(rx, ry, 4, rx, ry, 55 + (i % 4) * 18);
    if (i % 3 === 0) {
      rg.addColorStop(0, 'rgba(251, 113, 133, 0.24)');
    } else {
      rg.addColorStop(0, 'rgba(76, 201, 255, 0.28)');
    }
    rg.addColorStop(1, 'rgba(4, 47, 75, 0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, 512, 512);
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  for (let y = 0; y < 512; y += 8) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(170, y + 3, 340, y - 3, 512, y);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 8);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createAsphaltTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 512;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, 256, 512);

  for (let i = 0; i < 900; i++) {
    ctx.fillStyle =
      i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.18)';
    ctx.fillRect((i * 37) % 256, (i * 73) % 512, 2, 2);
  }

  ctx.fillStyle = '#38bdf8';
  ctx.fillRect(14, 0, 5, 512);
  ctx.fillRect(237, 0, 5, 512);

  ctx.fillStyle = '#f8fafc';
  for (let y = 0; y < 512; y += 64) {
    ctx.fillRect(126, y, 4, 34);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 24);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = 128;
  shadowCanvas.height = 128;
  const sctx = shadowCanvas.getContext('2d')!;
  const sgrad = sctx.createRadialGradient(64, 64, 8, 64, 64, 60);
  sgrad.addColorStop(0, 'rgba(0, 0, 0, 0.65)');
  sgrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  sctx.fillStyle = sgrad;
  sctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(shadowCanvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildRoadRibbonGeometry(
  curve: THREE.CatmullRomCurve3,
  widthVal: number,
  segments: number
): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const pt = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).normalize();
    const binormal = new THREE.Vector3()
      .crossVectors(tangent, _upVec)
      .normalize();

    const left = pt.clone().addScaledVector(binormal, -widthVal * 0.5);
    const right = pt.clone().addScaledVector(binormal, widthVal * 0.5);

    positions.push(left.x, left.y, left.z, right.x, right.y, right.z);
    normals.push(0, 1, 0, 0, 1, 0);
    uvs.push(0, t, 1, t);

    if (i < segments) {
      const base = i * 2;
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

/**
 * Builds a composite 10-part procedural 3D Delivery Truck Group
 * with beveled ExtrudeGeometry cab, LatheGeometry hub caps, TubeGeometry trim,
 * varied roughness/metalness (>=0.25 delta), and bottom-center ground pivot.
 */
function buildCompositeDeliveryTruck(
  isSoftwareGl: boolean,
  shadowTex: THREE.CanvasTexture
): {
  truckGroup: THREE.Group;
  wheels: THREE.Group[];
} {
  const truckGroup = new THREE.Group();
  truckGroup.userData = { telemetryKey: 'primary-truck' };

  // 1. Soft Radial Contact Shadow Plane (offset +0.025 on Y to prevent Z-fighting)
  const shadowGeo = new THREE.PlaneGeometry(3.3, 6.4);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    depthWrite: false,
    opacity: 0.55,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
  shadowMesh.rotation.x = -Math.PI / 2;
  shadowMesh.position.set(0, 0.025, 0);
  truckGroup.add(shadowMesh);

  // 2. Primary Silhouette: Heavy Brushed Steel Chassis Frame (roughness 0.52, metalness 0.82)
  const chassisGeo = new THREE.BoxGeometry(1.76, 0.34, 4.95);
  const chassisMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.52,
    metalness: 0.82,
  });
  const chassisMesh = new THREE.Mesh(chassisGeo, chassisMat);
  chassisMesh.position.set(0, 0.44, 0);
  chassisMesh.castShadow = !isSoftwareGl;
  chassisMesh.userData = { telemetryKey: 'primary-truck' };
  truckGroup.add(chassisMesh);

  // 3. Primary Silhouette: Beveled Insulated Cargo Container (roughness 0.22, metalness 0.14)
  const cargoShape = new THREE.Shape();
  cargoShape.moveTo(-0.92, 0);
  cargoShape.lineTo(0.92, 0);
  cargoShape.lineTo(0.92, 1.82);
  cargoShape.lineTo(-0.92, 1.82);
  cargoShape.closePath();

  const cargoGeo = new THREE.ExtrudeGeometry(cargoShape, {
    steps: 1,
    depth: 3.32,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.04,
    bevelSegments: 3,
  });
  cargoGeo.translate(0, 0, -1.66);

  const cargoMat = new THREE.MeshPhysicalMaterial({
    color: 0xf8fafc,
    roughness: 0.22,
    metalness: 0.14,
    clearcoat: 0.65,
    clearcoatRoughness: 0.15,
  });
  const cargoMesh = new THREE.Mesh(cargoGeo, cargoMat);
  cargoMesh.position.set(0, 0.58, -0.68);
  cargoMesh.castShadow = !isSoftwareGl;
  cargoMesh.receiveShadow = !isSoftwareGl;
  cargoMesh.userData = { telemetryKey: 'primary-truck' };
  truckGroup.add(cargoMesh);

  // 4. Secondary Read: Beveled Aerodynamic Tractor Cab (roughness 0.18, metalness 0.55)
  const cabShape = new THREE.Shape();
  cabShape.moveTo(-0.88, 0);
  cabShape.lineTo(0.88, 0);
  cabShape.lineTo(0.84, 1.38);
  cabShape.lineTo(-0.84, 1.38);
  cabShape.closePath();

  const cabGeo = new THREE.ExtrudeGeometry(cabShape, {
    steps: 1,
    depth: 1.34,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.05,
    bevelSegments: 3,
  });
  cabGeo.translate(0, 0, -0.67);

  const cabMat = new THREE.MeshPhysicalMaterial({
    color: 0x0f172a,
    roughness: 0.18,
    metalness: 0.55,
    clearcoat: 0.88,
  });
  const cabMesh = new THREE.Mesh(cabGeo, cabMat);
  cabMesh.position.set(0, 0.56, 1.74);
  cabMesh.castShadow = !isSoftwareGl;
  cabMesh.userData = { telemetryKey: 'primary-truck' };
  truckGroup.add(cabMesh);

  // 5. Secondary Read: Aerodynamic Roof Wind Deflector
  const fairingGeo = new THREE.BoxGeometry(1.72, 0.36, 0.92);
  const fairingMesh = new THREE.Mesh(fairingGeo, cabMat);
  fairingMesh.position.set(0, 2.08, 1.54);
  fairingMesh.rotation.x = 0.24;
  fairingMesh.userData = { telemetryKey: 'primary-truck' };
  truckGroup.add(fairingMesh);

  // 6. Accent Detail: Optical Panoramic Windshield (Software WebGL guard for transmission)
  const glassGeo = new THREE.BoxGeometry(1.64, 0.56, 0.08);
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x38bdf8,
    roughness: 0.08,
    metalness: 0.1,
    transmission: isSoftwareGl ? 0 : 0.75,
    transparent: true,
    opacity: isSoftwareGl ? 0.55 : 0.92,
    ior: 1.52,
    clearcoat: 1.0,
    depthWrite: false,
  });
  const glassMesh = new THREE.Mesh(glassGeo, glassMat);
  glassMesh.position.set(0, 1.48, 2.44);
  glassMesh.renderOrder = 2;
  glassMesh.userData = { telemetryKey: 'primary-truck' };
  truckGroup.add(glassMesh);

  // 7. Accent Detail: TubeGeometry Glowing Cyan LogiMind AI Telemetry Rails
  const leftRailCurve = new THREE.LineCurve3(
    new THREE.Vector3(-0.98, 1.56, -2.25),
    new THREE.Vector3(-0.98, 1.56, 0.88)
  );
  const rightRailCurve = new THREE.LineCurve3(
    new THREE.Vector3(0.98, 1.56, -2.25),
    new THREE.Vector3(0.98, 1.56, 0.88)
  );
  const railMat = new THREE.MeshStandardMaterial({
    color: 0x4cc9ff,
    emissive: 0x00bfff,
    emissiveIntensity: 1.8,
    roughness: 0.2,
  });
  const leftRail = new THREE.Mesh(
    new THREE.TubeGeometry(leftRailCurve, 8, 0.035, 8, false),
    railMat
  );
  const rightRail = new THREE.Mesh(
    new THREE.TubeGeometry(rightRailCurve, 8, 0.035, 8, false),
    railMat
  );
  truckGroup.add(leftRail, rightRail);

  // 8. Accent Detail: Front Anodized Grille & Bumper
  const bumperGeo = new THREE.BoxGeometry(1.84, 0.28, 0.16);
  const bumperMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.35,
    metalness: 0.88,
  });
  const bumperMesh = new THREE.Mesh(bumperGeo, bumperMat);
  bumperMesh.position.set(0, 0.52, 2.45);
  truckGroup.add(bumperMesh);

  // 9. Accent Detail: Dual LED Headlights & Rear Safety Light Bar
  const headlightGeo = new THREE.BoxGeometry(0.32, 0.14, 0.06);
  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xe0f2fe,
    emissiveIntensity: 3.0,
  });
  const leftHeadlight = new THREE.Mesh(headlightGeo, headlightMat);
  leftHeadlight.position.set(-0.62, 0.78, 2.46);
  const rightHeadlight = new THREE.Mesh(headlightGeo, headlightMat);
  rightHeadlight.position.set(0.62, 0.78, 2.46);

  const taillightGeo = new THREE.BoxGeometry(1.62, 0.1, 0.06);
  const taillightMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    emissive: 0xef4444,
    emissiveIntensity: 2.2,
  });
  const taillight = new THREE.Mesh(taillightGeo, taillightMat);
  taillight.position.set(0, 0.62, -2.38);
  truckGroup.add(leftHeadlight, rightHeadlight, taillight);

  // 10. Secondary Read: 6 Composite Wheels with LatheGeometry Metallic Hubs
  const tireGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.28, 20);
  tireGeo.rotateZ(Math.PI / 2);
  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x090d16,
    roughness: 0.86,
    metalness: 0.12,
  });

  const hubProfile = [
    new THREE.Vector2(0, -0.15),
    new THREE.Vector2(0.22, -0.15),
    new THREE.Vector2(0.18, 0.15),
    new THREE.Vector2(0, 0.15),
  ];
  const hubGeo = new THREE.LatheGeometry(hubProfile, 14);
  hubGeo.rotateZ(Math.PI / 2);
  const hubMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    roughness: 0.25,
    metalness: 0.9,
  });

  const wheelCoords: [number, number, number][] = [
    [-0.92, 0.42, 1.75],
    [0.92, 0.42, 1.75],
    [-0.92, 0.42, -0.85],
    [0.92, 0.42, -0.85],
    [-0.92, 0.42, -1.75],
    [0.92, 0.42, -1.75],
  ];

  const wheels: THREE.Group[] = [];
  for (const [wx, wy, wz] of wheelCoords) {
    const wGroup = new THREE.Group();
    wGroup.position.set(wx, wy, wz);
    const tireMesh = new THREE.Mesh(tireGeo, tireMat);
    tireMesh.castShadow = !isSoftwareGl;
    const hubMesh = new THREE.Mesh(hubGeo, hubMat);
    wGroup.add(tireMesh, hubMesh);
    truckGroup.add(wGroup);
    wheels.push(wGroup);
  }

  return { truckGroup, wheels };
}

export const CinematicHeroScene: React.FC<CinematicHeroSceneProps> = ({
  theme,
  cameraMode,
  isPaused,
  pulseBoost,
  dpr,
  enableShadows,
  onSelect,
  onFrameSample,
}) => {
  // Stable WebGL container ref outside re-rendering React UI
  const canvasMountRef = useRef<HTMLDivElement | null>(null);

  // Store mutable props in refs so React state updates never tear down the WebGL context
  const stateRef = useRef({
    theme,
    cameraMode,
    isPaused,
    pulseBoost,
    onSelect,
    onFrameSample,
  });

  useEffect(() => {
    stateRef.current = {
      theme,
      cameraMode,
      isPaused,
      pulseBoost,
      onSelect,
      onFrameSample,
    };
  }, [theme, cameraMode, isPaused, pulseBoost, onSelect, onFrameSample]);

  const skyUpdaterRef = useRef<((isLight: boolean) => void) | null>(null);
  useEffect(() => {
    if (skyUpdaterRef.current) {
      skyUpdaterRef.current(theme === 'light');
    }
  }, [theme]);

  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
      alpha: false,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(
      isSoftwareGl
        ? 1
        : Math.min(window.devicePixelRatio || 1, dpr[1] || 2)
    );
    renderer.shadowMap.enabled = !isSoftwareGl && enableShadows;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const width = Math.max(container.clientWidth, 320);
    const height = Math.max(container.clientHeight, 320);
    renderer.setSize(width, height);
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const maxAniso = renderer.capabilities.getMaxAnisotropy();

    const scene = new THREE.Scene();
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTexture = pmremGenerator.fromScene(
      new RoomEnvironment(),
      0.04
    ).texture;
    scene.environment = envTexture;
    pmremGenerator.dispose();

    let currentSkyTex: THREE.CanvasTexture | null = null;
    const updateSkyAndFog = (isLightMode: boolean) => {
      if (currentSkyTex) currentSkyTex.dispose();
      currentSkyTex = createSkyTexture(isLightMode, maxAniso);
      scene.background = currentSkyTex;
      scene.fog = new THREE.FogExp2(isLightMode ? 0xbae6fd : 0x071a2c, 0.0042);
    };
    updateSkyAndFog(stateRef.current.theme === 'light');
    skyUpdaterRef.current = updateSkyAndFog;

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.5, 450);
    camera.position.set(14, 6.8, 24);

    // OrbitControls with exponential damping for manual inspection
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.minDistance = 6;
    controls.maxDistance = 65;
    controls.target.set(-2, 1.2, -8);

    let userInteracting = false;
    controls.addEventListener('start', () => {
      userInteracting = true;
    });
    controls.addEventListener('end', () => {
      window.setTimeout(() => {
        userInteracting = false;
      }, 2500);
    });

    // Studio 3-Point Warm/Cool Lighting Rig (<= 3 shadow casters)
    const hemiLight = new THREE.HemisphereLight(0x7dd3fc, 0x0f2942, 0.85);
    hemiLight.position.set(0, 60, 0);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xffedd5, 2.6);
    keyLight.position.set(48, 34, -42);
    keyLight.castShadow = !isSoftwareGl && enableShadows;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.camera.near = 5;
    keyLight.shadow.camera.far = 160;
    keyLight.shadow.camera.left = -45;
    keyLight.shadow.camera.right = 45;
    keyLight.shadow.camera.top = 45;
    keyLight.shadow.camera.bottom = -45;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xfb7185, 0.55);
    rimLight.position.set(-35, 14, -20);
    scene.add(rimLight);

    const reefFillLight = new THREE.PointLight(0x2dd4bf, 1.8, 65, 2);
    reefFillLight.position.set(14, 2.5, 8);
    scene.add(reefFillLight);

    // Coastal Logistics Route Curve
    const routeCurve = new THREE.CatmullRomCurve3(
      [
        new THREE.Vector3(-18, 0.5, 48),
        new THREE.Vector3(-8, 0.5, 26),
        new THREE.Vector3(-1, 0.5, 8),
        new THREE.Vector3(3, 0.5, -12),
        new THREE.Vector3(-2, 0.5, -34),
        new THREE.Vector3(-14, 0.5, -58),
        new THREE.Vector3(-28, 0.5, -82),
      ],
      false,
      'catmullrom',
      0.5
    );

    // Ocean Surface with Coral/Turquoise Luminescence
    const oceanTex = createOceanTexture(maxAniso);
    const oceanGeo = new THREE.PlaneGeometry(340, 340, 24, 24);
    const oceanMat = new THREE.MeshPhysicalMaterial({
      map: oceanTex,
      roughness: 0.16,
      metalness: 0.12,
      clearcoat: 0.85,
      clearcoatRoughness: 0.15,
      reflectivity: 0.9,
    });
    const oceanMesh = new THREE.Mesh(oceanGeo, oceanMat);
    oceanMesh.rotation.x = -Math.PI / 2;
    oceanMesh.position.set(0, -1.6, 0);
    oceanMesh.receiveShadow = !isSoftwareGl && enableShadows;
    scene.add(oceanMesh);

    // Natural Coastal Shoreline & Hills (No indoor walls)
    const shoreGeo = new THREE.CylinderGeometry(36, 42, 1.4, 28);
    const shoreMat = new THREE.MeshStandardMaterial({
      color: 0xd6b88c,
      roughness: 0.88,
      metalness: 0.05,
    });
    const shoreMesh = new THREE.Mesh(shoreGeo, shoreMat);
    shoreMesh.position.set(-22, -1.4, -10);
    shoreMesh.receiveShadow = !isSoftwareGl && enableShadows;
    scene.add(shoreMesh);

    const hillGeo = new THREE.DodecahedronGeometry(1, 2);
    const hillConfigs = [
      { pos: [-38, 4, -25], scale: [28, 14, 26], color: 0x0f3d3e },
      { pos: [-24, 2.2, 12], scale: [22, 9.5, 24], color: 0x1e293b },
      { pos: [-42, 6.5, -60], scale: [35, 18, 32], color: 0x0f3d3e },
      { pos: [5, 3.5, -72], scale: [32, 13, 28], color: 0x1e293b },
    ];
    for (const h of hillConfigs) {
      const hMesh = new THREE.Mesh(
        hillGeo,
        new THREE.MeshStandardMaterial({
          color: h.color,
          roughness: 0.78,
          metalness: 0.08,
        })
      );
      hMesh.position.set(h.pos[0], h.pos[1], h.pos[2]);
      hMesh.scale.set(h.scale[0], h.scale[1], h.scale[2]);
      scene.add(hMesh);
    }

    // InstancedMesh (>20 instances): 32 Coastal Casuarina/Palm Trees with ±15% scale & color tint variation
    const treeCount = 32;
    const trunkInstGeo = new THREE.CylinderGeometry(0.14, 0.24, 2.4, 8);
    trunkInstGeo.translate(0, 1.2, 0);
    const trunkInstMat = new THREE.MeshStandardMaterial({
      color: 0x5c4033,
      roughness: 0.85,
      metalness: 0.05,
    });
    const trunkInstMesh = new THREE.InstancedMesh(
      trunkInstGeo,
      trunkInstMat,
      treeCount
    );

    const canopyInstGeo = new THREE.ConeGeometry(1.15, 2.2, 7);
    canopyInstGeo.translate(0, 2.8, 0);
    const canopyInstMat = new THREE.MeshStandardMaterial({
      color: 0x0d9488,
      roughness: 0.62,
      metalness: 0.1,
    });
    const canopyInstMesh = new THREE.InstancedMesh(
      canopyInstGeo,
      canopyInstMat,
      treeCount
    );

    for (let i = 0; i < treeCount; i++) {
      const angle = (i / treeCount) * Math.PI * 1.35 - 0.4;
      const radius = 14 + ((i * 19) % 18);
      const tx = -22 + Math.cos(angle) * radius;
      const tz = -10 + Math.sin(angle) * radius;
      const s = 0.85 + ((i * 7) % 30) / 100; // ±15% scale variation

      _vec3A.set(tx, -0.7, tz);
      _quat.setFromAxisAngle(_upVec, (i * 1.1) % (Math.PI * 2));
      _scaleVec.set(s, s, s);
      _mat4.compose(_vec3A, _quat, _scaleVec);

      trunkInstMesh.setMatrixAt(i, _mat4);
      canopyInstMesh.setMatrixAt(i, _mat4);

      _color.setHSL(0.47 + (i % 5) * 0.015, 0.68, 0.28 + (i % 4) * 0.04);
      canopyInstMesh.setColorAt(i, _color);
    }
    trunkInstMesh.instanceMatrix.needsUpdate = true;
    canopyInstMesh.instanceMatrix.needsUpdate = true;
    if (canopyInstMesh.instanceColor) {
      canopyInstMesh.instanceColor.needsUpdate = true;
    }
    trunkInstMesh.computeBoundingSphere();
    canopyInstMesh.computeBoundingSphere();
    scene.add(trunkInstMesh, canopyInstMesh);

    // Asphalt Highway Surface
    const asphaltTex = createAsphaltTexture(maxAniso);
    const roadGeo = buildRoadRibbonGeometry(routeCurve, 5.6, 150);
    const roadMat = new THREE.MeshStandardMaterial({
      map: asphaltTex,
      roughness: 0.42,
      metalness: 0.18,
    });
    const roadMesh = new THREE.Mesh(roadGeo, roadMat);
    roadMesh.receiveShadow = !isSoftwareGl && enableShadows;
    roadMesh.userData = { telemetryKey: 'route-corridor' };
    scene.add(roadMesh);

    // Viaduct Support Pillars
    const pillarGeo = new THREE.CylinderGeometry(0.45, 0.55, 2.2, 12);
    const pillarMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.6,
      metalness: 0.25,
    });
    for (let i = 1; i <= 11; i++) {
      const pt = routeCurve.getPointAt(i / 12);
      const pillar = new THREE.Mesh(pillarGeo, pillarMat);
      pillar.position.set(pt.x, -0.65, pt.z);
      scene.add(pillar);
    }

    // Glowing Cyan Logistics Route Trajectory Tube
    const glowingTubeGeo = new THREE.TubeGeometry(
      routeCurve,
      130,
      0.12,
      8,
      false
    );
    const glowingMat = new THREE.MeshStandardMaterial({
      color: 0x4cc9ff,
      emissive: 0x00bfff,
      emissiveIntensity: 1.8,
      roughness: 0.2,
    });
    const glowingTubeMesh = new THREE.Mesh(glowingTubeGeo, glowingMat);
    glowingTubeMesh.position.set(0, 0.08, 0);
    glowingTubeMesh.userData = { telemetryKey: 'route-corridor' };
    scene.add(glowingTubeMesh);

    // InstancedMesh (>20 instances): 24 Animated Route Progression Beacons
    const beaconCount = 24;
    const beaconGeo = new THREE.SphereGeometry(0.22, 12, 12);
    const beaconMat = new THREE.MeshStandardMaterial({
      color: 0x4cc9ff,
      emissive: 0x4cc9ff,
      emissiveIntensity: 2.4,
    });
    const beaconInstMesh = new THREE.InstancedMesh(
      beaconGeo,
      beaconMat,
      beaconCount
    );
    beaconInstMesh.frustumCulled = false;
    beaconInstMesh.userData = { telemetryKey: 'route-corridor' };
    scene.add(beaconInstMesh);

    // Composite Roadside Dispatch Coordinator & Relay Terminal (6-part Group)
    const waypointPt = routeCurve.getPointAt(0.44);
    const relayGroup = new THREE.Group();
    relayGroup.position.set(waypointPt.x - 4.2, waypointPt.y, waypointPt.z);
    relayGroup.userData = { telemetryKey: 'driver-station' };

    const terminalBase = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 2.2, 0.5),
      new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        roughness: 0.3,
        metalness: 0.72,
      })
    );
    terminalBase.position.set(0, 1.1, 0);
    terminalBase.userData = { telemetryKey: 'driver-station' };

    const terminalScreen = new THREE.Mesh(
      new THREE.BoxGeometry(0.85, 0.95, 0.06),
      new THREE.MeshStandardMaterial({
        color: 0x4cc9ff,
        emissive: 0x00bfff,
        emissiveIntensity: 1.6,
        roughness: 0.15,
      })
    );
    terminalScreen.position.set(0, 1.4, 0.26);
    terminalScreen.userData = { telemetryKey: 'driver-station' };

    const coordLegs = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.14, 0.85, 10),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.72 })
    );
    coordLegs.position.set(1.05, 0.42, 0.35);

    const coordTorso = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.17, 0.68, 12),
      new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0284c7,
        emissiveIntensity: 0.45,
        roughness: 0.38,
      })
    );
    coordTorso.position.set(1.05, 1.15, 0.35);

    const coordHead = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.45 })
    );
    coordHead.position.set(1.05, 1.66, 0.35);

    relayGroup.add(
      terminalBase,
      terminalScreen,
      coordLegs,
      coordTorso,
      coordHead
    );
    scene.add(relayGroup);

    // Composite 10-Part Moving 3D Delivery Truck
    const shadowTex = createContactShadowTexture();
    const { truckGroup, wheels } = buildCompositeDeliveryTruck(
      isSoftwareGl,
      shadowTex
    );
    scene.add(truckGroup);

    // Pre-warm shaders on hardware GPUs
    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Raycaster for interactive telemetry inspection
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const interactableTargets = [
      truckGroup,
      roadMesh,
      glowingTubeMesh,
      relayGroup,
    ];

    const handlePointerDown = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(interactableTargets, true);
      if (hits.length > 0) {
        let obj: THREE.Object3D | null = hits[0].object;
        while (obj) {
          if (obj.userData?.telemetryKey) {
            stateRef.current.onSelect(obj.userData.telemetryKey);
            break;
          }
          obj = obj.parent;
        }
      }
    };
    renderer.domElement.addEventListener('click', handlePointerDown);

    // Resize listener
    const handleResize = () => {
      if (!container) return;
      const w = Math.max(container.clientWidth, 320);
      const h = Math.max(container.clientHeight, 320);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // Animation & Software-WebGL Paced Loop
    const clock = new THREE.Clock();
    let truckProgress = 0.12;
    let elapsedTotal = 0;
    let frameCount = 0;
    let frameAccum = 0;
    let frameId = 0;
    let isDisposed = false;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (!gl || typeof gl.fenceSync !== 'function') {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (isDisposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      if (isDisposed) return;

      const rawDelta = clock.getDelta();
      const dt = Math.min(rawDelta, 0.05);
      const {
        isPaused: paused,
        cameraMode: mode,
        pulseBoost: boost,
        onFrameSample: sampleCb,
      } = stateRef.current;

      if (!paused && !document.hidden) {
        elapsedTotal += dt;
        frameCount += 1;
        frameAccum += rawDelta;

        if (frameAccum >= 0.75 && sampleCb) {
          const avgDelta = frameAccum / Math.max(frameCount, 1);
          const fps = Math.min(120, Math.round(1 / Math.max(avgDelta, 0.001)));
          const ms = Number((avgDelta * 1000).toFixed(1));
          sampleCb(fps, ms);
          frameCount = 0;
          frameAccum = 0;
        }

        // Advance ocean texture & glowing route pulse
        oceanTex.offset.x = (elapsedTotal * 0.015) % 1;
        oceanTex.offset.y = (elapsedTotal * 0.01) % 1;
        glowingMat.emissiveIntensity =
          1.75 + Math.sin(elapsedTotal * 2.5) * 0.35 + boost * 1.4;

        // Update InstancedMesh route beacons without new Vector3 allocations
        _quat.identity();
        _scaleVec.set(1, 1, 1);
        for (let i = 0; i < beaconCount; i++) {
          const bt = (i / beaconCount + elapsedTotal * 0.085) % 0.96;
          routeCurve.getPointAt(bt, _vec3A);
          _vec3A.y += 0.24;
          _mat4.compose(_vec3A, _quat, _scaleVec);
          beaconInstMesh.setMatrixAt(i, _mat4);
        }
        beaconInstMesh.instanceMatrix.needsUpdate = true;

        // Advance Single Moving 3D Delivery Truck along routeCurve
        truckProgress = (truckProgress + dt * 0.042) % 0.88;
        const t = 0.04 + truckProgress;
        routeCurve.getPointAt(t, _vec3A);
        routeCurve.getPointAt(Math.min(t + 0.025, 0.99), _vec3B);

        truckGroup.position.copy(_vec3A);
        truckGroup.lookAt(_vec3B);

        for (let w = 0; w < wheels.length; w++) {
          wheels[w].rotation.x += dt * 6.5;
        }

        // Frame-rate independent exponential camera damping (1 - Math.exp(-k * dt))
        if (!userInteracting) {
          const dampAlpha = 1 - Math.exp(-3.2 * dt);
          if (mode === 'chase') {
            _vec3C.set(_vec3A.x + 6.5, _vec3A.y + 4.2, _vec3A.z + 11.5);
            camera.position.lerp(_vec3C, dampAlpha);
            controls.target.lerp(
              _vec3B.set(_vec3A.x, _vec3A.y + 1.2, _vec3A.z - 4),
              dampAlpha
            );
          } else if (mode === 'overview') {
            _vec3C.set(
              18 + Math.sin(elapsedTotal * 0.22) * 3,
              19,
              18 + Math.cos(elapsedTotal * 0.22) * 3
            );
            camera.position.lerp(_vec3C, dampAlpha);
            controls.target.lerp(_vec3B.set(-4, 0.5, -18), dampAlpha);
          } else {
            _vec3C.set(
              14 + Math.sin(elapsedTotal * 0.25) * 2.2,
              6.8 + Math.sin(elapsedTotal * 0.18) * 0.4,
              24 + Math.cos(elapsedTotal * 0.25) * 2.0
            );
            camera.position.lerp(_vec3C, dampAlpha);
            controls.target.lerp(
              _vec3B.set(_vec3A.x * 0.35 - 2, 1.6, _vec3A.z * 0.35 - 10),
              dampAlpha
            );
          }
        }
      }

      controls.update();
      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = window.requestAnimationFrame(tick);
      }
    }

    frameId = window.requestAnimationFrame(tick);

    return () => {
      isDisposed = true;
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(frameId);
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('click', handlePointerDown);
      controls.dispose();
      if (currentSkyTex) currentSkyTex.dispose();
      envTexture.dispose();
      oceanTex.dispose();
      asphaltTex.dispose();
      shadowTex.dispose();
      roadGeo.dispose();
      glowingTubeGeo.dispose();
      beaconGeo.dispose();
      trunkInstGeo.dispose();
      canopyInstGeo.dispose();
      renderer.dispose();
    };
  }, [dpr, enableShadows]);

  return <div ref={canvasMountRef} className="w-full h-full" />;
};

export default CinematicHeroScene;
