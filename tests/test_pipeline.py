"""End-to-end checks on a simulated league: pitches -> seasons -> classify -> estimate."""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from shapeshift.models.shape_value import add_arsenal_context
from shapeshift.study.aggregate import SHAPE_FEATURES, season_table
from shapeshift.study.estimate import estimate_effects, match, prepare_covariates
from shapeshift.study.treatment import (
    CONTROL,
    TREATED,
    attach_prior_season,
    build_pairs,
    classify_changes,
    outcome_deltas,
)

MATERIAL = {
    "release_speed": 2.0,
    "induced_vertical_break": 3.0,
    "arm_side_break": 3.0,
    "release_spin_rate": 150.0,
    "arm_angle": 6.0,
    "release_pos_z": 0.25,
    "release_side": 0.6,
    "release_extension": 0.25,
}
BASE = {
    "release_speed": 94.0,
    "induced_vertical_break": 16.0,
    "arm_side_break": 8.0,
    "release_spin_rate": 2300.0,
    "arm_angle": 40.0,
    "release_pos_z": 5.8,
    "release_side": 2.0,
    "release_extension": 6.4,
}
NOISE = {
    "release_speed": 0.8,
    "induced_vertical_break": 1.5,
    "arm_side_break": 1.5,
    "release_spin_rate": 60.0,
    "arm_angle": 2.0,
    "release_pos_z": 0.1,
    "release_side": 0.1,
    "release_extension": 0.1,
}
GAINERS = range(0, 40)
REBOUNDER = 0  # lost velocity in 2021 -> 2022, then "gained" it back
TRUE_EFFECT_PER_PITCH = 0.01  # one run per 100 pitches


def simulated_pitches(seed: int = 0, pitchers: int = 160, per_season: int = 300) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    frames = []
    for pitcher in range(pitchers):
        talent = rng.normal(0, 0.004)
        offset = {feature: rng.normal(0, NOISE[feature] * 2) for feature in SHAPE_FEATURES}
        for season in (2021, 2022, 2023):
            shift = 0.0
            if pitcher in GAINERS and season == 2023:
                shift = 3.0
            if pitcher == REBOUNDER and season == 2021:
                shift = 3.0
            frame = pd.DataFrame(
                {
                    feature: BASE[feature]
                    + offset[feature]
                    + rng.normal(0, NOISE[feature], per_season)
                    for feature in SHAPE_FEATURES
                }
            )
            frame["release_speed"] += shift
            gain = TRUE_EFFECT_PER_PITCH if (pitcher in GAINERS and season == 2023) else 0.0
            frame["pitcher_xrv"] = talent + gain + rng.normal(0, 0.05, per_season)
            frame["pitcher_rv"] = frame["pitcher_xrv"]
            swing = rng.random(per_season) < 0.47
            frame["is_swing"] = swing.astype("int8")
            frame["is_whiff"] = (swing & (rng.random(per_season) < 0.23)).astype("int8")
            frame["is_csw"] = (rng.random(per_season) < 0.28).astype("int8")
            frame["is_out_of_zone"] = (rng.random(per_season) < 0.5).astype("int8")
            frame["is_chase"] = (frame["is_out_of_zone"].astype(bool) & swing).astype("int8")
            frame["is_in_zone"] = 1 - frame["is_out_of_zone"]
            frame["is_bip"] = (swing & (rng.random(per_season) < 0.3)).astype("int8")
            frame["is_hard_contact"] = pd.array(
                np.where(frame["is_bip"] == 1, (rng.random(per_season) < 0.4).astype(int), pd.NA),
                dtype="Int8",
            )
            frame["xwoba_contact"] = np.where(frame["is_bip"] == 1, 0.37, np.nan)
            frame["season"] = season
            frame["game_date"] = pd.Timestamp(f"{season}-04-01") + pd.to_timedelta(
                np.arange(per_season) // 15 * 5, unit="D"
            )
            frame["game_pk"] = season * 10_000 + np.arange(per_season) // 15
            frame["pitcher"] = pitcher
            frame["player_name"] = f"Pitcher {pitcher}"
            frame["p_throws"] = "R"
            frame["pitch_type"] = "FF"
            frame["pitch_family"] = "four_seam"
            frame["study_group"] = "four_seam"
            frame["age_pit"] = 27
            frames.append(frame)
    return pd.concat(frames, ignore_index=True)


@pytest.fixture(scope="module")
def classified() -> pd.DataFrame:
    seasons = season_table(simulated_pitches())
    pairs = build_pairs(seasons, [(2022, 2023)], min_pitches=150, mixed_type_share=0.15)
    table = classify_changes(
        pairs, MATERIAL, min_noise_z=4.0, control_band=0.6, persistence_share=0.5
    )
    table = attach_prior_season(outcome_deltas(table), seasons, MATERIAL)
    return prepare_covariates(table).reset_index(drop=True)


def test_every_velocity_gainer_is_found_and_labelled(classified: pd.DataFrame) -> None:
    gainers = classified.loc[classified["pitcher"].isin(GAINERS)]
    assert gainers["status"].eq(TREATED).all()
    assert gainers["change_label"].eq("more velocity").all()
    others = classified.loc[~classified["pitcher"].isin(GAINERS)]
    assert others["status"].ne(TREATED).mean() > 0.95


def test_rebound_is_flagged(classified: pd.DataFrame) -> None:
    flags = classified.set_index("pitcher")["rebound"]
    assert bool(flags.loc[REBOUNDER])
    assert not flags.loc[[p for p in GAINERS if p != REBOUNDER]].any()


def test_pipeline_recovers_the_simulated_effect(classified: pd.DataFrame) -> None:
    assert classified["status"].eq(CONTROL).sum() > 60
    matches = match(classified, k=5, caliper=0.2)
    (effect,) = estimate_effects(classified, matches, ["d_xrv100"], n_bootstrap=300, seed=0)
    assert effect.ci_low < 100 * TRUE_EFFECT_PER_PITCH < effect.ci_high
    assert effect.ci_low > 0


def test_season_rates_use_their_own_denominators() -> None:
    seasons = season_table(simulated_pitches(pitchers=3))
    row = seasons.iloc[0]
    assert row["whiff_rate"] == pytest.approx(row["whiffs"] / row["swings"])
    assert row["chase_rate"] == pytest.approx(row["chases"] / row["out_of_zone"])
    assert row["usage"] == pytest.approx(1.0)


def test_arsenal_context_measures_gaps_to_the_primary_fastball() -> None:
    pitches = pd.DataFrame(
        {
            "pitcher": [1, 1, 1, 1],
            "season": [2024] * 4,
            "pitch_family": ["four_seam", "four_seam", "sinker", "changeup"],
            "release_speed": [96.0, 96.0, 94.0, 87.0],
            "induced_vertical_break": [17.0, 17.0, 8.0, 6.0],
            "arm_side_break": [9.0, 9.0, 15.0, 14.0],
        }
    )
    result = add_arsenal_context(pitches)
    changeup = result.loc[result["pitch_family"].eq("changeup")].iloc[0]
    assert changeup["fb_velo_diff"] == pytest.approx(-9.0)
    assert changeup["fb_ivb_diff"] == pytest.approx(-11.0)
    assert changeup["fb_hb_diff"] == pytest.approx(5.0)


def test_cross_fit_never_grades_a_season_with_a_model_that_saw_it(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from shapeshift.study import stuff

    pitches = add_arsenal_context(simulated_pitches(pitchers=30, per_season=200))
    pitches["stand"] = "R"
    seen: list[set[int]] = []
    original = stuff.fit_shape_value_model

    def spy(training: pd.DataFrame, **kwargs: object) -> object:
        seen.append(set(training["season"].unique()))
        return original(training, **kwargs)  # type: ignore[arg-type]

    monkeypatch.setattr(stuff, "fit_shape_value_model", spy)
    grades, cards = stuff.cross_fit_grades(pitches, sample_size=5_000, seed=0)

    assert [card["held_out_season"] for card in cards] == [2021, 2022, 2023]
    for card, training_seasons in zip(cards, seen, strict=True):
        assert card["held_out_season"] not in training_seasons
    assert grades.notna().all()
    reliability = stuff.grade_reliability(pitches.assign(stuff_xrv=grades))
    assert set(reliability["study_group"]) == {"four_seam"}
