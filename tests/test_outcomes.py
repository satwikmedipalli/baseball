from __future__ import annotations

import pandas as pd
import pytest

from shapeshift.data.outcomes import WOBA_SCALE, add_outcome_labels


def sample_outcomes() -> pd.DataFrame:
    return pd.DataFrame(
        {
            "description": [
                "called_strike",
                "swinging_strike",
                "ball",
                "hit_into_play",
            ],
            "zone": [5, 5, 13, 6],
            "launch_speed": [pd.NA, pd.NA, pd.NA, 101.0],
        }
    )


def test_outcome_labels_mark_csw_and_zone_misses() -> None:
    result = add_outcome_labels(sample_outcomes())

    assert result["is_csw"].tolist() == [1, 1, 0, 0]
    assert result["is_in_zone"].tolist() == [1, 1, 0, 1]
    assert result["is_in_zone_miss"].tolist() == [0, 1, 0, 0]
    assert result["is_hard_contact"].tolist()[3] == 1


def test_luck_adjusted_run_value_removes_batted_ball_luck() -> None:
    """A bloop single (actual wOBA 0.9, expected 0.2) is charged at its expected value."""
    frame = pd.DataFrame(
        {
            "description": ["hit_into_play", "hit_into_play", "ball"],
            "zone": [5, 5, 12],
            "delta_run_exp": [0.40, -0.25, 0.05],
            "woba_value": [0.9, 0.0, pd.NA],
            "estimated_woba_using_speedangle": [0.2, 0.0, pd.NA],
        }
    )
    result = add_outcome_labels(frame)

    luck = (0.9 - 0.2) / WOBA_SCALE
    assert result["pitcher_xrv"].iloc[0] == pytest.approx(-(0.40 - luck))
    assert result["pitcher_xrv"].iloc[1] == pytest.approx(0.25)  # no luck, unchanged
    assert result["pitcher_xrv"].iloc[2] == pytest.approx(-0.05)  # not in play, actual value
    assert result["pitcher_rv"].iloc[0] == pytest.approx(-0.40)


def test_rate_labels_use_the_right_denominators() -> None:
    frame = pd.DataFrame(
        {
            "description": ["swinging_strike", "foul", "ball", "hit_into_play"],
            "zone": [13, 14, 11, 5],
            "delta_run_exp": [0.0, 0.0, 0.0, 0.0],
        }
    )
    result = add_outcome_labels(frame)
    assert result["is_swing"].tolist() == [1, 1, 0, 1]
    assert result["is_chase"].tolist() == [1, 1, 0, 0]
    assert result["is_out_of_zone"].tolist() == [1, 1, 1, 0]
    assert result["is_bip"].tolist() == [0, 0, 0, 1]
