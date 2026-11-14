"""Out-of-season shape grades used to explain redesign results.

The grade answers one question: how many runs per 100 pitches does a pitch with this
physical shape save, before command, count, or the hitter is known? Each season is graded
by a model that never saw that season, so a pitcher's grade is never fit to his own
results that year.
"""

from __future__ import annotations

from dataclasses import asdict
from typing import Any

import numpy as np
import pandas as pd

from shapeshift.models.shape_value import (
    MODEL_FEATURES,
    evaluate_shape_value_model,
    fit_shape_value_model,
)

TARGET = "pitcher_xrv"


def cross_fit_grades(
    pitches: pd.DataFrame, *, sample_size: int, seed: int
) -> tuple[pd.Series, list[dict[str, Any]]]:
    """Leave-one-season-out predictions for every pitch, plus a scorecard per season."""
    grades = pd.Series(np.nan, index=pitches.index, name="stuff_xrv")
    scorecards: list[dict[str, Any]] = []
    eligible = pitches[TARGET].notna()
    for season in sorted(pitches["season"].dropna().unique()):
        held_out = pitches["season"].eq(season)
        training = pitches.loc[~held_out & eligible]
        if len(training) > sample_size:
            training = training.sample(sample_size, random_state=seed)
        model = fit_shape_value_model(training, target=TARGET, random_seed=seed)
        test = pitches.loc[held_out]
        grades.loc[test.index] = np.asarray(
            model.predict(test.loc[:, list(MODEL_FEATURES)]), dtype=float
        )
        card = evaluate_shape_value_model(
            model, training, test.loc[test[TARGET].notna()], target=TARGET
        )
        scorecards.append({"held_out_season": int(season), **asdict(card)})
    return grades, scorecards


def grade_reliability(pitches: pd.DataFrame) -> pd.DataFrame:
    """Year-to-year correlation of grades versus results for the same pitcher-pitch.

    A useful shape grade is far more stable than the results it predicts.
    """
    keyed = (
        pitches.groupby(["pitcher", "study_group", "season"], observed=True)
        .agg(n=("stuff_xrv", "size"), stuff=("stuff_xrv", "mean"), xrv=(TARGET, "mean"))
        .reset_index()
    )
    keyed = keyed.loc[(keyed["n"] >= 150) & keyed["study_group"].ne("other")]
    nxt = keyed.assign(season=keyed["season"] - 1)
    joined = keyed.merge(nxt, on=["pitcher", "study_group", "season"], suffixes=("", "_next"))
    rows = []
    for group, part in joined.groupby("study_group"):
        rows.append(
            {
                "study_group": group,
                "pairs": len(part),
                "grade_year_to_year_r": float(part["stuff"].corr(part["stuff_next"])),
                "results_year_to_year_r": float(part["xrv"].corr(part["xrv_next"])),
                "grade_predicts_next_results_r": float(part["stuff"].corr(part["xrv_next"])),
                "results_predict_next_results_r": float(part["xrv"].corr(part["xrv_next"])),
            }
        )
    return pd.DataFrame(rows)
