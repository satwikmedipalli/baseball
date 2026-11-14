import data from "../../public/study.json";
import type { Effect, EraKey } from "./format";

export * from "./format";


export type ChangeType = {
  study_group: string;
  change_label: string;
  n: number;
  q_value?: number;
} & Record<EraKey, Record<string, Effect | undefined>>;

type Side = { velocity: number; ride: number; run: number; whiff_rate: number; xrv100: number; pitches: number };

export type Example = {
  id: number;
  name: string;
  pitch: string;
  season_pre: number;
  season_post: number;
  before: Side;
  after: Side;
  d_xrv100: number;
  matches: { name: string; d_velocity: number; d_xrv100: number; d_whiff_rate: number }[];
};

type Study = {
  created_at_utc: string;
  data_fingerprint: string;
  data: { pitches: number; first_season: number; last_season: number } | null;
  config: {
    material_change: Record<string, number>;
    development_pairs: number[][];
    confirmation_pairs: number[][];
    n_controls: number;
    n_placebo: number;
  };
  headline: {
    pitch_seasons: number;
    redesigns: number;
    controls: number;
    primary: Record<EraKey, Effect>;
    whiff: Record<EraKey, Effect>;
    pretrend: Record<EraKey, Effect>;
    replicated_change_types: {
      change_label: string;
      n: number;
      q_value: number;
      effect: Effect;
      whiff?: Effect;
      development: Effect;
      confirmation: Effect;
    }[];
    velocity_check?: {
      gains: number;
      rebounds: number;
      excluding_rebounds: Record<string, Effect>;
    };
  };
  results: Record<EraKey, { effects: Record<string, Effect>; matched_share: number }>;
  change_types: ChangeType[];
  sensitivity: ({ specification: string } & Partial<Effect>)[];
  placebo: { estimates: number[]; actual: number; share_as_extreme: number | null };
  example: Example | null;
  pitches_per_season: number | null;
};

export const study = data as unknown as Study;

const span = (pairs: number[][]) => `${pairs[0][0]}–${String(pairs[pairs.length - 1][1]).slice(2)}`;

export const ERA_LABEL: Record<EraKey, string> = {
  all: "All seasons",
  development: `Seasons the rules were built on, ${span(study.config.development_pairs)}`,
  confirmation: `Seasons held back for checking, ${span(study.config.confirmation_pairs)}`,
};

/** What each change type means, using the study's own thresholds. */
const m = study.config.material_change;
const inches = (feet: number) => Math.round(feet * 12);
export const CHANGE_MEANING: Record<string, string> = {
  "more velocity": `Threw the pitch at least ${m.release_speed} mph harder`,
  "less velocity": `Threw it at least ${m.release_speed} mph softer`,
  "more extension": `Released it at least ${inches(m.release_extension)} inches closer to the plate`,
  "less extension": `Released it at least ${inches(m.release_extension)} inches farther from the plate`,
  "more ride / less drop": `At least ${m.induced_vertical_break} inches more rise (or less drop)`,
  "less ride / more drop": `At least ${m.induced_vertical_break} inches less rise (or more drop)`,
  "more arm-side run": `At least ${m.arm_side_break} inches more run toward the arm side`,
  "more glove-side sweep": `At least ${m.arm_side_break} inches more sweep toward the glove side`,
  "more spin": `At least ${m.release_spin_rate} rpm more spin`,
  "less spin": `At least ${m.release_spin_rate} rpm less spin`,
  "higher arm angle": `Arm slot raised at least ${m.arm_angle}°`,
  "lower arm angle": `Arm slot dropped at least ${m.arm_angle}°`,
  "higher release": `Released at least ${inches(m.release_pos_z)} inches higher`,
  "lower release": `Released at least ${inches(m.release_pos_z)} inches lower`,
  "wider release": `Released at least ${inches(m.release_side)} inches wider on the rubber`,
  "narrower release": `Released at least ${inches(m.release_side)} inches closer to center`,
};
