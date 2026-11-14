import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { CATCHER, Player, READY, UMPIRE, batterKeys, pitcherKeys, sample, type Kit } from "./rig";
import { GLOW, MOUND, buildStadium, dirOf, fenceR } from "./stadium";

/*
  One at-bat, driven by scroll progress p (0–1):

    0.00–0.07  establishing shot behind the headline, then a push-in to the
               centre-field broadcast camera
    0.075–0.18 the windup, from the stretch
    0.18–0.272 the pitch (97.8 mph four-seamer)
    0.272      contact: flash, shake, the crowd goes up
    0.29–0.60  cut to the camera behind home: the ball climbs, bat flip,
               the batter starts his trot, fireworks
    0.60–0.88  cut to the left-centre bleachers: the ball comes straight at you
    0.88–1.00  the ball fills the screen and the page takes over

  Time-based effects (shake, crowd, fireworks, flashbulbs) run on the clock so
  they stay alive while the reader pauses.
*/

export const T = {
  PUSH: 0.1,
  WIND: 0.11,
  LIFT: 0.17,
  STRIDE: 0.235,
  RELEASE: 0.27,
  FOLLOW: 0.32,
  WATCH: 0.5,
  LOAD: 0.32,
  LAUNCH: 0.385,
  CONTACT: 0.41,
  FINISH: 0.45,
  FLIP: 0.9,
  ADMIRE: 0.95,
  CUT: 0.445,
  ARRIVE: 0.88,
};

export type Hud = {
  text: HTMLElement;
  hint: HTMLElement;
  bug: HTMLElement;
  score: HTMLElement;
  pitch: HTMLElement;
  exit: HTMLElement;
  dist: HTMLElement;
  flash: HTMLElement;
  fade: HTMLElement;
  live: HTMLElement;
};

const clamp = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const span = (p: number, a: number, b: number) => clamp((p - a) / (b - a));
const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const DEG = Math.PI / 180;

const HOME: Kit = { jersey: "#f4f1ea", pants: "#f1eee6", socks: "#10212f", cap: "#10212f", skin: "#c99a76", glove: "glove" };
const AWAY: Kit = { jersey: "#9aa1a9", pants: "#9aa1a9", socks: "#7d1b29", cap: "#7d1b29", skin: "#8a5a3c" };

function makeBall() {
  const R = 0.121;
  const g = new THREE.Group();
  const leather = (() => {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 256;
    const c = cv.getContext("2d")!;
    c.fillStyle = "#f6f1e4";
    c.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 9000; i++) {
      c.fillStyle = Math.random() < 0.5 ? "rgba(120,100,70,0.06)" : "rgba(255,255,255,0.08)";
      c.fillRect(Math.random() * 256, Math.random() * 256, 1.5, 1.5);
    }
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  g.add(new THREE.Mesh(new THREE.SphereGeometry(R, 64, 40), new THREE.MeshStandardMaterial({ map: leather, roughness: 0.62 })));
  const a = 0.7;
  const b = 0.3;
  const c = 2 * Math.sqrt(a * b);
  const seamAt = (t: number, out = new THREE.Vector3()) => {
    const u = t * Math.PI * 2;
    return out.set(a * Math.cos(u) + b * Math.cos(3 * u), a * Math.sin(u) - b * Math.sin(3 * u), c * Math.sin(2 * u)).multiplyScalar(R);
  };
  class Seam extends THREE.Curve<THREE.Vector3> {
    public constructor() {
      super();
    }
    getPoint(t: number, out = new THREE.Vector3()) {
      return seamAt(t, out).multiplyScalar(1.004);
    }
  }
  const red = new THREE.MeshStandardMaterial({ color: "#c42f3d", roughness: 0.7 });
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new Seam(), 240, R * 0.022, 6, true), new THREE.MeshStandardMaterial({ color: "#e9e2d2", roughness: 0.7 })));
  const N = 108;
  const st = new THREE.InstancedMesh(new THREE.BoxGeometry(R * 0.11, R * 0.026, R * 0.03), red, N * 2);
  const m = new THREE.Matrix4();
  const P = new THREE.Vector3();
  const Q = new THREE.Vector3();
  const tan = new THREE.Vector3();
  const side = new THREE.Vector3();
  const nrm = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  for (let i = 0; i < N; i++) {
    const t = i / N;
    seamAt(t, P);
    seamAt(t + 0.001, Q);
    tan.subVectors(Q, P).normalize();
    nrm.copy(P).normalize();
    side.crossVectors(tan, nrm).normalize();
    for (const s of [-1, 1]) {
      const dir = side.clone().multiplyScalar(s).addScaledVector(tan, 0.55).normalize();
      const up = nrm.clone();
      const z = new THREE.Vector3().crossVectors(dir, up).normalize();
      basis.makeBasis(dir, up, z);
      m.copy(basis).setPosition(P.clone().multiplyScalar(1.012).addScaledVector(side, s * R * 0.07));
      st.setMatrixAt(i * 2 + (s > 0 ? 1 : 0), m);
    }
  }
  g.add(st);
  return g;
}

function glowSprite(color: string, opacity: number) {
  return new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
}

export function createBallpark(canvas: HTMLCanvasElement, hud: Hud, getProgress: () => number) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true, powerPreference: "high-performance" });
  let dpr = Math.min(window.devicePixelRatio, 1.5);
  renderer.setPixelRatio(dpr);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog("#1a2333", 1100, 4200);
  const camera = new THREE.PerspectiveCamera(10, 1, 0.02, 12000);

  // Camera spots.
  const thC = -12 * DEG;
  const seatR = fenceR(thC) + 14 + 9 * 2.9 + 1.6;
  const seatD = dirOf(thC);
  const CAM_C = new THREE.Vector3(seatD.x * seatR, 11 + 9 * 1.45 + 4.6, seatD.y * seatR);
  const CAM_A = new THREE.Vector3(7, 30, -426);
  const AIM_A = new THREE.Vector3(-1.2, 3.9, 0);

  const stadium = buildStadium(renderer.capabilities.getMaxAnisotropy(), CAM_C);
  scene.add(stadium.group);

  // Lights: the bank behind third base casts the shadows.
  scene.add(new THREE.HemisphereLight("#9fb3d6", "#26351f", 0.75));
  const key = new THREE.DirectionalLight("#fff0d4", 2.6);
  key.position.set(-170, 260, 140);
  key.target.position.set(0, 0, -40);
  key.castShadow = true;
  key.shadow.mapSize.set(1536, 1536);
  Object.assign(key.shadow.camera, { left: -95, right: 95, top: 95, bottom: -95, near: 50, far: 700 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.04;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight("#dbe4ff", 1.1);
  fill.position.set(220, 210, 80);
  scene.add(fill);
  const rim = new THREE.DirectionalLight("#fff6e0", 1.0);
  rim.position.set(30, 190, -520);
  scene.add(rim);
  // A soft light riding with the camera, so the ball reads in close-up.
  const camLight = new THREE.PointLight("#fff4e0", 1.6, 30, 1.2);
  camera.add(camLight);
  scene.add(camera);

  // Players.
  const pitcher = new Player({ ...HOME, number: "21" });
  pitcher.root.position.copy(MOUND).add(new THREE.Vector3(0, 0, 0.3));
  const batter = new Player({ ...AWAY, helmet: true, bat: true, number: "7", numberColor: "#7d1b29", glove: null });
  const BAT_HOME = new THREE.Vector3(-2.9, 0, 0.7);
  batter.root.position.copy(BAT_HOME);
  batter.root.rotation.y = Math.PI;
  const catcher = new Player({ ...HOME, jersey: "#1b2a3a", pants: "#e9e6de", cap: "#1b2a3a", helmet: true, glove: "mitt" });
  catcher.root.position.set(0, 0, 3.7);
  catcher.root.rotation.y = Math.PI;
  catcher.apply(CATCHER);
  const ump = new Player({ jersey: "#16191d", pants: "#4a4f57", cap: "#16191d", skin: "#e0b48f", helmet: true });
  ump.root.position.set(0.4, 0, 6.1);
  ump.root.rotation.y = Math.PI;
  ump.apply(UMPIRE);
  // Runner leading off first.
  const runner = new Player({ ...AWAY, helmet: true, glove: null });
  runner.root.position.set(57, 0, -71);
  runner.root.rotation.y = Math.atan2(-57, 71) + Math.PI / 2;
  runner.apply({ ...READY, chest: [0.3, 0, 0] });
  const fielders = [
    [70, -80],
    [36, -138],
    [-34, -138],
    [-70, -78],
    [-165, -255],
    [0, -315],
    [165, -255],
  ].map(([x, z]) => {
    const f = new Player(HOME);
    f.root.position.set(x, 0, z);
    f.root.rotation.y = Math.atan2(-x, -z);
    f.apply(READY);
    return f;
  });
  for (const p of [pitcher, batter, catcher, ump, runner, ...fielders]) scene.add(p.root);

  const pKeys = pitcherKeys(T);
  const bKeys = batterKeys(T);

  // The ball.
  const ball = makeBall();
  scene.add(ball);
  const ballGlow = glowSprite("#ffffff", 0.9);
  scene.add(ballGlow);
  const trail = Array.from({ length: 16 }, () => {
    const s = glowSprite("#fff8ea", 0.5);
    scene.add(s);
    return s;
  });

  // Release and contact points come from the poses themselves.
  pitcher.apply(sample(pKeys, T.RELEASE));
  pitcher.root.updateMatrixWorld(true);
  const RELEASE_PT = pitcher.root.localToWorld(pitcher.handPos.R.clone());
  batter.apply(sample(bKeys, T.CONTACT));
  batter.root.updateMatrixWorld(true);
  const CONTACT_PT = batter.root.localToWorld(batter.sweet.clone());

  const pitchAt = (u: number, out: THREE.Vector3) => {
    out.lerpVectors(RELEASE_PT, CONTACT_PT, u);
    out.y += 1.1 * u * (1 - u);
    out.x += -0.5 * u * u * (1 - u);
    return out;
  };
  const H1 = 0.5;
  const EPS = 0.00022;
  const APEX = 112;
  const flightH = (p: number) => {
    if (p < T.CUT) {
      const u = span(p, T.CONTACT, T.CUT);
      return H1 * (1 - Math.pow(1 - u, 1.7));
    }
    const u = span(p, T.CUT, T.ARRIVE);
    return 1 - (1 - H1) * Math.pow(EPS / (1 - H1), u);
  };
  const flightAt = (h: number, out: THREE.Vector3) => {
    out.lerpVectors(CONTACT_PT, CAM_C, h);
    out.y += 4 * APEX * h * (1 - h);
    return out;
  };
  const ballAt = (p: number, out: THREE.Vector3) => {
    if (p < T.RELEASE) return out.copy(RELEASE_PT);
    if (p < T.CONTACT) return pitchAt(span(p, T.RELEASE, T.CONTACT), out);
    return flightAt(flightH(p), out);
  };
  const TOTAL_FT = Math.hypot(CAM_C.x - CONTACT_PT.x, CAM_C.z - CONTACT_PT.z);

  // Post: bloom on the lights, the board, fireworks.
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.6, 0.55, 0.86);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  let W = 1;
  let H = 1;
  const resize = (w: number, h: number) => {
    W = Math.max(1, w);
    H = Math.max(1, h);
    renderer.setSize(W, H, false);
    composer.setSize(W, H);
    camera.aspect = W / H;
  };

  /** Keep roughly the same horizontal coverage on tall screens. */
  const fit = (fov: number) => {
    const asp = W / H;
    if (asp >= 1.5) return fov;
    const hh = Math.atan(Math.tan((fov * DEG) / 2) * 1.5);
    return Math.min(2 * Math.atan(Math.tan(hh) / asp) / DEG, 75);
  };
  const pxPerUnit = () => H / (2 * Math.tan((camera.fov * DEG) / 2));

  // State.
  let bloomOn = true;
  let slow = 0;
  let lastDrop = 0;
  let shown = getProgress();
  let raf = 0;
  let last = performance.now();
  let clock = 0;
  let contactAt = -10;
  let wasPast = shown >= T.CONTACT;
  let cheer = wasPast ? 1 : 0;
  const look = new THREE.Vector3().copy(AIM_A);
  const lastHud: Record<string, string> = {};
  const set = (el: HTMLElement, k: string, val: string, prop: "opacity" | "text" | "class" = "opacity") => {
    const key2 = `${k}:${prop}`;
    if (lastHud[key2] === val) return;
    lastHud[key2] = val;
    if (prop === "opacity") el.style.opacity = val;
    else if (prop === "text") el.textContent = val;
    else el.className = val;
  };

  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();
  const prevBall = new THREE.Vector3();

  const frame = () => {
    raf = requestAnimationFrame(frame);
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    clock += dt;

    const target = getProgress();
    shown = Math.abs(target - shown) > 0.25 ? target : shown + (target - shown) * (1 - Math.exp(-dt * 12));
    const p = shown;

    const past = p >= T.CONTACT;
    if (past && !wasPast) {
      contactAt = clock;
      stadium.fireworks.reset();
    }
    wasPast = past;
    cheer += ((past ? 1 : 0) - cheer) * (1 - Math.exp(-dt * (past ? 5 : 3)));

    // Players.
    pitcher.apply(sample(pKeys, p));
    batter.apply(sample(bKeys, p));

    // Ball.
    const bp = ballAt(p, tmp);
    if (p < T.RELEASE) {
      pitcher.root.updateMatrixWorld(true);
      pitcher.root.localToWorld(bp.copy(pitcher.handPos.R)).add(tmp2.set(0, 0.08, 0));
    }
    ball.position.copy(bp);
    const spinAxis = tmp2.set(1, 0, 0.3).normalize();
    const spin = p < T.CONTACT ? span(p, T.RELEASE, T.CONTACT) * 60 : 60 + Math.sqrt(span(p, T.CONTACT, T.ARRIVE)) * 70 + (p > T.ARRIVE ? (p - T.ARRIVE) * 6 : 0);
    ball.quaternion.setFromAxisAngle(spinAxis, -spin);

    // Cameras.
    const shot: "A" | "C" = p < T.CUT ? "A" : "C";
    let fov = 4.4;
    if (shot === "A") {
      const push = smooth(span(p, 0.0, T.PUSH));
      camera.position.copy(CAM_A);
      camera.position.x += Math.sin(clock * 0.5) * 0.25;
      camera.position.y += Math.sin(clock * 0.7) * 0.15 + (1 - push) * 30;
      tmp2.copy(AIM_A);
      tmp2.y += (1 - push) * 26;
      if (p > T.CONTACT) tmp2.lerp(bp, 0.3 * span(p, T.CONTACT, T.CUT));
      look.copy(tmp2);
      fov = lerp(14, 4.4, push) - 0.35 * span(p, T.WIND, T.CONTACT);
    } else {
      const u = span(p, T.CUT, T.ARRIVE);
      camera.position.copy(CAM_C);
      camera.position.x += Math.sin(clock * 1.7) * 0.06 * (1 - u);
      camera.position.y += Math.sin(clock * 2.3) * 0.05 * (1 - u);
      look.copy(bp);
      fov = lerp(30, 46, smooth(u));
    }
    // Contact shake.
    const since = clock - contactAt;
    if (since < 0.6) {
      const k = Math.pow(1 - since / 0.6, 2) * (shot === "A" ? 0.45 : 0.3) * (fov / 4.4);
      camera.position.x += Math.sin(since * 71) * k * 2.6;
      camera.position.y += Math.cos(since * 53) * k * 2.2;
    }
    camera.fov = fit(fov);
    camera.updateProjectionMatrix();
    camera.lookAt(look);

    // Ball visibility: a soft glow and motion trail while it is small on screen.
    const dist = camera.position.distanceTo(bp);
    const ppu = pxPerUnit();
    const ballPx = (0.242 * ppu) / Math.max(dist, 0.01);
    const inPlay = p >= T.RELEASE - 0.002;
    const glowPx = Math.max(0, 22 - ballPx) * (inPlay ? 1 : 0.35);
    ballGlow.position.copy(bp);
    ballGlow.scale.setScalar((Math.max(glowPx, 0.01) * dist) / ppu);
    ballGlow.material.opacity = glowPx > 0 ? 0.85 : 0;
    const moving = p > T.RELEASE && p < T.ARRIVE - 0.03 && ballPx < 30;
    for (let i = 0; i < trail.length; i++) {
      const s = trail[i];
      if (!moving) {
        s.visible = false;
        continue;
      }
      s.visible = true;
      const lagP = p - (i + 1) * (p < T.CONTACT ? 0.0011 : 0.0016);
      ballAt(Math.max(lagP, T.RELEASE), prevBall);
      s.position.copy(prevBall);
      const d2 = camera.position.distanceTo(prevBall);
      const px = Math.max(ballPx, 5) * (1 - i / trail.length) * 1.1;
      s.scale.setScalar((px * d2) / ppu);
      s.material.opacity = 0.45 * (1 - i / trail.length);
    }

    // Crowd, board, lights.
    stadium.crowd.uniforms.uTime.value = clock;
    stadium.crowd.uniforms.uCheer.value = cheer;
    stadium.bulbs.uniforms.uTime.value = clock;
    stadium.bulbs.uniforms.uOn.value = cheer;
    stadium.bulbs.uniforms.uPx.value = ppu;
    stadium.board.draw(past, past && Math.floor(clock * 3) % 2 === 0);
    stadium.ribbonTex.offset.x = (clock * 0.02) % 1;
    stadium.fireworks.update(dt, past && p > T.CONTACT + 0.01, ppu);
    bloom.strength = 0.55 + cheer * 0.25;

    if (bloomOn) composer.render();
    else renderer.render(scene, camera);

    // Adaptive quality: if frames run long, drop resolution, then bloom.
    slow = slow * 0.95 + (dt > 0.024 ? 1 : 0) * 0.05;
    if (slow > 0.6 && clock - lastDrop > 2) {
      lastDrop = clock;
      slow = 0;
      if (dpr > 1) {
        dpr = Math.max(1, dpr - 0.25);
        renderer.setPixelRatio(dpr);
        composer.setPixelRatio(dpr);
        resize(W, H);
      } else if (bloomOn) bloomOn = false;
    }

    // HUD.
    const textO = 1 - smooth(span(p, 0.012, 0.055));
    set(hud.text, "text", textO.toFixed(3));
    hud.text.style.transform = `translate(-50%, ${(-(1 - textO) * 30).toFixed(1)}px)`;
    hud.text.style.visibility = textO < 0.01 ? "hidden" : "visible";
    set(hud.hint, "hint", (1 - span(p, 0.005, 0.03)).toFixed(3));
    const tv = span(p, 0.05, 0.075) * (1 - span(p, T.CUT + 0.12, T.CUT + 0.2));
    set(hud.bug, "bug", tv.toFixed(3));
    set(hud.live, "live", tv.toFixed(3));
    set(hud.score, "score", past ? "VIS 5" : "VIS 3", "text");
    set(hud.bug, "bugc", past ? "bp3-bug scored" : "bp3-bug", "class");
    set(hud.pitch, "pitch", (span(p, T.RELEASE + 0.01, T.RELEASE + 0.02) * (1 - span(p, T.CONTACT + 0.015, T.CONTACT + 0.03))).toFixed(3));
    set(hud.exit, "exit", (span(p, T.CONTACT + 0.02, T.CONTACT + 0.035) * tv).toFixed(3));
    const ft = Math.round(clamp(flightH(p) / 0.998) * TOTAL_FT);
    set(hud.dist, "dist", String(p > T.CONTACT ? ft : 0), "text");
    const fl = since < 0.35 ? Math.pow(1 - since / 0.35, 2) * 0.85 : 0;
    set(hud.flash, "flash", fl.toFixed(3));
    set(hud.fade, "fade", smooth(span(p, T.ARRIVE + 0.01, 0.975)).toFixed(3));
  };

  return {
    start() {
      if (raf) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    },
    stop() {
      cancelAnimationFrame(raf);
      raf = 0;
    },
    resize,
    dispose() {
      cancelAnimationFrame(raf);
      raf = 0;
      composer.dispose();
      renderer.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mt = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mt)) mt.forEach((x) => x.dispose());
        else mt?.dispose();
      });
    },
  };
}
