"""Matched difference-in-differences with regression adjustment and a pitcher bootstrap.

Estimand: the average effect of a redesign on the pitchers who made one (ATT), in
outcome-change units (post season minus pre season, pitcher-side positive).

1. Each redesign is matched, with replacement, to the `k` unchanged pitches with the
   closest propensity score in the same pitch group and season pair.
2. A regression of the outcome change on pre-season covariates, fit on controls only,
   removes whatever imbalance the matching leaves (Abadie-Imbens bias correction).
3. Uncertainty comes from resampling pitchers, so a pitcher who appears in several rows
   moves together, on both the redesign and the control side.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import asdict, dataclass

import numpy as np
import pandas as pd

from shapeshift.study.aggregate import SHAPE_FEATURES
from shapeshift.study.treatment import CONTROL, TREATED

COVARIATES = (
    *(f"{feature}_mean_pre" for feature in SHAPE_FEATURES),
    "xrv100_pre",
    "whiff_rate_pre",
    "usage_pre",
    "age_pre",
    "starter_pre",
)
EXACT = ("study_group", "pair")


@dataclass(frozen=True)
class Effect:
    outcome: str
    estimate: float
    ci_low: float
    ci_high: float
    p_value: float
    raw_difference: float
    treated_change: float
    control_change: float
    n_treated: int
    n_pitchers: int
    n_controls_used: int

    def to_dict(self) -> dict[str, float | int | str]:
        return asdict(self)


def prepare_covariates(table: pd.DataFrame) -> pd.DataFrame:
    """Fill gaps (arm angle is missing for a few pitchers) with the group median."""
    result = table.copy()
    for column in COVARIATES:
        median = result.groupby("study_group")[column].transform("median")
        result[column] = result[column].fillna(median).fillna(result[column].median())
    return result


def propensity_logit(
    table: pd.DataFrame,
    treated_mask: pd.Series,
    control_mask: pd.Series,
    covariates: Sequence[str] = COVARIATES,
) -> np.ndarray:
    """Log-odds of being a redesign given pre-season covariates, fit per pitch group."""
    from sklearn.linear_model import LogisticRegression

    logit = np.full(len(table), np.nan)
    values = table[list(covariates)].to_numpy(dtype=float)
    usable = (treated_mask | control_mask).to_numpy()
    label = treated_mask.to_numpy()
    for _, positions in table.groupby("study_group", observed=True).indices.items():
        rows = positions[usable[positions]]
        if len(rows) == 0 or label[rows].all() or not label[rows].any():
            continue
        x = values[rows]
        mean, scale = x.mean(axis=0), x.std(axis=0)
        scale[scale < 1e-9] = 1.0
        model = LogisticRegression(C=1.0, max_iter=2000)
        model.fit((x - mean) / scale, label[rows])
        logit[rows] = model.decision_function((x - mean) / scale)
    return logit


def match(
    table: pd.DataFrame,
    *,
    k: int,
    caliper: float,
    treated_mask: pd.Series | None = None,
    control_mask: pd.Series | None = None,
    covariates: Sequence[str] = COVARIATES,
) -> pd.DataFrame:
    """Propensity-score nearest neighbours, with replacement, inside exact cells.

    Distance is the gap in the logit of the propensity score divided by its standard
    deviation in the pitch group, so `caliper=0.2` is Austin's (2011) recommended 0.2 SD.
    Returns one row per pair: `treated` and `control` are positional indices into `table`.
    """
    treated_mask = table["status"].eq(TREATED) if treated_mask is None else treated_mask
    control_mask = table["status"].eq(CONTROL) if control_mask is None else control_mask
    logit = propensity_logit(table, treated_mask, control_mask, covariates)
    group_sd = pd.Series(logit).groupby(table["study_group"].to_numpy()).transform("std")
    score = logit / group_sd.replace(0, np.nan).fillna(1.0).to_numpy()
    pitchers = table["pitcher"].to_numpy()

    rows: list[np.ndarray] = []
    cells = table.groupby(list(EXACT), observed=True, sort=False).indices
    is_treated = treated_mask.to_numpy() & np.isfinite(score)
    is_control = control_mask.to_numpy() & np.isfinite(score)
    for cell_positions in cells.values():
        cell_treated = cell_positions[is_treated[cell_positions]]
        cell_controls = cell_positions[is_control[cell_positions]]
        if len(cell_treated) == 0 or len(cell_controls) == 0:
            continue
        distance = np.abs(score[cell_treated][:, None] - score[cell_controls][None, :])
        same_pitcher = pitchers[cell_treated][:, None] == pitchers[cell_controls][None, :]
        distance[same_pitcher] = np.inf
        take = min(k, len(cell_controls))
        nearest = np.argpartition(distance, take - 1, axis=1)[:, :take]
        for row, treated_position in enumerate(cell_treated):
            chosen = nearest[row]
            chosen = chosen[distance[row, chosen] <= caliper]
            if len(chosen) == 0:
                continue
            rows.append(
                np.column_stack(
                    [
                        np.full(len(chosen), treated_position),
                        cell_controls[chosen],
                        distance[row, chosen],
                    ]
                )
            )
    if not rows:
        return pd.DataFrame(columns=["treated", "control", "distance"])
    stacked = np.vstack(rows)
    return pd.DataFrame(
        {
            "treated": stacked[:, 0].astype(int),
            "control": stacked[:, 1].astype(int),
            "distance": stacked[:, 2],
        }
    )


def regression_adjustment(
    table: pd.DataFrame,
    outcomes: Sequence[str],
    control_positions: np.ndarray,
    covariates: Sequence[str] = COVARIATES,
) -> np.ndarray:
    """Residuals of each outcome after a controls-only regression on covariates.

    One ordinary least squares fit per pitch group. Returns an array of shape
    (rows, outcomes); rows with a missing outcome get NaN.
    """
    residuals = np.full((len(table), len(outcomes)), np.nan)
    covariate_values = table[list(covariates)].to_numpy(dtype=float)
    is_control = np.zeros(len(table), dtype=bool)
    is_control[control_positions] = True
    for _, group_positions in table.groupby("study_group", observed=True).indices.items():
        x = covariate_values[group_positions]
        mean = x.mean(axis=0)
        scale = x.std(axis=0)
        scale[scale < 1e-9] = 1.0
        design = np.column_stack([np.ones(len(x)), (x - mean) / scale])
        fit_rows = is_control[group_positions]
        for column, outcome in enumerate(outcomes):
            y = table[outcome].to_numpy(dtype=float)[group_positions]
            usable = fit_rows & np.isfinite(y)
            if usable.sum() <= design.shape[1] + 5:
                residuals[group_positions, column] = (
                    y - np.nanmean(y[usable]) if usable.any() else y
                )
                continue
            beta, *_ = np.linalg.lstsq(design[usable], y[usable], rcond=None)
            residuals[group_positions, column] = y - design @ beta
    return residuals


def estimate_effects(
    table: pd.DataFrame,
    matches: pd.DataFrame,
    outcomes: Sequence[str],
    *,
    n_bootstrap: int,
    seed: int,
    treated_subset: np.ndarray | None = None,
    adjust: bool = True,
    covariates: Sequence[str] = COVARIATES,
) -> list[Effect]:
    """ATT for each outcome with a pitcher-clustered bootstrap over both arms."""
    if matches.empty:
        return []
    pairs = matches
    if treated_subset is not None:
        pairs = matches.loc[matches["treated"].isin(treated_subset)]
        if pairs.empty:
            return []

    treated = np.unique(pairs["treated"].to_numpy())
    # Each treated row spreads weight 1 across its matches; controls sum what they receive.
    per_match = 1.0 / pairs.groupby("treated")["control"].transform("size").to_numpy()
    control_weight = pd.Series(per_match).groupby(pairs["control"].to_numpy()).sum()
    controls = control_weight.index.to_numpy(dtype=int)
    weights = control_weight.to_numpy(dtype=float)

    raw = table[list(outcomes)].to_numpy(dtype=float)
    all_controls = np.flatnonzero(table["status"].eq(CONTROL).to_numpy())
    values = regression_adjustment(table, outcomes, all_controls, covariates) if adjust else raw

    pitcher_codes, pitcher_index = np.unique(table["pitcher"].to_numpy(), return_inverse=True)
    rng = np.random.default_rng(seed)
    n_clusters = len(pitcher_codes)
    draws = np.stack(
        [
            np.bincount(rng.integers(0, n_clusters, n_clusters), minlength=n_clusters)
            for _ in range(n_bootstrap)
        ]
    ).astype(float)
    t_counts = draws[:, pitcher_index[treated]]
    c_counts = draws[:, pitcher_index[controls]] * weights

    effects: list[Effect] = []
    for column, outcome in enumerate(outcomes):
        t_values = values[treated, column]
        c_values = values[controls, column]
        t_ok = np.isfinite(t_values)
        c_ok = np.isfinite(c_values)
        if t_ok.sum() < 2 or c_ok.sum() < 2:
            continue
        point = _weighted(t_values[t_ok], np.ones(t_ok.sum())) - _weighted(
            c_values[c_ok], weights[c_ok]
        )
        t_sum = t_counts[:, t_ok] @ t_values[t_ok]
        t_den = t_counts[:, t_ok].sum(axis=1)
        c_sum = c_counts[:, c_ok] @ c_values[c_ok]
        c_den = c_counts[:, c_ok].sum(axis=1)
        valid = (t_den > 0) & (c_den > 0)
        boot = t_sum[valid] / t_den[valid] - c_sum[valid] / c_den[valid]
        centred = boot - boot.mean()
        # Two-sided p-value from the bootstrap distribution re-centred on zero.
        p_value = float((1 + (np.abs(centred) >= abs(point)).sum()) / (1 + len(boot)))

        t_raw = raw[treated, column]
        c_raw = raw[controls, column]
        tr_ok, cr_ok = np.isfinite(t_raw), np.isfinite(c_raw)
        treated_change = _weighted(t_raw[tr_ok], np.ones(tr_ok.sum()))
        control_change = _weighted(c_raw[cr_ok], weights[cr_ok])
        effects.append(
            Effect(
                outcome=outcome,
                estimate=float(point),
                ci_low=float(np.quantile(boot, 0.025)),
                ci_high=float(np.quantile(boot, 0.975)),
                p_value=p_value,
                raw_difference=float(treated_change - control_change),
                treated_change=float(treated_change),
                control_change=float(control_change),
                n_treated=int(t_ok.sum()),
                n_pitchers=len(np.unique(table["pitcher"].to_numpy()[treated])),
                n_controls_used=int(c_ok.sum()),
            )
        )
    return effects


def _weighted(values: np.ndarray, weights: np.ndarray) -> float:
    total = weights.sum()
    return float((values * weights).sum() / total) if total > 0 else float("nan")


def balance_table(
    table: pd.DataFrame, matches: pd.DataFrame, covariates: Sequence[str] = COVARIATES
) -> pd.DataFrame:
    """Standardized mean differences before and after matching, per covariate."""
    treated_all = table.loc[table["status"].eq(TREATED)]
    control_all = table.loc[table["status"].eq(CONTROL)]
    matched_treated = table.iloc[np.unique(matches["treated"].to_numpy())]
    per_match = 1.0 / matches.groupby("treated")["control"].transform("size")
    control_weight = per_match.groupby(matches["control"]).sum()
    matched_controls = table.iloc[control_weight.index.to_numpy(dtype=int)]
    weights = control_weight.to_numpy(dtype=float)

    rows = []
    for column in covariates:
        pooled_sd = np.sqrt((treated_all[column].var() + control_all[column].var()) / 2.0) or 1.0
        before = (treated_all[column].mean() - control_all[column].mean()) / pooled_sd
        after = (
            matched_treated[column].mean()
            - np.average(matched_controls[column].to_numpy(dtype=float), weights=weights)
        ) / pooled_sd
        rows.append({"covariate": column, "smd_before": before, "smd_after": after})
    return pd.DataFrame(rows)
