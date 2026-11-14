"""Classify offseason pitch changes as redesigns, controls, or ambiguous.

Nothing in this module reads an outcome column. A pitch is classified from its physical
shape alone, so the rule cannot be tuned toward a result.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence

import numpy as np
import pandas as pd

from shapeshift.study.aggregate import OUTCOMES, SHAPE_FEATURES

TREATED = "redesign"
CONTROL = "control"
AMBIGUOUS = "ambiguous"

# How a change in each feature reads to a pitching coach.
CHANGE_NAMES: dict[str, tuple[str, str]] = {
    "release_speed": ("more velocity", "less velocity"),
    "induced_vertical_break": ("more ride / less drop", "less ride / more drop"),
    "arm_side_break": ("more arm-side run", "more glove-side sweep"),
    "release_spin_rate": ("more spin", "less spin"),
    "arm_angle": ("higher arm angle", "lower arm angle"),
    "release_pos_z": ("higher release", "lower release"),
    "release_side": ("wider release", "narrower release"),
    "release_extension": ("more extension", "less extension"),
}

PRE_CONTEXT = ("usage", "starter", "age", "p_throws", "player_name", "total_pitches")


def build_pairs(
    seasons: pd.DataFrame,
    pairs: Sequence[tuple[int, int]],
    *,
    min_pitches: int,
    mixed_type_share: float,
) -> pd.DataFrame:
    """Join each pitcher-group to itself one season later."""
    frames: list[pd.DataFrame] = []
    for season_pre, season_post in pairs:
        pre = seasons.loc[seasons["season"].eq(season_pre)]
        post = seasons.loc[seasons["season"].eq(season_post)]
        joined = pre.merge(
            post, on=["pitcher", "study_group"], suffixes=("_pre", "_post"), how="inner"
        )
        joined["season_pre"] = season_pre
        joined["season_post"] = season_post
        frames.append(joined)
    if not frames:
        return pd.DataFrame()
    table = pd.concat(frames, ignore_index=True)
    enough = table["n_pre"].ge(min_pitches) & table["n_post"].ge(min_pitches)
    clean_mix = table["second_type_share_pre"].le(mixed_type_share) & table[
        "second_type_share_post"
    ].le(mixed_type_share)
    same_type = table["main_type_pre"].eq(table["main_type_post"]) | table["study_group"].eq(
        "slider_sweeper"
    )
    table = table.loc[enough & clean_mix & same_type].reset_index(drop=True)
    table["pair"] = table["season_pre"].astype(str) + "-" + table["season_post"].astype(str)
    return table


def classify_changes(
    pairs: pd.DataFrame,
    material_change: Mapping[str, float],
    *,
    min_noise_z: float,
    control_band: float,
    persistence_share: float,
) -> pd.DataFrame:
    """Label every pitcher-group-pair as redesign, control, or ambiguous."""
    table = pairs.copy()
    features = [feature for feature in SHAPE_FEATURES if feature in material_change]

    for feature in features:
        raw = table[f"{feature}_mean_post"] - table[f"{feature}_mean_pre"]
        # League drift (aging, tracking recalibration, a new ball) is removed by centring
        # on the typical change for that pitch group in that season pair.
        drift = raw.groupby([table["study_group"], table["pair"]]).transform("median")
        adjusted = raw - drift
        se = np.sqrt(
            table[f"{feature}_sd_pre"] ** 2 / table[f"{feature}_n_pre"].clip(lower=1)
            + table[f"{feature}_sd_post"] ** 2 / table[f"{feature}_n_post"].clip(lower=1)
        )
        table[f"delta_{feature}"] = adjusted
        table[f"z_{feature}"] = adjusted / se.replace(0, np.nan)
        table[f"ratio_{feature}"] = adjusted.abs() / material_change[feature]

        kept = []
        for half in ("h1", "h2"):
            half_change = table[f"{feature}_{half}_post"] - table[f"{feature}_mean_pre"] - drift
            kept.append(
                (np.sign(half_change) == np.sign(adjusted))
                & (half_change.abs() >= persistence_share * adjusted.abs())
            )
        table[f"material_{feature}"] = (
            table[f"ratio_{feature}"].ge(1.0)
            & table[f"z_{feature}"].abs().ge(min_noise_z)
            & kept[0]
            & kept[1]
        )

    ratios = table[[f"ratio_{feature}" for feature in features]].fillna(0.0)
    material = table[[f"material_{feature}" for feature in features]].fillna(False)
    treated = material.any(axis=1)
    control = ratios.lt(control_band).all(axis=1)

    table["status"] = np.select([treated, control], [TREATED, CONTROL], default=AMBIGUOUS)
    table["n_material_features"] = material.sum(axis=1).astype(int)

    masked = ratios.where(material.to_numpy(), other=-1.0)
    primary = masked.idxmax(axis=1).str.removeprefix("ratio_")
    table["primary_feature"] = primary.where(treated, other=pd.NA)
    direction = np.full(len(table), np.nan)
    for feature in features:
        chosen = table["primary_feature"].eq(feature).fillna(False).to_numpy()
        direction[chosen] = np.sign(table.loc[chosen, f"delta_{feature}"].to_numpy())
    table["direction"] = direction
    table["change_label"] = [
        _label(feature, sign)
        for feature, sign in zip(table["primary_feature"], direction, strict=True)
    ]
    return table


def _label(feature: object, sign: float) -> object:
    if not isinstance(feature, str) or not np.isfinite(sign):
        return pd.NA
    up, down = CHANGE_NAMES[feature]
    return up if sign > 0 else down


def outcome_deltas(table: pd.DataFrame) -> pd.DataFrame:
    """Post minus pre for every outcome, pitcher-side positive."""
    result = table.copy()
    for outcome in (*OUTCOMES, "stuff100", "pitcher_xrv100", "usage"):
        result[f"d_{outcome}"] = result[f"{outcome}_post"] - result[f"{outcome}_pre"]
    return result


def attach_prior_season(
    table: pd.DataFrame,
    seasons: pd.DataFrame,
    material_change: Mapping[str, float] | None = None,
) -> pd.DataFrame:
    """Add the season before `season_pre` for the pre-trend and rebound checks.

    A redesign is a *rebound* when, the year before, its main feature had moved at least
    half a threshold the other way (a velocity "gain" that only wins back a lost mile
    per hour is a recovery, not a redesign).
    """
    shape_means = [f"{feature}_mean" for feature in SHAPE_FEATURES]
    prior = seasons[["pitcher", "study_group", "season", "n", *OUTCOMES, *shape_means]].copy()
    prior["season_pre"] = prior["season"] + 1
    prior = prior.drop(columns="season").rename(
        columns={
            "n": "n_prior",
            **{outcome: f"{outcome}_prior" for outcome in OUTCOMES},
            **{column: column.replace("_mean", "_mean_prior") for column in shape_means},
        }
    )
    result = table.merge(prior, on=["pitcher", "study_group", "season_pre"], how="left")
    for outcome in OUTCOMES:
        result[f"pretrend_{outcome}"] = result[f"{outcome}_pre"] - result[f"{outcome}_prior"]

    rebound = np.zeros(len(result), dtype=bool)
    if material_change:
        for feature, threshold in material_change.items():
            chosen = result["primary_feature"].eq(feature).fillna(False).to_numpy()
            earlier = (result[f"{feature}_mean_pre"] - result[f"{feature}_mean_prior"]).to_numpy()
            opposite = np.sign(earlier) == -result["direction"].to_numpy()
            rebound |= chosen & opposite & (np.abs(earlier) >= threshold / 2)
    result["rebound"] = rebound
    return result
