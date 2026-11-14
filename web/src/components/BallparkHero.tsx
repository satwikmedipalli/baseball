"use client";

import { useEffect, useRef, useState } from "react";
import BallparkScene, { PITCHER, PLATE, VB, type Pose } from "./BallparkScene";

/*
  Scroll-driven at-bat. Scrolling plays the windup, the pitch, the swing and a
  home run hit straight back at the camera: the ball climbs into the sky where
  the headline was, breaks out of the picture, grows until it fills the screen,
  then drops out of view into the page. The crowd erupts on contact.

  The ball lives in an overlay placed in stage pixels, so it can leave the
  drawing and fly past the viewer.
*/

const WINDUP_START = 0.03;
const RELEASE = 0.15;
const CONTACT = 0.26;
const FLY_END = 0.78;
const ARM = 11;

const clamp = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const span = (p: number, a: number, b: number) => clamp((p - a) / (b - a));
const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const polar = (x: number, y: number, deg: number, len: number) => ({
  x: x + len * Math.sin((deg * Math.PI) / 180),
  y: y - len * Math.cos((deg * Math.PI) / 180),
});

/** Release point in field units: right shoulder plus the arm almost straight up. */
const HAND = (() => {
  const h = polar(6, -27, -10, ARM);
  return { x: PITCHER.x + h.x, y: PITCHER.y + h.y };
})();

/** Throwing-arm angle in degrees (0 = straight up, clockwise positive). */
function armAngle(q: number) {
  const w = span(q, WINDUP_START, RELEASE);
  if (q >= RELEASE) return lerp(-10, -150, smooth(span(q, RELEASE, RELEASE + 0.05)));
  if (w < 0.4) return lerp(210, 160, smooth(w / 0.4));
  if (w < 0.8) return lerp(160, 70, smooth((w - 0.4) / 0.4));
  return lerp(70, -10, smooth((w - 0.8) / 0.2));
}

function pitchAt(p: number) {
  const t = span(p, RELEASE, CONTACT);
  return { x: lerp(HAND.x, PLATE.x, t), y: lerp(HAND.y, PLATE.y, t) - Math.sin(t * Math.PI) * 5, spin: t * 4 };
}

/** Where field point (0, 0) sits in the stage, and pixels per field unit. */
type Stage = { left: number; top: number; scale: number; w: number; h: number };

function flightAt(p: number, st: Stage) {
  const sx = st.left + PLATE.x * st.scale;
  const sy = st.top + PLATE.y * st.scale;
  const endX = st.w / 2;
  const endY = st.h * 0.52;
  const big = 0.62 * Math.min(st.w, st.h);
  if (p < FLY_END) {
    const t = span(p, CONTACT, FLY_END);
    const a = 1 - t;
    const cx = sx + (endX - sx) * 0.3 + st.w * 0.06;
    const cy = -st.h * 0.22;
    const x = a * a * sx + 2 * a * t * cx + t * t * endX;
    const y = a * a * sy + 2 * a * t * cy + t * t * endY;
    const r = 3.2 + 9 * Math.sin((Math.min(t * 1.6, 1) * Math.PI) / 2) + big * Math.pow(t, 3);
    return { x, y, r, spin: 4 + t * 10 };
  }
  const u = span(p, FLY_END, 1);
  return { x: endX, y: endY + u * u * (st.h + big * 2), r: big, spin: 14 + u * 3 };
}

export default function BallparkHero({ redesigns, seasons }: { redesigns: number; seasons: string }) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const fieldRef = useRef<SVGSVGElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [p, setP] = useState(0);
  const [box, setBox] = useState<Stage>({ left: 0, top: 0, scale: 1, w: 1280, h: 800 });
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    mq.addEventListener("change", sync);
    let raf = 0;
    const read = () => {
      raf = 0;
      const sec = sectionRef.current;
      const field = fieldRef.current;
      const stage = stageRef.current;
      if (!sec || !field || !stage) return;
      const r = sec.getBoundingClientRect();
      const s = stage.getBoundingClientRect();
      // How far the sticky stage has travelled inside its section.
      setP(clamp((s.top - r.top) / Math.max(1, r.height - s.height)));
      const f = field.getBoundingClientRect();
      const scale = f.width / VB.w;
      setBox({ left: f.left - s.left - VB.x * scale, top: f.top - s.top - VB.y * scale, scale, w: s.width, h: s.height });
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(read);
    };
    raf = requestAnimationFrame(() => {
      sync();
      read();
    });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      mq.removeEventListener("change", sync);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const q = reduced ? 0 : p;
  const cheer = !reduced && q >= CONTACT;
  const textFade = 1 - smooth(span(q, CONTACT + 0.03, CONTACT + 0.16));
  const fieldFade = 1 - smooth(span(q, 0.6, 0.86)) * 0.85;
  const hint = 1 - span(q, 0.01, 0.05);

  const armDeg = armAngle(q);
  const swing = smooth(span(q, CONTACT - 0.03, CONTACT + 0.035));
  const pose: Pose = {
    lift: Math.sin(span(span(q, WINDUP_START, RELEASE), 0.15, 0.85) * Math.PI),
    hand: polar(6, -27, armDeg, ARM),
    // Seen from behind, the arm is hidden by his body while it is across his
    // chest (hands together in the set, and on the follow-through).
    armBehind: armDeg > 190 || armDeg < -40,
    holding: q < RELEASE,
    stride: Math.sin(span(q, CONTACT - 0.08, CONTACT - 0.01) * Math.PI),
    swing,
    bat: lerp(28, -215, swing),
    flash: q > CONTACT ? Math.max(0, 1 - (q - CONTACT) / 0.05) : 0,
  };

  let ball: { x: number; y: number; r: number; spin: number } | null = null;
  if (q >= RELEASE && q < CONTACT) {
    const b = pitchAt(q);
    ball = { x: box.left + b.x * box.scale, y: box.top + b.y * box.scale, r: 3.2, spin: b.spin };
  } else if (q >= CONTACT) {
    ball = flightAt(q, box);
  }

  return (
    <section ref={sectionRef} className={`bp${reduced ? " bp-static" : ""}${cheer ? " bp-cheer" : ""}`} aria-label="Introduction">
      <div ref={stageRef} className="bp-stage">
        <div className="bp-text" style={{ opacity: textFade, transform: `translateY(${(1 - textFade) * -24}px)` }}>
          <p className="bp-eyebrow">An independent baseball research project · Satwik Medipalli</p>
          <h1 className="bp-h">
            Does redesigning a pitch <em>actually work?</em>
          </h1>
          <p className="bp-sub">
            Every offseason, MLB pitchers rebuild their pitches: throwing harder, adding movement, changing their arm
            slot. I tracked {redesigns.toLocaleString()} of those changes across the {seasons} seasons to find out which
            ones actually led to better results.
          </p>
          <a className="bp-cta" href="#answer">
            Get the answer <span aria-hidden="true">↓</span>
          </a>
        </div>

        <svg
          ref={fieldRef}
          className="bp-field"
          viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`}
          style={{ opacity: fieldFade }}
          role="img"
          aria-label="A night game seen from the centre-field camera: the pitcher on the mound with his back to us, the batter at home plate, a full crowd in the stands."
        >
          <BallparkScene pose={pose} />
        </svg>

        {ball && (
          <svg
            className={`bp-ball${ball.r < 10 ? " small" : ""}`}
            viewBox="-50 -50 100 100"
            aria-hidden="true"
            style={{ left: ball.x - ball.r, top: ball.y - ball.r, width: ball.r * 2, height: ball.r * 2 }}
          >
            <defs>
              <radialGradient id="bp-ball-shade" cx="0.36" cy="0.3" r="0.78">
                <stop offset="0" stopColor="#ffffff" />
                <stop offset="0.55" stopColor="#f2eee4" />
                <stop offset="0.85" stopColor="#d8d0bf" />
                <stop offset="1" stopColor="#b9b09c" />
              </radialGradient>
            </defs>
            <circle r="48" fill="url(#bp-ball-shade)" />
            <g transform={`rotate(${ball.spin * 40})`}>
              <path className="bp-seam" d="M-30 -36 C-12 -14 -12 14 -30 36" />
              <path className="bp-seam" d="M30 -36 C12 -14 12 14 30 36" />
              {ball.r > 18 &&
                [-26, -17, -8, 1, 10, 19, 28].map((yy) => {
                  const lx = -30 + 18 * (1 - (yy / 36) ** 2) * 0.75;
                  const rx = -lx;
                  return (
                    <g key={yy}>
                      <path className="bp-stitch" d={`M${lx - 4} ${yy - 3} L${lx} ${yy} L${lx - 4} ${yy + 3}`} />
                      <path className="bp-stitch" d={`M${rx + 4} ${yy - 3} L${rx} ${yy} L${rx + 4} ${yy + 3}`} />
                    </g>
                  );
                })}
            </g>
            <circle r="48" fill="none" stroke="#000" strokeOpacity="0.08" strokeWidth="1" />
          </svg>
        )}

        <p className="bp-hint" style={{ opacity: reduced ? 0 : hint }} aria-hidden="true">
          Scroll to pitch <span>↓</span>
        </p>
      </div>
    </section>
  );
}
