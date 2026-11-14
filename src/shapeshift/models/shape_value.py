"""Context-neutral physical pitch-value model and baseline scorecard."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.impute import SimpleImputer
from sklearn.metrics import mean_absolute_error, root_mean_squared_error
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

NUMERIC_FEATURES = (
    "release_speed",
    "arm_side_break",
    "induced_vertical_break",
    "release_side",
    "release_pos_z",
    "release_extension",
    "release_spin_rate",
    "arm_angle",
    "fb_velo_diff",
    "fb_ivb_diff",
    "fb_hb_diff",
)
CATEGORICAL_FEATURES = ("pitch_family", "p_throws", "stand")
MODEL_FEATURES = (*NUMERIC_FEATURES, *CATEGORICAL_FEATURES)
FORBIDDEN_FEATURES = frozenset(
    {
        "pitcher",
        "player_name",
        "plate_x",
        "plate_z",
        "zone",
        "balls",
        "strikes",
        "description",
        "events",
        "delta_run_exp",
        "pitcher_run_value",
        "pitcher_rv",
        "pitcher_xrv",
        "launch_speed",
        "launch_angle",
        "estimated_woba_using_speedangle",
    }
)


FASTBALL_FAMILIES = ("four_seam", "sinker")


def add_arsenal_context(pitches: pd.DataFrame) -> pd.DataFrame:
    """Speed and movement gaps to the pitcher's primary fastball that season.

    A changeup at 86 mph means something different off 98 than off 91. The primary
    fastball is the four-seam or sinker the pitcher threw most that season.
    """
    result = pitches.copy()
    fastballs = result.loc[result["pitch_family"].isin(FASTBALL_FAMILIES)]
    counts = fastballs.groupby(["pitcher", "season", "pitch_family"], observed=True).size()
    if counts.empty:
        for column in ("fb_velo_diff", "fb_ivb_diff", "fb_hb_diff"):
            result[column] = np.nan
        return result
    primary = counts.groupby(level=["pitcher", "season"]).idxmax().map(lambda key: key[2])
    primary = primary.rename("primary_fastball").reset_index()
    means = (
        fastballs.groupby(["pitcher", "season", "pitch_family"], observed=True)[
            ["release_speed", "induced_vertical_break", "arm_side_break"]
        ]
        .mean()
        .reset_index()
        .rename(columns={"pitch_family": "primary_fastball"})
    )
    reference = primary.merge(means, on=["pitcher", "season", "primary_fastball"])
    reference = reference.rename(
        columns={
            "release_speed": "fb_velo",
            "induced_vertical_break": "fb_ivb",
            "arm_side_break": "fb_hb",
        }
    ).drop(columns="primary_fastball")
    result = result.merge(reference, on=["pitcher", "season"], how="left")
    result["fb_velo_diff"] = result["release_speed"] - result["fb_velo"]
    result["fb_ivb_diff"] = result["induced_vertical_break"] - result["fb_ivb"]
    result["fb_hb_diff"] = result["arm_side_break"] - result["fb_hb"]
    return result.drop(columns=["fb_velo", "fb_ivb", "fb_hb"])


@dataclass(frozen=True)
class Scorecard:
    rows: int
    model_mae: float
    model_rmse: float
    baseline_mae: float
    baseline_rmse: float
    rmse_improvement_pct: float

    def to_dict(self) -> dict[str, int | float]:
        return asdict(self)


def assert_leakage_safe(features: tuple[str, ...]) -> None:
    """Reject identifiers, location, context, and post-pitch information."""
    leaked = sorted(set(features).intersection(FORBIDDEN_FEATURES))
    if leaked:
        raise ValueError(f"Forbidden shape-model features: {', '.join(leaked)}")


def build_shape_value_pipeline(random_seed: int = 42) -> Pipeline:
    """Construct a reproducible nonlinear baseline for physical pitch quality."""
    assert_leakage_safe(MODEL_FEATURES)
    numeric = Pipeline(
        [
            ("impute", SimpleImputer(strategy="median")),
            ("scale", StandardScaler()),
        ]
    )
    categorical = Pipeline(
        [
            ("impute", SimpleImputer(strategy="most_frequent")),
            (
                "encode",
                OneHotEncoder(handle_unknown="ignore", sparse_output=False),
            ),
        ]
    )
    preprocessor = ColumnTransformer(
        [
            ("numeric", numeric, list(NUMERIC_FEATURES)),
            ("categorical", categorical, list(CATEGORICAL_FEATURES)),
        ],
        verbose_feature_names_out=False,
    )
    regressor = HistGradientBoostingRegressor(
        loss="squared_error",
        learning_rate=0.06,
        max_iter=250,
        max_leaf_nodes=31,
        min_samples_leaf=100,
        l2_regularization=1.0,
        random_state=random_seed,
    )
    return Pipeline([("features", preprocessor), ("regressor", regressor)])


def fit_shape_value_model(
    training: pd.DataFrame,
    *,
    target: str = "pitcher_xrv",
    random_seed: int = 42,
) -> Pipeline:
    """Fit using only the pre-committed physical feature list."""
    missing = sorted(set((*MODEL_FEATURES, target)) - set(training.columns))
    if missing:
        raise ValueError(f"Training data is missing: {', '.join(missing)}")
    eligible = training[target].notna()
    model = build_shape_value_pipeline(random_seed)
    return model.fit(training.loc[eligible, list(MODEL_FEATURES)], training.loc[eligible, target])


def evaluate_shape_value_model(
    model: Any,
    training: pd.DataFrame,
    evaluation: pd.DataFrame,
    *,
    target: str = "pitcher_xrv",
) -> Scorecard:
    """Compare model predictions with a frozen pitch-family-mean baseline."""
    eligible = evaluation[target].notna()
    test = evaluation.loc[eligible]
    actual = test[target].to_numpy(dtype=float)
    predicted = np.asarray(model.predict(test.loc[:, list(MODEL_FEATURES)]), dtype=float)

    family_means = training.groupby("pitch_family", observed=True)[target].mean()
    global_mean = float(training[target].mean())
    baseline = test["pitch_family"].map(family_means).fillna(global_mean).to_numpy(dtype=float)

    model_rmse = float(root_mean_squared_error(actual, predicted))
    baseline_rmse = float(root_mean_squared_error(actual, baseline))
    improvement = 100 * (baseline_rmse - model_rmse) / baseline_rmse
    return Scorecard(
        rows=len(test),
        model_mae=float(mean_absolute_error(actual, predicted)),
        model_rmse=model_rmse,
        baseline_mae=float(mean_absolute_error(actual, baseline)),
        baseline_rmse=baseline_rmse,
        rmse_improvement_pct=float(improvement),
    )
