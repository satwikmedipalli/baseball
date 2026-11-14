"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PITCH_NAME, seasons, useRedesigns, type Redesign } from "@/lib/redesigns";

type Props = {
  featuredId: number | null;
  featuredName: string;
  veloEstimate: string;
  veloRange: string;
};

const W = 640;
const H = 520;
const M = { l: 52, r: 18, t: 18, b: 46 };
const X: [number, number] = [-5, 5];
const Y: [number, number] = [-5, 5];
const sx = (v: number) => M.l + ((Math.max(X[0], Math.min(X[1], v)) - X[0]) / (X[1] - X[0])) * (W - M.l - M.r);
const sy = (v: number) => M.t + (1 - (Math.max(Y[0], Math.min(Y[1], v)) - Y[0]) / (Y[1] - Y[0])) * (H - M.t - M.b);
const dv = (r: Redesign) => r.velo[1] - r.velo[0];
const VELO = new Set(["more velocity", "less velocity"]);
const fmt = (v: number, d = 2) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(d)}`;

export default function StoryChart({ featuredId, featuredName, veloEstimate, veloRange }: Props) {
  const data = useRedesigns();
  const [step, setStep] = useState(0);
  const [hover, setHover] = useState<Redesign | null>(null);
  const stepsRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    const root = stepsRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setStep(Number((e.target as HTMLElement).dataset.step));
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    root.querySelectorAll("[data-step]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const rows = useMemo(() => data?.redesigns ?? [], [data]);
  const others = rows.filter((r) => !VELO.has(r.change));
  const otherMean = others.length ? others.reduce((s, r) => s + r.gap, 0) / others.length : 0;
  const featured = rows.find((r) => r.id === featuredId) ?? null;

  const trend = useMemo(() => {
    const pts: [number, number][] = [];
    for (let c = -4; c <= 4; c += 1) {
      const inBin = rows.filter((r) => dv(r) >= c - 0.5 && dv(r) < c + 0.5);
      if (inBin.length >= 8) pts.push([c, inBin.reduce((s, r) => s + r.gap, 0) / inBin.length]);
    }
    return pts;
  }, [rows]);
  const trendPath = trend.map(([x, y], i) => `${i ? "L" : "M"}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join(" ");

  function dotClass(r: Redesign): string {
    if (step === 0) return "sd";
    if (step === 1) return r.id === featuredId ? "sd sd-feature" : "sd sd-faint";
    if (step === 2) return VELO.has(r.change) ? "sd sd-faint" : "sd sd-mid";
    return r.change === "more velocity" ? "sd sd-hot" : "sd sd-faint";
  }

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg || !rows.length) return;
    const box = svg.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    const py = ((e.clientY - box.top) / box.height) * H;
    let best: Redesign | null = null;
    let bestD = 14 * 14;
    for (const r of rows) {
      const d = (sx(dv(r)) - px) ** 2 + (sy(r.gap) - py) ** 2;
      if (d < bestD) {
        bestD = d;
        best = r;
      }
    }
    setHover(best);
  }

  const shown = hover ?? (step === 1 ? featured : null);

  return (
    <div className="story">
      <div className="story-steps" ref={stepsRef}>
        <div className="story-step" data-step="0">
          <p className="kicker">Every dot is a redesign</p>
          <p>
            <strong>{rows.length ? rows.length.toLocaleString() : "Hundreds of"} pitches</strong> that changed over an
            offseason, each compared with look-alike pitchers who didn’t change.
          </p>
          <p className="story-small">
            Across: how much faster the pitch got. Up: how much better it did than its look-alikes, in runs saved per
            100 pitches. Hover any dot.
          </p>
        </div>
        <div className="story-step" data-step="1">
          <p className="kicker">One of them</p>
          <p>
            That’s <strong>{featuredName}’s fastball</strong>.{" "}
            {featured && (
              <>
                {fmt(dv(featured), 1)} mph, and {fmt(featured.gap)} runs per 100 better than the pitchers who looked
                like him and didn’t change.
              </>
            )}
          </p>
        </div>
        <div className="story-step" data-step="2">
          <p className="kicker">Most changes</p>
          <p>
            Most redesigns weren’t about speed. They bunch up near zero mph and land <strong>above and below</strong>{" "}
            the line about equally. Added rise, new arm slots, more spin: no clear effect.
          </p>
          <p className="story-small">
            Their plain average gap: {fmt(otherMean)} runs per 100, and the dots scatter widely on both sides.
          </p>
        </div>
        <div className="story-step" data-step="3">
          <p className="kicker">The exception</p>
          <p>
            Pitches that gained <strong>2+ mph</strong> sit above the line. The white line, the average at each
            speed change, steps up once gains pass about 2 mph.
          </p>
          <p className="story-big">{veloEstimate}</p>
          <p className="story-small">runs saved per 100 pitches after matching and adjustment (95% range {veloRange}).</p>
        </div>
      </div>

      <div className="story-stage">
        <figure className="story-figure">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label="Scatter of every redesign: velocity change across, runs saved compared with look-alikes up. Velocity gainers sit above zero on average."
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
          >
            {[-4, -2, 0, 2, 4].map((t) => (
              <g key={`x${t}`}>
                <line className={t === 0 ? "sg-zero" : "sg-grid"} x1={sx(t)} x2={sx(t)} y1={M.t} y2={H - M.b} />
                <text className="sg-tick" x={sx(t)} y={H - M.b + 18} textAnchor="middle">
                  {t === 0 ? "0" : `${fmt(t, 0)}`}
                </text>
              </g>
            ))}
            {[-4, -2, 0, 2, 4].map((t) => (
              <g key={`y${t}`}>
                <line className={t === 0 ? "sg-zero" : "sg-grid"} x1={M.l} x2={W - M.r} y1={sy(t)} y2={sy(t)} />
                <text className="sg-tick" x={M.l - 10} y={sy(t) + 4} textAnchor="end">
                  {t === 0 ? "0" : fmt(t, 0)}
                </text>
              </g>
            ))}
            <text className="sg-axis" x={W - M.r} y={H - 6} textAnchor="end">
              mph faster →
            </text>
            <text className="sg-axis" x={M.l + 6} y={M.t + 12}>
              ↑ better than look-alikes
            </text>
            <rect
              className={`sg-band${step === 3 ? " on" : ""}`}
              x={sx(2)}
              y={M.t}
              width={sx(X[1]) - sx(2)}
              height={H - M.t - M.b}
            />
            <g>
              {rows.map((r, i) => (
                <circle
                  key={r.id}
                  className={dotClass(r)}
                  cx={sx(dv(r))}
                  cy={sy(r.gap)}
                  r={r.id === featuredId && step === 1 ? 9 : 4}
                  style={{ transitionDelay: step === 0 ? `${(i % 60) * 6}ms` : "0ms" }}
                />
              ))}
            </g>
            {step === 3 && trend.length > 1 && <path className="sg-trend" d={trendPath} pathLength={1} />}
            {step === 2 && (
              <line className="sg-mean" x1={sx(-2.5)} x2={sx(2.5)} y1={sy(otherMean)} y2={sy(otherMean)} />
            )}
            {shown && (
              <g className="sg-hover" transform={`translate(${sx(dv(shown))},${sy(shown.gap)})`}>
                <circle r={11} className="sg-ring" />
              </g>
            )}
          </svg>
          {shown && (
            <div
              className="story-tip"
              style={{
                left: `${(sx(dv(shown)) / W) * 100}%`,
                top: `${(sy(shown.gap) / H) * 100}%`,
              }}
              data-flip={sx(dv(shown)) > W * 0.6 ? "left" : "right"}
            >
              <strong>{shown.name}</strong>
              <span>
                {PITCH_NAME[shown.pitch] ?? shown.pitch}, {seasons(shown.pair)}
              </span>
              <span className="story-tip-change">{shown.change}</span>
              <span>
                {shown.velo[0].toFixed(1)} → {shown.velo[1].toFixed(1)} mph
              </span>
              <span>
                vs look-alikes: <b>{fmt(shown.gap)}</b>
              </span>
            </div>
          )}
          <figcaption className="story-cap">
            One dot = one pitcher’s pitch, one offseason. Single dots are noisy; the averages carry the claim. Values
            beyond ±5 are pinned to the edge.
          </figcaption>
        </figure>
      </div>
    </div>
  );
}
