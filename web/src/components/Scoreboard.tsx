"use client";

import { useState } from "react";
import { capital, interval, signed, type Effect, type EraKey } from "@/lib/format";

export type BoardRow = {
  label: string;
  meaning: string;
  n: number;
  q?: number;
  held: boolean;
  all?: Effect;
  development?: Effect;
  confirmation?: Effect;
};

function EraLine({ label, effect }: { label: string; effect?: Effect }) {
  if (!effect) return null;
  return (
    <div className="era-line">
      <span className="era-name">{label}</span>
      <span className="era-value">
        <b>{signed(effect.estimate)}</b> <span className="muted">({interval(effect)}), {effect.n_treated} redesigns</span>
      </span>
    </div>
  );
}

export default function Scoreboard({ rows, eraLabel }: { rows: BoardRow[]; eraLabel: Record<EraKey, string> }) {
  const [open, setOpen] = useState<string | null>(null);
  const lo = Math.min(...rows.map((r) => r.all?.ci_low ?? 0), 0);
  const hi = Math.max(...rows.map((r) => r.all?.ci_high ?? 0), 0);
  const pad = (hi - lo) * 0.04;
  const MIN = lo - pad;
  const MAX = hi + pad;
  const pos = (v: number) => `${((v - MIN) / (MAX - MIN)) * 100}%`;
  const TICKS = [-1, -0.5, 0, 0.5, 1, 1.5, 2].filter((t) => t >= MIN && t <= MAX);
  return (
    <div className="board" aria-label="Effect of each kind of pitch change">
      <div className="board-head">
        <span>Change</span>
        <span className="board-scale-head">
          Runs saved per 100 pitches, with 95% range
        </span>
        <span className="board-verdict-head">Verdict</span>
      </div>
      {rows.map((row) => {
        const e = row.all;
        if (!e) return null;
        const held = row.held;
        const isOpen = open === row.label;
        return (
          <div key={row.label} className={`board-row${held ? " held" : ""}${isOpen ? " open" : ""}`}>
            <button
              type="button"
              className="board-main"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : row.label)}
            >
              <span className="board-name">
                <span className="board-label">{capital(row.label)}</span>
                <span className="board-meaning">{row.meaning}</span>
              </span>
              <span className="board-track" aria-label={`${signed(e.estimate)} runs per 100 pitches, range ${interval(e)}`}>
                <span className="board-zero" style={{ left: pos(0) }} />
                <span className="board-ci" style={{ left: pos(e.ci_low), width: `calc(${pos(e.ci_high)} - ${pos(e.ci_low)})` }} />
                <span className="board-dot" style={{ left: pos(e.estimate) }} />
                <span className="board-num" style={{ left: pos(e.ci_high) }}>{signed(e.estimate)}</span>
              </span>
              <span className="board-verdict">
                <span className={`badge ${held ? "badge-yes" : "badge-no"}`}>{held ? "Held up" : "No clear effect"}</span>
                <span className="board-n">{row.n} redesigns</span>
              </span>
            </button>
            {isOpen && (
              <div className="board-detail">
                <EraLine label={eraLabel.development} effect={row.development} />
                <EraLine label={eraLabel.confirmation} effect={row.confirmation} />
                <p className="muted">
                  Adjusted for testing {rows.length} changes at once, q ={" "}
                  <b>{row.q?.toFixed(3) ?? "n/a"}</b>. A change “held up” only if q is below 0.05 and it
                  pointed the same way in both sets of seasons.
                </p>
              </div>
            )}
          </div>
        );
      })}
      <div className="board-axis" aria-hidden="true">
        <span />
        <span className="board-ticks">
          {TICKS.map((t) => (
            <span key={t} style={{ left: pos(t) }}>
              {t === 0 ? "0" : signed(t, 1)}
            </span>
          ))}
        </span>
        <span />
      </div>
      <p className="board-foot">
        Right of zero means the pitch got better for the pitcher. The line is the 95% range: if it crosses zero, the
        data can’t rule out no effect. Tap a row for the season-by-season split.
      </p>
    </div>
  );
}
