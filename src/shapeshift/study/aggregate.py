"""Season-level pitcher x pitch-group summaries for the offseason study."""

from __future__ import annotations

import numpy as np
import pandas as pd

SHAPE_FEATURES = (
    "release_speed",
    "induced_vertical_break",
    "arm_side_break",
    "release_spin_rate",
    "arm_angle",
    "release_pos_z",
    "release_side",
    "release_extension",
)

# Outcome columns written per group-season. Rates use the right denominator: whiffs per
# swing, chases per out-of-zone pitch, hard contact per ball in play.
OUTCOMES = (
    "xrv100",
    "rv100",
    "whiff_rate",
    "csw_rate",
    "chase_rate",
    "zone_rate",
    "xwoba_contact",
    "hard_rate",
)

STARTER_PITCHES_PER_GAME = 45.0

PITCH_COLUMNS = (
    "season",
    "game_date",
    "game_pk",
    "pitcher",
    "player_name",
    "p_throws",
    "pitch_type",
    "study_group",
    *SHAPE_FEATURES,
    "pitcher_xrv",
    "pitcher_rv",
    "is_whiff",
    "is_swing",
    "is_csw",
    "is_chase",
    "is_out_of_zone",
    "is_in_zone",
    "is_bip",
    "is_hard_contact",
    "xwoba_contact",
    "age_pit",
)


def _ratio(numerator: pd.Series, denominator: pd.Series) -> pd.Series:
    return numerator.astype(float) / denominator.replace(0, np.nan).astype(float)


def pitcher_seasons(pitches: pd.DataFrame) -> pd.DataFrame:
    """One row per pitcher-season: workload, role, age, and whole-arsenal results."""
    grouped = pitches.groupby(["pitcher", "season"], observed=True)
    table = grouped.agg(
        player_name=("player_name", "first"),
        p_throws=("p_throws", "first"),
        total_pitches=("pitcher_xrv", "size"),
        games=("game_pk", "nunique"),
        age=("age_pit", "median"),
        pitcher_xrv100=("pitcher_xrv", "mean"),
    ).reset_index()
    table["pitcher_xrv100"] *= 100.0
    table["pitches_per_game"] = table["total_pitches"] / table["games"]
    table["starter"] = (table["pitches_per_game"] >= STARTER_PITCHES_PER_GAME).astype("int8")
    return table


def group_seasons(pitches: pd.DataFrame) -> pd.DataFrame:
    """One row per pitcher-season-group with shape, noise, halves, and outcomes."""
    frame = pitches.loc[pitches["study_group"].ne("other")].copy()
    if "stuff_xrv" not in frame.columns:
        frame["stuff_xrv"] = np.nan
    frame["hard_bip"] = frame["is_hard_contact"].astype("Float64").fillna(0).astype(float)
    keys = ["pitcher", "season", "study_group"]
    grouped = frame.groupby(keys, observed=True)

    spec: dict[str, tuple[str, str]] = {"n": ("pitcher_xrv", "size")}
    for feature in SHAPE_FEATURES:
        spec[f"{feature}_mean"] = (feature, "mean")
        spec[f"{feature}_sd"] = (feature, "std")
        spec[f"{feature}_n"] = (feature, "count")
    spec.update(
        xrv_sum=("pitcher_xrv", "sum"),
        rv_sum=("pitcher_rv", "sum"),
        whiffs=("is_whiff", "sum"),
        swings=("is_swing", "sum"),
        csw=("is_csw", "sum"),
        chases=("is_chase", "sum"),
        out_of_zone=("is_out_of_zone", "sum"),
        in_zone=("is_in_zone", "sum"),
        bip=("is_bip", "sum"),
        hard=("hard_bip", "sum"),
        xwoba_contact=("xwoba_contact", "mean"),
        stuff_sum=("stuff_xrv", "sum"),
        first_date=("game_date", "min"),
        last_date=("game_date", "max"),
    )
    table = grouped.agg(**spec).reset_index()

    table["xrv100"] = 100.0 * table["xrv_sum"] / table["n"]
    table["stuff100"] = 100.0 * table["stuff_sum"] / table["n"]
    table["rv100"] = 100.0 * table["rv_sum"] / table["n"]
    table["whiff_rate"] = _ratio(table["whiffs"], table["swings"])
    table["csw_rate"] = _ratio(table["csw"], table["n"])
    table["chase_rate"] = _ratio(table["chases"], table["out_of_zone"])
    table["zone_rate"] = _ratio(table["in_zone"], table["n"])
    table["hard_rate"] = _ratio(table["hard"], table["bip"])

    table = table.merge(_type_mix(frame, keys), on=keys, how="left")
    table = table.merge(_half_means(frame, keys), on=keys, how="left")
    return table.drop(columns=["xrv_sum", "rv_sum", "stuff_sum", "csw", "in_zone", "hard"])


def _type_mix(frame: pd.DataFrame, keys: list[str]) -> pd.DataFrame:
    """Share of the group thrown as its second most common Savant pitch type."""
    counts = frame.groupby([*keys, "pitch_type"], observed=True).size().rename("count")
    shares = counts / counts.groupby(level=keys).transform("sum")
    ranked = shares.groupby(level=keys).apply(
        lambda values: pd.Series(
            {
                "main_type": values.idxmax()[-1],
                "second_type_share": float(np.sort(values.to_numpy())[-2])
                if len(values) > 1
                else 0.0,
            }
        )
    )
    return ranked.unstack().reset_index()


def _half_means(frame: pd.DataFrame, keys: list[str]) -> pd.DataFrame:
    """Shape means for the first and second half of each group-season, split by pitch order."""
    ordered = frame.sort_values([*keys, "game_date"])
    position = ordered.groupby(keys, observed=True).cumcount()
    size = ordered.groupby(keys, observed=True)["game_date"].transform("size")
    ordered = ordered.assign(half=np.where(position < size / 2, "h1", "h2"))
    halves = ordered.groupby([*keys, "half"], observed=True)[list(SHAPE_FEATURES)].mean()
    wide = halves.unstack("half")
    wide.columns = [f"{feature}_{half}" for feature, half in wide.columns]
    return wide.reset_index()


def season_table(pitches: pd.DataFrame) -> pd.DataFrame:
    """Group-season rows joined to the pitcher-season context they belong to."""
    groups = group_seasons(pitches)
    pitchers = pitcher_seasons(pitches)
    table = groups.merge(pitchers, on=["pitcher", "season"], how="left")
    table["usage"] = table["n"] / table["total_pitches"]
    return table
