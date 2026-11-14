import Checks from "@/components/Checks";
import ExampleCard from "@/components/ExampleCard";
import PitcherSearch from "@/components/PitcherSearch";
import Reveal from "@/components/Reveal";
import Scoreboard, { type BoardRow } from "@/components/Scoreboard";
import BallparkHero from "@/components/BallparkHero3D";
import StoryChart from "@/components/StoryChart";
import { CHANGE_MEANING, ERA_LABEL, interval, signed, study } from "@/lib/study";

const REPO = "https://github.com/satwikmedipalli/baseball";

export default function Home() {
  const h = study.headline;
  const velo = h.replicated_change_types.find((r) => r.change_label === "more velocity");
  const held = h.replicated_change_types.length;
  const total = study.change_types.length;
  const perSeason = study.pitches_per_season;
  const seasonRuns = velo && perSeason ? (velo.effect.estimate * perSeason) / 100 : null;
  const span = study.data ? `${study.data.first_season} to ${study.data.last_season}` : "2020 to 2026";
  const heldUp = new Set(h.replicated_change_types.map((r) => r.change_label));
  const boardRows: BoardRow[] = [...study.change_types]
    .sort((a, b) => (b.all.d_xrv100?.estimate ?? 0) - (a.all.d_xrv100?.estimate ?? 0))
    .map((r) => ({
      label: r.change_label,
      meaning: CHANGE_MEANING[r.change_label] ?? "",
      n: r.n,
      q: r.q_value,
      held: heldUp.has(r.change_label),
      all: r.all.d_xrv100,
      development: r.development.d_xrv100,
      confirmation: r.confirmation.d_xrv100,
    }));
  const sens = study.sensitivity.filter((s) => s.estimate !== undefined).map((s) => s.estimate as number);

  return (
    <>
      <header className="topbar">
        <div className="wrap topbar-inner">
          <a href="#top" className="brand">
            <span className="brand-mark">SM</span>
            <span>
              Satwik Medipalli <span className="brand-sub">/ Baseball</span>
            </span>
          </a>
          <nav aria-label="Sections">
            <a href="#story">The data</a>
            <a href="#scoreboard">Scoreboard</a>
            <a href="#explore">Look up a pitcher</a>
            <a href="#trust">Why believe it</a>
            <a href="#method">Method</a>
            <a href={REPO}>Code ↗</a>
          </nav>
        </div>
      </header>

      <main id="top">
        <BallparkHero
          redesigns={h.redesigns}
          seasons={study.data ? `${study.data.first_season}–${study.data.last_season}` : "2020–2026"}
        />

        <section id="answer" className="intro">
          <div className="wrap">
            <p className="kicker">In plain English</p>
            <div className="intro-grid">
              <div className="intro-col">
                <span className="intro-n">01</span>
                <h2 className="intro-h">The question</h2>
                <p>
                  Teams and private pitch labs now redesign pitches every winter, using high-speed cameras and ball
                  tracking. A pitcher might add 2 mph, change how much the ball rises, or drop his arm angle. The pitch
                  looks different on the radar. <strong>But does it get hitters out more often?</strong>
                </p>
              </div>
              <div className="intro-col">
                <span className="intro-n">02</span>
                <h2 className="intro-h">What I did</h2>
                <p>
                  I took every pitch thrown in MLB from {span} (
                  {study.data ? `${study.data.pitches.toLocaleString()} pitches, ` : ""}public Statcast data) and found {h.redesigns.toLocaleString()} cases where a pitcher’s pitch changed a lot
                  from one season to the next. Then I compared each one with similar pitchers whose pitch{" "}
                  <em>didn’t</em> change, so the difference can be credited to the redesign and not to luck, age, or a
                  league-wide trend.
                </p>
              </div>
              <div className="intro-col">
                <span className="intro-n">03</span>
                <h2 className="intro-h">What I found</h2>
                <p>
                  Of {total} kinds of change, only {held === 2 ? "two" : held} reliably made pitches better.{" "}
                  <strong>The clearest is simply throwing harder.</strong> Most other changes, including the popular
                  ones like adding “ride” to a fastball, showed no clear effect on results.
                </p>
              </div>
            </div>

            {velo && (
              <div className="answer-band">
                <div className="answer-big">
                  <p className="kicker">The headline number</p>
                  <p className="answer-num">{signed(velo.effect.estimate)}</p>
                  <p className="answer-unit">runs saved per 100 pitches, when a pitch gains 2+ mph</p>
                </div>
                <div className="answer-plain">
                  {seasonRuns !== null && (
                    <p>
                      A typical pitch is thrown about {perSeason} times a season. At that rate, gaining velocity is
                      worth about <strong>{seasonRuns.toFixed(1)} fewer runs allowed per season</strong>, from one
                      pitch alone.
                    </p>
                  )}
                  {velo.whiff && (
                    <p>
                      Hitters also swung and missed <strong>{signed(velo.whiff.estimate * 100, 1)} percentage points</strong>{" "}
                      more often against it.
                    </p>
                  )}
                  <p className="muted">
                    Based on {velo.n} velocity gains. 95% range {interval(velo.effect)}: even the cautious end is
                    clearly above zero.
                  </p>
                </div>
              </div>
            )}

            <div className="glossary">
              <p className="kicker">How to read the numbers on this page</p>
              <dl>
                <div>
                  <dt>Runs saved per 100 pitches</dt>
                  <dd>
                    How many runs a pitch prevents, compared with an average pitch, for every 100 thrown. Positive is
                    good for the pitcher. It judges balls in play by how hard they were hit, not where they landed, to
                    strip out luck.
                  </dd>
                </div>
                <div>
                  <dt>Redesign</dt>
                  <dd>
                    A change to a pitch from one season to the next that is big enough to matter (e.g. 2+ mph faster),
                    bigger than measurement noise, and lasts the whole season.
                  </dd>
                </div>
                <div>
                  <dt>Look-alikes</dt>
                  <dd>
                    Up to {study.config.n_controls} pitchers who threw the same pitch, looked similar the year before,
                    and didn’t change it. The redesign gets credit only for improvement beyond theirs.
                  </dd>
                </div>
                <div>
                  <dt>95% range</dt>
                  <dd>
                    The range the true effect very likely falls in. If it includes zero, the data can’t rule out “no
                    effect”.
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </section>

        <section id="story" className="story-section">
          <div className="wrap">
            <div className="section-head story-head">
              <p className="kicker">See it in the data · scroll</p>
              <h2>
                {h.redesigns.toLocaleString()} redesigns. <em>One pattern.</em>
              </h2>
            </div>
            {velo && (
              <StoryChart
                featuredId={study.example?.id ?? null}
                featuredName={study.example?.name ?? ""}
                veloEstimate={signed(velo.effect.estimate)}
                veloRange={interval(velo.effect)}
              />
            )}
          </div>
        </section>

        <section id="example" className="section">
          <div className="wrap">
            <div className="section-head">
              <p className="kicker">01 · What a redesign looks like</p>
              <h2>
                One pitcher, <em>then</em> a thousand.
              </h2>
            </div>
            <ExampleCard />
          </div>
        </section>

        <section id="scoreboard" className="section section-alt">
          <div className="wrap">
            <div className="section-head">
              <p className="kicker">02 · The scoreboard</p>
              <h2>
                {total} kinds of change. <em>{held === 1 ? "One" : held === 2 ? "Two" : held} held up.</em>
              </h2>
              <p>
                Each redesign is named for the thing that changed most. Ranked by effect on runs. A change counts only
                if it survives a correction for testing {total} things at once and shows up in both early and late
                seasons.
              </p>
            </div>
            <Scoreboard rows={boardRows} eraLabel={ERA_LABEL} />
            <div className="aside-note">
              <p className="kicker">What about the average redesign?</p>
              <p>
                Across every change, the redesigned pitch did a little better than its look-alikes:{" "}
                <strong>{signed(h.primary.all.estimate)}</strong> runs per 100 ({interval(h.primary.all)}). But that
                number moves from {signed(Math.min(...sens))} to {signed(Math.max(...sens))} depending on how big a
                change has to be to count. Treat it as “small, maybe”. The velocity result doesn’t have that problem.
              </p>
            </div>
          </div>
        </section>

        <section id="explore" className="section explore-section">
          <div className="wrap">
            <div className="section-head">
              <p className="kicker">03 · Look up a pitcher</p>
              <h2>
                Find your guy. <em>See what changed.</em>
              </h2>
              <p>
                Every redesign in the study with a close match, searchable by name. Watch the pitch move from one season
                to the next, and see how it did against pitchers who didn’t change.
              </p>
            </div>
            <PitcherSearch initial={study.example?.name ?? "Cole Ragans"} />
          </div>
        </section>

        <section id="trust" className="section">
          <div className="wrap">
            <div className="section-head">
              <p className="kicker">04 · Why believe it</p>
              <h2>
                Four ways it <em>could</em> have been wrong.
              </h2>
              <p>Each one was checked. None of them explain the result.</p>
            </div>
            <Reveal>
              <Checks />
            </Reveal>
          </div>
        </section>

        <section id="method" className="section section-alt">
          <div className="wrap">
            <div className="section-head">
              <p className="kicker">05 · How it works</p>
              <h2>
                Built to be <em>challenged.</em>
              </h2>
            </div>
            <ol className="steps">
              <li>
                <span className="step-n">01</span>
                <h3>Find the changes</h3>
                <p>
                  Compare every pitch to its previous season on speed, movement, spin, and release. A redesign is a
                  coach-sized change that beats measurement noise and lasts all season. Results are never looked at
                  here.
                </p>
              </li>
              <li>
                <span className="step-n">02</span>
                <h3>Score the pitch, minus luck</h3>
                <p>
                  Runs saved per 100 pitches, judging balls in play by how hard and at what angle they were hit, not
                  where they landed.
                </p>
              </li>
              <li>
                <span className="step-n">03</span>
                <h3>Find look-alikes</h3>
                <p>
                  Match each redesign to up to {study.config.n_controls} pitchers with the same pitch who looked similar
                  the year before but didn’t change. Compare how much each side improved.
                </p>
              </li>
              <li>
                <span className="step-n">04</span>
                <h3>Hold seasons back</h3>
                <p>
                  Set every rule on early seasons, then check the later ones once. Uncertainty comes from resampling
                  pitchers, and it was tested on simulated leagues with a known answer.
                </p>
              </li>
            </ol>
            <div className="limits">
              <p className="kicker">What it can’t tell you</p>
              <p>
                This is observational. It controls for what Statcast measures, not health, intent, grip, or a whole
                training program changing at once. Pitchers who choose to redesign may also differ in ways it can’t see, like
                access to a pitch lab or a healthy winter. Pitchers who abandoned a change in spring, or lost their job, never
                make the sample. And “works on average” doesn’t mean it works for every arm.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="wrap footer-inner">
          <p>
            <strong>Satwik Medipalli</strong> · Baseball research
          </p>
          <p className="muted">
            Data: MLB Baseball Savant, via pybaseball. Run {study.created_at_utc.slice(0, 10)}, data{" "}
            <code>{study.data_fingerprint.slice(0, 12)}</code>. Independent work, not affiliated with MLB or any club.
          </p>
          <p>
            <a href={REPO}>Code, protocol, and full results ↗</a>
          </p>
        </div>
      </footer>
    </>
  );
}
