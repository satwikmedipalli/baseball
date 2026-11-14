import Forest, { type ForestRow } from "@/components/Forest";
import { OUTCOMES, interval, signed, study, type EraKey } from "@/lib/study";

const REPO = "https://github.com/satwikmedipalli/shapeshift";
const ERAS: EraKey[] = ["all", "development", "confirmation"];

function Placebo() {
  const { estimates, actual } = study.placebo;
  const bins = 24;
  const lo = Math.min(...estimates, 0) * 1.1;
  const hi = Math.max(actual, ...estimates) * 1.1;
  const width = (hi - lo) / bins;
  const counts = Array.from({ length: bins }, (_, i) =>
    estimates.filter((e) => e >= lo + i * width && e < lo + (i + 1) * width).length,
  );
  const peak = Math.max(...counts);
  const x = (v: number) => ((v - lo) / (hi - lo)) * 600;
  const extreme = Math.round((study.placebo.share_as_extreme ?? 0) * estimates.length);
  return (
    <figure className="placebo">
      <svg viewBox="0 0 600 170" role="img" aria-label={`Histogram of ${estimates.length} placebo estimates centred near zero; the real estimate is ${signed(actual)}.`}>
        {counts.map((c, i) => (
          <rect
            key={i}
            className="placebo-bar"
            x={x(lo + i * width) + 1}
            y={140 - (c / peak) * 120}
            width={Math.max(600 / bins - 2, 1)}
            height={(c / peak) * 120}
            rx={2}
          >
            <title>{`${c} draws between ${signed(lo + i * width)} and ${signed(lo + (i + 1) * width)}`}</title>
          </rect>
        ))}
        <line className="placebo-actual" x1={x(actual)} x2={x(actual)} y1={10} y2={140} />
        <text className="placebo-label" x={x(actual) - 6} y={22} textAnchor="end">
          real redesigns {signed(actual)}
        </text>
        <line className="axis-line" x1={0} x2={600} y1={140} y2={140} />
        <line className="axis-zero" x1={x(0)} x2={x(0)} y1={136} y2={146} />
        <text className="axis-text" x={x(0)} y={162} textAnchor="middle">0</text>
      </svg>
      <figcaption>
        {estimates.length} runs of the full estimator with fake redesigns drawn from unchanged
        pitches. {extreme} of {estimates.length} came out as large as the real estimate.
      </figcaption>
    </figure>
  );
}

export default function Home() {
  const h = study.headline;
  const velocity = h.replicated_change_types.find((r) => r.change_label === "more velocity");
  const ride = study.change_types.find((r) => r.change_label === "more ride / less drop");
  const primary = h.primary.all;

  const changeRows: ForestRow[] = study.change_types.map((r) => ({
    id: r.change_label,
    label: r.change_label.charAt(0).toUpperCase() + r.change_label.slice(1),
    note: `n=${r.n}${r.q_value !== undefined ? `, q=${r.q_value.toFixed(3)}` : ""}`,
    effects: { all: r.all.d_xrv100, development: r.development.d_xrv100, confirmation: r.confirmation.d_xrv100 },
  }));

  const runRows: ForestRow[] = OUTCOMES.filter((o) => o.unit === "runs").map((o) => ({
    id: o.key,
    label: o.label,
    effects: Object.fromEntries(ERAS.map((era) => [era, study.results[era].effects[o.key]])),
  }));
  const rateRows: ForestRow[] = OUTCOMES.filter((o) => o.unit === "pp").map((o) => ({
    id: o.key,
    label: o.label + (o.lowerIsBetter ? " (lower is better)" : ""),
    effects: Object.fromEntries(ERAS.map((era) => [era, study.results[era].effects[o.key]])),
  }));
  const sensitivityRows: ForestRow[] = study.sensitivity
    .filter((s) => s.estimate !== undefined)
    .map((s) => ({
      id: s.specification,
      label: s.specification.charAt(0).toUpperCase() + s.specification.slice(1),
      note: `n=${s.n_treated}`,
      effects: { all: s as never },
    }));
  const pretrendRows: ForestRow[] = [
    {
      id: "before",
      label: "Season before the redesign",
      note: "should be near zero",
      effects: { development: h.pretrend.development, confirmation: h.pretrend.confirmation },
    },
    {
      id: "after",
      label: "Season of the redesign",
      effects: { development: h.primary.development, confirmation: h.primary.confirmation },
    },
  ];

  return (
    <div className="shell">
      <header className="topbar">
        <a href="#top" className="brand">ShapeShift</a>
        <nav aria-label="Sections">
          <a href="#findings">Findings</a>
          <a href="#average">Average</a>
          <a href="#checks">Checks</a>
          <a href="#method">Method</a>
          <a href={REPO}>Code</a>
        </nav>
      </header>

      <main id="top">
        <section className="hero">
          <p className="eyebrow">MLB pitch design · every Statcast pitch, 2020–2026</p>
          <h1>Which offseason pitch redesigns actually work?</h1>
          <p className="lead">
            Every winter, pitchers spend weeks in pitch labs adding velocity, chasing ride, or
            reshaping a slider. ShapeShift measures what those changes did once the season
            started. It compares {h.redesigns.toLocaleString()} redesigned pitches with{" "}
            {h.controls.toLocaleString()} closely matched pitches that did not change.
          </p>

          {velocity && (
            <div className="headline-card">
              <div>
                <p className="card-kicker">The change that reliably paid</p>
                <p className="card-title">More velocity</p>
                <p className="card-body">
                  Pitches that gained velocity saved about{" "}
                  <strong>{signed(velocity.effect.estimate)} runs per 100 pitches</strong>{" "}more
                  than matched pitches that didn&apos;t. That held in the development seasons
                  and the held-out seasons, and survived the correction for testing{" "}
                  {study.change_types.length} change types at once.
                </p>
              </div>
              <dl className="stat-grid">
                <div>
                  <dt>Runs saved / 100</dt>
                  <dd>{signed(velocity.effect.estimate)}</dd>
                  <span>95%: {interval(velocity.effect)}</span>
                </div>
                {velocity.whiff && (
                  <div>
                    <dt>Whiff rate</dt>
                    <dd>{signed(velocity.whiff.estimate * 100, 1)} pp</dd>
                    <span>95%: {interval(velocity.whiff, 100, 1)}</span>
                  </div>
                )}
                <div>
                  <dt>Redesigns</dt>
                  <dd>{velocity.n}</dd>
                  <span>q = {velocity.q_value.toFixed(3)}</span>
                </div>
              </dl>
            </div>
          )}
        </section>

        <section id="findings" className="section">
          <div className="section-head">
            <p className="eyebrow">Findings</p>
            <h2>Which redesigns paid off?</h2>
            <p>
              Each redesign is labelled by the feature that moved most. A row counts as a
              finding only if it survives the false-discovery adjustment (q below 0.05) and
              points the same way in both eras. Hover or tap a row for the numbers.
            </p>
          </div>
          <Forest
            rows={changeRows}
            eras={ERAS}
            unit="runs"
            caption="Effect of each type of redesign on luck-adjusted runs saved per 100 pitches"
          />
          <div className="callouts">
            {h.replicated_change_types.map((r) => (
              <div key={r.change_label} className="callout">
                <p className="callout-title">{r.change_label}</p>
                <p>
                  {signed(r.effect.estimate)} runs/100 overall; {signed(r.development.estimate)} in
                  development, {signed(r.confirmation.estimate)} held out.
                </p>
              </div>
            ))}
            {ride && (
              <div className="callout muted">
                <p className="callout-title">more ride</p>
                <p>
                  The most talked-about change: {signed(ride.all.d_xrv100?.estimate ?? 0)} runs/100 (
                  {interval(ride.all.d_xrv100)}). No average effect.
                </p>
              </div>
            )}
          </div>
          {h.velocity_check && (
            <p className="note">
              Is it just injured pitchers getting velocity back? {h.velocity_check.rebounds} of{" "}
              {h.velocity_check.gains} velocity gains only won back velocity lost the year before.
              Without them the effect is{" "}
              {signed(h.velocity_check.excluding_rebounds.d_xrv100.estimate)} (
              {interval(h.velocity_check.excluding_rebounds.d_xrv100)}).
            </p>
          )}
        </section>

        <section id="average" className="section">
          <div className="section-head">
            <p className="eyebrow">The average redesign</p>
            <h2>A small gain, and it depends on where you draw the line</h2>
            <p>
              Across all redesigns, the redesigned pitch saved {signed(primary.estimate)} runs per
              100 pitches ({interval(primary)}) more than its matches. That clears the placebo
              test, but it shrinks toward zero when the definition of a redesign is made looser
              or stricter (see checks). The change-type result is the stronger claim.
            </p>
          </div>
          <div className="two-up">
            <div>
              <h3>Runs</h3>
              <Forest rows={runRows} eras={ERAS} unit="runs" caption="Run outcomes of an average redesign" />
            </div>
            <div>
              <h3>Pitch results</h3>
              <Forest rows={rateRows} eras={ERAS} unit="pp" scale={100} digits={1} caption="Pitch-level rates for an average redesign" />
            </div>
          </div>
        </section>

        <section id="checks" className="section">
          <div className="section-head">
            <p className="eyebrow">Checks</p>
            <h2>Trying to break it</h2>
          </div>
          <div className="two-up">
            <div>
              <h3>Were redesigners already trending?</h3>
              <p className="small">
                The same comparison, one season earlier. If redesigners were already improving,
                the first row would be positive.
              </p>
              <Forest rows={pretrendRows} eras={["development", "confirmation"]} unit="runs" caption="Pre-trend versus effect" />
            </div>
            <div>
              <h3>Placebo</h3>
              <Placebo />
            </div>
          </div>
          <h3>Alternative specifications</h3>
          <p className="small">
            The main estimate under other reasonable choices. The definition of a redesign is
            the setting that moves it most.
          </p>
          <Forest rows={sensitivityRows} eras={["all"]} unit="runs" caption="Main estimate under alternative specifications" />
        </section>

        <section id="method" className="section">
          <div className="section-head">
            <p className="eyebrow">Method</p>
            <h2>How it works</h2>
          </div>
          <ol className="steps">
            <li>
              <strong>Find redesigns without looking at results.</strong>{" "}Compare each pitch&apos;s
              shape to last season on eight features, after removing league-wide drift. A
              redesign clears a coaching-sized threshold, beats measurement noise, and holds
              all season. A test checks that outcomes are never read here.
            </li>
            <li>
              <strong>Measure what hitters did, minus luck.</strong>{" "}Runs saved per 100 pitches,
              valuing each ball in play by its exit velocity and launch angle rather than where
              it landed.
            </li>
            <li>
              <strong>Compare like with like.</strong>{" "}Match each redesign to its five most
              similar unchanged pitches from the same pitch group and seasons, on shape, results,
              usage, age, and role. A regression adjustment removes what matching leaves.
            </li>
            <li>
              <strong>Honest uncertainty.</strong>{" "}95% intervals from resampling pitchers. On
              simulated leagues with a known answer, the intervals cover it 95% of the time.
            </li>
            <li>
              <strong>Hold seasons out.</strong>{" "}Rules were built on 2021–24; 2024–26 is reported
              separately, whatever it shows.
            </li>
          </ol>
          <div className="limits">
            <h3>What it can&apos;t tell you</h3>
            <p>
              It is observational. Matching handles what Statcast measures, not health, intent,
              grip, or a training program that changed several things at once. &ldquo;Redesign&rdquo;
              means a measured change, so velocity loss appears as a change type. Pitchers who
              dropped a change in spring, or lost their job, are not in the sample.
            </p>
          </div>
        </section>
      </main>

      <footer className="footer">
        <p>
          Data: MLB Baseball Savant via pybaseball. Run {study.created_at_utc.slice(0, 10)}, data
          fingerprint <code>{study.data_fingerprint}</code>. Independent project, not affiliated
          with MLB or any club.
        </p>
        <p>
          <a href={REPO}>Code, protocol, and full results</a> · Satwik Medipalli
        </p>
      </footer>
    </div>
  );
}
