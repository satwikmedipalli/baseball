import data from "../../public/study.json";

export type Effect = {
  outcome: string;
  estimate: number;
  ci_low: number;
  ci_high: number;
  p_value: number;
  n_treated: number;
  n_pitchers: number;
};

export type EraKey = "all" | "development" | "confirmation";

export type ChangeType = {
  study_group: string;
  change_label: string;
  n: number;
  q_value?: number;
} & Record<EraKey, Record<string, Effect | undefined>>;

type Study = {
  created_at_utc: string;
  data_fingerprint: string;
  headline: {
    pitch_seasons: number;
    redesigns: number;
    controls: number;
    primary: Record<EraKey, Effect>;
    whiff: Record<EraKey, Effect>;
    pretrend: Record<EraKey, Effect>;
    placebo_share: number | null;
    placebo_draws: number;
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
  counts: { pair: string; redesign?: number; control?: number; ambiguous?: number }[];
  results: Record<EraKey, { effects: Record<string, Effect>; pretrend: Record<string, Effect> }>;
  change_types: ChangeType[];
  subgroups: ChangeType[];
  sensitivity: ({ specification: string } & Partial<Effect>)[];
  placebo: { estimates: number[]; actual: number; share_as_extreme: number | null };
};

export const study = data as unknown as Study;

export const ERA_LABEL: Record<EraKey, string> = {
  all: "All seasons",
  development: "Development, 2021-24",
  confirmation: "Held out, 2024-26",
};

export function signed(value: number, digits = 2): string {
  const rounded = Number(value.toFixed(digits));
  const text = Math.abs(rounded).toFixed(digits);
  if (rounded > 0) return `+${text}`;
  if (rounded < 0) return `−${text}`;
  return text;
}

export function interval(effect: Effect | undefined, scale = 1, digits = 2): string {
  if (!effect) return "n/a";
  return `${signed(effect.ci_low * scale, digits)} to ${signed(effect.ci_high * scale, digits)}`;
}

export const OUTCOMES: { key: string; label: string; scale: number; unit: string; lowerIsBetter?: boolean }[] = [
  { key: "d_xrv100", label: "Runs saved per 100 pitches (luck-adjusted)", scale: 1, unit: "runs" },
  { key: "d_rv100", label: "Runs saved per 100 pitches (actual results)", scale: 1, unit: "runs" },
  { key: "d_pitcher_xrv100", label: "Whole-arsenal runs saved per 100", scale: 1, unit: "runs" },
  { key: "d_stuff100", label: "Shape grade, runs per 100", scale: 1, unit: "runs" },
  { key: "d_whiff_rate", label: "Whiff rate", scale: 100, unit: "pp" },
  { key: "d_csw_rate", label: "Called strike + whiff rate", scale: 100, unit: "pp" },
  { key: "d_chase_rate", label: "Chase rate", scale: 100, unit: "pp" },
  { key: "d_hard_rate", label: "Hard-hit rate on contact", scale: 100, unit: "pp", lowerIsBetter: true },
];
