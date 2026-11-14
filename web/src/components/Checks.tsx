import { interval, signed, study, type Effect } from "@/lib/study";

function Bars({ rows, min, max }: { rows: { label: string; effect: Effect; strong?: boolean }[]; min: number; max: number }) {
  const pos = (v: number) => `${((v - min) / (max - min)) * 100}%`;
  return (
    <div className="bars">
      {rows.map((r) => (
        <div key={r.label} className={`bars-row${r.strong ? " strong" : ""}`}>
          <span className="bars-label">{r.label}</span>
          <span className="bars-track" aria-label={`${r.label}: ${signed(r.effect.estimate)}, range ${interval(r.effect)}`}>
            <span className="bars-zero" style={{ left: pos(0) }} />
            <span className="bars-ci" style={{ left: pos(r.effect.ci_low), width: `calc(${pos(r.effect.ci_high)} - ${pos(r.effect.ci_low)})` }} />
            <span className="bars-dot" style={{ left: pos(r.effect.estimate) }} />
          </span>
          <span className="bars-num">{signed(r.effect.estimate)}</span>
        </div>
      ))}
    </div>
  );
}

function Placebo() {
  const { estimates, actual } = study.placebo;
  const bins = 22;
  const lo = Math.min(...estimates, 0);
  const hi = Math.max(actual, ...estimates) * 1.08;
  const w = (hi - lo) / bins;
  const counts = Array.from({ length: bins }, (_, i) => estimates.filter((e) => e >= lo + i * w && e < lo + (i + 1) * w).length);
  const peak = Math.max(...counts);
  const x = (v: number) => ((v - lo) / (hi - lo)) * 300;
  return (
    <svg className="placebo" viewBox="0 0 300 110" role="img" aria-label={`${estimates.length} fake studies, all near zero; the real result is ${signed(actual)}.`}>
      {counts.map((c, i) => (
        <rect key={i} className="placebo-bar" x={x(lo + i * w) + 0.75} y={88 - (c / peak) * 70} width={300 / bins - 1.5} height={(c / peak) * 70} rx={1.5} />
      ))}
      <line className="placebo-real" x1={x(actual)} x2={x(actual)} y1={8} y2={88} />
      <text className="placebo-text strong" x={x(actual) - 5} y={16} textAnchor="end">real: {signed(actual)}</text>
      <text className="placebo-text" x={x(0)} y={104} textAnchor="middle">0</text>
      <line className="placebo-base" x1={0} x2={300} y1={88} y2={88} />
    </svg>
  );
}

export default function Checks() {
  const h = study.headline;
  const velo = h.replicated_change_types.find((r) => r.change_label === "more velocity");
  const vc = h.velocity_check;
  const extreme = Math.round((study.placebo.share_as_extreme ?? 0) * study.placebo.estimates.length);
  const dev = study.config.development_pairs;
  const conf = study.config.confirmation_pairs;
  return (
    <div className="checks">
      {velo && (
        <article className="check">
          <p className="label">01 · Fresh seasons</p>
          <h3>It held up on seasons the rules never saw</h3>
          <p>
            Every rule was set using {dev[0][0]}–{dev[dev.length - 1][1]}. The later seasons were checked once, at
            the end. The velocity effect showed up in both.
          </p>
          <Bars
            min={-0.1}
            max={1.6}
            rows={[
              { label: `${dev[0][0]}–${String(dev[dev.length - 1][1]).slice(2)}`, effect: velo.development },
              { label: `${conf[0][0]}–${String(conf[conf.length - 1][1]).slice(2)}`, effect: velo.confirmation, strong: true },
            ]}
          />
        </article>
      )}
      <article className="check">
        <p className="label">02 · No head start</p>
        <h3>Redesigners weren’t already improving</h3>
        <p>
          If pitchers who change were already on the way up, the year <em>before</em> the change would look good too.
          It doesn’t.
        </p>
        <Bars
          min={-0.4}
          max={0.45}
          rows={[
            { label: "Year before", effect: h.pretrend.all },
            { label: "Year of change", effect: h.primary.all, strong: true },
          ]}
        />
      </article>
      <article className="check">
        <p className="label">03 · Not luck</p>
        <h3>Fake redesigns find nothing</h3>
        <p>
          The whole study was rerun {study.placebo.estimates.length} times with fake “redesigns” picked from pitchers
          who changed nothing. {extreme} of {study.placebo.estimates.length} came close to the real result.
        </p>
        <Placebo />
      </article>
      {vc && velo && (
        <article className="check">
          <p className="label">04 · Not just healing</p>
          <h3>It isn’t injured arms getting velocity back</h3>
          <p>
            {vc.rebounds} of the {vc.gains} velocity gains only regained speed lost the year before. Taking them out
            leaves the effect where it was.
          </p>
          <Bars
            min={-0.1}
            max={1.6}
            rows={[
              { label: "All gains", effect: velo.effect },
              { label: "Without rebounds", effect: vc.excluding_rebounds.d_xrv100, strong: true },
            ]}
          />
        </article>
      )}
    </div>
  );
}
