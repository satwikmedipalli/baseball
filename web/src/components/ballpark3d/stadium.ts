import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { mat } from "./rig";

/*
  The ballpark, in feet. Home plate's front edge is the origin, centre field is
  down -z, first base is +x. The fence is 330 ft down the lines and 400 ft to
  centre; a two-deck bowl wraps foul territory and bleachers sit beyond the
  outfield wall.
*/

export const MOUND = new THREE.Vector3(0, 0.83, -60.5);
export const fenceR = (th: number) => 330 + 70 * Math.cos(2 * th);
export const dirOf = (th: number) => new THREE.Vector2(Math.sin(th), -Math.cos(th));
const DEG = Math.PI / 180;

const rand = (() => {
  let s = 7;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
})();

/* ---------- Ground ---------- */

function canvas(n: number) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = n;
  return [cv, cv.getContext("2d")!] as const;
}

/** Inner edge of the seating bowl: down the third-base line, round behind home, up the first-base line. */
function bowlEdge(off = 55, step = 4) {
  const pts: THREE.Vector2[] = [];
  const nor: THREE.Vector2[] = [];
  const u3 = new THREE.Vector2(-Math.SQRT1_2, -Math.SQRT1_2);
  const n3 = new THREE.Vector2(-Math.SQRT1_2, Math.SQRT1_2);
  const u1 = new THREE.Vector2(Math.SQRT1_2, -Math.SQRT1_2);
  const n1 = new THREE.Vector2(Math.SQRT1_2, Math.SQRT1_2);
  for (let s = 335; s > 0; s -= step) {
    pts.push(u3.clone().multiplyScalar(s).addScaledVector(n3, off));
    nor.push(n3.clone());
  }
  const arcN = Math.ceil(((Math.PI / 2) * off) / step);
  for (let i = 0; i <= arcN; i++) {
    const a = (135 - (90 * i) / arcN) * DEG;
    const n = new THREE.Vector2(Math.cos(a), Math.sin(a));
    pts.push(n.clone().multiplyScalar(off));
    nor.push(n);
  }
  for (let s = step; s <= 335; s += step) {
    pts.push(u1.clone().multiplyScalar(s).addScaledVector(n1, off));
    nor.push(n1.clone());
  }
  return { pts, nor };
}

function mowing(g: CanvasRenderingContext2D, toPx: (x: number, z: number) => [number, number], ppf: number, a: string, b: string) {
  const sq = 26;
  g.save();
  const [ox, oz] = toPx(0, 0);
  g.translate(ox, oz);
  g.rotate(Math.PI / 4);
  for (let i = -40; i < 40; i++)
    for (let j = -40; j < 40; j++) {
      g.fillStyle = (i + j) & 1 ? a : b;
      g.fillRect(i * sq * ppf, j * sq * ppf, sq * ppf + 1, sq * ppf + 1);
    }
  g.restore();
}

function fieldTexture(maxAniso: number) {
  const N = 2048;
  const W = 1000;
  const CZ = -250;
  const ppf = N / W;
  const toPx = (x: number, z: number): [number, number] => [(x + W / 2) * ppf, (z - CZ + W / 2) * ppf];
  const [cv, g] = canvas(N);
  g.fillStyle = "#1c2a20";
  g.fillRect(0, 0, N, N);

  // Everything inside the bowl and the fence is grass.
  const edge = bowlEdge(55);
  g.beginPath();
  edge.pts.forEach((p, i) => (i ? g.lineTo(...toPx(p.x, p.y)) : g.moveTo(...toPx(p.x, p.y))));
  for (let th = 45; th >= -45; th -= 1) {
    const d = dirOf(th * DEG).multiplyScalar(fenceR(th * DEG));
    g.lineTo(...toPx(d.x, d.y));
  }
  g.closePath();
  g.save();
  g.clip();
  mowing(g, toPx, ppf, "#3f7a3b", "#356a33");
  // Warning track in front of the bowl and the fence.
  g.strokeStyle = "#7d5d40";
  g.lineWidth = 22 * ppf;
  g.beginPath();
  edge.pts.forEach((p, i) => (i ? g.lineTo(...toPx(p.x, p.y)) : g.moveTo(...toPx(p.x, p.y))));
  g.stroke();
  g.beginPath();
  for (let th = -46; th <= 46; th += 1) {
    const d = dirOf(th * DEG).multiplyScalar(fenceR(th * DEG));
    if (th === -46) g.moveTo(...toPx(d.x, d.y));
    else g.lineTo(...toPx(d.x, d.y));
  }
  g.lineWidth = 30 * ppf;
  g.stroke();
  g.restore();

  // Foul lines.
  g.strokeStyle = "#f4f1e8";
  g.lineWidth = 1.3;
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(...toPx(0, 0));
    g.lineTo(...toPx(s * 330 * Math.SQRT1_2, -330 * Math.SQRT1_2));
    g.stroke();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  const geo = new THREE.PlaneGeometry(W, W);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, CZ);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 }));
  m.receiveShadow = true;
  return m;
}

function infieldTexture(maxAniso: number) {
  const N = 2048;
  const W = 260;
  const CZ = -55;
  const ppf = N / W;
  const toPx = (x: number, z: number): [number, number] => [(x + W / 2) * ppf, (z - CZ + W / 2) * ppf];
  const [cv, g] = canvas(N);
  const DIRT = "#b98a5e";
  const circle = (x: number, z: number, r: number) => {
    g.beginPath();
    g.arc(...toPx(x, z), r * ppf, 0, Math.PI * 2);
  };

  // Skinned infield: a 95 ft arc around the rubber, kept inside the lines plus a strip of foul ground.
  g.save();
  g.beginPath();
  g.moveTo(...toPx(0, 14));
  g.lineTo(...toPx(-160, -146));
  g.lineTo(...toPx(-160, -200));
  g.lineTo(...toPx(160, -200));
  g.lineTo(...toPx(160, -146));
  g.closePath();
  g.clip();
  circle(0, -60.5, 95);
  g.fillStyle = DIRT;
  g.fill();
  g.restore();

  // Infield grass.
  const c = new THREE.Vector2(0, -63.64);
  const diamond = [new THREE.Vector2(0, 0), new THREE.Vector2(63.64, -63.64), new THREE.Vector2(0, -127.28), new THREE.Vector2(-63.64, -63.64)].map((p) =>
    p.sub(c).multiplyScalar(0.885).add(c),
  );
  g.save();
  g.beginPath();
  diamond.forEach((p, i) => (i ? g.lineTo(...toPx(p.x, p.y)) : g.moveTo(...toPx(p.x, p.y))));
  g.closePath();
  g.clip();
  mowing(g, toPx, ppf, "#41803d", "#376f35");
  g.restore();

  // Cut-outs: home plate circle, mound, bases.
  g.fillStyle = DIRT;
  circle(0, 0.7, 13);
  g.fill();
  circle(0, -60.5, 9.5);
  g.fill();
  for (const [x, z] of [
    [63.64, -63.64],
    [-63.64, -63.64],
    [0, -127.28],
  ]) {
    circle(x, z, 6);
    g.fill();
  }

  // Dirt grain.
  g.save();
  g.globalCompositeOperation = "source-atop";
  for (let i = 0; i < 40000; i++) {
    g.fillStyle = rand() < 0.5 ? "rgba(70,45,25,0.16)" : "rgba(255,235,205,0.12)";
    g.fillRect(rand() * N, rand() * N, 2, 2);
  }
  g.restore();

  // Chalk.
  g.strokeStyle = "#fbfaf4";
  g.lineWidth = 0.3 * ppf;
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(...toPx(s * 0.71, 0));
    g.lineTo(...toPx(s * 160, -160 + 0.71));
    g.stroke();
    // Batter's boxes.
    g.strokeRect(...toPx(s > 0 ? 1.21 : -5.21, -2.29), 4 * ppf, 6 * ppf);
  }
  // Catcher's box.
  g.beginPath();
  g.moveTo(...toPx(-1.79, 3.71));
  g.lineTo(...toPx(-1.79, 11.5));
  g.lineTo(...toPx(1.79, 11.5));
  g.lineTo(...toPx(1.79, 3.71));
  g.stroke();

  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  const geo = new THREE.PlaneGeometry(W, W);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0.04, CZ);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.98, depthWrite: false }));
  m.receiveShadow = true;
  m.renderOrder = 1;
  return m;
}

/* ---------- Tiered seating and the crowd ---------- */

type Seat = { x: number; y: number; z: number; ry: number };

/** Steps (tread + riser) offset outward from a polyline, and a seat list. */
function tiers(
  pts: THREE.Vector2[],
  nor: THREE.Vector2[],
  { off0, rows, depth, y0, rise, seatGap, fill, skip }: { off0: number; rows: number; depth: number; y0: number; rise: number; seatGap: number; fill: number; skip?: (x: number, z: number) => boolean },
) {
  const pos: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[]) => pos.push(...a, ...b, ...c, ...a, ...c, ...d);
  const seats: Seat[] = [];
  for (let k = 0; k < rows; k++) {
    const o0 = off0 + k * depth;
    const o1 = o0 + depth;
    const y = y0 + k * rise;
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i];
      const q = pts[i + 1];
      const np = nor[i];
      const nq = nor[i + 1];
      const A = [p.x + np.x * o0, y, p.y + np.y * o0];
      const B = [q.x + nq.x * o0, y, q.y + nq.y * o0];
      const C = [q.x + nq.x * o1, y, q.y + nq.y * o1];
      const D = [p.x + np.x * o1, y, p.y + np.y * o1];
      quad(A, D, C, B);
      quad([D[0], y, D[2]], [D[0], y + rise, D[2]], [C[0], y + rise, C[2]], [C[0], y, C[2]]);
    }
    // Seats, spaced by arc length along this row.
    let carry = rand() * seatGap;
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i].clone().addScaledVector(nor[i], o0 + depth * 0.55);
      const q = pts[i + 1].clone().addScaledVector(nor[i + 1], o0 + depth * 0.55);
      const len = p.distanceTo(q);
      for (let s = carry; s < len; s += seatGap) {
        const t = s / len;
        const x = p.x + (q.x - p.x) * t;
        const z = p.y + (q.y - p.y) * t;
        const n = nor[i];
        if (rand() < fill && !(skip && skip(x, z))) seats.push({ x, y, z, ry: Math.atan2(-n.x, -n.y) });
      }
      carry = ((carry - len) % seatGap + seatGap) % seatGap;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return { geo, seats };
}

function ribbon(pts: THREE.Vector2[], nor: THREE.Vector2[], off: number, y0: number, y1: number, uvLen?: number) {
  const pos: number[] = [];
  const uv: number[] = [];
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i].clone().addScaledVector(nor[i], off);
    const b = pts[i + 1].clone().addScaledVector(nor[i + 1], off);
    const l = a.distanceTo(b);
    const u0 = uvLen ? acc / uvLen : 0;
    const u1 = uvLen ? (acc + l) / uvLen : 1;
    acc += l;
    pos.push(a.x, y0, a.y, b.x, y0, b.y, b.x, y1, b.y, a.x, y0, a.y, b.x, y1, b.y, a.x, y1, a.y);
    uv.push(u0, 0, u1, 0, u1, 1, u0, 0, u1, 1, u0, 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

const SHIRTS = ["#14263a", "#f2efe8", "#b72d3e", "#1f3e66", "#8e98a3", "#d6b25a", "#e8e6df", "#2d5d48", "#14263a", "#f2efe8", "#552a3a", "#c4c8cd"];
const SKINS = ["#f1c9a5", "#d9a37b", "#b07a52", "#7b4c2f", "#4e2f1d", "#e8b98f"];

export type Crowd = { group: THREE.Group; uniforms: { uTime: { value: number }; uCheer: { value: number } }; heads: THREE.Vector3[] };

function crowd(seats: Seat[]): Crowd {
  const uniforms = { uTime: { value: 0 }, uCheer: { value: 0 } };
  const part = (g: THREE.BufferGeometry, arm: number) => {
    const n = g.attributes.position.count;
    g.setAttribute("aArm", new THREE.Float32BufferAttribute(new Array(n).fill(arm), 1));
    return g;
  };
  const torso = part(new THREE.BoxGeometry(1.35, 1.55, 0.85).translate(0, 0.78, 0), 0);
  const armL = part(new THREE.BoxGeometry(0.3, 1.25, 0.32).translate(0.82, 0.95, 0.05), 1);
  const armR = part(new THREE.BoxGeometry(0.3, 1.25, 0.32).translate(-0.82, 0.95, 0.05), -1);
  const bodyGeo = mergeGeometries([torso, armL, armR])!;
  const headGeo = new THREE.IcosahedronGeometry(0.4, 1).translate(0, 1.95, 0);
  headGeo.setAttribute("aArm", new THREE.Float32BufferAttribute(new Array(headGeo.attributes.position.count).fill(0), 1));

  const phase = new Float32Array(seats.length);
  for (let i = 0; i < seats.length; i++) phase[i] = rand();
  bodyGeo.setAttribute("aPhase", new THREE.InstancedBufferAttribute(phase, 1));
  headGeo.setAttribute("aPhase", new THREE.InstancedBufferAttribute(phase, 1));

  const patch = (m: THREE.MeshStandardMaterial) => {
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uniforms.uTime;
      sh.uniforms.uCheer = uniforms.uCheer;
      sh.vertexShader = sh.vertexShader
        .replace(
          "#include <common>",
          "#include <common>\nattribute float aPhase;\nattribute float aArm;\nuniform float uTime;\nuniform float uCheer;",
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
          float on = clamp(uCheer * 1.4 - aPhase * 0.4, 0.0, 1.0);
          float hop = max(0.0, sin(uTime * (8.0 + aPhase * 5.0) + aPhase * 40.0));
          if (aArm != 0.0) {
            float ang = aArm * on * (2.55 + 0.35 * sin(uTime * 11.0 + aPhase * 20.0));
            vec2 piv = vec2(aArm * 0.82, 1.55);
            vec2 p = transformed.xy - piv;
            float c = cos(ang), s = sin(ang);
            transformed.xy = vec2(p.x * c - p.y * s, p.x * s + p.y * c) + piv;
          }
          transformed.y += on * (0.5 + hop * (0.5 + aPhase * 0.9)) + sin(uTime * 1.3 + aPhase * 30.0) * 0.03;`,
        );
    };
    return m;
  };
  const bodyMat = patch(new THREE.MeshStandardMaterial({ roughness: 0.9 }));
  const headMat = patch(new THREE.MeshStandardMaterial({ roughness: 0.7 }));
  const bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, seats.length);
  const heads = new THREE.InstancedMesh(headGeo, headMat, seats.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const col = new THREE.Color();
  const headPos: THREE.Vector3[] = [];
  seats.forEach((s, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.ry + (rand() - 0.5) * 0.3);
    m.compose(new THREE.Vector3(s.x, s.y, s.z), q, new THREE.Vector3(1, 0.9 + rand() * 0.25, 1));
    bodies.setMatrixAt(i, m);
    heads.setMatrixAt(i, m);
    bodies.setColorAt(i, col.set(SHIRTS[(rand() * SHIRTS.length) | 0]));
    heads.setColorAt(i, col.set(SKINS[(rand() * SKINS.length) | 0]));
    headPos.push(new THREE.Vector3(s.x, s.y + 2.3, s.z));
  });
  bodies.frustumCulled = false;
  heads.frustumCulled = false;
  const group = new THREE.Group();
  group.add(bodies, heads);
  return { group, uniforms, heads: headPos };
}

/* ---------- Lights, boards, sky, fireworks ---------- */

function glowTexture() {
  const [cv, g] = canvas(128);
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, "rgba(255,250,235,1)");
  gr.addColorStop(0.18, "rgba(255,236,190,0.55)");
  gr.addColorStop(0.5, "rgba(255,220,160,0.12)");
  gr.addColorStop(1, "rgba(255,220,160,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export const GLOW = typeof document !== "undefined" ? glowTexture() : (null as unknown as THREE.Texture);

function tower(at: THREE.Vector3, look: THREE.Vector3) {
  const g = new THREE.Group();
  g.position.copy(at);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 2, at.y, 8), mat("#141c25", 0.6, 0.4));
  pole.position.y = -at.y / 2;
  g.add(pole);
  const head = new THREE.Group();
  g.add(head);
  head.lookAt(look);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(44, 22, 2), mat("#111820", 0.5, 0.3));
  head.add(panel);
  const bulbs = new THREE.InstancedMesh(new THREE.CircleGeometry(1.5, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.05, 1.8), toneMapped: false }), 40);
  let i = 0;
  const m = new THREE.Matrix4();
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 10; c++) {
      m.makeTranslation(-18 + c * 4, -7.5 + r * 5, 1.1);
      bulbs.setMatrixAt(i++, m);
    }
  head.add(bulbs);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: "#fff2d0", transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.45 }));
  glow.scale.set(120, 90, 1);
  glow.position.z = 4;
  head.add(glow);
  return g;
}

export type Board = { meshes: THREE.Mesh[]; draw: (hr: boolean, blink: boolean) => void };

function boards(): Board {
  const paint = (hr: boolean, blink: boolean) => {
    const cv = document.createElement("canvas");
    cv.width = 1024;
    cv.height = 320;
    const g = cv.getContext("2d")!;
    g.fillStyle = "#05080c";
    g.fillRect(0, 0, 1024, 320);
    g.fillStyle = "rgba(255,255,255,0.04)";
    for (let y = 0; y < 320; y += 6) for (let x = 0; x < 1024; x += 6) g.fillRect(x, y, 3, 3);
    g.textAlign = "center";
    g.textBaseline = "middle";
    if (hr) {
      g.fillStyle = blink ? "#ff5a4e" : "#ffd36b";
      g.font = "900 150px 'Arial Black', Impact, sans-serif";
      g.fillText("HOME RUN!", 512, 165);
    } else {
      g.fillStyle = "#f2c86b";
      g.font = "800 64px 'Courier New', monospace";
      g.fillText("TOP 9 · 2 OUT · 3–2", 512, 110);
      g.fillStyle = "#e8e2d4";
      g.font = "700 54px 'Courier New', monospace";
      g.fillText("VISITORS 3   HOME 4", 512, 210);
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };
  const states = [paint(false, false), paint(true, false), paint(true, true)];
  const material = new THREE.MeshBasicMaterial({ map: states[0], toneMapped: false });
  material.color.setScalar(1.35);
  const draw = (hr: boolean, blink: boolean) => {
    const t = states[hr ? (blink ? 2 : 1) : 0];
    if (material.map !== t) material.map = t;
  };
  const frame = mat("#0a0f15", 0.5, 0.3);
  const mk = (w: number, h: number, pos: THREE.Vector3, look: THREE.Vector3) => {
    const grp = new THREE.Mesh(new THREE.BoxGeometry(w + 4, h + 4, 2), frame);
    grp.position.copy(pos);
    grp.lookAt(look);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    screen.position.z = 1.05;
    grp.add(screen);
    return grp;
  };
  const lf = dirOf(-30 * DEG).multiplyScalar(fenceR(-30 * DEG) + 100);
  return {
    meshes: [mk(96, 30, new THREE.Vector3(lf.x, 78, lf.y), new THREE.Vector3(0, 40, 0)), mk(80, 25, new THREE.Vector3(0, 124, 222), new THREE.Vector3(0, 60, -300))],
    draw,
  };
}

function sky() {
  const geo = new THREE.SphereGeometry(5000, 32, 16);
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {},
    vertexShader: "varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: `varying vec3 vDir;
      void main(){
        float h = vDir.y;
        vec3 zen = vec3(0.012, 0.03, 0.07);
        vec3 mid = vec3(0.05, 0.10, 0.20);
        vec3 hor = vec3(0.36, 0.30, 0.34);
        vec3 c = mix(hor, mid, smoothstep(-0.02, 0.18, h));
        c = mix(c, zen, smoothstep(0.18, 0.7, h));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const s = new THREE.Mesh(geo, m);
  s.renderOrder = -10;
  const starPos: number[] = [];
  for (let i = 0; i < 1400; i++) {
    const u = rand() * 2 - 1;
    const a = rand() * Math.PI * 2;
    const y = 0.12 + Math.abs(u) * 0.88;
    const r = Math.sqrt(1 - y * y);
    starPos.push(Math.cos(a) * r * 4800, y * 4800, Math.sin(a) * r * 4800);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute("position", new THREE.Float32BufferAttribute(starPos, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: "#dfe8ff", size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.75, fog: false, depthWrite: false }));
  const g = new THREE.Group();
  g.add(s, stars);
  return g;
}

export class Fireworks {
  group = new THREE.Group();
  private bursts: { pts: THREE.Points; m: THREE.ShaderMaterial; t: number }[] = [];
  private next = 0;
  private spots: THREE.Vector3[];
  constructor(spots: THREE.Vector3[]) {
    this.spots = spots;
    const COLORS = ["#ffd36b", "#ff6f61", "#fdf6e3", "#7fd1ff", "#ff9ad5", "#9dff9a"];
    for (let b = 0; b < 10; b++) {
      const n = 160;
      const TR = 5;
      const vel: number[] = [];
      const lag: number[] = [];
      for (let i = 0; i < n; i++) {
        const u = rand() * 2 - 1;
        const a = rand() * Math.PI * 2;
        const r = Math.sqrt(1 - u * u);
        const sp = 70 + rand() * 18;
        for (let k = 0; k < TR; k++) {
          vel.push(Math.cos(a) * r * sp, u * sp, Math.sin(a) * r * sp);
          lag.push(k);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(new Array(n * TR * 3).fill(0), 3));
      geo.setAttribute("vel", new THREE.Float32BufferAttribute(vel, 3));
      geo.setAttribute("lag", new THREE.Float32BufferAttribute(lag, 1));
      const m = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uT: { value: -1 }, uO: { value: new THREE.Vector3() }, uC: { value: new THREE.Color(COLORS[b % COLORS.length]) }, uPx: { value: 400 } },
        vertexShader: `attribute vec3 vel; attribute float lag; uniform float uT; uniform vec3 uO; uniform float uPx; varying float vA;
          void main(){
            float t = max(0.0, uT - lag * 0.045);
            float k = 1.0 - exp(-t * 1.6);
            vec3 p = uO + vel * k / 1.6 + vec3(0.0, -14.0 * t * t, 0.0);
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            vA = (uT < 0.0 || uT > 2.6) ? 0.0 : (1.0 - smoothstep(1.2, 2.6, uT)) * (1.0 - lag * 0.17) * smoothstep(0.0, 0.05, uT);
            gl_PointSize = min(14.0, max(1.5, (1.5 - lag * 0.2) * uPx / -mv.z));
          }`,
        fragmentShader: `uniform vec3 uC; varying float vA;
          void main(){ vec2 d = gl_PointCoord - 0.5; float f = smoothstep(0.5, 0.0, length(d)); gl_FragColor = vec4(uC * 1.6 * f, f * vA); }`,
      });
      const pts = new THREE.Points(geo, m);
      pts.frustumCulled = false;
      this.group.add(pts);
      this.bursts.push({ pts, m, t: -1 });
    }
  }
  update(dt: number, on: boolean, pxPerUnit: number) {
    if (on) {
      this.next -= dt;
      if (this.next <= 0) {
        const b = this.bursts.find((x) => x.t < 0 || x.t > 2.6);
        if (b) {
          b.t = 0;
          b.m.uniforms.uO.value.copy(this.spots[(rand() * this.spots.length) | 0]).add(new THREE.Vector3((rand() - 0.5) * 120, (rand() - 0.5) * 60, (rand() - 0.5) * 120));
        }
        this.next = 0.18 + rand() * 0.35;
      }
    }
    for (const b of this.bursts) {
      if (b.t >= 0) b.t += dt;
      if (!on && b.t > 2.6) b.t = -1;
      b.m.uniforms.uT.value = b.t;
      b.m.uniforms.uPx.value = pxPerUnit;
    }
  }
  reset() {
    for (const b of this.bursts) b.t = -1;
    this.next = 0;
  }
}

function flashbulbs(heads: THREE.Vector3[]) {
  const pos: number[] = [];
  const seed: number[] = [];
  for (const h of heads) {
    if (rand() < 0.07) {
      pos.push(h.x, h.y + 0.5, h.z);
      seed.push(rand());
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("seed", new THREE.Float32BufferAttribute(seed, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uOn: { value: 0 }, uPx: { value: 400 } },
    vertexShader: `attribute float seed; uniform float uTime; uniform float uOn; uniform float uPx; varying float vA;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float slot = floor(uTime * 9.0 + seed * 97.0);
        float r = fract(sin(slot * 12.9898 + seed * 78.233) * 43758.5453);
        vA = uOn * step(0.94, r);
        gl_PointSize = max(2.0, 2.2 * uPx / -mv.z);
      }`,
    fragmentShader: `varying float vA; void main(){ vec2 d = gl_PointCoord - 0.5; float f = smoothstep(0.5, 0.0, length(d)); gl_FragColor = vec4(vec3(2.5, 2.5, 2.7) * f, f * vA); }`,
  });
  const pts = new THREE.Points(geo, m);
  pts.frustumCulled = false;
  return { pts, uniforms: m.uniforms };
}

function ribbonTexture() {
  const cv = document.createElement("canvas");
  cv.width = 2048;
  cv.height = 64;
  const g = cv.getContext("2d")!;
  g.fillStyle = "#0a1a2e";
  g.fillRect(0, 0, 2048, 64);
  g.fillStyle = "#f2c86b";
  g.font = "800 40px 'Courier New', monospace";
  g.textBaseline = "middle";
  const msg = "SHAPESHIFT ★ PITCH LAB ★ 2020–2026 ★ ";
  let x = 0;
  while (x < 2048) {
    g.fillText(msg, x, 34);
    x += g.measureText(msg).width;
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/* ---------- Assemble ---------- */

export type Stadium = {
  group: THREE.Group;
  crowd: Crowd;
  bulbs: ReturnType<typeof flashbulbs>;
  board: Board;
  fireworks: Fireworks;
  ribbonTex: THREE.Texture;
};

export function buildStadium(maxAniso: number, seatCam: THREE.Vector3): Stadium {
  const g = new THREE.Group();
  g.add(sky());

  const outside = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2), mat("#0c130f", 1));
  outside.position.y = -0.2;
  g.add(outside);
  g.add(fieldTexture(maxAniso));
  g.add(infieldTexture(maxAniso));

  // Mound, rubber, plate, bases.
  const mound = new THREE.Mesh(
    new THREE.LatheGeometry([new THREE.Vector2(9.6, 0.05), new THREE.Vector2(9.2, 0.07), new THREE.Vector2(5.5, 0.5), new THREE.Vector2(2.6, 0.83), new THREE.Vector2(0, 0.83)], 48),
    mat("#b4845a", 0.95),
  );
  mound.position.set(0, 0, -60.5);
  mound.receiveShadow = true;
  g.add(mound);
  const white = mat("#f7f5ef", 0.6);
  const rubber = new THREE.Mesh(new THREE.BoxGeometry(2, 0.06, 0.5), white);
  rubber.position.set(0, 0.86, -60.5);
  g.add(rubber);
  const plateShape = new THREE.Shape([new THREE.Vector2(-0.708, 0), new THREE.Vector2(0.708, 0), new THREE.Vector2(0.708, -0.708), new THREE.Vector2(0, -1.416), new THREE.Vector2(-0.708, -0.708)]);
  const plate = new THREE.Mesh(new THREE.ShapeGeometry(plateShape).rotateX(-Math.PI / 2), white);
  plate.position.y = 0.06;
  plate.receiveShadow = true;
  g.add(plate);
  for (const [x, z] of [
    [63.64, -63.64],
    [0, -127.28],
    [-63.64, -63.64],
  ]) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.25, 1.25), white);
    base.position.set(x, 0.12, z);
    base.rotation.y = Math.PI / 4;
    base.castShadow = true;
    g.add(base);
  }

  // Outfield wall, yellow line, distance markers, foul poles.
  const ths: THREE.Vector2[] = [];
  const thn: THREE.Vector2[] = [];
  for (let th = -45; th <= 45; th += 0.5) {
    const d = dirOf(th * DEG);
    ths.push(d.clone().multiplyScalar(fenceR(th * DEG)));
    thn.push(d);
  }
  g.add(new THREE.Mesh(ribbon(ths, thn, 0, 0, 9.6), mat("#143526", 0.85)));
  g.add(new THREE.Mesh(ribbon(ths, thn, 0.05, 9.6, 10.2), new THREE.MeshBasicMaterial({ color: "#e9c441" })));
  for (const th of [-45, -22, 0, 22, 45]) {
    const cv = document.createElement("canvas");
    cv.width = 384;
    cv.height = 128;
    const c2 = cv.getContext("2d")!;
    c2.fillStyle = "#f4f1e8";
    c2.font = "900 92px 'Arial Black', Impact, sans-serif";
    c2.textAlign = "center";
    c2.textBaseline = "middle";
    c2.fillText(String(Math.round(fenceR(th * DEG) / 5) * 5), 192, 68);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(13.5, 4.5), new THREE.MeshBasicMaterial({ map: t, transparent: true }));
    const d = dirOf(th * DEG);
    const p = d.clone().multiplyScalar(fenceR(th * DEG) - 0.3);
    sign.position.set(p.x, 5.5, p.y);
    sign.lookAt(0, 5.5, 0);
    g.add(sign);
  }
  for (const s of [-1, 1]) {
    const d = dirOf(s * 45 * DEG).multiplyScalar(330);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 80, 8), new THREE.MeshBasicMaterial({ color: "#f2d24a" }));
    pole.position.set(d.x, 40, d.y);
    g.add(pole);
  }

  // The bowl: lower deck, suite level with a ribbon board, upper deck, roof.
  const edge = bowlEdge(55, 4);
  const concrete = mat("#2a323c", 0.95);
  const seats: Seat[] = [];
  const lower = tiers(edge.pts, edge.nor, { off0: 2, rows: 26, depth: 2.9, y0: 3.5, rise: 1.3, seatGap: 2.3, fill: 0.9 });
  g.add(new THREE.Mesh(lower.geo, concrete));
  seats.push(...lower.seats);
  g.add(new THREE.Mesh(ribbon(edge.pts, edge.nor, 0, 0, 3.5), mat("#122236", 0.7)));
  const lowerBack = 2 + 26 * 2.9;
  const suiteY0 = 3.5 + 26 * 1.3;
  g.add(new THREE.Mesh(ribbon(edge.pts, edge.nor, lowerBack, suiteY0, suiteY0 + 16), mat("#0e151d", 0.6)));
  const ribbonTex = ribbonTexture();
  const rib = new THREE.Mesh(
    ribbon(edge.pts, edge.nor, lowerBack - 0.3, suiteY0 + 1, suiteY0 + 5, 120),
    new THREE.MeshBasicMaterial({ map: ribbonTex, toneMapped: false, color: new THREE.Color(1.3, 1.3, 1.3) }),
  );
  g.add(rib);
  g.add(
    new THREE.Mesh(
      ribbon(edge.pts, edge.nor, lowerBack - 0.2, suiteY0 + 8, suiteY0 + 13),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.75, 0.5), toneMapped: false, transparent: true, opacity: 0.55 }),
    ),
  );
  const upperOff = lowerBack + 14;
  const upperY = suiteY0 + 18;
  const upper = tiers(edge.pts, edge.nor, { off0: upperOff, rows: 20, depth: 2.9, y0: upperY, rise: 1.75, seatGap: 2.3, fill: 0.86 });
  g.add(new THREE.Mesh(upper.geo, concrete));
  seats.push(...upper.seats);
  const upperBack = upperOff + 20 * 2.9;
  const topY = upperY + 20 * 1.75;
  g.add(new THREE.Mesh(ribbon(edge.pts, edge.nor, upperBack, upperY, topY + 22), mat("#121a23", 0.7)));
  const roofGeo = (() => {
    const pos: number[] = [];
    for (let i = 0; i < edge.pts.length - 1; i++) {
      const [p, q, np, nq] = [edge.pts[i], edge.pts[i + 1], edge.nor[i], edge.nor[i + 1]];
      const a = [p.x + np.x * (upperOff + 10), topY + 22, p.y + np.y * (upperOff + 10)];
      const b = [q.x + nq.x * (upperOff + 10), topY + 22, q.y + nq.y * (upperOff + 10)];
      const c = [q.x + nq.x * upperBack, topY + 22, q.y + nq.y * upperBack];
      const d = [p.x + np.x * upperBack, topY + 22, p.y + np.y * upperBack];
      pos.push(...a, ...b, ...c, ...a, ...c, ...d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    return geo;
  })();
  const roof = new THREE.Mesh(roofGeo, new THREE.MeshStandardMaterial({ color: "#151d27", side: THREE.DoubleSide, roughness: 0.8 }));
  g.add(roof);
  g.add(
    new THREE.Mesh(
      ribbon(edge.pts, edge.nor, upperOff + 10, topY + 20.5, topY + 21.6),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.2, 1.8), toneMapped: false }),
    ),
  );

  // Outfield bleachers, with the batter's eye in dead centre.
  const bl: THREE.Vector2[] = [];
  const bn: THREE.Vector2[] = [];
  for (let th = -42; th <= 42; th += 1) {
    const d = dirOf(th * DEG);
    bl.push(d.clone().multiplyScalar(fenceR(th * DEG) + 14));
    bn.push(d);
  }
  const eye = (x: number, z: number) => Math.abs(Math.atan2(x, -z)) < 7 * DEG;
  const nearCam = (x: number, z: number) => (x - seatCam.x) ** 2 + (z - seatCam.z) ** 2 < 3.5 * 3.5;
  const bleach = tiers(bl, bn, { off0: 0, rows: 24, depth: 2.9, y0: 11, rise: 1.45, seatGap: 2.3, fill: 0.88, skip: (x, z) => eye(x, z) || nearCam(x, z) });
  g.add(new THREE.Mesh(bleach.geo, concrete));
  seats.push(...bleach.seats);
  g.add(new THREE.Mesh(ribbon(bl, bn, -14, 0, 11), mat("#0f1a14", 0.9)));
  g.add(new THREE.Mesh(ribbon(bl, bn, 24 * 2.9, 11, 11 + 24 * 1.45 + 10), mat("#121a23", 0.8)));
  {
    const eyeG = new THREE.Mesh(new THREE.BoxGeometry(100, 46, 2), mat("#0b1611", 0.95));
    const d = dirOf(0).multiplyScalar(fenceR(0) + 40);
    eyeG.position.set(d.x, 23, d.y);
    g.add(eyeG);
  }

  const c = crowd(seats);
  g.add(c.group);
  const bulbs = flashbulbs(c.heads);
  g.add(bulbs.pts);

  // Light towers.
  const field = new THREE.Vector3(0, 0, -150);
  const tAt = (s: number, side: number, h: number) => {
    const u = new THREE.Vector2(side * Math.SQRT1_2, -Math.SQRT1_2);
    const n = new THREE.Vector2(side * Math.SQRT1_2, Math.SQRT1_2);
    const p = u.multiplyScalar(s).addScaledVector(n, upperBack + 70);
    return new THREE.Vector3(p.x, h, p.y);
  };
  const towers = [tAt(260, -1, 190), tAt(90, -1, 200), tAt(90, 1, 200), tAt(260, 1, 190)];
  for (const th of [-34, 34]) {
    const d = dirOf(th * DEG).multiplyScalar(fenceR(th * DEG) + 120);
    towers.push(new THREE.Vector3(d.x, 170, d.y));
  }
  for (const t of towers) g.add(tower(t, field));

  const board = boards();
  g.add(...board.meshes);

  const spots = [
    ...[-38, -18, 0, 18, 38].map((th) => {
      const d = dirOf(th * DEG).multiplyScalar(fenceR(th * DEG) + 160);
      return new THREE.Vector3(d.x, 300, d.y);
    }),
    new THREE.Vector3(-180, 320, 260),
    new THREE.Vector3(0, 340, 320),
    new THREE.Vector3(180, 320, 260),
  ];
  const fireworks = new Fireworks(spots);
  g.add(fireworks.group);

  return { group: g, crowd: c, bulbs, board, fireworks, ribbonTex };
}
