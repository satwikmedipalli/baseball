"use client";

import { useEffect, useState } from "react";
import { useRedesigns } from "@/lib/redesigns";
import { useInView } from "./useInView";

type Props = {
  hb: [number, number];
  ivb: [number, number];
  velo: [number, number];
  years: [string, string];
  cloud?: [number, number][];
  pitch?: string;
  size?: "lg" | "sm";
};

const S = 320;
const P = 28;

function q(sorted: number[], k: number) {
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(k * sorted.length))] : 0;
}

/** Square frame around the pitch type's cloud and this pitch, so shapes aren't lost in a corner. */
function frame(cloud: [number, number][], hb: number[], ivb: number[]) {
  const xs = [...cloud.map((c) => c[0])].sort((a, b) => a - b);
  const ys = [...cloud.map((c) => c[1])].sort((a, b) => a - b);
  const x0 = Math.min(q(xs, 0.02), ...hb), x1 = Math.max(q(xs, 0.98), ...hb);
  const y0 = Math.min(q(ys, 0.02), ...ivb), y1 = Math.max(q(ys, 0.98), ...ivb);
  const half = Math.max(8, (x1 - x0) / 2 + 2, (y1 - y0) / 2 + 2);
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, half };
}

function useCount(from: number, to: number, run: boolean, ms = 1100) {
  const [v, setV] = useState(from);
  useEffect(() => {
    if (!run) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      const e = 1 - (1 - k) ** 3;
      setV(from + (to - from) * e);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [from, to, run, ms]);
  return v;
}

export default function MovementPlot({ hb, ivb, velo, years, cloud: given, pitch, size = "lg" }: Props) {
  const data = useRedesigns();
  const cloud = given ?? (pitch && data ? (data.cloud[pitch] ?? []) : []);
  const { ref, seen } = useInView<HTMLDivElement>(0.4);
  const f = frame(cloud, hb, ivb);
  const sc = (v: number) => P + ((v - (f.cx - f.half)) / (2 * f.half)) * (S - 2 * P);
  const sy = (v: number) => S - P - ((v - (f.cy - f.half)) / (2 * f.half)) * (S - 2 * P);
  const ticksX: number[] = [];
  const ticksY: number[] = [];
  for (let t = Math.ceil((f.cx - f.half) / 5) * 5; t <= f.cx + f.half; t += 5) ticksX.push(t);
  for (let t = Math.ceil((f.cy - f.half) / 5) * 5; t <= f.cy + f.half; t += 5) ticksY.push(t);
  const inX = (v: number) => v > f.cx - f.half && v < f.cx + f.half;
  const inY = (v: number) => v > f.cy - f.half && v < f.cy + f.half;
  const speed = useCount(velo[0], velo[1], seen);
  const dx = sc(hb[1]) - sc(hb[0]);
  const dy = sy(ivb[1]) - sy(ivb[0]);
  const moved = Math.hypot(hb[1] - hb[0], ivb[1] - ivb[0]);
  return (
    <div ref={ref} className={`mv mv-${size}${seen ? " mv-on" : ""}`}>
      <div className="mv-speed" aria-label={`Velocity ${velo[0].toFixed(1)} to ${velo[1].toFixed(1)} mph`}>
        <span className="mv-speed-num">{speed.toFixed(1)}</span>
        <span className="mv-speed-unit">mph</span>
        <span className={`mv-speed-delta${velo[1] - velo[0] >= 0 ? " up" : " down"}`}>
          {velo[1] - velo[0] >= 0 ? "▲" : "▼"} {Math.abs(velo[1] - velo[0]).toFixed(1)}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${S} ${S}`}
        role="img"
        aria-label={`Pitch movement moved ${moved.toFixed(1)} inches: rise ${ivb[0].toFixed(1)} to ${ivb[1].toFixed(1)} inches, arm-side run ${hb[0].toFixed(1)} to ${hb[1].toFixed(1)} inches.`}
      >
        <rect className="mv-bg" x={P} y={P} width={S - 2 * P} height={S - 2 * P} />
        {ticksX.map((t) => (
          <g key={`x${t}`}>
            <line className={t === 0 ? "mv-axis" : "mv-grid"} x1={sc(t)} x2={sc(t)} y1={P} y2={S - P} />
            <text className="mv-tick" x={sc(t)} y={S - P + 11} textAnchor="middle">{t}</text>
          </g>
        ))}
        {ticksY.map((t) => (
          <g key={`y${t}`}>
            <line className={t === 0 ? "mv-axis" : "mv-grid"} x1={P} x2={S - P} y1={sy(t)} y2={sy(t)} />
            <text className="mv-tick" x={P - 4} y={sy(t) + 3} textAnchor="end">{t}</text>
          </g>
        ))}
        {cloud.filter(([x, y]) => inX(x) && inY(y)).map(([x, y], i) => (
          <circle key={i} className="mv-cloud" cx={sc(x)} cy={sy(y)} r={1.6} />
        ))}
        <line className="mv-path" x1={sc(hb[0])} y1={sy(ivb[0])} x2={sc(hb[1])} y2={sy(ivb[1])} pathLength={1} />
        <circle className="mv-pre" cx={sc(hb[0])} cy={sy(ivb[0])} r={6} />
        <g className="mv-post" style={{ transform: seen ? "translate(0,0)" : `translate(${-dx}px, ${-dy}px)` }}>
          <circle cx={sc(hb[1])} cy={sy(ivb[1])} r={7.5} />
        </g>
        <text className="mv-lab" x={S - P} y={S - 2} textAnchor="end">arm side →</text>
        <text className="mv-lab" x={P} y={S - 2}>← glove side</text>
        <text className="mv-lab" x={P + 4} y={P - 10}>↑ rise (in)</text>
        <text className="mv-lab mv-year" x={sc(hb[0]) + (dx >= 0 ? -10 : 10)} y={sy(ivb[0]) + 4} textAnchor={dx >= 0 ? "end" : "start"}>
          {years[0]}
        </text>
        <text className="mv-lab mv-year post" x={sc(hb[1]) + (dx >= 0 ? 12 : -12)} y={sy(ivb[1]) + 4} textAnchor={dx >= 0 ? "start" : "end"}>
          {years[1]}
        </text>
      </svg>
      <p className="mv-note">
        Shape moved {moved.toFixed(1)} in. Rise {ivb[0].toFixed(1)} → {ivb[1].toFixed(1)}, run {hb[0].toFixed(1)} →{" "}
        {hb[1].toFixed(1)}.{cloud.length > 0 && " Grey: every other pitch of this type in the study."}
      </p>
    </div>
  );
}
