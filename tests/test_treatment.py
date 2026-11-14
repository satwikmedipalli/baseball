from __future__ import annotations

import numpy as np
import pandas as pd

from shapeshift.study.aggregate import SHAPE_FEATURES
from shapeshift.study.treatment import (
    AMBIGUOUS,
    CONTROL,
    TREATED,
    build_pairs,
    classify_changes,
)

MATERIAL = {
    "release_speed": 1.0,
    "induced_vertical_break": 2.0,
    "arm_side_break": 2.0,
    "release_spin_rate": 150.0,
    "arm_angle": 4.0,
    "release_pos_z": 0.25,
    "release_side": 0.25,
    "release_extension": 0.3,
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
SD = {feature: MATERIAL[feature] for feature in SHAPE_FEATURES}


def season_row(
    pitcher: int,
    season: int,
    shift: dict[str, float] | None = None,
    halves: tuple[float, float] = (1.0, 1.0),
    n: int = 600,
    second_type_share: float = 0.0,
) -> dict[str, object]:
    shift = shift or {}
    row: dict[str, object] = {
        "pitcher": pitcher,
        "season": season,
        "study_group": "four_seam",
        "n": n,
        "main_type": "FF",
        "second_type_share": second_type_share,
    }
    for feature in SHAPE_FEATURES:
        delta = shift.get(feature, 0.0)
        row[f"{feature}_mean"] = BASE[feature] + delta
        row[f"{feature}_sd"] = SD[feature]
        row[f"{feature}_n"] = n
        row[f"{feature}_h1"] = BASE[feature] + delta * halves[0]
        row[f"{feature}_h2"] = BASE[feature] + delta * halves[1]
    return row


def classify(rows: list[dict[str, object]]) -> pd.DataFrame:
    seasons = pd.DataFrame(rows)
    pairs = build_pairs(seasons, [(2022, 2023)], min_pitches=150, mixed_type_share=0.15)
    return classify_changes(
        pairs, MATERIAL, min_noise_z=4.0, control_band=0.5, persistence_share=0.5
    ).set_index("pitcher")


def population(extra: list[dict[str, object]]) -> list[dict[str, object]]:
    """Twenty unchanged pitchers so the league-drift median is zero."""
    rows: list[dict[str, object]] = []
    for pitcher in range(100, 120):
        rows += [season_row(pitcher, 2022), season_row(pitcher, 2023)]
    return rows + extra


def test_persistent_velocity_gain_is_a_redesign() -> None:
    result = classify(
        population(
            [
                season_row(1, 2022),
                season_row(1, 2023, {"release_speed": 1.6}),
            ]
        )
    )
    assert result.loc[1, "status"] == TREATED
    assert result.loc[1, "change_label"] == "more velocity"
    assert result.loc[100, "status"] == CONTROL


def test_change_that_fades_in_second_half_is_not_a_redesign() -> None:
    result = classify(
        population(
            [
                season_row(2, 2022),
                season_row(2, 2023, {"release_speed": 1.6}, halves=(1.9, 0.1)),
            ]
        )
    )
    assert result.loc[2, "status"] != TREATED


def test_mid_sized_change_is_ambiguous_not_control() -> None:
    result = classify(
        population(
            [
                season_row(3, 2022),
                season_row(3, 2023, {"arm_side_break": 1.5}),
            ]
        )
    )
    assert result.loc[3, "status"] == AMBIGUOUS


def test_league_wide_shift_is_not_counted_as_redesigns() -> None:
    rows: list[dict[str, object]] = []
    for pitcher in range(20):
        rows += [season_row(pitcher, 2022), season_row(pitcher, 2023, {"release_spin_rate": 300})]
    result = classify(rows)
    assert result["status"].eq(CONTROL).all()


def test_tiny_samples_cannot_clear_the_noise_bar() -> None:
    rows = population([])
    noisy_pre = season_row(4, 2022, n=160)
    noisy_post = season_row(4, 2023, {"release_speed": 1.1}, n=160)
    for row in (noisy_pre, noisy_post):
        row["release_speed_sd"] = 6.0
    result = classify([*rows, noisy_pre, noisy_post])
    assert result.loc[4, "status"] != TREATED


def test_mixed_slider_sweeper_rows_are_dropped() -> None:
    result = classify(
        population(
            [
                season_row(5, 2022, second_type_share=0.4),
                season_row(5, 2023, {"release_speed": 2.0}),
            ]
        )
    )
    assert 5 not in result.index


def test_classification_ignores_outcomes() -> None:
    rows = population([season_row(6, 2022), season_row(6, 2023, {"release_speed": 1.6})])
    base = classify(rows)["status"]
    for row in rows:
        row["xrv100"] = np.random.default_rng(int(row["pitcher"])).normal()
    assert classify(rows)["status"].equals(base)
