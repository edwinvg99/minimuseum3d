'use strict';
/* ─────────────────────────────────────────────────────────────────────────────
   MUSEUM 3D  —  Three.js first-person walkable museum
   Depends on: three.min.js, popup.js (PopupController), anime.min.js
───────────────────────────────────────────────────────────────────────────── */
const Museum3D = (() => {

  /* ── state ──────────────────────────────────────────────────────────────── */
  let renderer = null, scene = null, camera = null, clock = null;
  let animId   = null;

  // Museum footprint (units)
  const W = 76, H = 6.2, D = 76;
  const COLLIDERS = [];

  // Player
  const player = {
    yaw: 0, pitch: 0, speed: 5.2,
    bobPhase: 0, moving: false,
    velY: 0,           // vertical velocity for jump
    grounded: true,    // is on the floor?
    baseY: 1.7,        // current eye height (changes during jump)
  };
  const GRAVITY    = -22;  // units/s²
  const JUMP_FORCE =  8;   // initial upward velocity

  const keys  = {};
  let   locked = false;
  const isMob  = ('ontouchstart' in window);

  // Touch tracking
  const touch  = { left: null, right: null };

  // Painting meshes for raycasting
  const paintings  = [];
  let   nearPainting = null;
  const INTERACT_DISTANCE = 5.5;

  // Free-mouse NDC position (used when pointer is NOT locked)
  const _mouseNDC = { x: 0, y: 0 };

  // Animated objects reference map
  const A = {};

  // Named handlers for clean removal
  const H_map = {};
  let bgm = null;
  let audioBtn = null;

  // Room tracking for entry popups
  let _currentRoom = null;
  let _inFutureRoom = false;
  let _futureRoomVisited = false;
  const interactables = [];

  /* ── public API ─────────────────────────────────────────────────────────── */
  function init(onReady) {
    if (renderer !== null) { if (onReady) onReady(); return; }

    clock = new THREE.Clock();
    _makeRenderer();
    _makeScene();
    _buildRoom();
    _buildLights();
    _buildCeiling();
    _buildPaintings();
    _buildProps();
    _buildRoomThemes();
    _buildFutureRoom();
    _setupAudio();
    _bindInput();
    _currentRoom = 'month3'; // camera starts outside south corridor (month3 zone)
    _renderLoop();
    _flyIn(onReady);
  }

  function destroy() {
    cancelAnimationFrame(animId);
    animId = null;

    // Remove all listeners
    document.removeEventListener('keydown',          H_map.kd);
    document.removeEventListener('keyup',            H_map.ku);
    document.removeEventListener('mousemove',        H_map.mm);
    document.removeEventListener('pointerlockchange',H_map.plc);
    window.removeEventListener('resize',             H_map.rz);
    if (renderer) {
      const cv = renderer.domElement;
      cv.removeEventListener('click',       H_map.click);
      cv.removeEventListener('touchstart',  H_map.ts);
      cv.removeEventListener('touchmove',   H_map.tm);
      cv.removeEventListener('touchend',    H_map.te);
      cv.removeEventListener('touchcancel', H_map.te);
    }

    if (document.pointerLockElement) document.exitPointerLock();

    // Reset state
    Object.keys(keys).forEach(k => delete keys[k]);
    touch.left = touch.right = null;
    paintings.length = 0;
    interactables.length = 0;
    COLLIDERS.length = 0;
    Object.keys(A).forEach(k => delete A[k]);
    _currentRoom = null;
    _inFutureRoom = false;
    _futureRoomVisited = false;

    _teardownAudio();

    const mm = document.getElementById('minimap-player');
    if (mm) {
      mm.style.left = '50%';
      mm.style.top = '50%';
      mm.style.transform = 'translate(-50%, -50%)';
    }

    // Dispose Three.js
    if (scene) {
      scene.traverse(obj => {
        if (obj.isMesh || obj.isPoints || obj.isSprite) {
          if (obj.geometry) obj.geometry.dispose();
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
        }
      });
    }
    if (renderer) {
      renderer.dispose();
      try { renderer.forceContextLoss(); } catch (_) {}
    }
    renderer = scene = camera = clock = null;
    nearPainting = null;
  }

  /* ── renderer ───────────────────────────────────────────────────────────── */
  function _makeRenderer() {
    renderer = new THREE.WebGLRenderer({
      canvas: document.getElementById('museum-3d-canvas'),
      antialias: true, alpha: false, powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled    = false;
    renderer.outputEncoding       = THREE.sRGBEncoding;
    renderer.toneMapping          = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure  = 0.86;
  }

  /* ── scene + camera ─────────────────────────────────────────────────────── */
  function _makeScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x02030b);
    scene.fog        = new THREE.Fog(0x06070f, 22, 78);

    camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 120);
    camera.rotation.order = 'YXZ';
    // Cinematic start position (outside/above, flies in)
    camera.position.set(0, 5.4, D / 2 + 3.5);
    player.yaw   = 0;
    player.pitch = -0.28;
  }

  /* ── room ───────────────────────────────────────────────────────────────── */
  function _buildRoom() {
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x0b0d18,
      roughness: 0.9,
      metalness: 0.04,
      emissive: 0x04060f,
      emissiveIntensity: 0.18,
    });
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x13131a,
      roughness: 0.56,
      metalness: 0.18,
      emissive: 0x05060a,
      emissiveIntensity: 0.14,
    });
    const ceilMat = new THREE.MeshStandardMaterial({ color: 0x05050a, roughness: 0.98 });

    _add(new THREE.Mesh(new THREE.PlaneGeometry(W, D), floorMat), [0, 0, 0], [-Math.PI / 2, 0, 0]);
    _add(new THREE.Mesh(new THREE.PlaneGeometry(W, D), ceilMat), [0, H, 0], [Math.PI / 2, 0, 0]);

    const trimMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      metalness: 0.9,
      roughness: 0.22,
      emissive: 0x4a3504,
      emissiveIntensity: 0.22,
    });
    _add(new THREE.Mesh(new THREE.BoxGeometry(W, 0.12, 0.06), trimMat), [0, 0.06, -D / 2 + 1.03]);
    _add(new THREE.Mesh(new THREE.BoxGeometry(W, 0.12, 0.06), trimMat), [0, 0.06, D / 2 - 1.03]);
    _add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, D), trimMat), [-W / 2 + 1.03, 0.06, 0]);
    _add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, D), trimMat), [W / 2 - 1.03, 0.06, 0]);

    const WMAX = 37;
    const WR = 8;
    const CW = 1.6;
    const COR_END = 24;
    const ROOM_OUT = 35;
    const ROOM_HALF = 7.5;

    const segs = [
      // Outer shell
      { a: [-WMAX, -WMAX], b: [WMAX, -WMAX] },
      { a: [WMAX, -WMAX], b: [WMAX, WMAX] },
      { a: [WMAX, WMAX], b: [-WMAX, WMAX] },
      { a: [-WMAX, WMAX], b: [-WMAX, -WMAX] },

      // Welcome room walls with 4 door openings
      { a: [-WR, -WR], b: [-CW, -WR] },
      { a: [CW, -WR], b: [WR, -WR] },
      { a: [-WR, WR], b: [-CW, WR] },
      { a: [CW, WR], b: [WR, WR] },
      { a: [-WR, -WR], b: [-WR, -CW] },
      { a: [-WR, CW], b: [-WR, WR] },
      { a: [WR, -WR], b: [WR, -CW] },
      { a: [WR, CW], b: [WR, WR] },

      // Long corridor side walls
      { a: [-CW, -WR], b: [-CW, -COR_END] },
      { a: [CW, -WR], b: [CW, -COR_END] },
      { a: [-CW, WR], b: [-CW, COR_END] },
      { a: [CW, WR], b: [CW, COR_END] },
      { a: [WR, -CW], b: [COR_END, -CW] },
      { a: [WR, CW], b: [COR_END, CW] },
      { a: [-WR, -CW], b: [-COR_END, -CW] },
      { a: [-WR, CW], b: [-COR_END, CW] },

      // Light blockers to avoid direct line of sight
      { a: [-CW, -14], b: [0.45, -14] },
      { a: [-0.45, -18], b: [CW, -18] },
      { a: [-0.45, 14], b: [CW, 14] },
      { a: [-CW, 18], b: [0.45, 18] },
      { a: [14, -CW], b: [14, 0.45] },
      { a: [18, -0.45], b: [18, CW] },
      { a: [-14, -0.45], b: [-14, CW] },
      { a: [-18, -CW], b: [-18, 0.45] },

      // North room
      { a: [-ROOM_HALF, -ROOM_OUT], b: [ROOM_HALF, -ROOM_OUT] },
      { a: [-ROOM_HALF, -ROOM_OUT], b: [-ROOM_HALF, -COR_END] },
      { a: [ROOM_HALF, -ROOM_OUT], b: [ROOM_HALF, -COR_END] },
      { a: [-ROOM_HALF, -COR_END], b: [-CW, -COR_END] },
      { a: [CW, -COR_END], b: [ROOM_HALF, -COR_END] },

      // South room
      { a: [-ROOM_HALF, ROOM_OUT], b: [ROOM_HALF, ROOM_OUT] },
      { a: [-ROOM_HALF, COR_END], b: [-ROOM_HALF, ROOM_OUT] },
      { a: [ROOM_HALF, COR_END], b: [ROOM_HALF, ROOM_OUT] },
      { a: [-ROOM_HALF, COR_END], b: [-CW, COR_END] },
      { a: [CW, COR_END], b: [ROOM_HALF, COR_END] },

      // East room
      { a: [ROOM_OUT, -ROOM_HALF], b: [ROOM_OUT, ROOM_HALF] },
      { a: [COR_END, -ROOM_HALF], b: [ROOM_OUT, -ROOM_HALF] },
      { a: [COR_END, ROOM_HALF], b: [ROOM_OUT, ROOM_HALF] },
      { a: [COR_END, -ROOM_HALF], b: [COR_END, -CW] },
      { a: [COR_END, CW], b: [COR_END, ROOM_HALF] },

      // West room
      { a: [-ROOM_OUT, -ROOM_HALF], b: [-ROOM_OUT, ROOM_HALF] },
      { a: [-ROOM_OUT, -ROOM_HALF], b: [-COR_END, -ROOM_HALF] },
      { a: [-ROOM_OUT, ROOM_HALF], b: [-COR_END, ROOM_HALF] },
      { a: [-COR_END, -ROOM_HALF], b: [-COR_END, -CW] },
      { a: [-COR_END, CW], b: [-COR_END, ROOM_HALF] },
    ];

    segs.forEach(({ a, b }) => _addWallSegment(a[0], a[1], b[0], b[1], wallMat));

    const welcomeFloor = new THREE.MeshStandardMaterial({
      color: 0x1f2a44,
      roughness: 0.8,
      metalness: 0.1,
      emissive: 0x111b34,
      emissiveIntensity: 0.32,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    _add(new THREE.Mesh(new THREE.PlaneGeometry(15.5, 15.5), welcomeFloor), [0, 0.002, 0], [-Math.PI / 2, 0, 0]);

    const corridorTint = [
      { p: [0, 0.003, -16], sz: [2.5, 16], c: 0x0f2f4a },
      { p: [0, 0.003, 16], sz: [2.5, 16], c: 0x4a132f },
      { p: [16, 0.003, 0], sz: [16, 2.5], c: 0x4a300f },
      { p: [-16, 0.003, 0], sz: [16, 2.5], c: 0x123d28 },
    ];
    corridorTint.forEach((d) => {
      _add(new THREE.Mesh(new THREE.PlaneGeometry(d.sz[0], d.sz[1]), new THREE.MeshStandardMaterial({
        color: d.c,
        roughness: 0.84,
        metalness: 0.08,
        emissive: d.c,
        emissiveIntensity: 0.2,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      })), [d.p[0], d.p[1], d.p[2]], [-Math.PI / 2, 0, 0]);
    });

    const darkDoorMat = new THREE.MeshStandardMaterial({
      color: 0x0a0a0f,
      roughness: 0.48,
      metalness: 0.42,
      emissive: 0x04040a,
      emissiveIntensity: 0.22,
    });

    const addDarkDoor = (x, z, ry) => {
      const g = new THREE.Group();
      const postL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 3.2, 0.18), darkDoorMat.clone());
      const postR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 3.2, 0.18), darkDoorMat.clone());
      const top = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.14, 0.18), darkDoorMat.clone());
      postL.position.set(-1.8, 1.6, 0);
      postR.position.set(1.8, 1.6, 0);
      top.position.set(0, 3.16, 0);
      g.add(postL, postR, top);
      g.position.set(x, 0, z);
      g.rotation.y = ry;
      scene.add(g);

      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: _glow(0x171a2a),
        transparent: true,
        opacity: 0.23,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }));
      halo.scale.set(5.3, 4.1, 1);
      halo.position.set(x, 1.8, z);
      scene.add(halo);
    };


    const addPortal = (x, z, ry, color) => {
      const portal = new THREE.Mesh(
        new THREE.TorusGeometry(1.25, 0.1, 16, 48),
        new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: 0.62,
          roughness: 0.2,
          metalness: 0.58,
        })
      );
      portal.position.set(x, 1.55, z);
      portal.rotation.set(0, ry, 0);
      scene.add(portal);

      const glow = new THREE.Sprite(new THREE.SpriteMaterial({
        map: _glow(color),
        transparent: true,
        opacity: 0.26,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }));
      glow.scale.set(3.8, 3.8, 1);
      glow.position.set(x, 1.55, z);
      scene.add(glow);
    };

    addPortal(0, -COR_END + 0.75, 0, 0x67e8f9);
    addPortal(COR_END - 0.75, 0, -Math.PI / 2, 0xfde68a);
    addPortal(0, COR_END - 0.75, Math.PI, 0xf9a8d4);
    addPortal(-COR_END + 0.75, 0, Math.PI / 2, 0x86efac);
  }

  /* ── lights ─────────────────────────────────────────────────────────────── */
  function _buildLights() {
    scene.add(new THREE.AmbientLight(0x0d0f16, 0.28));
    scene.add(new THREE.HemisphereLight(0x1e2238, 0x08080d, 0.18));

    const coreLights = [
      { p: [0, H - 0.45, 0], c: 0xdbeafe, i: 0.95, d: 16 },
      { p: [0, H - 0.45, 14], c: 0xc4b5fd, i: 0.66, d: 11 },
      { p: [0, H - 0.45, -14], c: 0xbfdbfe, i: 0.66, d: 11 },
      { p: [14, H - 0.45, 0], c: 0xfde68a, i: 0.66, d: 11 },
      { p: [-14, H - 0.45, 0], c: 0x86efac, i: 0.66, d: 11 },
    ];
    coreLights.forEach((l, i) => {
      const point = new THREE.PointLight(l.c, l.i, l.d, 1.5);
      point.position.set(...l.p);
      scene.add(point);
      A[`cL${i}`] = point;
    });

    const laneLights = [
      { p: [0, H - 0.5, -11], c: 0x38bdf8 },
      { p: [0, H - 0.5, -20], c: 0x0ea5e9 },
      { p: [11, H - 0.5, 0], c: 0xfbbf24 },
      { p: [20, H - 0.5, 0], c: 0xf59e0b },
      { p: [0, H - 0.5, 11], c: 0xf472b6 },
      { p: [0, H - 0.5, 20], c: 0xdb2777 },
      { p: [-11, H - 0.5, 0], c: 0x4ade80 },
      { p: [-20, H - 0.5, 0], c: 0x16a34a },
    ];
    laneLights.forEach((d, i) => {
      const l = new THREE.PointLight(d.c, 0.22, 7.4, 1.9);
      l.position.set(...d.p);
      scene.add(l);
      A[`pathL${i}`] = l;
    });

    const roomAuras = [
      { key: 'month1Aura', p: [0, 2.4, -29], c: 0x7dd3fc },
      { key: 'month2Aura', p: [29, 2.4, 0], c: 0xfde68a },
      { key: 'month3Aura', p: [0, 2.4, 29], c: 0xf9a8d4 },
      { key: 'month4Aura', p: [-29, 2.4, 0], c: 0x86efac },
    ];
    roomAuras.forEach((r, i) => {
      const aura = new THREE.PointLight(r.c, 0.82, 10.5, 1.45);
      aura.position.set(...r.p);
      scene.add(aura);
      A[r.key] = aura;

      const chandelier = new THREE.PointLight(r.c, 0.45, 7.8, 1.6);
      chandelier.position.set(r.p[0], H - 0.42, r.p[2]);
      scene.add(chandelier);
      A[`roomCh${i}`] = chandelier;
    });
  }

  /* ── ceiling: stars + moon + suspended lights ───────────────────────────── */
  function _buildCeiling() {
    const N   = 620;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const pal = [[1,.95,1],[.64,.84,1],[.95,.62,.86],[.62,1,.9],[1,.92,.6]];

    for (let i = 0; i < N; i++) {
      pos[i*3]   = (Math.random() - 0.5) * W * 0.95;
      pos[i*3+1] = H - 0.04;
      pos[i*3+2] = (Math.random() - 0.5) * D * 0.95;
      const p    = pal[i % pal.length];
      col[i*3]   = p[0];
      col[i*3+1] = p[1];
      col[i*3+2] = p[2];
    }

    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    sg.setAttribute('color', new THREE.BufferAttribute(col, 3));

    A.stars = new THREE.Points(sg, new THREE.PointsMaterial({
      size: 0.05,
      vertexColors: true,
      transparent: true,
      opacity: 0.88,
      sizeAttenuation: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    scene.add(A.stars);

    A.moon = new THREE.Mesh(
      new THREE.SphereGeometry(0.68, 32, 32),
      new THREE.MeshStandardMaterial({
        color: 0xfefce8,
        emissive: 0xfef08a,
        emissiveIntensity: 1.8,
        roughness: 0.58,
      })
    );
    A.moon.position.set(-10.8, H - 0.62, -10.4);
    scene.add(A.moon);

    A.moonGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: _glow(0xfffbeb),
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }));
    A.moonGlow.scale.set(4.2, 4.2, 1);
    A.moonGlow.position.copy(A.moon.position);
    scene.add(A.moonGlow);

    A.moonL = new THREE.PointLight(0x60a5fa, 2.1, 26, 1.35);
    A.moonL.position.copy(A.moon.position);
    scene.add(A.moonL);

    const orbC = [0xc084fc, 0x67e8f9, 0xf9a8d4, 0xfde68a, 0x99f6e4];
    [[0,H-0.38,0], [0,H-0.38,-8.8], [0,H-0.38,8.8], [-11.1,H-0.38,0], [11.1,H-0.38,0]].forEach((op, i) => {
      _add(new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.012, 0.62, 8),
        new THREE.MeshStandardMaterial({ color: 0x9ca3af, metalness: 0.9, roughness: 0.28 })
      ), [op[0], op[1] + 0.31, op[2]]);

      const orb = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 18, 18),
        new THREE.MeshStandardMaterial({
          color: orbC[i],
          emissive: orbC[i],
          emissiveIntensity: 3.4,
          roughness: 0.08,
          metalness: 0.58,
        })
      );
      orb.position.set(...op);
      scene.add(orb);
      A[`orb${i}`] = orb;

      const og = new THREE.Sprite(new THREE.SpriteMaterial({
        map: _glow(orbC[i]),
        transparent: true,
        opacity: 0.52,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }));
      og.scale.set(1.35, 1.35, 1);
      og.position.set(...op);
      scene.add(og);
      A[`og${i}`] = og;
    });
  }

  /* ── paintings ──────────────────────────────────────────────────────────── */
  // Auto-spread paintings on each wall so frames never overlap.
  // Groups by (wall-fixed-coord, y-row) then pushes apart any pair that's too close.
  function _autoSpreadPaintings(defs) {
    const FW  = 0.14; // frame half-extension beyond painting edge
    const GAP = 0.30; // minimum clear gap between neighbouring frames

    // For each painting decide which axis runs ALONG the wall (varies) vs ACROSS (fixed).
    // ry ≈ 0 or π  → north/south wall → paintings arranged along X  (axis idx 0)
    // ry ≈ ±π/2    → east/west  wall  → paintings arranged along Z  (axis idx 2)
    function alongAxis(ry) {
      const a = ((ry % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      return (a < 0.15 || Math.abs(a - Math.PI) < 0.15) ? 0 : 2;
    }
    function fixedAxis(ry) { return alongAxis(ry) === 0 ? 2 : 0; }

    // Bucket: same wall (fixed coord within 0.3) AND same height row (y within 0.8)
    const buckets = [];
    defs.forEach(d => {
      const fIdx = fixedAxis(d.ry);
      const fVal = d.pos[fIdx];
      const yVal = d.pos[1];
      const b = buckets.find(b =>
        fixedAxis(b[0].ry) === fIdx &&
        Math.abs(b[0].pos[fIdx] - fVal) < 0.3 &&
        Math.abs(b[0].pos[1]    - yVal) < 0.8
      );
      if (b) b.push(d); else buckets.push([d]);
    });

    buckets.forEach(group => {
      if (group.length < 2) return;
      const aIdx = alongAxis(group[0].ry);
      group.sort((a, b) => a.pos[aIdx] - b.pos[aIdx]);
      for (let i = 1; i < group.length; i++) {
        const prev = group[i - 1];
        const curr = group[i];
        const need = prev.pos[aIdx] + prev.w / 2 + FW + GAP + curr.w / 2 + FW;
        if (curr.pos[aIdx] < need) curr.pos[aIdx] = need;
      }
    });
  }

  function _buildPaintings() {
    // Wall thickness = 0.12, half = 0.06.  Inner faces:
    //   Back walls  at ±ROOM_OUT(35):  inner face at 35-0.06 = 34.94  → use ±34.8
    //   Side walls  at ±ROOM_HALF(7.5): inner face at 7.5-0.06 = 7.44 → use ±7.3
    //   Welcome walls at ±WR(8):        inner face at 7.94            → use ±7.8

    // Rotation guide — which face is visible from inside the room:
    //   ry=0    normal +Z  visible from south  (back of NORTH room)
    //   ry=π    normal -Z  visible from north  (back of SOUTH room)
    //   ry=-π/2 normal -X  visible from east   (east wall inner face)
    //   ry=+π/2 normal +X  visible from west   (west wall inner face)
    // ─────────────────────────────────────────────────────────────────────────
    // GUÍA DE POSICIONES  pos: [X, Y, Z]
    //   X  positivo = este  │ negativo = oeste
    //   Y  altura (ojo del jugador ≈ 1.7, techo ≈ 6.2)
    //   Z  positivo = sur   │ negativo = norte
    //
    // Límites de cada sala (paredes interiores):
    //   Sala NORTE (mes1): X ∈ [-7.3, 7.3]  Z ∈ [-34.8, -25]
    //   Sala SUR   (mes3): X ∈ [-7.3, 7.3]  Z ∈ [ 25,  34.8]
    //   Sala ESTE  (mes2): Z ∈ [-7.3,  7.3]  X ∈ [ 25,  34.8]
    //   Sala OESTE (mes4): Z ∈ [-7.3,  7.3]  X ∈ [-34.8, -25]
    //   Bienvenida:        X ∈ [-7.8,  7.8]  Z ∈ [-7.8,  7.8]
    //     (corredor norte/sur: X ∈ [-1.6, 1.6]  →  NO colocar cuadros ahí)
    //     (corredor este/oeste: Z ∈ [-1.6, 1.6] →  NO colocar cuadros ahí)
    //
    // ry indica hacia dónde apunta el frente del cuadro:
    //   ry = 0          → frente al SUR  (pared norte,  fondo mes1)
    //   ry = Math.PI    → frente al NORTE (pared sur,   fondo mes3)
    //   ry = -Math.PI/2 → frente al OESTE (pared este,  fondo mes2 / laterales mes1 y mes3)
    //   ry = +Math.PI/2 → frente al ESTE  (pared oeste, fondo mes4 / laterales mes1 y mes3)
    //
    // w = ancho del cuadro   h = alto del cuadro   (en unidades del mundo)
    // ─────────────────────────────────────────────────────────────────────────
    const defs = [

      // ══════════════════════════════════════════════════════════════════════
      // SALA DE BIENVENIDA
      // ══════════════════════════════════════════════════════════════════════

      // -- Pared NORTE de bienvenida (z fijo ≈ -7.8, varía X) --
      // ⚠ Evitar X ∈ [-2.6, 2.6] — es el hueco del corredor hacia MES 1
      // Cuadro B-N-1  (izquierda)
      { pos: [-5.4, 2.9, -7.8],  ry: 0,            w: 3.0, h: 3.8 },
      // Cuadro B-N-2  (derecha, alejado del centro)
      { pos: [ 4.0, 2.7, -7.8],  ry: 0,            w: 2.2, h: 2.7 },
      // Cuadro B-N-3  (extremo derecho)
      { pos: [ 6.6, 2.4, -7.8],  ry: 0,            w: 1.2, h: 1.7 },

      // -- Pared ESTE de bienvenida (x fijo ≈ 7.8, varía Z) --
      // ⚠ Evitar Z ∈ [-2.6, 2.6] — hueco del corredor hacia MES 2
      // Cuadro B-E-1  (norte)
      { pos: [7.8, 3.0, -5.2],   ry: -Math.PI / 2, w: 2.8, h: 3.6 },
      // Cuadro B-E-2  (sur)
      { pos: [7.8, 2.5,  3.8],   ry: -Math.PI / 2, w: 1.4, h: 2.1 },
      // Cuadro B-E-3  (extremo sur)
      { pos: [7.8, 2.8,  5.8],   ry: -Math.PI / 2, w: 1.9, h: 2.4 },

      // -- Pared SUR de bienvenida (z fijo ≈ 7.8, varía X) --
      // ⚠ Evitar X ∈ [-2.6, 2.6] — hueco del corredor hacia MES 3
      // Cuadro B-S-1  (derecha)
      { pos: [ 5.0, 3.0,  7.8],  ry: Math.PI,      w: 2.6, h: 3.7 },
      // Cuadro B-S-2  (izquierda, alejado del centro)
      { pos: [-3.8, 2.5,  7.8],  ry: Math.PI,      w: 1.7, h: 2.3 },
      // Cuadro B-S-3  (extremo izquierdo)
      { pos: [-6.2, 2.2,  7.8],  ry: Math.PI,      w: 1.2, h: 1.7 },

      // -- Pared OESTE de bienvenida (x fijo ≈ -7.8, varía Z) --
      // ⚠ Evitar Z ∈ [-2.6, 2.6] — hueco del corredor hacia MES 4
      // Cuadro B-O-1  (sur)
      { pos: [-7.8, 2.8,  5.0],  ry:  Math.PI / 2, w: 2.2, h: 2.9 },
      // Cuadro B-O-2  (norte)
      { pos: [-7.8, 2.3, -3.8],  ry:  Math.PI / 2, w: 1.3, h: 1.9 },
      // Cuadro B-O-3  (extremo norte)
      { pos: [-7.8, 3.0, -5.6],  ry:  Math.PI / 2, w: 2.6, h: 3.5 },

      // ══════════════════════════════════════════════════════════════════════
      // MES 1  —  sala NORTE  (z va de -25 hacia -34.8)
      // ══════════════════════════════════════════════════════════════════════

      // -- Pared del FONDO (z fijo ≈ -34.8, varía X) --
      // Cuadro 1-F-1  (izquierda arriba)
      { pos: [0, 3.2, -34.8], ry: 0, w: 3, h: 2.5, imgUrl: 'assets/images/1mes1.jpeg',  title: 'Ganador',            message: 'Ese día te alegraste por ganarme en dominó, y solo por ver tu hermosa sonrisa fui yo el ganador 🤍' },
      // Cuadro 1-F-2  (derecha arriba)
      { pos: [ -3, 3.2, -34.8], ry: 0, w: 3, h: 4, imgUrl: 'assets/images/1mes2.jpeg',  title: 'El proceso',                   message: 'Amo los momentos previos de hacer o vivir algo juntos; no solo disfruto la actividad, la hermosa vista de un mirador o una deliciosa comida, disfruto cada momento a tu lado, ese camino antes de llegar al destino, amo vivir el proceso contigo 💕' },
      // Cuadro 1-F-3  (izquierda abajo)
      { pos: [-5.6, 3.2, -34.8], ry: 0, w: 2, h: 2, imgUrl: 'assets/images/1mes3.jpeg',  title: 'La oblea',             message: 'Me encantó buscar obleas en puestos de sancochos contigo 🫕' },
      // Cuadro 1-F-4  (derecha abajo)
      { pos: [ 1.1, 3.2, -34.8], ry: 0, w: 3.5, h: 3.5, imgUrl: 'assets/images/1mes4.jpeg',  title: 'Los ojos mas hermosos del mundo',            message: 'Me encanta lo que me hace sentir tu mirada; esos hermosos ojitos que, sin decir una palabra, me llenan de amor 👀💕' },

      // -- Pared ESTE de mes1 (x fijo ≈ 7.3, varía Z negativo) --
      // Cuadro 1-E-1  (más cerca de la entrada)
      { pos: [7.3, 2.8, -26.5],  ry: -Math.PI / 2, w: 1.6, h: 2.0, imgUrl: 'assets/images/1mes5.jpeg',  title: 'El picacho',             message: 'El primer mirador al que fuimos no solo nos regaló una vista increíble, sino también el inicio de recuerdos que siempre voy a querer volver a mirar contigo 🌃' },
      // Cuadro 1-E-2  (medio)
      { pos: [7.3, 2.8, -29.6],  ry: -Math.PI / 2, w: 1.8, h: 2.2, imgUrl: 'assets/images/1mes6.jpeg',  title: 'Copito',       message: 'Copito no era solo un detalle, era una forma de abrazarte incluso cuando no pudiera estar al lado tuyo 🫂' },
      // Cuadro 1-E-3  (más cerca del fondo)
      { pos: [7.3, 2.8, -32.8],  ry: -Math.PI / 2, w: 1.5, h: 1.9, imgUrl: 'assets/images/1mes7.jpeg',  title: 'Lo que siento por ti',         message: 'Me encanta dejar besos en tu frente, porque en cada uno va todo lo que siento por ti: cariño, cuidado y un amor que quiero que siempre te acompañe 🤍' },

      // -- Pared OESTE de mes1 (x fijo ≈ -7.3, varía Z negativo) --
      // Cuadro 1-O-1  (más cerca de la entrada)
      { pos: [-7.3, 2.8, -26.5], ry:  Math.PI / 2, w: 1.6, h: 2.0, imgUrl: 'assets/images/1mes8.jpeg',  title: 'Guacala', message: 'Hasta esas hamburguesas tan malucas se volvieron un buen recuerdo, porque lo mejor de ese momento eras tú riéndote conmigo 🍔✨' },
      // Cuadro 1-O-2  (medio)
      { pos: [-7.3, 2.8, -29.6], ry:  Math.PI / 2, w: 1.8, h: 2.2, imgUrl: 'assets/images/1mes9.jpeg',  title: 'El inicio',        message: 'El día que te pedí ser mi novia estaba lleno de nervios. No sabía si lo estaba haciendo de la mejor manera, si era el momento perfecto o si te gustaría… pero de lo que nunca dudé fue de que quería que fueras tú. Y sigo queriendo que sea así, por siempre ❤️💐' },
      // Cuadro 1-O-3  (más cerca del fondo)
      { pos: [-7.3, 2.8, -32.8], ry:  Math.PI / 2, w: 1.5, h: 1.9, imgUrl: 'assets/images/1mes10.jpeg', title: 'Todo es mas lindo a tu lado',       message: 'Ese día me encantó perderme contigo, despertar un gamincito de su "cama" jajkjha, y jugar vóley entre risas, mi familia y nuestro amor 🥰' },

      // ══════════════════════════════════════════════════════════════════════
      // MES 2  —  sala ESTE  (x va de 25 hacia 34.8)
      // ══════════════════════════════════════════════════════════════════════

      // -- Pared del FONDO (x fijo ≈ 34.8, varía Z) --
      // Cuadro 2-F-1  (norte arriba)
      { pos: [34.8, 3.3, -2.5],  ry: -Math.PI / 2, w: 2.0, h: 2.5, imgUrl: 'assets/images/2mes1.jpeg', title: 'Magia ✨',            message: 'Ese día alguien hizo trucos para nosotros, pero lo más mágico fue mirarte y saber que contigo todo se siente especial. ✨.' },
      // Cuadro 2-F-2  (sur arriba)
      { pos: [34.8, 3.1,  3.5],  ry: -Math.PI / 2, w: 1.8, h: 2.2, imgUrl: 'assets/images/2mes2.jpeg', title: 'Atarceder',       message: 'Hemos visto atardeceres hermosos, pero ninguno se compara con lo increíble que te ves tú; porque lo tuyo no solo se mira… se siente. 🌅❤️' },
      // Cuadro 2-F-3  (abajo centro)
      { pos: [34.8, 1.8,  1.0],  ry: -Math.PI / 2, w: 1.6, h: 1.9, imgUrl: 'assets/images/2mes3.jpeg', title: 'Tú ropa',   message: 'Me encanta cómo te vistes, porque en cada detalle de tu ropa se nota tu esencia; es como si llevaras tu personalidad puesta, y eso te hace aún más única 💕' },

      // -- Pared NORTE de mes2 (z fijo ≈ -7.3, varía X positivo) --
      // Cuadro 2-N-1  (cerca entrada)
      { pos: [27.0, 2.8, -7.3],  ry: 0,            w: 1.6, h: 2.0, imgUrl: 'assets/images/2mes4.jpeg', title: 'Mi sonrisa',            message: 'A tu lado, mi sonrisa no la fuerzo ni la busco… simplemente nace sola, desde lo más profundo de mi corazón 💌' },
      // Cuadro 2-N-2  (cerca fondo)
      { pos: [31.5, 2.8, -7.3],  ry: 0,            w: 1.8, h: 2.2, imgUrl: 'assets/images/2mes5.jpeg', title: 'La luna 🌙',   message: 'Cada vez que miro la luna, pienso en ti… en lo bonita que eres y en ese brillo tan especial de tus ojos que ilumina mucho más que cualquier noche. 🌙✨' },

      // -- Pared SUR de mes2 (z fijo ≈ 7.3, varía X positivo) --
      // Cuadro 2-S-1  (cerca entrada)
      { pos: [27.0, 2.8,  7.3],  ry: Math.PI,      w: 1.6, h: 2.0, imgUrl: 'assets/images/2mes6.jpeg', title: 'El cosmos', message: 'Dicen que el cosmos es infinito, pero lo que siento por ti hace que hasta lo infinito se quede corto. ✨' },
      // Cuadro 2-S-2  (cerca fondo)
      { pos: [31.5, 2.8,  7.3],  ry: Math.PI,      w: 1.8, h: 2.2, imgUrl: 'assets/images/2mes7.jpeg', title: 'La ciudad',      message: 'Las vistas a la ciudad pueden ser hermosas, pero nada se compara con mirarte a ti y sentir que ahí está todo lo que quiero. 🌆✨' },

      // ══════════════════════════════════════════════════════════════════════
      // MES 3  —  sala SUR  (z va de 25 hacia 34.8)
      // ══════════════════════════════════════════════════════════════════════

      // -- Pared del FONDO (z fijo ≈ 34.8, varía X) --
      // Cuadro 3-F-1  (izquierda)
      { pos: [-2.5, 3.3, 34.8],  ry: Math.PI,      w: 2.0, h: 2.5, imgUrl: 'assets/images/3mes1.jpeg', title: 'Tus abrazos',  message: 'Entre el profundo cielo azul, esas nubes cálidas son como tus abrazos, un refugio de paz en mi mundo  🌎❤️' },
      // Cuadro 3-F-2  (derecha)
      { pos: [ 2.5, 3.1, 34.8],  ry: Math.PI,      w: 1.8, h: 2.2, imgUrl: 'assets/images/3mes2.jpeg', title: 'Ni el cielo compite contigo', message: 'El atardecer pintó el cielo con sus mejores colores, pero aun así no logró opacar lo que tú haces sentir en mí. Porque por más bonito que sea el horizonte… nada se compara con la calma y la belleza que encuentro en ti. 🌙✨' },

      // -- Pared ESTE de mes3 (x fijo ≈ 7.3, varía Z positivo) --
      // Cuadro 3-E-1  (cerca entrada, z pequeño)
      { pos: [7.3, 2.8, 26.5],   ry: -Math.PI / 2, w: 1.6, h: 2.0, imgUrl: 'assets/images/3mes3.jpeg', title: 'Lugares magicos',           message: 'Descubrir lugares mágicos contigo se volvió uno de mis hobbies favoritos… aunque, siendo sincero, lo más especial no es el lugar, sino verte disfrutarlos. ✨' },
      // Cuadro 3-E-2  (cerca fondo, z grande)
      { pos: [7.3, 2.8, 30.5],   ry: -Math.PI / 2, w: 1.7, h: 2.1, imgUrl: 'assets/images/3mes4.jpeg', title: 'Sentirte',              message: 'Me encanta sentirte cerquita, pegada a mí. Porque en ese pequeño espacio encuentro toda la paz y el amor que necesito 💖' },

      // -- Pared OESTE de mes3 (x fijo ≈ -7.3, varía Z positivo) --
      // Cuadro 3-O-1
      { pos: [-7.3, 2.8, 28.5],  ry:  Math.PI / 2, w: 4, h: 4, imgUrl: 'assets/images/3mes5.jpeg', title: 'Mi princesa',    message: 'Nunca podré describir lo lindo que fue ese día, ver a mi princesa en un castillo, encantada con todo lo que ese lugar tenía para ofrecerle, fue demasiado mágico 💕💕' },

      // ══════════════════════════════════════════════════════════════════════
      // MES 4  —  sala OESTE  (x va de -25 hacia -34.8)
      // ══════════════════════════════════════════════════════════════════════

      // -- Pared del FONDO (x fijo ≈ -34.8, varía Z) --
      // Cuadro 4-F-1  (norte arriba)
      { pos: [-34.8, 3.3, -2.5], ry:  Math.PI / 2, w: 2.0, h: 2.5, imgUrl: 'assets/images/mes4x1.jpeg', title: 'vivirlo a tu lado',      message: 'Descubrir lugares contigo es genial; y aunque a veces no salga tan divertido como imaginábamos, vivirlo a tu lado lo convierte en un plan que nunca me quisiera perder ✨' },
      // Cuadro 4-F-2  (sur arriba)
      { pos: [-34.8, 3.3,  1.5], ry:  Math.PI / 2, w: 2.5, h: 3.2, imgUrl: 'assets/images/mes4x2.jpeg', title: 'El amor', message: 'Me encanta la forma tan linda y auténtica en que sentimos y vivimos el amor; lo nuestro no solo se dice, se demuestra en cada detalle 💖' },
      // Cuadro 4-F-3  (abajo centro)
      { pos: [-34.8, 3.3,  0.0], ry:  Math.PI / 2, w: 1.6, h: 1.9, imgUrl: 'assets/images/mes4x3.jpeg', title: 'Amo todo de ti',          message: 'Amo tus caras raras, tus pucheros y lo expresiva que eres, porque en cada gesto tuyo encuentro una forma única y hermosa de ti 💖' },

      // -- Pared NORTE de mes4 (z fijo ≈ -7.3, varía X negativo) --
      // Cuadro 4-N-1  (cerca entrada)
      { pos: [-27.0, 2.8, -7.3], ry: 0,            w: 1.6, h: 2.0, imgUrl: 'assets/images/mes4x4.jpeg', title: 'Me encantas',   message: 'Me encanta verte mientras estás distraída, simplemente siendo tú, perdida en tus pensamientos o mirando algo fijamente. Es muy loco cómo te volviste el centro de mi atención sin importar el lugar en que estemos, y eso me encanta 💕' },
      // Cuadro 4-N-2  (cerca fondo)
      { pos: [-31.5, 2.8, -7.3], ry: 0,            w: 1.8, h: 2.2, imgUrl: 'assets/images/mes4x5.jpeg', title: 'Pequeños momentos',         message: 'Aunque el ruido y la gente nos incomoden, siempre encontramos paz en nuestros pequeños momentos; esos en los que solo existimos tú y yo, y todo lo demás deja de importar 💫' },

      // -- Pared SUR de mes4 (z fijo ≈ 7.3, varía X negativo) --
      // Cuadro 4-S-1  (cerca entrada)
      { pos: [-27.0, 2.8,  7.3], ry: Math.PI,      w: 1.6, h: 2.0, imgUrl: 'assets/images/mes4x6.jpeg', title: 'Mi hogar',  message: 'Amo compartir mi familia contigo; son de lo más importante en mi vida, junto a ti. Hacerte parte de mi hogar es, sin duda, una de las cosas más bonitas que puedo darte. 💖' },
      // Cuadro 4-S-2  (cerca fondo)
      { pos: [-31.5, 2.8,  7.3], ry: Math.PI,      w: 1.8, h: 2.2, imgUrl: 'assets/images/mes4x7.jpeg', title: 'Rincon del mundo',              message: 'Es increible como cualquier rincón del mundo vale más la pena si es contigo ✨' },
    ];

    // Resolve any remaining overlaps before building
    _autoSpreadPaintings(defs);

    const imgURLs = typeof FRAMES_DATA !== 'undefined'
      ? FRAMES_DATA.map(f => f.image)
      : Array.from({ length: 8 }, (_, i) => `https://picsum.photos/seed/museum${i+1}/400/500`);

    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      metalness: 0.92,
      roughness: 0.18,
      emissive: 0x4a3500,
      emissiveIntensity: 0.45,
    });

    const loader = new THREE.TextureLoader();
    defs.forEach((d, i) => {
      const idx = i % imgURLs.length;
      const url = d.imgUrl || imgURLs[idx];
      loader.load(url, tex => {
        tex.encoding = THREE.sRGBEncoding;
        const glowKey = `fgp${i}`;

        const pm = new THREE.Mesh(
          new THREE.PlaneGeometry(d.w, d.h),
          new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, metalness: 0.06 })
        );
        pm.position.set(...d.pos);
        pm.rotation.y = d.ry;
        // Store painting-specific data for direct popup display
        const paintingData = d.imgUrl
          ? { image: d.imgUrl, title: d.title || '', message: d.message || '' }
          : { image: imgURLs[idx], title: (typeof FRAMES_DATA !== 'undefined' ? FRAMES_DATA[idx].title : ''), message: (typeof FRAMES_DATA !== 'undefined' ? FRAMES_DATA[idx].message : '') };
        pm.userData = { isPainting: true, paintingIndex: idx, frameGlowKey: glowKey, paintingData };
        scene.add(pm);
        paintings.push(pm);

        _buildFrame({ ...d, glowKey }, goldMat.clone());
        _buildPaintingSpot(d);
      });
    });
  }

  function _buildFrame(d, mat) {
    const fw = 0.13;
    const fd = 0.09;
    const g  = new THREE.Group();

    [
      [[d.w + fw*2, fw, fd], [0,  d.h/2 + fw/2, fd/2]],
      [[d.w + fw*2, fw, fd], [0, -d.h/2 - fw/2, fd/2]],
      [[fw, d.h + fw*2, fd], [-d.w/2 - fw/2, 0, fd/2]],
      [[fw, d.h + fw*2, fd], [ d.w/2 + fw/2, 0, fd/2]],
    ].forEach(([sz, of]) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(...sz), mat);
      m.position.set(...of);
      g.add(m);
    });

    const cg = new THREE.SphereGeometry(fw * 0.68, 8, 8);
    [
      [-d.w/2 - fw/2,  d.h/2 + fw/2],
      [ d.w/2 + fw/2,  d.h/2 + fw/2],
      [-d.w/2 - fw/2, -d.h/2 - fw/2],
      [ d.w/2 + fw/2, -d.h/2 - fw/2],
    ].forEach(([cx, cy]) => {
      const c = new THREE.Mesh(cg, mat.clone());
      c.position.set(cx, cy, fd/2 + 0.01);
      g.add(c);
    });

    g.position.set(...d.pos);
    g.rotation.y = d.ry;
    scene.add(g);

    const gs = new THREE.Sprite(new THREE.SpriteMaterial({
      map: _glow(0xd4af37),
      transparent: true,
      opacity: 0.14,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }));
    gs.scale.set(d.w + 1.5, d.h + 1.5, 1);
    gs.position.set(...d.pos);
    const n = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(0, d.ry, 0));
    gs.position.addScaledVector(n, 0.2);
    scene.add(gs);
    A[d.glowKey] = gs;
  }

  function _buildPaintingSpot(d) {
    const sp = new THREE.SpotLight(0xfff2cf, 2.25, 8.5, Math.PI/7, 0.35);
    const op = [...d.pos];
    op[1] += 2.5;
    const n = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(0, d.ry, 0));
    op[0] += n.x * 1.2;
    op[2] += n.z * 1.2;
    sp.position.set(...op);
    sp.target.position.set(...d.pos);
    scene.add(sp);
    scene.add(sp.target);
  }

  /* ── props ──────────────────────────────────────────────────────────────── */
  function _buildProps() {
    const markerMat = new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      roughness: 0.25,
      metalness: 0.65,
      emissive: 0x334155,
      emissiveIntensity: 0.28,
    });

    const spawnRing = _add(new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.08, 12, 44), markerMat.clone()), [0, 0.04, 4.5], [-Math.PI / 2, 0, 0]);
    A.spawnRing = spawnRing;
    _add(new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), new THREE.MeshBasicMaterial({ color: 0x93c5fd, transparent: true, opacity: 0.1, side: THREE.DoubleSide })), [0, 0.02, 4.5], [-Math.PI / 2, 0, 0]);

    const midRing = _add(new THREE.Mesh(new THREE.RingGeometry(1.1, 1.8, 48), new THREE.MeshBasicMaterial({ color: 0xf8fafc, transparent: true, opacity: 0.18, side: THREE.DoubleSide })), [0, 0.02, 0], [-Math.PI / 2, 0, 0]);
    A.midRing = midRing;

    const welcomeTotem = _add(new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.48, 1.2, 16),
      new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.26, metalness: 0.72, emissive: 0x473500, emissiveIntensity: 0.22 })
    ), [0, 0.62, 0]);
    A.welcomeTotem = welcomeTotem;

    A.centerCore = _add(new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 20, 20),
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0, emissive: 0x93c5fd, emissiveIntensity: 1.8, roughness: 0.2, metalness: 0.26 })
    ), [0, 1.45, 0]);

    A.centerLight = new THREE.PointLight(0x93c5fd, 1.4, 8.8, 1.8);
    A.centerLight.position.set(0, 1.45, 0);
    scene.add(A.centerLight);

    A.centerRing = _add(new THREE.Mesh(
      new THREE.TorusGeometry(1.45, 0.06, 12, 54),
      new THREE.MeshStandardMaterial({ color: 0x93c5fd, emissive: 0x1d4ed8, emissiveIntensity: 0.7, roughness: 0.22, metalness: 0.48 })
    ), [0, 1.45, 0], [Math.PI / 2, 0, 0]);

    const candles = [
      [-6.2, -6.2], [6.2, -6.2], [-6.2, 6.2], [6.2, 6.2],
    ];
    A.candleLights = [];
    A.candleFlames = [];
    candles.forEach(([x, z], i) => {
      _add(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.48, 12), new THREE.MeshStandardMaterial({ color: 0xe5e7eb, roughness: 0.85 })), [x, 0.24, z]);
      const flame = new THREE.Sprite(new THREE.SpriteMaterial({
        map: _glow(i % 2 ? 0xf59e0b : 0xfb7185),
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }));
      flame.scale.set(0.36, 0.5, 1);
      flame.position.set(x, 0.62, z);
      scene.add(flame);
      A.candleFlames.push(flame);

      const light = new THREE.PointLight(i % 2 ? 0xfb923c : 0xfda4af, 1.75, 5.8, 1.7);
      light.position.set(x, 0.72, z);
      scene.add(light);
      A.candleLights.push(light);
    });

    // ── Future portal trigger (NW corner of welcome room) ──────────────────
    const futurePortalMesh = new THREE.Mesh(
      new THREE.TorusGeometry(0.85, 0.09, 16, 48),
      new THREE.MeshStandardMaterial({
        color: 0xe9d5ff,
        emissive: 0x7c3aed,
        emissiveIntensity: 1.4,
        roughness: 0.15,
        metalness: 0.6,
      })
    );
    futurePortalMesh.position.set(-4.5, 1.55, -4.5);
    futurePortalMesh.userData = { onInteract: _teleportToFuture, hintText: 'El Futuro — clic para entrar ✦' };
    scene.add(futurePortalMesh);
    interactables.push(futurePortalMesh);
    A.futurePortalMesh = futurePortalMesh;

    const futurePortalGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: _glow(0x7c3aed),
      transparent: true,
      opacity: 0.38,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }));
    futurePortalGlow.scale.set(2.8, 2.8, 1);
    futurePortalGlow.position.set(-4.5, 1.55, -4.5);
    scene.add(futurePortalGlow);
    A.futurePortalGlow = futurePortalGlow;

    const futureLabel = new THREE.Sprite(new THREE.SpriteMaterial({
      map: _labelTexture('EL FUTURO', '#e9d5ff'),
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    }));
    futureLabel.scale.set(2.4, 0.66, 1);
    futureLabel.position.set(-4.5, 3.0, -4.5);
    scene.add(futureLabel);
    A.futureLabel = futureLabel;

    // ── Red button (end-of-tour surprise, SE corner of welcome room) ───────
    _add(new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.50, 0.30, 20),
      new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.55, metalness: 0.5 })
    ), [4.5, 0.15, 4.5]);

    const redBtnMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.28, 0.20, 20),
      new THREE.MeshStandardMaterial({
        color: 0xef4444,
        emissive: 0xdc2626,
        emissiveIntensity: 1.1,
        roughness: 0.28,
        metalness: 0.22,
      })
    );
    redBtnMesh.position.set(4.5, 0.40, 4.5);
    redBtnMesh.userData = { onInteract: _onRedButtonClick, hintText: 'Clic para el mensaje final ❤️' };
    scene.add(redBtnMesh);
    interactables.push(redBtnMesh);
    A.redBtnMesh = redBtnMesh;

    const redBtnGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: _glow(0xef4444),
      transparent: true,
      opacity: 0.28,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }));
    redBtnGlow.scale.set(1.4, 1.4, 1);
    redBtnGlow.position.set(4.5, 0.5, 4.5);
    scene.add(redBtnGlow);
    A.redBtnGlow = redBtnGlow;
  }

  /* ── El Futuro room ─────────────────────────────────────────────────────── */
  function _buildFutureRoom() {
    const cx = 105, cz = 0;
    const RW = 14, RD = 14;
    const FH = 6.2;

    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x02000a, roughness: 0.98, metalness: 0.02,
      emissive: 0x05011a, emissiveIntensity: 0.18, side: THREE.DoubleSide,
    });
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x04010f, roughness: 0.92, metalness: 0.08,
      emissive: 0x08022a, emissiveIntensity: 0.2,
    });
    const emptyMat = new THREE.MeshStandardMaterial({
      color: 0x03010a, roughness: 0.98, emissive: 0x1a0a3a, emissiveIntensity: 0.3,
    });
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37, metalness: 0.92, roughness: 0.18,
      emissive: 0x4a3500, emissiveIntensity: 0.35,
    });

    _add(new THREE.Mesh(new THREE.PlaneGeometry(RW*2, RD*2), floorMat), [cx, 0.001, cz], [-Math.PI/2, 0, 0]);
    _add(new THREE.Mesh(new THREE.PlaneGeometry(RW*2, RD*2), darkMat.clone()), [cx, FH, cz], [Math.PI/2, 0, 0]);
    _add(new THREE.Mesh(new THREE.PlaneGeometry(RD*2, FH), darkMat.clone()), [cx+RW, FH/2, cz], [0, -Math.PI/2, 0]);
    _add(new THREE.Mesh(new THREE.PlaneGeometry(RD*2, FH), darkMat.clone()), [cx-RW, FH/2, cz], [0,  Math.PI/2, 0]);
    _add(new THREE.Mesh(new THREE.PlaneGeometry(RW*2, FH), darkMat.clone()), [cx, FH/2, cz-RD], [0, 0, 0]);
    _add(new THREE.Mesh(new THREE.PlaneGeometry(RW*2, FH), darkMat.clone()), [cx, FH/2, cz+RD], [0, Math.PI, 0]);

    // Colliders
    COLLIDERS.push({ minX: cx+RW-0.1, maxX: cx+RW+0.1, minZ: cz-RD,   maxZ: cz+RD   });
    COLLIDERS.push({ minX: cx-RW-0.1, maxX: cx-RW+0.1, minZ: cz-RD,   maxZ: cz+RD   });
    COLLIDERS.push({ minX: cx-RW,     maxX: cx+RW,     minZ: cz-RD-0.1, maxZ: cz-RD+0.1 });
    COLLIDERS.push({ minX: cx-RW,     maxX: cx+RW,     minZ: cz+RD-0.1, maxZ: cz+RD+0.1 });

    // Lighting
    const futAmbient = new THREE.AmbientLight(0x120525, 0.5);
    scene.add(futAmbient);
    [[cx, FH-0.5, cz, 0x5b21b6, 0.7, 22],
     [cx-8, FH-0.5, cz-6, 0x3730a3, 0.45, 12],
     [cx+8, FH-0.5, cz+6, 0x4c1d95, 0.45, 12],
    ].forEach(([px,py,pz,c,i,d], idx) => {
      const pt = new THREE.PointLight(c, i, d, 1.8);
      pt.position.set(px, py, pz);
      scene.add(pt);
      A[`futL${idx}`] = pt;
    });

    // Ceiling stars
    const sN = 90;
    const sPos = new Float32Array(sN * 3);
    for (let i = 0; i < sN; i++) {
      sPos[i*3]   = cx + (Math.random()-0.5) * RW * 1.85;
      sPos[i*3+1] = FH - 0.04;
      sPos[i*3+2] = cz + (Math.random()-0.5) * RD * 1.85;
    }
    const sSg = new THREE.BufferGeometry();
    sSg.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
    const futStars = new THREE.Points(sSg, new THREE.PointsMaterial({
      color: 0xc4b5fd, size: 0.07, transparent: true, opacity: 0.5,
      sizeAttenuation: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    scene.add(futStars);
    A.futureStars = futStars;

    // Empty frames helper
    function _addEmptyFrame(pos, ry, w, h) {
      const pm = new THREE.Mesh(new THREE.PlaneGeometry(w, h), emptyMat.clone());
      pm.position.set(...pos);
      pm.rotation.y = ry;
      scene.add(pm);
      const fw = 0.11, fd = 0.07;
      const g = new THREE.Group();
      [[w+fw*2, fw, fd, 0, h/2+fw/2, fd/2],
       [w+fw*2, fw, fd, 0, -h/2-fw/2, fd/2],
       [fw, h+fw*2, fd, -w/2-fw/2, 0, fd/2],
       [fw, h+fw*2, fd,  w/2+fw/2, 0, fd/2],
      ].forEach(([sx,sy,sz, ox,oy,oz]) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz), goldMat.clone());
        m.position.set(ox, oy, oz);
        g.add(m);
      });
      g.position.set(...pos);
      g.rotation.y = ry;
      scene.add(g);
    }

    // East wall frames (facing west, ry = -PI/2)
    [-10,-5,0,5,10].forEach(z => {
      _addEmptyFrame([cx+RW-0.06, 3.4, cz+z], -Math.PI/2, 2.0, 2.8);
      _addEmptyFrame([cx+RW-0.06, 1.3, cz+z], -Math.PI/2, 1.2, 1.6);
    });
    // West wall frames (facing east, ry = +PI/2)
    [-10,-5,0,5,10].forEach(z => {
      _addEmptyFrame([cx-RW+0.06, 3.4, cz+z],  Math.PI/2, 2.0, 2.8);
      _addEmptyFrame([cx-RW+0.06, 1.3, cz+z],  Math.PI/2, 1.2, 1.6);
    });
    // North wall frames (facing south, ry = 0)
    [-9,-4,1,6,11].forEach(x => {
      _addEmptyFrame([cx+x, 3.4, cz-RD+0.06], 0, 1.8, 2.6);
      _addEmptyFrame([cx+x, 1.3, cz-RD+0.06], 0, 1.1, 1.5);
    });
    // South wall frames (facing north, ry = PI) — leave center for return portal
    [-10,-5,5,10].forEach(x => {
      _addEmptyFrame([cx+x, 3.4, cz+RD-0.06], Math.PI, 1.8, 2.6);
    });
    [-9,2,9].forEach(x => {
      _addEmptyFrame([cx+x, 1.3, cz+RD-0.06], Math.PI, 1.4, 1.8);
    });

    // Return portal on south wall
    const retPortal = new THREE.Mesh(
      new THREE.TorusGeometry(1.1, 0.09, 16, 48),
      new THREE.MeshStandardMaterial({
        color: 0xa78bfa, emissive: 0x7c3aed, emissiveIntensity: 0.9,
        roughness: 0.2, metalness: 0.58,
      })
    );
    retPortal.position.set(cx, 1.55, cz+RD-0.3);
    retPortal.userData = { onInteract: _teleportBack, hintText: 'Clic para regresar al museo ←' };
    scene.add(retPortal);
    interactables.push(retPortal);
    A.returnPortal = retPortal;

    const retGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: _glow(0x7c3aed), transparent: true, opacity: 0.3,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    retGlow.scale.set(3.4, 3.4, 1);
    retGlow.position.set(cx, 1.55, cz+RD-0.3);
    scene.add(retGlow);
    A.returnPortalGlow = retGlow;

    const retLabel = new THREE.Sprite(new THREE.SpriteMaterial({
      map: _labelTexture('← Volver', '#a78bfa'),
      transparent: true, opacity: 0.88, depthWrite: false,
    }));
    retLabel.scale.set(2.2, 0.6, 1);
    retLabel.position.set(cx, 3.4, cz+RD-0.3);
    scene.add(retLabel);
  }

  /* ── Teleport functions ─────────────────────────────────────────────────── */
  function _teleportToFuture() {
    const overlay = document.getElementById('transition-overlay');
    if (!overlay) return;
    anime({
      targets: overlay, opacity: [0, 1], duration: 600, easing: 'easeInQuad',
      complete() {
        camera.position.set(105, 1.7, 10);
        player.yaw   = Math.PI;
        player.pitch = 0;
        _inFutureRoom = true;
        _currentRoom  = 'future';
        anime({
          targets: overlay, opacity: [1, 0], duration: 700, delay: 200, easing: 'easeOutQuad',
          complete() {
            if (!_futureRoomVisited) {
              _futureRoomVisited = true;
              setTimeout(_showFuturePopup, 700);
            }
          },
        });
      },
    });
  }

  function _teleportBack() {
    const overlay = document.getElementById('transition-overlay');
    if (!overlay) return;
    anime({
      targets: overlay, opacity: [0, 1], duration: 600, easing: 'easeInQuad',
      complete() {
        camera.position.set(0, 1.7, 4.5);
        player.yaw   = 0;
        player.pitch = 0;
        _inFutureRoom = false;
        _currentRoom  = 'welcome';
        anime({ targets: overlay, opacity: [1, 0], duration: 700, delay: 200, easing: 'easeOutQuad' });
      },
    });
  }

  function _showFuturePopup() {
    const overlay = document.getElementById('room-popup-overlay');
    const titleEl = document.getElementById('room-popup-month');
    const textEl  = document.getElementById('room-popup-text');
    if (!overlay) return;
    titleEl.textContent = '✦ El Futuro ✦';
    textEl.textContent  = 'Aquí estarán todos los momentos hermosos que vamos a vivir juntos, cumpliendo sueños y metas. Cada uno de estos marcos vacíos espera una historia que aún no hemos escrito. El futuro nos pertenece, y lo voy a construir a tu lado, siempre. 💜';
    overlay.classList.add('active');
    const btn = document.getElementById('room-popup-close');
    let autoClose;
    const close = () => {
      clearTimeout(autoClose);
      overlay.classList.remove('active');
      btn.removeEventListener('click', close);
    };
    btn.addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); }, { once: true });
    autoClose = setTimeout(close, 15000);
  }

  function _onRedButtonClick() {
    if (locked) document.exitPointerLock();
    if (A.redBtnMesh) {
      anime({ targets: A.redBtnMesh.material, emissiveIntensity: [1.1, 4.0, 1.1], duration: 800, easing: 'easeInOutQuad' });
    }
    setTimeout(() => {
      if (typeof PopupController !== 'undefined') {
        PopupController.openDirect({
          image: 'assets/images/1mes9.jpeg',
          title: '♥ Para ti, siempre ♥',
          message: 'Estos 4 meses han sido el comienzo de todo lo que quiero vivir contigo. Gracias por cada risa, cada abrazo, cada mirada. Eres mi lugar favorito en el mundo. Con todo mi amor, ahora y siempre. ❤️',
        });
      }
    }, locked ? 160 : 0);
  }

  function _buildRoomThemes() {
    const defs = [
      { key: 'month1', name: 'MES 1', center: [0, -29], c1: 0x7dd3fc, c2: 0x0ea5e9, axis: 'z', panel: -34.9 },
      { key: 'month2', name: 'MES 2', center: [29, 0], c1: 0xfde68a, c2: 0xf59e0b, axis: 'x', panel: 34.9 },
      { key: 'month3', name: 'MES 3', center: [0, 29], c1: 0xf9a8d4, c2: 0xdb2777, axis: 'z', panel: 34.9 },
      { key: 'month4', name: 'MES 4', center: [-29, 0], c1: 0x86efac, c2: 0x16a34a, axis: 'x', panel: -34.9 },
    ];

    defs.forEach((t) => {
      const floor = _add(new THREE.Mesh(
        new THREE.PlaneGeometry(14.2, 10.8),
        new THREE.MeshStandardMaterial({
          color: t.c1,
          roughness: 0.84,
          metalness: 0.08,
          emissive: t.c2,
          emissiveIntensity: 0.27,
          transparent: true,
          opacity: 0.1,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        })
      ), [t.center[0], 0.003, t.center[1]], [-Math.PI / 2, 0, 0]);
      A[`${t.key}Rug`] = floor;

      const ring = _add(new THREE.Mesh(
        new THREE.RingGeometry(2.8, 4.4, 52),
        new THREE.MeshBasicMaterial({ color: t.c1, transparent: true, opacity: 0.24, side: THREE.DoubleSide })
      ), [t.center[0], 0.015, t.center[1]], [-Math.PI / 2, 0, 0]);
      A[`${t.key}Ring`] = ring;

      const aura = new THREE.Sprite(new THREE.SpriteMaterial({
        map: _glow(t.c1),
        transparent: true,
        opacity: 0.2,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }));
      aura.scale.set(10.8, 10.8, 1);
      aura.position.set(t.center[0], 2.1, t.center[1]);
      scene.add(aura);
      A[`${t.key}AuraSprite`] = aura;

      const plaque = new THREE.Sprite(new THREE.SpriteMaterial({
        map: _labelTexture(t.name, `#${t.c1.toString(16).padStart(6, '0')}`),
        transparent: true,
        opacity: 0.88,
        depthWrite: false,
      }));
      plaque.scale.set(2.4, 0.66, 1);
      const corridorEntrance = 8.3;
      if (t.axis === 'z') {
        const zSign = t.panel < 0 ? -1 : 1;
        plaque.position.set(t.center[0], 3.55, zSign * corridorEntrance);
      } else {
        const xSign = t.panel < 0 ? -1 : 1;
        plaque.position.set(xSign * corridorEntrance, 3.55, t.center[1]);
      }
      scene.add(plaque);
      A[`${t.key}Plaque`] = plaque;

      const tintMat = new THREE.MeshStandardMaterial({
        color: t.c1,
        emissive: t.c2,
        emissiveIntensity: 0.25,
        roughness: 0.86,
        metalness: 0.04,
        transparent: true,
        opacity: 0,
      });

      if (t.axis === 'z') {
        _add(new THREE.Mesh(new THREE.BoxGeometry(8.2, 3.45, 0.05), tintMat), [t.center[0], 2.25, t.panel]);
      } else {
        _add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 3.45, 8.2), tintMat), [t.panel, 2.25, t.center[1]]);
      }

      const cx = t.center[0];
      const cz = t.center[1];
      if (t.key === 'month1') {
        A.month1Signature = _add(new THREE.Mesh(
          new THREE.TorusKnotGeometry(0.74, 0.16, 96, 16, 2, 3),
          new THREE.MeshStandardMaterial({ color: 0x67e8f9, emissive: 0x0ea5e9, emissiveIntensity: 0.56, roughness: 0.24, metalness: 0.52 })
        ), [cx, 1.35, cz], [0.35, 0.2, 0.1]);
      }
      if (t.key === 'month2') {
        A.month2Signature = _add(new THREE.Mesh(
          new THREE.OctahedronGeometry(0.96, 1),
          new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0xb45309, emissiveIntensity: 0.48, roughness: 0.34, metalness: 0.42 })
        ), [cx, 1.22, cz]);
      }
      if (t.key === 'month3') {
        const petals = new THREE.Group();
        for (let p = 0; p < 6; p++) {
          const m = new THREE.Mesh(
            new THREE.SphereGeometry(0.35, 14, 14),
            new THREE.MeshStandardMaterial({ color: 0xf472b6, emissive: 0xbe185d, emissiveIntensity: 0.52, roughness: 0.3, metalness: 0.32 })
          );
          const a = (Math.PI * 2 * p) / 6;
          m.position.set(Math.cos(a) * 0.9, 1.1, Math.sin(a) * 0.9);
          petals.add(m);
        }
        const core = new THREE.Mesh(
          new THREE.SphereGeometry(0.28, 14, 14),
          new THREE.MeshStandardMaterial({ color: 0xfce7f3, emissive: 0xf9a8d4, emissiveIntensity: 0.72, roughness: 0.22, metalness: 0.2 })
        );
        core.position.set(0, 1.12, 0);
        petals.add(core);
        petals.position.set(cx, 0, cz);
        scene.add(petals);
        A.month3Signature = petals;
      }
      if (t.key === 'month4') {
        const trunk = _add(new THREE.Mesh(
          new THREE.CylinderGeometry(0.2, 0.28, 1.45, 12),
          new THREE.MeshStandardMaterial({ color: 0x355e3b, roughness: 0.88, metalness: 0.05, emissive: 0x14532d, emissiveIntensity: 0.24 })
        ), [cx, 0.72, cz]);
        const crown = _add(new THREE.Mesh(
          new THREE.SphereGeometry(0.82, 18, 18),
          new THREE.MeshStandardMaterial({ color: 0x86efac, roughness: 0.84, metalness: 0.04, emissive: 0x166534, emissiveIntensity: 0.3 })
        ), [cx, 1.85, cz]);
        A.month4Signature = { trunk, crown };
      }
    });
  }

  /* ── input ──────────────────────────────────────────────────────────────── */
  function _bindInput() {
    const cv = renderer.domElement;

    H_map.kd  = e => { keys[e.code] = true; };
    H_map.ku  = e => { keys[e.code] = false; };
    document.addEventListener('keydown', H_map.kd);
    document.addEventListener('keyup',   H_map.ku);

    // Unified mousemove: pointer-lock look OR free hover detection
    H_map.mm = e => {
      if (locked) {
        player.yaw   -= e.movementX * 0.0022;
        player.pitch -= e.movementY * 0.0022;
        player.pitch  = Math.max(-1.35, Math.min(1.35, player.pitch));
      } else {
        // Track NDC for free-mouse raycasting
        _mouseNDC.x =  (e.clientX / innerWidth)  * 2 - 1;
        _mouseNDC.y = -(e.clientY / innerHeight)  * 2 + 1;
      }
    };
    document.addEventListener('mousemove', H_map.mm);

    H_map.plc = () => {
      locked = document.pointerLockElement === cv;
      const ch = document.getElementById('museum-crosshair');
      // Crosshair visible only while locked; free cursor otherwise
      if (ch) ch.style.opacity = locked ? '1' : '0';
      cv.style.cursor = locked ? 'none' : 'crosshair';
    };
    document.addEventListener('pointerlockchange', H_map.plc);

    // Click: first try to hit a painting, then toggle pointer lock
    let _clickCooldown = false;
    H_map.click = e => {
      if (isMob) return;

      // Don't process clicks through the room-entry popup
      const roomOverlay = document.getElementById('room-popup-overlay');
      if (roomOverlay && roomOverlay.classList.contains('active')) return;

      const rect = cv.getBoundingClientRect();
      const mx   =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
      const my   = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
      _ray.setFromCamera({ x: mx, y: my }, camera);

      const hitI = _ray.intersectObjects(interactables, false);
      if (hitI.length > 0 && hitI[0].distance <= INTERACT_DISTANCE) {
        const action = hitI[0].object.userData.onInteract;
        if (action) { action(); return; }
      }

      const hits = _ray.intersectObjects(paintings, false);

      if (hits.length > 0 && hits[0].distance <= INTERACT_DISTANCE) {
        if (_clickCooldown) return;
        _clickCooldown = true;
        setTimeout(() => { _clickCooldown = false; }, 700);

        const pData = hits[0].object.userData.paintingData;
        if (locked) document.exitPointerLock();

        const open = () => {
          if (typeof PopupController !== 'undefined' && pData) {
            PopupController.openDirect(pData);
          }
        };
        locked ? setTimeout(open, 100) : open();
        return;
      }

      if (!locked) cv.requestPointerLock();
    };
    cv.addEventListener('click', H_map.click);

    // Touch
    H_map.ts = e => _touchStart(e); H_map.tm = e => _touchMove(e);
    H_map.te = e => _touchEnd(e);
    cv.addEventListener('touchstart', H_map.ts, { passive: false });
    cv.addEventListener('touchmove',  H_map.tm, { passive: false });
    cv.addEventListener('touchend',   H_map.te, { passive: false });
    cv.addEventListener('touchcancel',H_map.te, { passive: false });

    H_map.rz = () => {
      renderer.setSize(innerWidth, innerHeight);
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', H_map.rz);

    // Mobile hint
    if (isMob) {
      const tapRow = document.querySelector('.hint-tap');
      if (tapRow) tapRow.style.display = 'flex';
    }

    audioBtn = document.getElementById('museum-audio-toggle');
    if (audioBtn) {
      _setAudioButtonState(Boolean(bgm && !bgm.paused));
      H_map.at = () => {
        if (!bgm) return;
        if (bgm.paused) {
          bgm.play().then(() => _setAudioButtonState(true)).catch(() => _setAudioButtonState(false));
        } else {
          bgm.pause();
          _setAudioButtonState(false);
        }
      };
      audioBtn.addEventListener('click', H_map.at);
    }
  }

  function _touchStart(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.clientX < innerWidth / 2 && !touch.left) {
        touch.left = { id: t.identifier, sx: t.clientX, sy: t.clientY, dx: 0, dy: 0 };
        const base = document.getElementById('joystick-left-base');
        if (base) {
          base.style.left    = `${t.clientX - 45}px`;
          base.style.top     = `${t.clientY - 45}px`;
          base.style.display = 'block';
        }
      } else if (t.clientX >= innerWidth / 2 && !touch.right) {
        touch.right = { id: t.identifier, lx: t.clientX, ly: t.clientY };
      }
    }
  }

  function _touchMove(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (touch.left && t.identifier === touch.left.id) {
        const dx = (t.clientX - touch.left.sx) / 58;
        const dy = (t.clientY - touch.left.sy) / 58;
        const mg = Math.sqrt(dx*dx + dy*dy);
        touch.left.dx = mg > 1 ? dx/mg : dx;
        touch.left.dy = mg > 1 ? dy/mg : dy;
        const kn = document.getElementById('joystick-left-knob');
        if (kn) kn.style.transform = `translate(${touch.left.dx*33}px, ${touch.left.dy*33}px)`;
      }
      if (touch.right && t.identifier === touch.right.id) {
        player.yaw   -= (t.clientX - touch.right.lx) * 0.0045;
        player.pitch -= (t.clientY - touch.right.ly) * 0.0045;
        player.pitch  = Math.max(-1.35, Math.min(1.35, player.pitch));
        touch.right.lx = t.clientX; touch.right.ly = t.clientY;
      }
    }
  }

  function _touchEnd(e) {
    for (const t of e.changedTouches) {
      if (touch.left && t.identifier === touch.left.id) {
        touch.left = null;
        const b = document.getElementById('joystick-left-base');
        const k = document.getElementById('joystick-left-knob');
        if (b) b.style.display = 'none';
        if (k) k.style.transform = 'translate(0,0)';
      }
      if (touch.right && t.identifier === touch.right.id) touch.right = null;
    }
  }

  /* ── cinematic fly-in ───────────────────────────────────────────────────── */
  function _flyIn(onReady) {
    camera.position.set(0, 5.2, D / 2 + 4.8);
    player.yaw = 0;
    player.pitch = -0.28;

    anime({
      targets: camera.position,
      x: 0, y: 1.7, z: 4.5,
      duration: 2600,
      easing: 'easeOutExpo',
    });
    anime({
      targets: player, pitch: 0,
      duration: 2600,
      easing: 'easeOutExpo',
      complete: () => { if (onReady) onReady(); },
    });
  }

  /* ── player movement ────────────────────────────────────────────────────── */
  function _move(dt) {
    const fwd  = (keys['KeyW']||keys['ArrowUp'])   ?1:0;
    const back = (keys['KeyS']||keys['ArrowDown']) ?1:0;
    const lft  = (keys['KeyA']||keys['ArrowLeft']) ?1:0;
    const rgt  = (keys['KeyD']||keys['ArrowRight'])?1:0;

    const tdx = touch.left ? touch.left.dx : 0;
    const tdy = touch.left ? touch.left.dy : 0;

    const mz = (fwd-back) - tdy;
    const mx = (rgt-lft)  + tdx;

    player.moving = mz !== 0 || mx !== 0;

    // ── Horizontal movement ──────────────────────────────────────────────
    if (player.moving) {
      const cos = Math.cos(player.yaw), sin = Math.sin(player.yaw);
      // Correct FPS formula: forward = (-sin, -cos), right = (cos, -sin)
      let nx = camera.position.x + (-sin*mz + cos*mx) * player.speed * dt;
      let nz = camera.position.z + (-cos*mz - sin*mx) * player.speed * dt;

      if (_inFutureRoom) {
        nx = Math.max(91.5, Math.min(118.5, nx));
        nz = Math.max(-13.5, Math.min(13.5, nz));
      } else {
        nx = Math.max(-W/2+0.72, Math.min(W/2-0.72, nx));
        nz = Math.max(-D/2+0.72, Math.min(D/2-0.72, nz));
      }

      const solved = _resolveWallCollisions(nx, nz, 0.42);
      camera.position.x = solved.x;
      camera.position.z = solved.z;
    }

    // ── Jump + gravity ───────────────────────────────────────────────────
    if ((keys['Space']) && player.grounded) {
      player.velY      = JUMP_FORCE;
      player.grounded  = false;
    }

    if (!player.grounded) {
      player.velY      += GRAVITY * dt;
      player.baseY     += player.velY * dt;
      if (player.baseY <= 1.7) {
        player.baseY   = 1.7;
        player.velY    = 0;
        player.grounded = true;
        player.bobPhase = 0; // reset bob on landing
      }
    }

    // ── Head bob (only when walking on ground) ───────────────────────────
    if (player.moving && player.grounded) {
      player.bobPhase += dt * 9;
      camera.position.y = player.baseY + Math.sin(player.bobPhase) * 0.025;
    } else if (!player.grounded) {
      camera.position.y = player.baseY; // no bob in air
    } else {
      // Smoothly settle back to eye height when stopped
      player.baseY      = 1.7;
      camera.position.y += (1.7 - camera.position.y) * Math.min(1, dt * 10);
    }

    camera.rotation.y = player.yaw;
    camera.rotation.x = player.pitch;
  }

  /* ── raycaster ──────────────────────────────────────────────────────────── */
  const _ray = new THREE.Raycaster();
  function _raycast() {
    // When locked: cast from screen center (crosshair).
    // When free:   cast from actual mouse cursor position.
    const origin = locked ? { x: 0, y: 0 } : _mouseNDC;
    _ray.setFromCamera(origin, camera);

    const hitI = _ray.intersectObjects(interactables, false);
    if (hitI.length > 0 && hitI[0].distance <= INTERACT_DISTANCE) {
      const ch   = document.getElementById('museum-crosshair');
      const hint = document.getElementById('museum-hint');
      if (ch)   ch.className = 'museum-crosshair near-painting';
      if (hint) { hint.className = 'museum-hint visible'; hint.textContent = hitI[0].object.userData.hintText || 'Clic para interactuar'; }
      if (!locked && renderer) renderer.domElement.style.cursor = 'pointer';
      nearPainting = null;
      return;
    }

    const hits = _ray.intersectObjects(paintings);

    // Distance limit only for crosshair mode (locked); free mouse has no limit
    const near = hits.length > 0 && hits[0].distance <= INTERACT_DISTANCE;
    nearPainting = near ? hits[0].object : null;

    const ch   = document.getElementById('museum-crosshair');
    const hint = document.getElementById('museum-hint');

    if (ch) ch.className = 'museum-crosshair' + (locked && near ? ' near-painting' : '');

    if (hint) {
      hint.className   = 'museum-hint' + (near ? ' visible' : '');
      if (near) hint.textContent = isMob ? 'Toca para ver el recuerdo' : 'Clic para ver el recuerdo';
    }

    // Update canvas cursor for free-mouse hover
    if (!locked && renderer) {
      renderer.domElement.style.cursor = near ? 'pointer' : 'crosshair';
    }
  }

  /* ── render loop ────────────────────────────────────────────────────────── */
  function _renderLoop() {
    animId = requestAnimationFrame(_renderLoop);
    const dt = Math.min(clock.getDelta(), 0.05);
    const t  = clock.elapsedTime;

    _move(dt);
    _raycast();
    _updateMinimap();
    _detectRoom();

    // Candle flicker
    if (A.candleLights) {
      A.candleLights.forEach((l, i) => {
        l.intensity = 1.55 + Math.sin(t * (14 + i * 1.4)) * 0.32 + Math.sin(t * (6.4 + i)) * 0.18;
      });
    }
    if (A.candleFlames) {
      A.candleFlames.forEach((f, i) => {
        f.scale.set(0.34 + Math.sin(t * (11 + i * 1.7)) * 0.05, 0.48 + Math.sin(t * (8 + i * 1.3)) * 0.06, 1);
      });
    }

    // Moon pulse
    if (A.moonL)     A.moonL.intensity                = 1.35 + Math.sin(t*0.42)*0.2;
    if (A.moonGlow)  A.moonGlow.scale.setScalar(3.4  + Math.sin(t*0.58)*0.45);
    if (A.moon)      A.moon.material.emissiveIntensity = 1.9 + Math.sin(t*0.31)*0.28;

    // Stars twinkle
    if (A.stars) A.stars.material.opacity = 0.82 + Math.sin(t*1.9)*0.14;

    // Chandelier orbs
    for (let i = 0; i < 5; i++) {
      if (A[`orb${i}`]) A[`orb${i}`].material.emissiveIntensity = 1.7 + Math.sin(t*1.55 + i*0.82) * 0.38;
      if (A[`og${i}`])  A[`og${i}`].material.opacity            = 0.2 + Math.sin(t*2.0 + i) * 0.08;
      if (A[`cL${i}`])  A[`cL${i}`].intensity                   = 0.92 + Math.sin(t*2.25 + i*0.9) * 0.24;
    }

    for (let i = 0; i < 8; i++) {
      if (A[`pathL${i}`]) A[`pathL${i}`].intensity = 0.34 + Math.sin(t*2.7 + i*0.75) * 0.1;
    }

    if (A.month1Aura) A.month1Aura.intensity = 0.78 + Math.sin(t * 1.4) * 0.2;
    if (A.month2Aura) A.month2Aura.intensity = 0.78 + Math.sin(t * 1.35 + 0.9) * 0.2;
    if (A.month3Aura) A.month3Aura.intensity = 0.78 + Math.sin(t * 1.45 + 1.8) * 0.2;
    if (A.month4Aura) A.month4Aura.intensity = 0.78 + Math.sin(t * 1.3 + 2.5) * 0.2;

    ['month1', 'month2', 'month3', 'month4'].forEach((k, i) => {
      const ring = A[`${k}Ring`];
      const aura = A[`${k}AuraSprite`];
      if (ring) {
        ring.rotation.z += dt * (0.12 + i * 0.02);
        ring.material.opacity = 0.16 + Math.sin(t * (1.6 + i * 0.2)) * 0.06;
      }
      if (aura) {
        aura.material.opacity = 0.14 + Math.sin(t * (1.1 + i * 0.15)) * 0.06;
        aura.scale.setScalar(11.6 + Math.sin(t * (0.8 + i * 0.13)) * 0.9);
      }
    });

    if (A.centerRing) {
      A.centerRing.rotation.y += dt * 0.7;
      A.centerRing.rotation.x = Math.PI / 2 + Math.sin(t * 0.8) * 0.1;
    }
    if (A.centerCore) {
      A.centerCore.position.y = 1.2 + Math.sin(t * 1.9) * 0.12;
      A.centerCore.material.emissiveIntensity = 2.3 + Math.sin(t * 2.4) * 0.6;
    }
    if (A.centerLight) A.centerLight.intensity = 1.9 + Math.sin(t * 1.8) * 0.4;
    for (let i = 0; i < 4; i++) {
      if (A[`roomCh${i}`]) A[`roomCh${i}`].intensity = 0.5 + Math.sin(t * (1.6 + i * 0.1) + i) * 0.16;
    }

    if (A.month1Signature) A.month1Signature.rotation.y += dt * 0.65;
    if (A.month2Signature) {
      A.month2Signature.rotation.y += dt * 0.4;
      A.month2Signature.position.y = 1.18 + Math.sin(t * 1.25) * 0.07;
    }
    if (A.month3Signature) {
      A.month3Signature.rotation.y -= dt * 0.28;
      A.month3Signature.position.y = Math.sin(t * 1.5) * 0.05;
    }
    if (A.month4Signature && A.month4Signature.crown) {
      A.month4Signature.crown.position.y = 1.82 + Math.sin(t * 1.1) * 0.06;
    }

    // Frame glows (brighter near player)
    paintings.forEach(pm => {
      const gs = A[pm.userData.frameGlowKey];
      if (!gs) return;
      const d = camera.position.distanceTo(pm.position);
      gs.material.opacity = d < 6.4
        ? 0.28 + Math.sin(t*2.2+pm.userData.paintingIndex)*0.08
        : 0.09 + Math.sin(t*1.6+pm.userData.paintingIndex)*0.04;
    });

    // Future portal + red button animations
    if (A.futurePortalMesh) {
      A.futurePortalMesh.rotation.z += dt * 0.55;
      A.futurePortalMesh.rotation.x += dt * 0.22;
    }
    if (A.futurePortalGlow) {
      A.futurePortalGlow.material.opacity = 0.28 + Math.sin(t * 2.1) * 0.1;
      A.futurePortalGlow.scale.setScalar(2.6 + Math.sin(t * 1.8) * 0.3);
    }
    if (A.returnPortal)     A.returnPortal.rotation.z += dt * 0.5;
    if (A.returnPortalGlow) A.returnPortalGlow.material.opacity = 0.24 + Math.sin(t * 1.9) * 0.08;
    if (A.redBtnMesh)  A.redBtnMesh.material.emissiveIntensity  = 0.85 + Math.sin(t * 3.5) * 0.3;
    if (A.redBtnGlow)  A.redBtnGlow.material.opacity            = 0.22 + Math.sin(t * 2.8) * 0.1;
    if (A.futureStars) A.futureStars.material.opacity           = 0.38 + Math.sin(t * 1.3) * 0.12;
    for (let i = 0; i < 3; i++) {
      if (A[`futL${i}`]) A[`futL${i}`].intensity = 0.42 + Math.sin(t * (1.2 + i * 0.3)) * 0.14;
    }

    renderer.render(scene, camera);
  }

  /* ── systems helpers ────────────────────────────────────────────────────── */
  function _setupAudio() {
    bgm = document.getElementById('museum-bgm');
    if (!bgm) return;

    bgm.volume = 0.34;
    bgm.currentTime = 0;
    bgm.play().then(() => _setAudioButtonState(true)).catch(() => _setAudioButtonState(false));
  }

  function _teardownAudio() {
    if (audioBtn && H_map.at) audioBtn.removeEventListener('click', H_map.at);
    audioBtn = null;
    if (bgm) {
      bgm.pause();
      bgm.currentTime = 0;
    }
    bgm = null;
  }

  function _setAudioButtonState(on) {
    if (!audioBtn) return;
    audioBtn.classList.toggle('off', !on);
    audioBtn.textContent = on ? '♪ Musica ON' : '♪ Musica OFF';
  }

  function _updateMinimap() {
    if (_inFutureRoom) return;
    const mm = document.getElementById('minimap-player');
    if (!mm || !camera) return;
    const xPct = ((camera.position.x + W/2) / W) * 100;
    const zPct = ((camera.position.z + D/2) / D) * 100;
    mm.style.left = `${Math.max(0, Math.min(100, xPct)).toFixed(2)}%`;
    mm.style.top = `${Math.max(0, Math.min(100, zPct)).toFixed(2)}%`;
    const mapDeg = (-player.yaw * 180 / Math.PI - 90).toFixed(1);
    mm.style.transform = `translate(-50%, -50%) rotate(${mapDeg}deg)`;
  }

  function _addWallSegment(x1, z1, x2, z2, wallMat) {
    const dx = x2 - x1;
    const dz = z2 - z1;
    const len = Math.sqrt(dx*dx + dz*dz);
    const midX = (x1 + x2) * 0.5;
    const midZ = (z1 + z2) * 0.5;

    const wall = new THREE.Mesh(new THREE.BoxGeometry(len, H, 0.12), wallMat.clone());
    wall.position.set(midX, H / 2, midZ);
    wall.rotation.y = -Math.atan2(dz, dx);
    scene.add(wall);

    const isHorizontal = Math.abs(z1 - z2) < 0.001;
    const pad = 0.06;
    COLLIDERS.push({
      minX: Math.min(x1, x2) - (isHorizontal ? 0 : pad),
      maxX: Math.max(x1, x2) + (isHorizontal ? 0 : pad),
      minZ: Math.min(z1, z2) - (isHorizontal ? pad : 0),
      maxZ: Math.max(z1, z2) + (isHorizontal ? pad : 0),
    });
  }

  function _resolveWallCollisions(x, z, r) {
    let px = x;
    let pz = z;

    for (let i = 0; i < COLLIDERS.length; i++) {
      const c = COLLIDERS[i];
      const minX = c.minX - r;
      const maxX = c.maxX + r;
      const minZ = c.minZ - r;
      const maxZ = c.maxZ + r;
      if (px <= minX || px >= maxX || pz <= minZ || pz >= maxZ) continue;

      const leftPen  = px - minX;
      const rightPen = maxX - px;
      const downPen  = pz - minZ;
      const upPen    = maxZ - pz;
      const minPen   = Math.min(leftPen, rightPen, downPen, upPen);

      if (minPen === leftPen) px = minX;
      else if (minPen === rightPen) px = maxX;
      else if (minPen === downPen) pz = minZ;
      else pz = maxZ;
    }

    return { x: px, z: pz };
  }

  function _addDoorFrame(x, z, ry, width, mat) {
    const h = 3.1;
    const t = 0.1;
    const g = new THREE.Group();

    const top = new THREE.Mesh(new THREE.BoxGeometry(width + t*2, t, t), mat.clone());
    top.position.set(0, h, 0);
    g.add(top);

    const left = new THREE.Mesh(new THREE.BoxGeometry(t, h, t), mat.clone());
    left.position.set(-(width/2 + t/2), h/2, 0);
    g.add(left);

    const right = new THREE.Mesh(new THREE.BoxGeometry(t, h, t), mat.clone());
    right.position.set((width/2 + t/2), h/2, 0);
    g.add(right);

    g.position.set(x, 0, z);
    g.rotation.y = ry;
    scene.add(g);

    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: _glow(0x60a5fa),
      transparent: true,
      opacity: 0.18,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }));
    glow.scale.set(width + 1.4, h + 1.6, 1);
    glow.position.set(x, 1.5, z);
    scene.add(glow);
  }

  function _labelTexture(text, colorHex) {
    const cv = document.createElement('canvas');
    cv.width = 512;
    cv.height = 160;
    const ctx = cv.getContext('2d');

    const grad = ctx.createLinearGradient(0, 0, cv.width, 0);
    grad.addColorStop(0, 'rgba(5, 8, 24, 0.78)');
    grad.addColorStop(1, 'rgba(10, 14, 34, 0.3)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, cv.width, cv.height);

    ctx.strokeStyle = colorHex;
    ctx.lineWidth = 4;
    ctx.strokeRect(10, 10, cv.width - 20, cv.height - 20);

    ctx.font = '700 72px "Playfair Display", serif';
    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = 10;
    ctx.fillText(text, cv.width / 2, cv.height / 2);

    return new THREE.CanvasTexture(cv);
  }

  /* ── generic helpers ────────────────────────────────────────────────────── */
  function _add(mesh, pos, rotEuler) {
    if (pos)      mesh.position.set(...pos);
    if (rotEuler) mesh.rotation.set(...rotEuler);
    scene.add(mesh);
    return mesh;
  }

  function _glow(hex) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const c  = cv.getContext('2d');
    const r  = (hex>>16)&0xff, g = (hex>>8)&0xff, b = hex&0xff;
    const gd = c.createRadialGradient(64,64,0,64,64,64);
    gd.addColorStop(0,   `rgba(${r},${g},${b},1)`);
    gd.addColorStop(0.4, `rgba(${r},${g},${b},0.5)`);
    gd.addColorStop(1,   `rgba(${r},${g},${b},0)`);
    c.fillStyle = gd; c.fillRect(0,0,128,128);
    return new THREE.CanvasTexture(cv);
  }

  /* ── room entry detection ───────────────────────────────────────────────── */
  const _ROOM_MESSAGES = {
    month1: {
      title: '✦ Primer Mes ✦',
      text:  'En este primer mes comenzó una historia que nunca imaginé. Cada momento contigo ha sido un regalo, cada sonrisa tuya un tesoro que guardo en el lugar más especial de mi corazón. Gracias por dejar que esta historia comenzara.',
    },
    month2: {
      title: '✦ Segundo Mes ✦',
      text:  'El segundo mes trajo consigo más razones para amarte. Fui descubriendo pequeños detalles tuyos que hacen que todo sea más bonito. Tu presencia se convirtió en la parte favorita de mis días, en ese rincón del corazón que siempre espera verte.',
    },
    month3: {
      title: '✦ Tercer Mes ✦',
      text:  'Ya en el tercer mes, tu compañía se volvió tan natural como respirar. Contigo aprendí que el amor no necesita grandes gestos, solo los pequeños momentos que hacen que la vida tenga un sabor diferente, más dulce, más tuyo.',
    },
    month4: {
      title: '✦ Cuarto Mes ✦',
      text:  'Cuatro meses de aprender que contigo quiero hacer miles de cosas. De descubrir que mi lugar favorito en el mundo es donde sea que estés tú. Gracias por estos cuatro meses llenos de ti, de nosotros, de todo lo que está por venir.',
    },
  };

  function _detectRoom() {
    if (!camera) return;
    const x = camera.position.x;
    const z = camera.position.z;

    let room = 'welcome';
    if (_inFutureRoom) {
      room = 'future';
    } else if (Math.abs(x) < 7.5 && z < -24) room = 'month1';
    else if (x > 24 && Math.abs(z) < 7.5) room = 'month2';
    else if (Math.abs(x) < 7.5 && z > 24) room = 'month3';
    else if (x < -24 && Math.abs(z) < 7.5) room = 'month4';

    if (room !== _currentRoom) {
      _currentRoom = room;
      if (room !== 'welcome' && room !== 'future') {
        setTimeout(() => _showRoomPopup(room), 400);
      }
    }
  }

  function _showRoomPopup(room) {
    const data    = _ROOM_MESSAGES[room];
    const overlay = document.getElementById('room-popup-overlay');
    const titleEl = document.getElementById('room-popup-month');
    const textEl  = document.getElementById('room-popup-text');
    if (!overlay || !data) return;

    titleEl.textContent = data.title;
    textEl.textContent  = data.text;
    overlay.classList.add('active');

    const btn = document.getElementById('room-popup-close');
    let _autoClose;

    const close = () => {
      clearTimeout(_autoClose);
      overlay.classList.remove('active');
      btn.removeEventListener('click', close);
    };
    btn.addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); }, { once: true });
    _autoClose = setTimeout(close, 10000);
  }

  return { init, destroy };
})();
