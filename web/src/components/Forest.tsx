"use client";

import { useMemo, useState } from "react";
import { ERA_LABEL, type EraKey, type Effect, interval, signed } from "@/lib/study";

export type ForestRow = {
  id: string;
  label: string;
  note?: string;
  effects: Partial<Record<EraKey, Effect | undefined>>;
};

type Props = {
  rows: ForestRow[];
  eras: EraKey[];
  scale?: number;
  unit: string;
  digits?: number;
  caption: string;
};

function niceTicks(min: number, max: number): { ticks: number[]; digits: number } {
  const span = max - min;
  const step = [0.1, 0.25, 0.5, 1, 2, 5].find((s) => span / s <= 6) ?? 10;
  const ticks: number[] = [];
  for (let t = Math.ceil(min / step) * step; t <= max + 1e-9; t += step) {
    ticks.push(Number(t.toFixed(6)));
  }
  const digits = step === 0.25 ? 2 : step < 1 ? 1 : 0;
  return { ticks, digits };
}

export default function Forest({ rows, eras, scale = 1, unit, digits = 2, caption }: Props) {
  const [active, setActive] = useState<string | null>(null);

  const [min, max] = useMemo(() => {
    let lo = 0;
    let hi = 0;
    for (const row of rows) {
      for (const era of eras) {
        const e = row.effects[era];
        if (!e) continue;
        lo = Math.min(lo, e.ci_low * scale);
        hi = Math.max(hi, e.ci_high * scale);
      }
    }
    const pad = (hi - lo) * 0.06;
    return [lo - pad, hi + pad];
  }, [rows, eras, scale]);

  const pos = (v: number) => `${((v - min) / (max - min)) * 100}%`;
  const { ticks, digits: tickDigits } = niceTicks(min, max);

  return (
    <figure className="forest">
      <figcaption className="sr-only">{caption}</figcaption>
      <div className="forest-legend" aria-hidden="true">
        {eras.map((era) => (
          <span key={era} className="legend-item">
            <span className={`legend-dot era-${era}`} />
            {ERA_LABEL[era]}
          </span>
        ))}
      </div>
      <ul className="forest-rows">
        {rows.map((row) => {
          const isActive = active === row.id;
          return (
            <li
              key={row.id}
              className={`forest-row${isActive ? " is-active" : ""}`}
              onMouseEnter={() => setActive(row.id)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(row.id)}
              onBlur={() => setActive(null)}
              onClick={() => setActive(isActive ? null : row.id)}
              tabIndex={0}
            >
              <div className="forest-label">
                <span>{row.label}</span>
                {row.note && <span className="forest-note">{row.note}</span>}
              </div>
              <div className="forest-track">
                <span className="forest-zero" style={{ left: pos(0) }} />
                {eras.map((era, i) => {
                  const e = row.effects[era];
                  if (!e) return null;
                  const top = `${((i + 1) / (eras.length + 1)) * 100}%`;
                  return (
                    <span key={era}>
                      <span
                        className={`forest-ci era-${era}`}
                        style={{
                          left: pos(e.ci_low * scale),
                          width: `calc(${pos(e.ci_high * scale)} - ${pos(e.ci_low * scale)})`,
                          top,
                        }}
                      />
                      <span
                        className={`forest-dot era-${era}`}
                        style={{ left: pos(e.estimate * scale), top }}
                      />
                    </span>
                  );
                })}
                {isActive && (
                  <div className="forest-tip" role="status">
                    <strong>{row.label}</strong>
                    {eras.map((era) => {
                      const e = row.effects[era];
                      if (!e) return null;
                      return (
                        <span key={era} className="tip-line">
                          <span className={`legend-dot era-${era}`} />
                          {ERA_LABEL[era]}: <b>{signed(e.estimate * scale, digits)}</b> {unit}
                          <span className="tip-ci">
                            {" "}
                            ({interval(e, scale, digits)}), n={e.n_treated}
                          </span>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="forest-axis" aria-hidden="true">
        <div className="forest-label" />
        <div className="forest-ticks">
          {ticks.map((t) => (
            <span key={t} style={{ left: pos(t) }}>
              {signed(t, tickDigits)}
            </span>
          ))}
        </div>
      </div>
      <p className="forest-unit">{unit === "pp" ? "percentage points" : `${unit} per 100 pitches`}, 95% interval. Positive is better for the pitcher.</p>
    </figure>
  );
}
