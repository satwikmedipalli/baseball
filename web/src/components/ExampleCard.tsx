import { signed, study } from "@/lib/study";
import MovementPlot from "./MovementPlot";

function Dumbbell({
  label,
  before,
  after,
  min,
  max,
  format,
}: {
  label: string;
  before: number;
  after: number;
  min: number;
  max: number;
  format: (v: number) => string;
}) {
  const pos = (v: number) => `${((v - min) / (max - min)) * 100}%`;
  const [a, b] = before < after ? [before, after] : [after, before];
  return (
    <div className="bell">
      <span className="bell-label">{label}</span>
      <span className="bell-track" aria-label={`${label}: ${format(before)} before, ${format(after)} after`}>
        <span className="bell-bar" style={{ left: pos(a), width: `calc(${pos(b)} - ${pos(a)})` }} />
        <span className="bell-dot before" style={{ left: pos(before) }} />
        <span className="bell-dot after" style={{ left: pos(after) }} />
        <span className="bell-val before" style={{ left: pos(before) }}>{format(before)}</span>
        <span className="bell-val after" style={{ left: pos(after) }}>{format(after)}</span>
      </span>
    </div>
  );
}

export default function ExampleCard() {
  const ex = study.example;
  if (!ex) return null;
  const pct = (v: number) => `${(v * 100).toFixed(0)}%`;
  const avgMatch = ex.matches.reduce((s, m) => s + m.d_xrv100, 0) / ex.matches.length;
  const first = ex.name.split(" ")[0];
  const last = ex.name.split(" ").slice(1).join(" ");
  return (
    <div className="example">
      <div className="example-card">
        <p className="label">
          {ex.pitch} · {ex.season_pre} → {ex.season_post}
        </p>
        <h3 className="example-name">{ex.name}</h3>
        <MovementPlot
          pitch="four_seam"
          hb={[ex.before.run, ex.after.run]}
          ivb={[ex.before.ride, ex.after.ride]}
          velo={[ex.before.velocity, ex.after.velocity]}
          years={[String(ex.season_pre), String(ex.season_post)]}
        />
        <Dumbbell label="Whiff rate" before={ex.before.whiff_rate} after={ex.after.whiff_rate} min={0.05} max={0.3} format={pct} />
      </div>
      <div className="example-text">
        <p className="example-lead">
          {first} {last} came into {ex.season_post} throwing his fastball{" "}
          <strong>{(ex.after.velocity - ex.before.velocity).toFixed(1)} mph harder</strong>. Hitters swung through it
          more than twice as often.
        </p>
        <p>
          But pitchers improve for all kinds of reasons. So the study finds pitchers who looked like {last} the year
          before (same pitch, similar shape, similar results, similar age and role) and who <em>didn’t</em> change:
        </p>
        <ul className="matches">
          <li className="matches-head" aria-hidden="true">
            <span>Look-alike, same seasons</span>
            <span>Speed change</span>
            <span>Runs change</span>
          </li>
          {ex.matches.map((m) => (
            <li key={m.name}>
              <span>{m.name}</span>
              <span className="muted">{signed(m.d_velocity, 1)} mph</span>
              <span>{signed(m.d_xrv100)}</span>
            </li>
          ))}
        </ul>
        <p>
          {last} improved by <strong>{signed(ex.d_xrv100)}</strong> runs per 100 pitches. His look-alikes improved by{" "}
          {signed(avgMatch)} on average. The gap, <strong>{signed(ex.d_xrv100 - avgMatch)}</strong>, is the part
          credited to the redesign.
        </p>
        <p className="muted">
          One pitcher is an anecdote. He was also traded mid-season, which is exactly why one case proves nothing. The
          study repeats this comparison for every redesign that had a close match ({study.results.all.effects.d_xrv100.n_treated.toLocaleString()}{" "}
          of {study.headline.redesigns.toLocaleString()}) and averages.
        </p>
      </div>
    </div>
  );
}
