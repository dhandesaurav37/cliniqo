import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';

function createRoundedRectShape(width: number, height: number, radius: number) {
  const shape = new THREE.Shape();
  const x = -width / 2;
  const y = -height / 2;
  shape.moveTo(x + radius, y);
  shape.lineTo(x + width - radius, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + radius);
  shape.lineTo(x + width, y + height - radius);
  shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  shape.lineTo(x + radius, y + height);
  shape.quadraticCurveTo(x, y + height, x, y + height - radius);
  shape.lineTo(x, y + radius);
  shape.quadraticCurveTo(x, y, x + radius, y);
  return shape;
}

function createCrossShape(size: number, armWidth: number, radius: number) {
  const h = size / 2;
  const a = armWidth / 2;
  const r = Math.min(radius, a * 0.45);
  const shape = new THREE.Shape();

  shape.moveTo(-a + r, h);
  shape.lineTo(a - r, h);
  shape.quadraticCurveTo(a, h, a, h - r);
  shape.lineTo(a, a);
  shape.lineTo(h - r, a);
  shape.quadraticCurveTo(h, a, h, a - r);
  shape.lineTo(h, -a + r);
  shape.quadraticCurveTo(h, -a, h - r, -a);
  shape.lineTo(a, -a);
  shape.lineTo(a, -h + r);
  shape.quadraticCurveTo(a, -h, a - r, -h);
  shape.lineTo(-a + r, -h);
  shape.quadraticCurveTo(-a, -h, -a, -h + r);
  shape.lineTo(-a, -a);
  shape.lineTo(-h + r, -a);
  shape.quadraticCurveTo(-h, -a, -h, -a + r);
  shape.lineTo(-h, a - r);
  shape.quadraticCurveTo(-h, a, -h + r, a);
  shape.lineTo(-a, a);
  shape.lineTo(-a, h - r);
  shape.quadraticCurveTo(-a, h, -a + r, h);

  return shape;
}

function createRxSheetTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 680;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#FBFDFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Header band
  const grad = ctx.createLinearGradient(0, 0, canvas.width, 96);
  grad.addColorStop(0, '#0284C7');
  grad.addColorStop(1, '#0891B2');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, 92);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 24px sans-serif';
  ctx.fillText('CLINIC PRESCRIPTION', 36, 46);
  ctx.font = '500 15px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText('Digital Rx · Sample Layout', 36, 72);

  // Rx symbol
  ctx.fillStyle = '#0284C7';
  ctx.font = '800 54px Georgia, serif';
  ctx.fillText('Rx', 38, 174);

  // Divider
  ctx.strokeStyle = '#DCE8F5';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(36, 200);
  ctx.lineTo(476, 200);
  ctx.stroke();

  // Sample medication rows
  const meds = [
    ['1. Paracetamol 650 mg', '1-0-1  ·  5 Days  (10 Tabs)'],
    ['2. Azithromycin 500 mg', '1-0-0  ·  3 Days  (3 Tabs)'],
    ['3. Pantoprazole 40 mg', '1-0-0  ·  7 Days  (7 Tabs)'],
  ];

  meds.forEach(([title, meta], idx) => {
    const y = 258 + idx * 102;
    ctx.fillStyle = '#0B192C';
    ctx.font = '700 21px sans-serif';
    ctx.fillText(title, 40, y);

    ctx.fillStyle = '#475569';
    ctx.font = '500 17px monospace';
    ctx.fillText(meta, 40, y + 32);

    ctx.strokeStyle = '#EEF4FB';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(40, y + 54);
    ctx.lineTo(472, y + 54);
    ctx.stroke();
  });

  // Follow-up footer bar
  ctx.fillStyle = '#EFF7FF';
  ctx.fillRect(36, 566, 440, 74);
  ctx.fillStyle = '#0369A1';
  ctx.font = '600 17px sans-serif';
  ctx.fillText('Follow-up Visit: In 5 Days · WhatsApp Active', 56, 610);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  texture.needsUpdate = true;
  return texture;
}

function createAppointmentCardTexture(
  title: string,
  subtitle: string,
  accentHex: string,
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 224;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Subtle top accent bar
  ctx.fillStyle = accentHex;
  ctx.fillRect(0, 0, canvas.width, 12);

  // Icon box
  ctx.fillStyle = '#EFF7FF';
  ctx.fillRect(28, 42, 64, 64);
  ctx.strokeStyle = accentHex;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(60, 58);
  ctx.lineTo(60, 90);
  ctx.moveTo(44, 74);
  ctx.lineTo(76, 74);
  ctx.stroke();

  ctx.fillStyle = '#0B192C';
  ctx.font = '700 28px sans-serif';
  ctx.fillText(title, 114, 74);

  ctx.fillStyle = '#475569';
  ctx.font = '500 22px sans-serif';
  ctx.fillText(subtitle, 114, 114);

  ctx.fillStyle = '#64748B';
  ctx.font = '500 18px monospace';
  ctx.fillText('SAMPLE QUEUE · LIVE SYNC', 28, 178);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  texture.needsUpdate = true;
  return texture;
}

export function Hero3DScene() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [fallbackActive, setFallbackActive] = useState(false);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let renderer: THREE.WebGLRenderer | null = null;
    let frameId = 0;
    let disposed = false;

    const isSoftwareGl = (() => {
      try {
        const probeCanvas = document.createElement('canvas');
        const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      setFallbackActive(true);
      return;
    }

    const activeRenderer = renderer;
    const width = Math.max(container.clientWidth, 320);
    const height = Math.max(container.clientHeight, 320);

    activeRenderer.setSize(width, height);
    activeRenderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    activeRenderer.outputColorSpace = THREE.SRGBColorSpace;
    activeRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    activeRenderer.toneMappingExposure = 1.08;
    activeRenderer.shadowMap.enabled = !isSoftwareGl;
    activeRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
    activeRenderer.setClearColor(0x000000, 0);

    container.appendChild(activeRenderer.domElement);

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      setFallbackActive(true);
    };
    const handleContextRestored = () => {
      setFallbackActive(false);
    };
    activeRenderer.domElement.addEventListener('webglcontextlost', handleContextLost);
    activeRenderer.domElement.addEventListener('webglcontextrestored', handleContextRestored);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 60);
    camera.position.set(0, 0.25, 8.6);

    const pmremGenerator = new THREE.PMREMGenerator(activeRenderer);
    const envTex = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmremGenerator.dispose();

    // Lighting rig (warm key + cool hemi + cyan rim)
    const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x94a3b8, 0.85);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff7ed, 1.9);
    keyLight.position.set(4.5, 6.0, 5.5);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -4;
    keyLight.shadow.camera.right = 4;
    keyLight.shadow.camera.top = 4;
    keyLight.shadow.camera.bottom = -4;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.35);
    rimLight.position.set(-5.0, 2.5, -3.5);
    scene.add(rimLight);

    if (!isSoftwareGl) {
      RectAreaLightUniformsLib.init();
      const areaLight = new THREE.RectAreaLight(0xe0f2fe, 2.4, 5, 3);
      areaLight.position.set(-3.2, 3.2, 4.0);
      areaLight.lookAt(0, 0, 0);
      scene.add(areaLight);
    }

    const maxAniso = activeRenderer.capabilities.getMaxAnisotropy();

    // Shared materials (varied roughness & metalness)
    const brushedMetalMat = new THREE.MeshPhysicalMaterial({
      color: 0xe2e8f0,
      metalness: 0.92,
      roughness: 0.2,
      anisotropy: 0.75,
      clearcoat: 0.2,
    });

    const navySiliconeMat = new THREE.MeshStandardMaterial({
      color: 0x0f2942,
      metalness: 0.06,
      roughness: 0.68,
    });

    const cyanGlassMat = new THREE.MeshPhysicalMaterial({
      color: 0x7dd3fc,
      metalness: 0.0,
      roughness: 0.08,
      transmission: isSoftwareGl ? 0 : 0.88,
      transparent: true,
      opacity: isSoftwareGl ? 0.55 : 1,
      ior: 1.52,
      thickness: 0.8,
      attenuationColor: new THREE.Color(0x0284c7),
      attenuationDistance: 1.8,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
    });

    const frostedGlassPanelMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0.0,
      roughness: 0.22,
      transmission: isSoftwareGl ? 0 : 0.72,
      transparent: true,
      opacity: isSoftwareGl ? 0.42 : 0.92,
      ior: 1.48,
      thickness: 0.35,
      clearcoat: 0.85,
      depthWrite: false,
    });

    const rootGroup = new THREE.Group();
    scene.add(rootGroup);

    const disposables: Array<{ dispose: () => void }> = [
      envTex,
      brushedMetalMat,
      navySiliconeMat,
      cyanGlassMat,
      frostedGlassPanelMat,
    ];

    // 1. Central Sculpted Medical Cross Group (3-part composite)
    const crossGroup = new THREE.Group();
    crossGroup.position.set(-0.25, 0.35, 0.3);
    crossGroup.rotation.set(0.12, -0.22, 0.05);

    const crossGeo = new THREE.ExtrudeGeometry(createCrossShape(1.55, 0.52, 0.12), {
      depth: 0.26,
      bevelEnabled: true,
      bevelThickness: 0.06,
      bevelSize: 0.05,
      bevelSegments: 4,
    });
    crossGeo.center();
    const crossMesh = new THREE.Mesh(crossGeo, cyanGlassMat);
    crossMesh.castShadow = true;
    crossGroup.add(crossMesh);

    const innerCoreGeo = new THREE.ExtrudeGeometry(createCrossShape(1.02, 0.26, 0.06), {
      depth: 0.14,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.02,
      bevelSegments: 2,
    });
    innerCoreGeo.center();
    const innerCoreMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      metalness: 0.25,
      roughness: 0.25,
      emissive: 0x0369a1,
      emissiveIntensity: 0.22,
    });
    const innerCoreMesh = new THREE.Mesh(innerCoreGeo, innerCoreMat);
    crossGroup.add(innerCoreMesh);

    const haloRingGeo = new THREE.TorusGeometry(1.18, 0.032, 20, 64);
    const haloRingMesh = new THREE.Mesh(haloRingGeo, brushedMetalMat);
    haloRingMesh.rotation.x = Math.PI / 6;
    crossGroup.add(haloRingMesh);

    rootGroup.add(crossGroup);
    disposables.push(crossGeo, innerCoreGeo, innerCoreMat, haloRingGeo);

    // 2. Stethoscope Assembly Group (multi-part Lathe + Tube + Torus)
    const stethGroup = new THREE.Group();
    stethGroup.position.set(-1.35, -0.55, 0.75);
    stethGroup.rotation.set(0.28, 0.35, -0.18);

    // Chestpiece diaphragm
    const chestBodyGeo = new THREE.CylinderGeometry(0.42, 0.36, 0.14, 36);
    const chestBody = new THREE.Mesh(chestBodyGeo, brushedMetalMat);
    chestBody.rotation.x = Math.PI / 2;
    chestBody.castShadow = true;
    stethGroup.add(chestBody);

    const diaphragmRimGeo = new THREE.TorusGeometry(0.4, 0.035, 16, 40);
    const diaphragmRim = new THREE.Mesh(diaphragmRimGeo, navySiliconeMat);
    diaphragmRim.position.z = 0.07;
    stethGroup.add(diaphragmRim);

    const stemGeo = new THREE.CylinderGeometry(0.055, 0.065, 0.36, 20);
    const stemMesh = new THREE.Mesh(stemGeo, brushedMetalMat);
    stemMesh.position.set(0, 0.44, 0);
    stethGroup.add(stemMesh);

    // Acoustic silicone tubing curve
    const mainTubeCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.58, 0),
      new THREE.Vector3(0.08, 1.15, -0.12),
      new THREE.Vector3(0.55, 1.55, -0.25),
      new THREE.Vector3(1.15, 1.42, -0.18),
    ]);
    const mainTubeGeo = new THREE.TubeGeometry(mainTubeCurve, 42, 0.055, 14, false);
    const mainTubeMesh = new THREE.Mesh(mainTubeGeo, navySiliconeMat);
    mainTubeMesh.castShadow = true;
    stethGroup.add(mainTubeMesh);

    // Binaural Y arms
    const ySplitterGeo = new THREE.CylinderGeometry(0.08, 0.065, 0.18, 20);
    const ySplitter = new THREE.Mesh(ySplitterGeo, brushedMetalMat);
    ySplitter.position.set(1.15, 1.42, -0.18);
    ySplitter.rotation.z = -Math.PI / 3;
    stethGroup.add(ySplitter);

    const armCurveLeft = new THREE.CatmullRomCurve3([
      new THREE.Vector3(1.18, 1.44, -0.18),
      new THREE.Vector3(1.58, 1.75, -0.05),
      new THREE.Vector3(1.75, 2.05, 0.08),
    ]);
    const armCurveRight = new THREE.CatmullRomCurve3([
      new THREE.Vector3(1.18, 1.4, -0.18),
      new THREE.Vector3(1.68, 1.25, -0.35),
      new THREE.Vector3(1.98, 1.5, -0.22),
    ]);
    const armLeftGeo = new THREE.TubeGeometry(armCurveLeft, 24, 0.034, 12, false);
    const armRightGeo = new THREE.TubeGeometry(armCurveRight, 24, 0.034, 12, false);
    stethGroup.add(new THREE.Mesh(armLeftGeo, brushedMetalMat));
    stethGroup.add(new THREE.Mesh(armRightGeo, brushedMetalMat));

    const earTipGeo = new THREE.SphereGeometry(0.065, 16, 16);
    const earTip1 = new THREE.Mesh(earTipGeo, navySiliconeMat);
    earTip1.position.set(1.76, 2.07, 0.09);
    const earTip2 = new THREE.Mesh(earTipGeo, navySiliconeMat);
    earTip2.position.set(2.0, 1.52, -0.21);
    stethGroup.add(earTip1, earTip2);

    rootGroup.add(stethGroup);
    disposables.push(
      chestBodyGeo,
      diaphragmRimGeo,
      stemGeo,
      mainTubeGeo,
      ySplitterGeo,
      armLeftGeo,
      armRightGeo,
      earTipGeo,
    );

    // 3. Prescription Sheet Group (Beveled Glass Backing + Crisp Rx Canvas Decal + Metallic Clip)
    const rxGroup = new THREE.Group();
    rxGroup.position.set(1.38, -0.08, -0.15);
    rxGroup.rotation.set(-0.06, -0.32, -0.06);

    const rxBoardGeo = new THREE.ExtrudeGeometry(createRoundedRectShape(1.52, 2.02, 0.1), {
      depth: 0.06,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.02,
      bevelSegments: 2,
    });
    rxBoardGeo.center();
    const rxBoardMat = new THREE.MeshPhysicalMaterial({
      color: 0xf8fbff,
      roughness: 0.25,
      metalness: 0.02,
      clearcoat: 0.65,
    });
    const rxBoardMesh = new THREE.Mesh(rxBoardGeo, rxBoardMat);
    rxBoardMesh.castShadow = true;
    rxGroup.add(rxBoardMesh);

    const rxTexture = createRxSheetTexture(maxAniso);
    const rxFaceGeo = new THREE.PlaneGeometry(1.4, 1.88);
    const rxFaceMat = new THREE.MeshStandardMaterial({
      map: rxTexture,
      roughness: 0.4,
      metalness: 0.0,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const rxFaceMesh = new THREE.Mesh(rxFaceGeo, rxFaceMat);
    rxFaceMesh.position.z = 0.052;
    rxGroup.add(rxFaceMesh);

    const clipGeo = new THREE.BoxGeometry(0.56, 0.14, 0.12);
    const clipMesh = new THREE.Mesh(clipGeo, brushedMetalMat);
    clipMesh.position.set(0, 0.98, 0.04);
    rxGroup.add(clipMesh);

    rootGroup.add(rxGroup);
    disposables.push(rxBoardGeo, rxBoardMat, rxTexture, rxFaceGeo, rxFaceMat, clipGeo);

    // 4. Floating Glass Appointment Cards (2 Cards)
    const card1Group = new THREE.Group();
    card1Group.position.set(-1.32, 1.38, -0.35);
    card1Group.rotation.set(0.08, 0.24, 0.05);

    const cardPlateGeo = new THREE.ExtrudeGeometry(createRoundedRectShape(1.66, 0.74, 0.09), {
      depth: 0.04,
      bevelEnabled: true,
      bevelThickness: 0.015,
      bevelSize: 0.015,
      bevelSegments: 2,
    });
    cardPlateGeo.center();

    const card1Glass = new THREE.Mesh(cardPlateGeo, frostedGlassPanelMat);
    card1Glass.renderOrder = 2;
    card1Group.add(card1Glass);

    const card1Tex = createAppointmentCardTexture(
      'Token #04 · Follow-up',
      '10:30 AM · Confirmed',
      '#0284C7',
      maxAniso,
    );
    const cardFaceGeo = new THREE.PlaneGeometry(1.52, 0.64);
    const card1FaceMat = new THREE.MeshBasicMaterial({
      map: card1Tex,
      transparent: true,
      opacity: 0.96,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
    const card1Face = new THREE.Mesh(cardFaceGeo, card1FaceMat);
    card1Face.position.z = 0.038;
    card1Face.renderOrder = 3;
    card1Group.add(card1Face);
    rootGroup.add(card1Group);

    const card2Group = new THREE.Group();
    card2Group.position.set(1.22, -1.32, 0.45);
    card2Group.rotation.set(-0.08, -0.22, 0.04);

    const card2Glass = new THREE.Mesh(cardPlateGeo, frostedGlassPanelMat);
    card2Glass.renderOrder = 2;
    card2Group.add(card2Glass);

    const card2Tex = createAppointmentCardTexture(
      'WhatsApp Reminder',
      'Sent · Visit in 5 Days',
      '#0891B2',
      maxAniso,
    );
    const card2FaceMat = new THREE.MeshBasicMaterial({
      map: card2Tex,
      transparent: true,
      opacity: 0.96,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
    const card2Face = new THREE.Mesh(cardFaceGeo, card2FaceMat);
    card2Face.position.z = 0.038;
    card2Face.renderOrder = 3;
    card2Group.add(card2Face);
    rootGroup.add(card2Group);

    disposables.push(cardPlateGeo, cardFaceGeo, card1Tex, card1FaceMat, card2Tex, card2FaceMat);

    // Subtle glass backdrop disc for studio depth
    const backdropDiscGeo = new THREE.RingGeometry(1.85, 2.28, 64);
    const backdropDiscMat = new THREE.MeshBasicMaterial({
      color: 0xbae6fd,
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide,
    });
    const backdropDisc = new THREE.Mesh(backdropDiscGeo, backdropDiscMat);
    backdropDisc.position.set(0, 0, -1.4);
    rootGroup.add(backdropDisc);
    disposables.push(backdropDiscGeo, backdropDiscMat);

    if (!isSoftwareGl) {
      activeRenderer.compile(scene, camera);
    }

    // Pointer parallax targets
    let targetRotX = 0;
    let targetRotY = 0;

    const handlePointerMove = (e: PointerEvent) => {
      if (prefersReducedMotion) return;
      const rect = container.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
      targetRotY = THREE.MathUtils.clamp(nx * 0.18, -0.22, 0.22);
      targetRotX = THREE.MathUtils.clamp(-ny * 0.12, -0.15, 0.15);
    };

    const handlePointerLeave = () => {
      targetRotX = 0;
      targetRotY = 0;
    };

    container.addEventListener('pointermove', handlePointerMove, { passive: true });
    container.addEventListener('pointerleave', handlePointerLeave);

    const handleResize = () => {
      if (!container || disposed) return;
      const w = Math.max(container.clientWidth, 280);
      const h = Math.max(container.clientHeight, 280);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      activeRenderer.setSize(w, h);
      if (prefersReducedMotion) {
        activeRenderer.render(scene, camera);
      }
    };
    window.addEventListener('resize', handleResize);

    // Software WebGL GPU fence synchronization
    function afterDraw(cb: () => void) {
      if (disposed) return;
      const gl = activeRenderer.getContext() as WebGL2RenderingContext;
      if (!gl || typeof gl.fenceSync !== 'function') {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 6);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 6);
    }

    const clock = new THREE.Clock();

    const renderFrame = () => {
      if (disposed) return;
      const delta = Math.min(clock.getDelta(), 0.05);
      const elapsed = clock.getElapsedTime();

      if (!prefersReducedMotion) {
        rootGroup.rotation.x = THREE.MathUtils.damp(rootGroup.rotation.x, targetRotX, 4.5, delta);
        rootGroup.rotation.y = THREE.MathUtils.damp(rootGroup.rotation.y, targetRotY, 4.5, delta);

        crossGroup.position.y = 0.35 + Math.sin(elapsed * 1.1) * 0.09;
        crossGroup.rotation.y = -0.22 + Math.sin(elapsed * 0.65) * 0.08;

        stethGroup.position.y = -0.55 + Math.sin(elapsed * 0.95 + 1.1) * 0.07;
        rxGroup.position.y = -0.08 + Math.sin(elapsed * 1.05 + 2.0) * 0.08;
        card1Group.position.y = 1.38 + Math.sin(elapsed * 1.25 + 0.5) * 0.06;
        card2Group.position.y = -1.32 + Math.sin(elapsed * 1.15 + 2.7) * 0.06;
      }

      activeRenderer.render(scene, camera);

      if (!prefersReducedMotion) {
        if (isSoftwareGl) {
          afterDraw(renderFrame);
        } else {
          frameId = requestAnimationFrame(renderFrame);
        }
      }
    };

    renderFrame();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', handleResize);
      container.removeEventListener('pointermove', handlePointerMove);
      container.removeEventListener('pointerleave', handlePointerLeave);
      activeRenderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      activeRenderer.domElement.removeEventListener('webglcontextrestored', handleContextRestored);

      disposables.forEach((item) => item.dispose());
      activeRenderer.dispose();
      if (activeRenderer.domElement.parentNode === container) {
        container.removeChild(activeRenderer.domElement);
      }
    };
  }, []);

  if (fallbackActive) {
    return (
      <div className="relative flex h-full w-full items-center justify-center rounded-3xl lucid-glass p-8">
        <div className="text-center max-w-xs space-y-3">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-cyan-500 text-white shadow-lg">
            <span className="font-display text-2xl font-bold">+</span>
          </div>
          <p className="font-display text-base font-semibold text-[#0B192C]">
            Unified Clinic Workspace
          </p>
          <p className="text-sm text-slate-600">
            Queue tokens, consultation notes, digital Rx sheets, and follow-up schedules in sync.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-[380px] sm:h-[460px] lg:h-[520px] w-full">
      <div
        ref={mountRef}
        className="h-full w-full"
        aria-label="Interactive 3D composition of a medical cross, stethoscope, digital prescription sheet, and floating appointment cards"
        role="img"
      />
    </div>
  );
}
