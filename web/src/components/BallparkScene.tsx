import type { CSSProperties } from "react";

/*
  The ballpark itself: a night game at dusk seen from the centre-field camera.
  Pure drawing, no state. The pose values come from BallparkHero; the crowd's
  celebration is CSS, switched on by the `bp-cheer` class on the section.

  Coordinates: x 0–400, y −40–300. Sky and lights sit above y = 0, the stands
  behind home plate at y 4–64, the field below, the outfield wall and bleacher
  crowd (nearest the camera) at the bottom.
*/

export const VB = { x: 0, y: -40, w: 400, h: 340 };

export type Pose = {
  lift: number; // pitcher's leg kick, 0–1
  hand: { x: number; y: number }; // throwing hand, relative to the pitcher's feet
  armBehind: boolean; // arm across his chest, hidden by his body
  holding: boolean; // ball still in his hand
  stride: number; // batter's stride, 0–1
  swing: number; // batter's swing, 0–1
  bat: number; // bat angle in degrees
  flash: number; // contact flash, 0–1
};

export const PITCHER = { x: 195, y: 130 };
export const PLATE = { x: 203, y: 64 };

const rand = (i: number) => {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lag = (i: number, max = 1.2): CSSProperties => ({ "--d": `${(-rand(i + 7) * max).toFixed(2)}s` }) as CSSProperties;

const SHIRTS = ["#a83a46", "#33475c", "#7d8c9a", "#c9a454", "#e8e2d4", "#58735f"];
const HEADS = ["#2b211b", "#b88a6c", "#6a4a33"];

const STANDS = Array.from({ length: 5 }, (_, row) => {
  const y = 13 + row * 8.6;
  const x0 = lerp(78, 44, row / 4);
  const x1 = lerp(322, 356, row / 4);
  const n = Math.floor((x1 - x0) / 6.6);
  return Array.from({ length: n + 1 }, (_, k) => {
    const i = row * 100 + k;
    return {
      i,
      x: x0 + k * 6.6 + (rand(i) - 0.5) * 1.6,
      y: y + (rand(i + 9) - 0.5) * 0.8,
      shirt: SHIRTS[Math.floor(rand(i + 1) * SHIRTS.length)],
      head: HEADS[Math.floor(rand(i + 2) * HEADS.length)],
      bulb: rand(i + 3) < 0.1,
      row,
    };
  });
}).flat();

const FRONT = Array.from({ length: 10 }, (_, k) => ({
  i: k,
  x: 18 + k * 41 + (rand(k + 40) - 0.5) * 8,
  y: 278 + (rand(k + 50) - 0.5) * 7,
  phone: k === 2 || k === 6 || k === 8,
}));

const STARS = Array.from({ length: 16 }, (_, i) => ({
  x: 50 + rand(i + 200) * 300,
  y: -38 + rand(i + 300) * 26,
  r: 0.4 + rand(i + 400) * 0.6,
  o: 0.3 + rand(i + 500) * 0.5,
}));

const FIREWORKS = [
  { x: 150, y: -20, c: "#f2c86b", d: "0s" },
  { x: 262, y: -25, c: "#ff9a8f", d: "0.55s" },
  { x: 208, y: -10, c: "#fdf6e3", d: "1.1s" },
];

/* Mowing bands: rings around home plate, following the curve of the outfield. */
const BANDS = Array.from({ length: 9 }, (_, k) => 96 + k * 26);

function Tower({ x, flip }: { x: number; flip?: boolean }) {
  const bx = flip ? x - 30 : x;
  return (
    <g>
      <circle cx={bx + 15} cy={-27} r="34" fill="url(#bp-glow)" />
      <rect x={x + (flip ? -16 : 14)} y={-20} width="2.4" height="80" fill="#1b2633" />
      <rect x={bx} y={-35} width="30" height="15" rx="1.5" fill="#1b2633" />
      {[0, 1].map((r) =>
        [0, 1, 2, 3, 4].map((c) => (
          <circle key={`${r}${c}`} className="bp-lamp" cx={bx + 4 + c * 5.5} cy={-31 + r * 7} r="2" fill="#fff7dc" style={lag(r * 5 + c + x)} />
        )),
      )}
    </g>
  );
}

export default function BallparkScene({ pose }: { pose: Pose }) {
  const { lift, hand, armBehind, holding, stride, swing, bat, flash } = pose;
  const arm = <line x1="6" y1="-27" x2={hand.x} y2={hand.y} stroke="url(#bp-white-v)" strokeWidth="3.2" strokeLinecap="round" />;
  return (
    <>
      <defs>
        <clipPath id="bp-frame">
          <rect x={VB.x} y={VB.y} width={VB.w} height={VB.h} rx="18" />
        </clipPath>
        <linearGradient id="bp-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0b1726" />
          <stop offset="0.55" stopColor="#21385a" />
          <stop offset="0.85" stopColor="#4d5f80" />
          <stop offset="1" stopColor="#b98572" />
        </linearGradient>
        <radialGradient id="bp-glow">
          <stop offset="0" stopColor="#fff6d8" stopOpacity="0.85" />
          <stop offset="0.25" stopColor="#ffe7a8" stopOpacity="0.35" />
          <stop offset="1" stopColor="#ffe7a8" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="bp-beam" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff3cf" stopOpacity="0.1" />
          <stop offset="1" stopColor="#fff3cf" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="bp-deck" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1a2735" />
          <stop offset="1" stopColor="#2a3a4b" />
        </linearGradient>
        <linearGradient id="bp-grass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4c7a4a" />
          <stop offset="1" stopColor="#3a6640" />
        </linearGradient>
        <linearGradient id="bp-dirt" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c99a6b" />
          <stop offset="1" stopColor="#b5845a" />
        </linearGradient>
        <radialGradient id="bp-pool" cx="200" cy="112" r="210" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff8e1" stopOpacity="0.22" />
          <stop offset="0.6" stopColor="#fff8e1" stopOpacity="0.06" />
          <stop offset="1" stopColor="#fff8e1" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="bp-vignette" cx="200" cy="120" r="260" gradientUnits="userSpaceOnUse">
          <stop offset="0.55" stopColor="#060d14" stopOpacity="0" />
          <stop offset="1" stopColor="#060d14" stopOpacity="0.55" />
        </radialGradient>
        <linearGradient id="bp-white" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#cfcabe" />
        </linearGradient>
        <linearGradient id="bp-white-v" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f7f5ef" />
          <stop offset="1" stopColor="#d9d4c8" />
        </linearGradient>
        <linearGradient id="bp-red" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#d0424f" />
          <stop offset="1" stopColor="#8f2431" />
        </linearGradient>
        <linearGradient id="bp-sil" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1d2c3a" />
          <stop offset="1" stopColor="#070d13" />
        </linearGradient>
        <linearGradient id="bp-wall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1f4434" />
          <stop offset="1" stopColor="#10261d" />
        </linearGradient>
        <clipPath id="bp-fair">
          <path d="M200 64 L-20 230 L-20 242 Q200 276 420 242 L420 230 Z" />
        </clipPath>
        <filter id="bp-soft" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.1" />
        </filter>
        <filter id="bp-dof" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="0.7" />
        </filter>
        <filter id="bp-led" x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur stdDeviation="1.2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <pattern id="bp-dots" width="2" height="2" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.45" fill="#ffffff" fillOpacity="0.06" />
        </pattern>
      </defs>

      <g clipPath="url(#bp-frame)">
        {/* Sky, stars, light towers. */}
        <rect x={VB.x} y={VB.y} width={VB.w} height="104" fill="url(#bp-sky)" />
        {STARS.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#fff" fillOpacity={s.o} />
        ))}
        {FIREWORKS.map((f) => (
          <g key={f.x} transform={`translate(${f.x} ${f.y})`}>
            <g className="bp-fw" style={{ "--d": f.d } as CSSProperties}>
              {Array.from({ length: 14 }, (_, k) => {
                const a = (k / 14) * Math.PI * 2;
                return (
                  <g key={k}>
                    <line x1={Math.cos(a) * 4} y1={Math.sin(a) * 4} x2={Math.cos(a) * 13} y2={Math.sin(a) * 13} stroke={f.c} strokeWidth="1" strokeLinecap="round" />
                    <circle cx={Math.cos(a) * 15.5} cy={Math.sin(a) * 15.5} r="0.9" fill={f.c} />
                  </g>
                );
              })}
            </g>
          </g>
        ))}
        <Tower x={8} />
        <Tower x={392} flip />

        {/* Stands behind home plate, lit from under the roof. */}
        <path d="M70 4 L330 4 L366 60 L34 60 Z" fill="url(#bp-deck)" />
        <rect x="64" y="-1" width="272" height="6" rx="1.5" fill="#0d1620" />
        <rect x="68" y="4.6" width="264" height="1.1" fill="#ffe9b3" fillOpacity="0.75" />
        {STANDS.map((f) => (
          <g key={f.i} className="bp-fan" style={lag(f.i)}>
            <rect x={f.x - 2.5} y={f.y + 1.5} width="5" height="5.6" rx="1.5" fill={f.shirt} />
            <circle cx={f.x} cy={f.y} r="2.1" fill={f.head} />
            {f.bulb && <circle className="bp-bulb" cx={f.x + 1.5} cy={f.y + 2.2} r="1.8" fill="#fff" style={lag(f.i + 3, 1.3)} />}
          </g>
        ))}
        <path d="M70 4 L330 4 L366 60 L34 60 Z" fill="#0b1520" fillOpacity="0.14" />

        {/* Scoreboard. */}
        <rect x="78" y="-12" width="2.4" height="17" fill="#1b2633" />
        <rect x="118" y="-12" width="2.4" height="17" fill="#1b2633" />
        <rect x="58" y="-36" width="82" height="25" rx="2" fill="#070c12" stroke="#2b3949" strokeWidth="0.8" />
        <rect x="61" y="-33" width="76" height="19" fill="url(#bp-dots)" />
        <g filter="url(#bp-led)" style={{ fontFamily: "var(--mono)" }} fontWeight="700" fontSize="9.5" letterSpacing="0.6" textAnchor="middle">
          <text className="bp-board-count" x="99" y="-20.2" fill="#f2c86b">
            FULL COUNT
          </text>
          <text className="bp-board-hr" x="99" y="-20.2" fill="#ff6b5e">
            HOME RUN!
          </text>
        </g>

        {/* Backstop. */}
        <rect x="28" y="57" width="344" height="7" fill="#101b26" />
        <rect x="28" y="57" width="344" height="0.8" fill="#ffffff" fillOpacity="0.18" />

        {/* Field: foul ground, striped outfield, infield, chalk. */}
        <rect x="-20" y="64" width="440" height="200" fill="#335a39" />
        <path d="M200 64 L-20 230 L-20 242 Q200 276 420 242 L420 230 Z" fill="url(#bp-grass)" />
        <g clipPath="url(#bp-fair)" strokeOpacity="0.05">
          {BANDS.map((r) => (
            <ellipse key={r} cx="200" cy="40" rx={r * 1.15} ry={r * 0.82} fill="none" stroke="#ffffff" strokeWidth="13" />
          ))}
        </g>
        <ellipse cx="200" cy="72" rx="17" ry="7.5" fill="url(#bp-dirt)" />
        <ellipse cx="160" cy="70" rx="4" ry="1.7" fill="#2f5536" stroke="#c99a6b" strokeWidth="0.6" />
        <ellipse cx="240" cy="70" rx="4" ry="1.7" fill="#2f5536" stroke="#c99a6b" strokeWidth="0.6" />
        <path d="M200 66 L136 118 Q200 172 264 118 Z" fill="url(#bp-dirt)" />
        <path d="M200 80 L156 117 Q200 153 244 117 Z" fill="#4f7f4c" />
        <path d="M200 80 L156 117 Q200 153 244 117 Z" fill="#ffffff" fillOpacity="0.04" />
        <g stroke="#f6f2e8" strokeWidth="1.1" strokeOpacity="0.9">
          <line x1="200" y1="74" x2="-20" y2="232" />
          <line x1="200" y1="74" x2="420" y2="232" />
        </g>
        <g fill="#fbfaf6">
          <rect x="147" y="115.5" width="6" height="3.4" rx="0.6" />
          <rect x="247" y="115.5" width="6" height="3.4" rx="0.6" />
          <rect x="197" y="150" width="6" height="3.4" rx="0.6" />
          <path d="M197 73 h6 v1.5 l-3 1.8 l-3 -1.8 Z" />
        </g>
        <ellipse cx={PITCHER.x + 2} cy={PITCHER.y - 1} rx="15" ry="6" fill="#d0a274" />
        <ellipse cx={PITCHER.x + 2} cy={PITCHER.y - 2} rx="10" ry="3.6" fill="#ffffff" fillOpacity="0.06" />
        <rect x={PITCHER.x - 1} y={PITCHER.y - 2.4} width="6" height="1.4" fill="#fbfaf6" />

        {/* Light: beams from the towers and a pool over the infield. */}
        <path d="M23 -20 L150 250 L-20 250 Z" fill="url(#bp-beam)" />
        <path d="M377 -20 L420 250 L250 250 Z" fill="url(#bp-beam)" />
        <rect x="-20" y="60" width="440" height="200" fill="url(#bp-pool)" />

        {/* Umpire and catcher. */}
        <ellipse cx="200" cy="67" rx="9" ry="2" fill="#000" fillOpacity="0.3" filter="url(#bp-soft)" />
        <g fill="#20262d">
          <rect x="196" y="58" width="8" height="8" rx="2.5" />
          <circle cx="200" cy="56" r="2.6" />
        </g>
        <g fill="#2c3a48">
          <ellipse cx="200" cy="68" rx="4.6" ry="3.6" />
          <circle cx="200" cy="63.5" r="2.4" />
          <rect x="198.2" y="62.4" width="3.6" height="2.4" rx="0.6" fill="#11171d" />
        </g>

        {/* Batter: right-handed, side-on, away red. */}
        <ellipse cx="213" cy="76.5" rx="7" ry="1.6" fill="#000" fillOpacity="0.32" filter="url(#bp-soft)" />
        <g transform="translate(211 76)">
          <g stroke="#c4c8cd" strokeWidth="2.3" strokeLinecap="round">
            <line x1="1.5" y1="-9" x2="4.5" y2="0" />
            <line x1="-1.5" y1="-9" x2={-4.5 - stride * 2.5} y2={-stride * 2} />
          </g>
          <rect x="-3.3" y="-18" width="6.6" height="10" rx="2" fill="url(#bp-red)" />
          <circle cx="0" cy="-20.5" r="2.7" fill="#b88a6c" />
          <path d="M-2.9 -21 a2.9 2.9 0 0 1 5.8 0 Z" fill="#7d1b29" />
          <rect x="-4.9" y="-21.6" width="2.7" height="1.1" rx="0.5" fill="#7d1b29" />
          <circle cx="0.9" cy="-22.6" r="0.6" fill="#fff" fillOpacity="0.5" />
          <g transform={`translate(${lerp(1.5, -1.5, swing)} -15) rotate(${bat})`}>
            <path d="M-0.6 0 L0.6 0 L1.3 -14 Q0 -15 -1.3 -14 Z" fill="#b98049" />
          </g>
        </g>

        {/* Pitcher: back to the camera, home whites, #21, glove on the left hand. */}
        <ellipse cx={PITCHER.x + 4} cy={PITCHER.y + 0.5} rx="11" ry="2.6" fill="#000" fillOpacity="0.35" filter="url(#bp-soft)" />
        <g transform={`translate(${PITCHER.x} ${PITCHER.y})`}>
          <g stroke="url(#bp-white-v)" strokeWidth="3.8" strokeLinecap="round">
            <line x1="3" y1="-15" x2="4.5" y2="-0.5" />
            <line x1="-3" y1="-15" x2={-4.5 - lift * 4} y2={-0.5 - lift * 11} />
          </g>
          <ellipse cx="5" cy="0" rx="2.4" ry="1.2" fill="#10212f" />
          <ellipse cx={-5 - lift * 4} cy={-lift * 11} rx="2.4" ry="1.2" fill="#10212f" />
          {armBehind && arm}
          <line x1="-6" y1="-26" x2={-9 + lift * 3} y2={-18 + lift * 2} stroke="url(#bp-white-v)" strokeWidth="3.2" strokeLinecap="round" />
          <ellipse cx={-9.5 + lift * 3} cy={-17 + lift * 2} rx="3.3" ry="3.7" fill="#8a5a2b" />
          <rect x="-6.6" y="-29.5" width="13.2" height="16" rx="3.5" fill="url(#bp-white)" />
          <rect x="-6.6" y="-15.2" width="13.2" height="1.3" fill="#10212f" />
          <text x="0" y="-18.4" textAnchor="middle" fontSize="7.2" fontWeight="800" fill="#10212f" style={{ fontFamily: "var(--sans)" }}>
            21
          </text>
          <rect x="-1.6" y="-31.5" width="3.2" height="3" fill="#a87b5e" />
          <circle cx="0" cy="-34.5" r="4.2" fill="#b88a6c" />
          <path d="M-4.6 -34.4 a4.6 4.6 0 0 1 9.2 0 Z" fill="#10212f" />
          <circle cx="0" cy="-38.9" r="0.7" fill="#10212f" />
          {!armBehind && arm}
          {holding && !armBehind && <circle cx={hand.x} cy={hand.y} r="1.9" fill="#fff" />}
        </g>
        {flash > 0 && (
          <g opacity={flash}>
            <circle cx={PLATE.x} cy={PLATE.y} r={6 + (1 - flash) * 16} fill="url(#bp-glow)" />
            <circle cx={PLATE.x} cy={PLATE.y} r={3 + (1 - flash) * 12} fill="none" stroke="#fff" strokeWidth="1.2" />
          </g>
        )}

        {/* Warning track, the wall with its yellow home-run line, the bleacher crowd. */}
        <path d="M-20 242 Q200 276 420 242 L420 252 Q200 288 -20 252 Z" fill="#8c6747" />
        <path d="M-20 252 Q200 288 420 252 L420 320 L-20 320 Z" fill="url(#bp-wall)" />
        <path d="M-20 252 Q200 288 420 252" fill="none" stroke="#f2c84b" strokeWidth="1.6" />
        <g filter="url(#bp-dof)">
          {FRONT.map((f) => (
            <g key={f.i} className="bp-front" style={lag(f.i + 20)}>
              <g className="bp-front-arms">
                <line x1={f.x - 10} y1={f.y + 13} x2={f.x - 17} y2={f.y - 13} stroke="#15212d" strokeWidth="6" strokeLinecap="round" />
                <line x1={f.x + 10} y1={f.y + 13} x2={f.x + 17} y2={f.y - 13} stroke="#15212d" strokeWidth="6" strokeLinecap="round" />
                {f.phone && (
                  <g>
                    <circle cx={f.x - 17} cy={f.y - 19} r="9" fill="url(#bp-glow)" />
                    <rect x={f.x - 19.5} y={f.y - 23} width="5" height="8" rx="1" fill="#e6f4ff" />
                  </g>
                )}
              </g>
              <rect x={f.x - 14} y={f.y + 7} width="28" height="36" rx="10" fill="url(#bp-sil)" />
              <circle cx={f.x} cy={f.y} r="8.5" fill="#101a24" />
              <path d={`M${f.x - 7.6} ${f.y - 3.5} A8.5 8.5 0 0 1 ${f.x + 7.6} ${f.y - 3.5}`} fill="none" stroke="#f3cf8e" strokeOpacity="0.55" strokeWidth="1.1" />
              <path d={`M${f.x - 13} ${f.y + 11} Q${f.x} ${f.y + 5} ${f.x + 13} ${f.y + 11}`} fill="none" stroke="#f3cf8e" strokeOpacity="0.3" strokeWidth="1" />
            </g>
          ))}
        </g>

        <rect x={VB.x} y={VB.y} width={VB.w} height={VB.h} fill="url(#bp-vignette)" pointerEvents="none" />
      </g>
      <rect x={VB.x + 0.5} y={VB.y + 0.5} width={VB.w - 1} height={VB.h - 1} rx="17.5" fill="none" stroke="#ffffff" strokeOpacity="0.08" />
    </>
  );
}
