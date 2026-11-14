"use client";

import { useEffect, useRef, useState } from "react";

/*
  Playback is on a clock, not on scroll. Keyframes map seconds to the
  engine's timeline (0–1): the headline holds, the camera pushes in, the
  windup, the pitch, the cut, the ball flying at the viewer, the fade.
  Then the page scrolls itself to the findings.
*/
const PLAY: [number, number][] = [
  [0, 0],
  [2.6, 0],
  [3.5, 0.1],
  [4.8, 0.27],
  [5.45, 0.41],
  [5.8, 0.445],
  [8.6, 0.88],
  [9.3, 1],
];
const END = PLAY[PLAY.length - 1][0];
function playhead(t: number) {
  for (let i = 1; i < PLAY.length; i++) {
    const [t1, p1] = PLAY[i];
    if (t <= t1) {
      const [t0, p0] = PLAY[i - 1];
      return p0 + ((p1 - p0) * (t - t0)) / (t1 - t0);
    }
  }
  return 1;
}
import BallparkHero from "./BallparkHero";

/*
  The 3D at-bat (three.js), scrubbed by scroll. The engine is loaded on the
  client only; without WebGL, or with reduced motion, the SVG hero stands in.
*/

function webglOK() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export default function BallparkHero3D({ redesigns, seasons }: { redesigns: number; seasons: string }) {
  const [mode, setMode] = useState<"3d" | "svg">("3d");
  const section = useRef<HTMLElement | null>(null);
  const stage = useRef<HTMLDivElement | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const replay = useRef<() => void>(() => {});
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !webglOK()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time capability check on mount
      setMode("svg");
      return;
    }
    let alive = true;
    let engine: { start(): void; stop(): void; resize(w: number, h: number): void; dispose(): void } | null = null;
    let io: IntersectionObserver | null = null;
    let ro: ResizeObserver | null = null;

    // Plays once on load when the reader is at the top; any scroll, key or
    // tap during the intro skips straight to the findings.
    let playing = window.scrollY < 40 && !location.hash;
    let t0 = performance.now();
    let auto = false;
    const toAnswer = () => {
      auto = true;
      document.getElementById("answer")?.scrollIntoView({ behavior: "smooth" });
    };
    const finish = (scroll: boolean) => {
      if (!playing) return;
      playing = false;
      setDone(true);
      if (scroll) toAnswer();
    };
    const progress = () => {
      if (!playing) return 0;
      const t = (performance.now() - t0) / 1000;
      if (t >= END) finish(true);
      return playhead(t);
    };
    const skip = () => finish(true);
    const onScroll = () => {
      if (playing && !auto && window.scrollY > 40) finish(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (["ArrowDown", "PageDown", " ", "End", "Escape"].includes(e.key)) skip();
    };
    window.addEventListener("wheel", skip, { passive: true });
    window.addEventListener("touchmove", skip, { passive: true });
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, { passive: true });
    replay.current = () => {
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
      auto = false;
      t0 = performance.now() - 2000;
      playing = true;
      setDone(false);
    };

    import("./ballpark3d/engine")
      .then(({ createBallpark }) => {
        if (!alive || !canvas.current || !stage.current || !section.current) return;
        const hud = Object.fromEntries(
          [...stage.current.querySelectorAll<HTMLElement>("[data-hud]")].map((el) => [el.dataset.hud, el]),
        ) as unknown as Parameters<typeof createBallpark>[1];
        try {
          engine = createBallpark(canvas.current, hud, progress);
        } catch {
          setMode("svg");
          return;
        }
        const el = stage.current;
        engine.resize(el.clientWidth, el.clientHeight);
        ro = new ResizeObserver(() => engine?.resize(el.clientWidth, el.clientHeight));
        ro.observe(el);
        io = new IntersectionObserver(([e]) => (e.isIntersecting ? engine?.start() : engine?.stop()), { rootMargin: "100px" });
        io.observe(section.current);
      })
      .catch(() => alive && setMode("svg"));

    return () => {
      alive = false;
      window.removeEventListener("wheel", skip);
      window.removeEventListener("touchmove", skip);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll);
      io?.disconnect();
      ro?.disconnect();
      engine?.dispose();
    };
  }, []);

  if (mode === "svg") return <BallparkHero redesigns={redesigns} seasons={seasons} />;

  return (
    <section ref={section} className="bp3" aria-label="Introduction">
      <div ref={stage} className="bp3-stage">
        <canvas
          ref={canvas}
          className="bp3-canvas"
          role="img"
          aria-label="A night game: the pitcher delivers, the batter hits a home run deep to left-centre, and the crowd erupts."
        />
        <div className="bp3-shade" aria-hidden="true" />

        <div data-hud="text" className="bp3-text">
          <p className="bp3-eyebrow">An independent baseball research project · Satwik Medipalli</p>
          <h1 className="bp3-h">
            Does redesigning a pitch <em>actually work?</em>
          </h1>
          <p className="bp3-sub">
            Every offseason, MLB pitchers rebuild their pitches: throwing harder, adding movement, changing their arm
            slot. I tracked {redesigns.toLocaleString()} of those changes across the {seasons} seasons to find out which
            ones actually led to better results.
          </p>
          <a className="bp3-cta" href="#answer">
            Get the answer <span aria-hidden="true">↓</span>
          </a>
        </div>

        <div aria-hidden="true">
          <div data-hud="live" className="bp3-live" style={{ opacity: 0 }}>
            <i /> Live
          </div>
          <div data-hud="bug" className="bp3-bug" style={{ opacity: 0 }}>
            <div className="bp3-teams">
              <span className="away" data-hud="score">
                VIS 3
              </span>
              <span className="home">HOME 4</span>
            </div>
            <div className="bp3-state">
              <span className="inn">▲9</span>
              <span className="bases">
                <b className="on" />
                <b />
                <b />
              </span>
              <span className="count">3–2</span>
              <span className="outs">
                <b className="on" />
                <b className="on" />
              </span>
            </div>
          </div>
          <div data-hud="pitch" className="bp3-pitch" style={{ opacity: 0 }}>
            <strong>97.8</strong> mph <span>4-seam fastball</span>
          </div>
          <div data-hud="exit" className="bp3-exit" style={{ opacity: 0 }}>
            <p className="bp3-exit-h">Home run</p>
            <dl>
              <div>
                <dt>Exit velo</dt>
                <dd>111.4 mph</dd>
              </div>
              <div>
                <dt>Launch</dt>
                <dd>27°</dd>
              </div>
              <div>
                <dt>Distance</dt>
                <dd>
                  <span data-hud="dist">0</span> ft
                </dd>
              </div>
            </dl>
          </div>
          <div data-hud="flash" className="bp3-flash" style={{ opacity: 0 }} />
          <div data-hud="fade" className="bp3-fade" style={{ opacity: 0 }} />
        </div>

        <p data-hud="hint" className="bp3-hint" aria-hidden="true" hidden={done}>
          Play ball
        </p>
        {done && (
          <button type="button" className="bp3-replay" onClick={() => replay.current()}>
            ↻ Replay
          </button>
        )}
      </div>
    </section>
  );
}
