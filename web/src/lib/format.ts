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

export const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
