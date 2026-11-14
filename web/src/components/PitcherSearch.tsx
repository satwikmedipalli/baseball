"use client";

import { useId, useMemo, useState } from "react";
import { PITCH_NAME, seasons, useRedesigns, type Redesign } from "@/lib/redesigns";
import MovementPlot from "./MovementPlot";

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const fmt = (v: number, d = 2) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(d)}`;

function Card({ r }: { r: Redesign }) {
  const [a, b] = r.pair.split("-");
  const better = r.gap > 0;
  return (
    <article className="pc">
      <header className="pc-head">
        <div>
          <p className="label">
            {PITCH_NAME[r.pitch] ?? r.pitch} · {seasons(r.pair)}
          </p>
          <h4>{r.change.charAt(0).toUpperCase() + r.change.slice(1)}</h4>
        </div>
        <span className={`pc-verdict ${better ? "up" : "down"}`}>
          {fmt(r.gap)}
          <small>vs look-alikes</small>
        </span>
      </header>
      <MovementPlot hb={r.hb} ivb={r.ivb} velo={r.velo} years={[a, b]} pitch={r.pitch} size="sm" />
      <dl className="pc-stats">
        <div>
          <dt>Whiff rate</dt>
          <dd>
            {(r.whiff[0] * 100).toFixed(0)}% → {(r.whiff[1] * 100).toFixed(0)}%
          </dd>
        </div>
        <div>
          <dt>Spin</dt>
          <dd>
            {r.spin[0]} → {r.spin[1]}
          </dd>
        </div>
        <div>
          <dt>His change</dt>
          <dd>{fmt(r.own)}</dd>
        </div>
        <div>
          <dt>Look-alikes’ change</dt>
          <dd>{fmt(r.matched)}</dd>
        </div>
      </dl>
      {r.rebound && <p className="pc-note">Rebound: this mostly regained something lost the season before.</p>}
    </article>
  );
}

export default function PitcherSearch({ initial }: { initial: string }) {
  const data = useRedesigns();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(initial);
  const [focused, setFocused] = useState(false);

  const names = useMemo(() => {
    const set = new Map<string, number>();
    for (const r of data?.redesigns ?? []) set.set(r.name, (set.get(r.name) ?? 0) + 1);
    return [...set.keys()].sort((a, b) => a.localeCompare(b));
  }, [data]);

  const suggestions = useMemo(() => {
    const q = fold(query.trim());
    if (!q) return [];
    return names.filter((n) => fold(n).includes(q)).slice(0, 8);
  }, [names, query]);

  const tryNames = useMemo(() => {
    const rows = [...(data?.redesigns ?? [])]
      .filter((r) => r.change === "more velocity" && r.name !== initial)
      .sort((a, b) => b.velo[1] - b.velo[0] - (a.velo[1] - a.velo[0]));
    return [...new Set(rows.map((r) => r.name))].slice(0, 5);
  }, [data, initial]);

  const cards = (data?.redesigns ?? []).filter((r) => r.name === selected).sort((a, b) => a.pair.localeCompare(b.pair));

  function choose(name: string) {
    setSelected(name);
    setQuery("");
    setFocused(false);
  }

  return (
    <div className="search">
      <div className="search-bar">
        <label htmlFor={`${listId}-input`} className="sr-only">
          Search pitchers
        </label>
        <div className="search-box">
          <span aria-hidden="true" className="search-icon">⌕</span>
          <input
            id={`${listId}-input`}
            type="search"
            autoComplete="off"
            placeholder={data ? `Search ${names.length.toLocaleString()} pitchers…` : "Loading pitchers…"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 120)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && suggestions[0]) choose(suggestions[0]);
            }}
            role="combobox"
            aria-expanded={focused && suggestions.length > 0}
            aria-controls={`${listId}-list`}
          />
        </div>
        {focused && suggestions.length > 0 && (
          <ul className="search-list" id={`${listId}-list`} role="listbox">
            {suggestions.map((n) => (
              <li key={n} role="option" aria-selected={false} onMouseDown={() => choose(n)}>
                {n}
              </li>
            ))}
          </ul>
        )}
        {focused && query.trim() && suggestions.length === 0 && data && (
          <p className="search-empty">No redesign found for “{query}”. Only pitchers whose change had a close match are here.</p>
        )}
      </div>
      <div className="search-try">
        <span>Try</span>
        {[initial, ...tryNames].map((n) => (
          <button key={n} type="button" className={n === selected ? "on" : ""} onClick={() => choose(n)}>
            {n}
          </button>
        ))}
      </div>

      <div className="search-result" aria-live="polite">
        <h3 className="search-name">
          {selected}
          <span>
            {cards.length} redesign{cards.length === 1 ? "" : "s"}
          </span>
        </h3>
        <div className="pc-grid">
          {cards.map((r) => (
            <Card key={r.id} r={r} />
          ))}
        </div>
        <p className="search-foot">
          “vs look-alikes” is this pitch’s change in runs saved per 100, minus the average change of pitchers who
          looked like him and didn’t change. One case is noisy: treat it as a story, not a verdict.
        </p>
      </div>
    </div>
  );
}
