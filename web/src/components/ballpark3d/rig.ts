import * as THREE from "three";

/*
  Low-poly ballplayers. Each body is posed from a handful of numbers: pelvis
  height and rotation, chest rotation, and where the hands and feet should be.
  Arms and legs are solved with two-bone IK, so a pose reads like a coach's
  description ("glove out toward the plate, throwing hand high behind the
  head") instead of a pile of joint angles.

  Units are feet. Every position in a pose is in the player's own frame:
  +z is the way he is working (the pitcher toward home, the batter toward the
  pitcher), +y is up, and his chest faces -x when he stands side-on.
*/

export type V3 = [number, number, number];

export type Pose = {
  root?: V3; // the whole body shifted inside its frame (the pitcher's stride)
  pelvisY: number;
  pelvis: V3; // euler x, y, z
  chest: V3;
  handL: V3;
  handR: V3;
  footL: V3;
  footR: V3;
  poleL?: V3; // which way the left elbow points
  poleR?: V3;
  kneeL?: V3;
  kneeR?: V3;
  grip?: V3; // bottom hand on the bat
  bat?: V3; // bat direction, knob to barrel
};

export type Kit = {
  jersey: string;
  sleeve?: string;
  pants: string;
  socks?: string;
  cap: string;
  skin: string;
  helmet?: boolean;
  number?: string;
  numberColor?: string;
  glove?: "glove" | "mitt" | null;
  bat?: boolean;
  scale?: number;
};

const UP = new THREE.Vector3(0, 1, 0);
const a = new THREE.Vector3();
const b = new THREE.Vector3();
const c = new THREE.Vector3();
const d = new THREE.Vector3();
const n = new THREE.Vector3();
const mChest = new THREE.Matrix4();

const UPPER_ARM = 1.05;
const FOREARM = 1.0;
const THIGH = 1.55;
const SHIN = 1.5;

function solve(root: THREE.Vector3, target: THREE.Vector3, l1: number, l2: number, pole: THREE.Vector3, mid: THREE.Vector3, end: THREE.Vector3) {
  d.subVectors(target, root);
  let len = d.length();
  if (len < 1e-5) d.set(0, -1, 0);
  d.normalize();
  len = Math.min(Math.max(len, Math.abs(l1 - l2) + 1e-3), l1 + l2 - 1e-3);
  const x = (l1 * l1 - l2 * l2 + len * len) / (2 * len);
  const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  n.copy(pole).addScaledVector(d, -pole.dot(d));
  if (n.lengthSq() < 1e-8) n.set(0, 0, 1).addScaledVector(d, -d.z);
  n.normalize();
  mid.copy(root).addScaledVector(d, x).addScaledVector(n, h);
  end.copy(root).addScaledVector(d, len);
}

function place(mesh: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3) {
  mesh.position.addVectors(from, to).multiplyScalar(0.5);
  c.subVectors(to, from).normalize();
  mesh.quaternion.setFromUnitVectors(UP, c);
}

const mats = new Map<string, THREE.MeshStandardMaterial>();
export function mat(color: string, rough = 0.75, metal = 0) {
  const k = `${color}|${rough}|${metal}`;
  let m = mats.get(k);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
    mats.set(k, m);
  }
  return m;
}

function numberTexture(text: string, color: string) {
  const cv = document.createElement("canvas");
  cv.width = 256;
  cv.height = 256;
  const g = cv.getContext("2d")!;
  g.fillStyle = color;
  g.font = "900 170px 'Arial Black', Impact, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineWidth = 10;
  g.strokeStyle = "#b72d3e";
  g.strokeText(text, 128, 140);
  g.fillText(text, 128, 140);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export class Player {
  root = new THREE.Group();
  pelvis = new THREE.Group();
  chest = new THREE.Group();
  head = new THREE.Group();
  bat: THREE.Object3D | null = null;
  ball: THREE.Object3D | null = null;
  /** Bat held in the hands; false once it is flipped away. */
  holdingBat = true;
  readonly handPos = { L: new THREE.Vector3(), R: new THREE.Vector3() };
  readonly sweet = new THREE.Vector3();
  private seg: Record<string, THREE.Mesh> = {};
  private ends: Record<string, THREE.Mesh> = {};
  private feet: THREE.Mesh[] = [];

  constructor(kit: Kit) {
    const s = kit.scale ?? 1;
    this.root.scale.setScalar(s);
    const jersey = mat(kit.jersey, 0.8);
    const sleeve = mat(kit.sleeve ?? kit.jersey, 0.8);
    const pants = mat(kit.pants, 0.8);
    const skin = mat(kit.skin, 0.6);
    const shoe = mat("#111418", 0.5);
    const cap = mat(kit.cap, kit.helmet ? 0.25 : 0.7, kit.helmet ? 0.2 : 0);

    this.root.add(this.pelvis);
    this.pelvis.add(this.chest);
    this.chest.position.set(0, 0.2, 0);

    const hips = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 10), pants);
    hips.scale.set(1.05, 0.7, 0.72);
    this.pelvis.add(hips);
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.13, 16), mat("#16191d", 0.5));
    belt.scale.set(1, 1, 0.72);
    belt.position.y = 0.28;
    this.pelvis.add(belt);

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 0.95, 6, 14), jersey);
    torso.scale.set(1.0, 1.0, 0.62);
    torso.position.y = 0.88;
    this.chest.add(torso);
    if (kit.number) {
      const plate = new THREE.Mesh(
        new THREE.PlaneGeometry(0.72, 0.72),
        new THREE.MeshStandardMaterial({ map: numberTexture(kit.number, kit.numberColor ?? "#10212f"), transparent: true, roughness: 0.8 }),
      );
      plate.position.set(0, 0.95, -0.345);
      plate.rotation.y = Math.PI;
      this.chest.add(plate);
    }
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.35, 10), skin);
    neck.position.y = 1.78;
    this.chest.add(neck);
    this.head.position.set(0, 2.08, 0);
    this.chest.add(this.head);
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 12), skin);
    face.scale.set(0.92, 1.05, 1);
    this.head.add(face);
    const crown = new THREE.Mesh(new THREE.SphereGeometry(kit.helmet ? 0.4 : 0.37, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), cap);
    crown.position.y = 0.04;
    this.head.add(crown);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 16, 1, false, -Math.PI / 2, Math.PI), cap);
    brim.scale.set(1, 1, 1.15);
    brim.position.set(0, 0.06, 0.22);
    this.head.add(brim);
    if (kit.helmet) {
      const flap = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), cap);
      flap.scale.set(0.4, 1, 1);
      flap.position.set(0.32, -0.08, -0.02);
      this.head.add(flap);
    }

    const limb = (key: string, r: number, len: number, m: THREE.Material) => {
      const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(r, len - r, 4, 10), m);
      mesh.castShadow = true;
      this.root.add(mesh);
      this.seg[key] = mesh;
    };
    limb("uaL", 0.17, UPPER_ARM, sleeve);
    limb("uaR", 0.17, UPPER_ARM, sleeve);
    limb("faL", 0.14, FOREARM, skin);
    limb("faR", 0.14, FOREARM, skin);
    limb("thL", 0.25, THIGH, pants);
    limb("thR", 0.25, THIGH, pants);
    const sock = mat(kit.socks ?? kit.pants, 0.8);
    limb("shL", 0.19, SHIN, sock);
    limb("shR", 0.19, SHIN, sock);

    const hand = (key: "L" | "R") => {
      const glove = key === "L" && kit.glove;
      const r = glove ? (kit.glove === "mitt" ? 0.36 : 0.3) : 0.12;
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), glove ? mat("#7a4a22", 0.55) : skin);
      if (glove) m.scale.set(0.75, 1, 1);
      m.castShadow = true;
      this.root.add(m);
      this.ends[key] = m;
    };
    hand("L");
    hand("R");
    for (let i = 0; i < 2; i++) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.24, 0.95), shoe);
      f.castShadow = true;
      this.root.add(f);
      this.feet.push(f);
    }

    if (kit.bat) {
      const prof = [
        [0.0, 0.0],
        [0.07, 0.0],
        [0.075, 0.05],
        [0.04, 0.09],
        [0.04, 0.9],
        [0.065, 1.5],
        [0.11, 2.15],
        [0.115, 2.7],
        [0.09, 2.8],
        [0.0, 2.81],
      ].map(([r, y]) => new THREE.Vector2(r, y));
      const bat = new THREE.Mesh(new THREE.LatheGeometry(prof, 14), mat("#c48a52", 0.35, 0.05));
      bat.castShadow = true;
      this.root.add(bat);
      this.bat = bat;
    }

    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
  }

  apply(p: Pose) {
    const off = p.root ?? [0, 0, 0];
    this.pelvis.position.set(off[0], p.pelvisY + off[1], off[2]);
    this.pelvis.rotation.set(p.pelvis[0], p.pelvis[1], p.pelvis[2], "YXZ");
    this.chest.rotation.set(p.chest[0], p.chest[1], p.chest[2], "YXZ");
    this.pelvis.updateMatrix();
    this.chest.updateMatrix();
    mChest.multiplyMatrices(this.pelvis.matrix, this.chest.matrix);

    let hL = p.handL;
    let hR = p.handR;
    if (this.bat && this.holdingBat && p.grip && p.bat) {
      a.set(...p.bat).normalize();
      hL = p.grip;
      hR = [p.grip[0] + a.x * 0.3, p.grip[1] + a.y * 0.3, p.grip[2] + a.z * 0.3];
      this.bat.position.set(p.grip[0] - a.x * 0.18, p.grip[1] - a.y * 0.18, p.grip[2] - a.z * 0.18);
      this.bat.quaternion.setFromUnitVectors(UP, a);
      this.sweet.set(p.grip[0] + a.x * 2.2, p.grip[1] + a.y * 2.2, p.grip[2] + a.z * 2.2);
    }

    for (const side of ["L", "R"] as const) {
      const sx = side === "L" ? 1 : -1;
      // Arm.
      const sh = new THREE.Vector3(0.62 * sx, 1.5, 0).applyMatrix4(mChest);
      const pole = new THREE.Vector3();
      const po = side === "L" ? p.poleL : p.poleR;
      if (po) pole.set(...po);
      else pole.set(sx, -1, -0.7).transformDirection(mChest);
      const target = new THREE.Vector3(...(side === "L" ? hL : hR));
      const el = new THREE.Vector3();
      const wr = new THREE.Vector3();
      solve(sh, target, UPPER_ARM, FOREARM, pole, el, wr);
      place(this.seg[`ua${side}`], sh, el);
      place(this.seg[`fa${side}`], el, wr);
      this.ends[side].position.copy(wr);
      this.handPos[side].copy(wr);
      // Leg.
      const hip = new THREE.Vector3(0.3 * sx, -0.12, 0).applyMatrix4(this.pelvis.matrix);
      const kp = new THREE.Vector3();
      const ko = side === "L" ? p.kneeL : p.kneeR;
      if (ko) kp.set(...ko);
      else kp.set(0.2 * sx, 0, 1).transformDirection(this.pelvis.matrix);
      const ft = new THREE.Vector3(...(side === "L" ? p.footL : p.footR));
      const kn = new THREE.Vector3();
      const an = new THREE.Vector3();
      solve(hip, ft, THIGH, SHIN, kp, kn, an);
      place(this.seg[`th${side}`], hip, kn);
      place(this.seg[`sh${side}`], kn, an);
      const foot = this.feet[side === "L" ? 0 : 1];
      foot.position.copy(an);
      foot.position.y = Math.max(an.y - 0.05, 0.12);
      // Toes point the way the knee does, flattened onto the ground.
      b.subVectors(kn, hip);
      b.y = 0;
      if (b.lengthSq() < 1e-4) b.set(0, 0, 1).applyAxisAngle(UP, this.pelvis.rotation.y);
      foot.rotation.set(0, Math.atan2(b.x, b.z), 0);
    }
    if (this.ball) this.ball.position.copy(this.handPos.R);
  }
}

/* ---------- Keyframes ---------- */

const smooth = (t: number) => t * t * (3 - 2 * t);
const lv = (x: V3, y: V3, t: number): V3 => [x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t];
const lo = (x: V3 | undefined, y: V3 | undefined, t: number) => (x && y ? lv(x, y, t) : (t < 0.5 ? x : y) ?? x ?? y);

export function blend(p: Pose, q: Pose, t: number): Pose {
  return {
    root: lo(p.root ?? [0, 0, 0], q.root ?? [0, 0, 0], t),
    pelvisY: p.pelvisY + (q.pelvisY - p.pelvisY) * t,
    pelvis: lv(p.pelvis, q.pelvis, t),
    chest: lv(p.chest, q.chest, t),
    handL: lv(p.handL, q.handL, t),
    handR: lv(p.handR, q.handR, t),
    footL: lv(p.footL, q.footL, t),
    footR: lv(p.footR, q.footR, t),
    poleL: lo(p.poleL, q.poleL, t),
    poleR: lo(p.poleR, q.poleR, t),
    kneeL: lo(p.kneeL, q.kneeL, t),
    kneeR: lo(p.kneeR, q.kneeR, t),
    grip: lo(p.grip, q.grip, t),
    bat: lo(p.bat, q.bat, t),
  };
}

export type Key = { at: number; pose: Pose; ease?: (t: number) => number };

export function sample(keys: Key[], x: number): Pose {
  if (x <= keys[0].at) return keys[0].pose;
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i];
    if (x <= k.at) {
      const prev = keys[i - 1];
      const t = (x - prev.at) / (k.at - prev.at);
      return blend(prev.pose, k.pose, (k.ease ?? smooth)(t));
    }
  }
  return keys[keys.length - 1].pose;
}

/* ---------- The pitcher (right-handed, from the stretch) ---------- */

const P_SET: Pose = {
  pelvisY: 3.0,
  pelvis: [0, -1.57, 0],
  chest: [0.05, 0, 0],
  handL: [-0.62, 4.25, 0.18],
  handR: [-0.58, 4.2, -0.02],
  footL: [0, 0.12, 0.9],
  footR: [0, 0.12, -0.6],
};
const P_LIFT: Pose = {
  pelvisY: 3.15,
  pelvis: [0, -1.85, 0],
  chest: [0.02, -0.12, 0],
  handL: [-0.62, 4.6, -0.05],
  handR: [-0.58, 4.55, -0.22],
  footL: [-1.15, 1.75, 0.25],
  kneeL: [-1, 0.35, 0],
  footR: [0, 0.12, -0.6],
};
const P_STRIDE: Pose = {
  root: [0, 0, 1.7],
  pelvisY: 2.62,
  pelvis: [0.05, -1.2, 0],
  chest: [0.1, -0.35, 0.05],
  handL: [-0.15, 4.55, 4.0],
  handR: [-0.3, 5.25, -0.15],
  poleR: [0, -1, -0.8],
  footL: [0.1, -0.2, 4.5],
  kneeL: [0, 0.3, 1],
  footR: [0, 0.2, -0.45],
};
const P_RELEASE: Pose = {
  root: [0, 0, 2.5],
  pelvisY: 2.45,
  pelvis: [0.15, 0.05, 0],
  chest: [0.5, 0.3, 0],
  handL: [0.55, 3.9, 3.4],
  handR: [-1.25, 5.6, 5.4],
  poleR: [-1, -0.4, 0],
  footL: [0.1, -0.2, 4.5],
  kneeL: [0, 0.2, 1],
  footR: [-0.2, 0.35, 0.7],
};
const P_FOLLOW: Pose = {
  root: [0, 0, 3.0],
  pelvisY: 2.25,
  pelvis: [0.3, 0.5, 0],
  chest: [0.8, 0.35, 0],
  handL: [0.9, 3.2, 3.0],
  handR: [1.0, 2.3, 4.5],
  poleR: [0, -1, 0],
  footL: [0.1, -0.2, 4.5],
  footR: [-0.7, 1.7, 1.3],
  kneeR: [0, -1, 0.4],
};
const P_WATCH: Pose = {
  ...P_FOLLOW,
  root: [0, 0, 3.0],
  pelvisY: 2.9,
  pelvis: [0.05, 0.9, 0],
  chest: [-0.25, 0.4, 0],
  handL: [0.8, 3.6, 3.3],
  handR: [-0.4, 3.0, 3.0],
  poleR: undefined,
  footR: [-0.3, -0.1, 2.2],
  kneeR: undefined,
};

export const pitcherKeys = (T: { WIND: number; LIFT: number; STRIDE: number; RELEASE: number; FOLLOW: number; WATCH: number }): Key[] => [
  { at: T.WIND, pose: P_SET },
  { at: T.LIFT, pose: P_LIFT },
  { at: T.STRIDE, pose: P_STRIDE },
  { at: T.RELEASE, pose: P_RELEASE, ease: (t) => t * t },
  { at: T.FOLLOW, pose: P_FOLLOW, ease: (t) => 1 - (1 - t) * (1 - t) },
  { at: T.WATCH, pose: P_WATCH },
];

/* ---------- The batter (right-handed) ---------- */

const B_STANCE: Pose = {
  pelvisY: 2.85,
  pelvis: [0.12, -1.55, 0],
  chest: [0.18, -0.1, 0],
  handL: [0, 0, 0],
  handR: [0, 0, 0],
  grip: [-0.55, 4.45, -0.8],
  bat: [0.3, 0.62, -0.72],
  footL: [0, 0.12, 1.05],
  footR: [0, 0.12, -1.25],
};
const B_LOAD: Pose = {
  ...B_STANCE,
  pelvis: [0.12, -1.78, 0],
  chest: [0.18, -0.28, 0],
  grip: [-0.35, 4.5, -1.15],
  bat: [0.4, 0.6, -0.69],
  footL: [-0.1, 0.55, 1.3],
};
const B_LAUNCH: Pose = {
  ...B_STANCE,
  pelvisY: 2.7,
  pelvis: [0.15, -1.25, 0],
  chest: [0.22, -0.55, 0],
  grip: [-0.65, 4.45, -0.85],
  bat: [0.15, 0.45, -0.88],
  footL: [0, 0.12, 1.95],
  footR: [0, 0.14, -1.2],
};
const B_CONTACT: Pose = {
  ...B_LAUNCH,
  pelvis: [0.15, -0.15, 0],
  chest: [0.22, 0.05, -0.12],
  grip: [-1.55, 3.55, 0.55],
  bat: [-0.93, -0.06, 0.36],
  footR: [0, 0.3, -1.05],
  kneeR: [0, 0, 1],
};
const B_FINISH: Pose = {
  ...B_CONTACT,
  pelvis: [0.05, 0.4, 0],
  chest: [0.02, 0.65, 0],
  grip: [0.35, 5.25, 0.85],
  bat: [0.6, 0.1, -0.8],
  handL: [0.35, 5.25, 0.85],
  handR: [0.53, 5.28, 0.61],
  footR: [-0.2, 0.5, -0.85],
};
const B_ADMIRE: Pose = {
  ...B_FINISH,
  pelvisY: 2.95,
  pelvis: [0, 0.6, 0],
  chest: [-0.12, 0.25, 0],
  handL: [0.75, 2.9, 0.7],
  handR: [-0.4, 2.9, 0.3],
  poleL: [1, -0.5, 0],
  poleR: [-1, -0.5, 0],
  footR: [-0.1, 0.12, -0.6],
  kneeR: undefined,
};

export const batterKeys = (T: { LOAD: number; LAUNCH: number; CONTACT: number; FINISH: number; FLIP: number; ADMIRE: number }): Key[] => [
  { at: T.LOAD - 0.04, pose: B_STANCE },
  { at: T.LOAD, pose: B_LOAD },
  { at: T.LAUNCH, pose: B_LAUNCH },
  { at: T.CONTACT, pose: B_CONTACT, ease: (t) => t * t },
  { at: T.FINISH, pose: B_FINISH, ease: (t) => 1 - (1 - t) * (1 - t) },
  { at: T.FLIP, pose: B_FINISH },
  { at: T.ADMIRE, pose: B_ADMIRE },
];
export const BATTER_CONTACT = B_CONTACT;

/* ---------- Everyone else ---------- */

export const CATCHER: Pose = {
  pelvisY: 1.35,
  pelvis: [0.35, 0, 0],
  chest: [0.2, 0, 0],
  handL: [0.25, 2.7, 1.3],
  handR: [-0.55, 1.9, 0.5],
  footL: [0.95, 0.12, 0.1],
  footR: [-0.95, 0.12, 0.1],
  kneeL: [0.7, 0.2, 1],
  kneeR: [-0.7, 0.2, 1],
};
export const UMPIRE: Pose = {
  pelvisY: 2.35,
  pelvis: [0.35, 0, 0],
  chest: [0.45, 0, 0],
  handL: [0.62, 1.95, 0.85],
  handR: [-0.62, 1.95, 0.85],
  footL: [0.95, 0.12, 0],
  footR: [-0.95, 0.12, 0],
  kneeL: [0.4, 0, 1],
  kneeR: [-0.4, 0, 1],
};
export const READY: Pose = {
  pelvisY: 2.6,
  pelvis: [0.25, 0, 0],
  chest: [0.4, 0, 0],
  handL: [0.6, 2.55, 1.15],
  handR: [-0.6, 2.55, 1.15],
  footL: [0.95, 0.12, 0],
  footR: [-0.95, 0.12, 0],
  kneeL: [0.4, 0, 1],
  kneeR: [-0.4, 0, 1],
};

/** A running stride; `ph` is the stride phase in radians. */
export function runPose(ph: number): Pose {
  const s = Math.sin(ph);
  const c2 = Math.cos(ph);
  return {
    pelvisY: 2.85 + Math.abs(Math.cos(ph)) * 0.18,
    pelvis: [0.25, 0, 0],
    chest: [0.25, -s * 0.15, 0],
    handL: [0.75, 3.6 + Math.max(0, -s) * 0.9, -s * 1.3],
    handR: [-0.75, 3.6 + Math.max(0, s) * 0.9, s * 1.3],
    poleL: [0.3, -0.5, -1],
    poleR: [-0.3, -0.5, -1],
    footL: [0.3, 0.15 + Math.max(0, c2) * 1.3, s * 1.9],
    footR: [-0.3, 0.15 + Math.max(0, -c2) * 1.3, -s * 1.9],
    kneeL: [0, 0, 1],
    kneeR: [0, 0, 1],
  };
}
