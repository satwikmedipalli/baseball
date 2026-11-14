"""Pitch-level outcome labels.

Everything here is signed from the pitcher's point of view: larger is better for the
pitcher. None of these columns is ever used to decide whether a pitch changed.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

CALLED_STRIKE_DESCRIPTIONS = frozenset({"called_strike"})
WHIFF_DESCRIPTIONS = frozenset({"swinging_strike", "swinging_strike_blocked", "missed_bunt"})
CONTACT_DESCRIPTIONS = frozenset(
    {"foul", "foul_tip", "foul_bunt", "bunt_foul_tip", "hit_into_play", "foul_pitchout"}
)
SWING_DESCRIPTIONS = WHIFF_DESCRIPTIONS | CONTACT_DESCRIPTIONS
IN_ZONE_CODES = frozenset(range(1, 10))
HARD_CONTACT_LAUNCH = 95.0

# Runs per point of wOBA. FanGraphs' yearly wOBA scale sat between 1.20 and 1.26 over
# 2021-2026; one constant keeps seasons comparable and the error it adds is second order
# next to the luck it removes.
WOBA_SCALE = 1.24


def add_outcome_labels(frame: pd.DataFrame) -> pd.DataFrame:
    """Attach swing, contact, and run-value labels.

    `pitcher_xrv` is the primary outcome: Savant's run-expectancy change for the pitch,
    with batted-ball luck removed. For a ball in play the actual wOBA value is swapped
    for the expected wOBA from exit velocity and launch angle, so a bloop single and a
    line-drive out with the same contact quality count the same. Counts, walks,
    strikeouts and hit-by-pitches keep their actual run value.
    """
    result = frame.copy()
    index = result.index
    description = (
        result["description"].astype("string")
        if "description" in result
        else pd.Series(pd.NA, index=index, dtype="string")
    )
    zone = pd.to_numeric(
        result["zone"] if "zone" in result else pd.Series(np.nan, index=index),
        errors="coerce",
    )

    is_swing = description.isin(SWING_DESCRIPTIONS)
    is_whiff = description.isin(WHIFF_DESCRIPTIONS)
    is_in_zone = zone.isin(IN_ZONE_CODES)
    is_bip = description.eq("hit_into_play").fillna(False)

    result["is_called_strike"] = description.isin(CALLED_STRIKE_DESCRIPTIONS).astype("int8")
    result["is_whiff"] = is_whiff.astype("int8")
    result["is_swing"] = is_swing.astype("int8")
    result["is_csw"] = (result["is_called_strike"].astype(bool) | is_whiff).astype("int8")
    result["is_in_zone"] = is_in_zone.astype("int8")
    result["is_in_zone_miss"] = (is_in_zone & is_whiff).astype("int8")
    result["is_out_of_zone"] = (zone.notna() & ~is_in_zone).astype("int8")
    result["is_chase"] = (zone.notna() & ~is_in_zone & is_swing).astype("int8")
    result["is_bip"] = is_bip.astype("int8")

    if "launch_speed" in result.columns:
        launch = pd.to_numeric(result["launch_speed"], errors="coerce")
        hard = (launch >= HARD_CONTACT_LAUNCH).astype("Int8")
        result["is_hard_contact"] = hard.where(is_bip, pd.NA)
    else:
        result["is_hard_contact"] = pd.Series(pd.NA, index=index, dtype="Int8")

    run_value = pd.to_numeric(
        result["delta_run_exp"] if "delta_run_exp" in result else pd.Series(np.nan, index=index),
        errors="coerce",
    )
    result["pitcher_rv"] = -run_value

    expected = _numeric(result, "estimated_woba_using_speedangle")
    actual = _numeric(result, "woba_value")
    luck = ((actual - expected) / WOBA_SCALE).where(is_bip & expected.notna() & actual.notna())
    # Batter-side run value minus batter luck, then flipped to the pitcher's side.
    result["pitcher_xrv"] = -(run_value - luck.fillna(0.0))
    result["xwoba_contact"] = expected.where(is_bip)
    return result


def _numeric(frame: pd.DataFrame, column: str) -> pd.Series:
    if column not in frame.columns:
        return pd.Series(np.nan, index=frame.index, dtype=float)
    return pd.to_numeric(frame[column], errors="coerce")
