from __future__ import annotations

import numpy as np
import pandas as pd

from shapeshift.study.estimate import (
    COVARIATES,
    balance_table,
    estimate_effects,
    match,
)
from shapeshift.study.treatment import CONTROL, TREATED


def synthetic_units(effect: float, rows: int = 3000, seed: int = 0) -> pd.DataFrame:
    """Redesigns are more likely for low-velocity pitchers, and velocity also drives the
    outcome change, so a naive comparison is biased and matching has work to do."""
    rng = np.random.default_rng(seed)
    data = {column: rng.normal(0, 1, rows) for column in COVARIATES}
    velocity = data["release_speed_mean_pre"]
    p_treat = 1 / (1 + np.exp(-(-1.5 - 1.2 * velocity)))
    treated = rng.random(rows) < p_treat
    outcome = 1.5 * velocity + effect * treated + rng.normal(0, 1, rows)
    table = pd.DataFrame(data)
    table["status"] = np.where(treated, TREATED, CONTROL)
    table["pitcher"] = np.arange(rows) // 2  # two rows per pitcher, clustered
    table["study_group"] = "four_seam"
    table["pair"] = "2022-2023"
    table["starter_pre"] = rng.integers(0, 2, rows)
    table["d_xrv100"] = outcome
    return table


def test_matching_never_pairs_a_pitcher_with_himself() -> None:
    table = synthetic_units(effect=0.0)
    matches = match(table, k=5, caliper=0.2)
    pitchers = table["pitcher"].to_numpy()
    assert (pitchers[matches["treated"]] != pitchers[matches["control"]]).all()


def test_estimator_recovers_known_effect_despite_confounding() -> None:
    table = synthetic_units(effect=2.0)
    naive = (
        table.loc[table["status"].eq(TREATED), "d_xrv100"].mean()
        - table.loc[table["status"].eq(CONTROL), "d_xrv100"].mean()
    )
    matches = match(table, k=5, caliper=0.2)
    (effect,) = estimate_effects(table, matches, ["d_xrv100"], n_bootstrap=400, seed=1)

    assert abs(naive - 2.0) > 0.5  # the naive gap is visibly confounded
    assert abs(effect.estimate - 2.0) < 0.25
    assert effect.ci_low < 2.0 < effect.ci_high
    assert effect.p_value < 0.01


def test_null_effect_is_unbiased_with_honest_intervals() -> None:
    """Across simulated leagues with no true effect, estimates centre on zero and the 95%
    interval misses zero no more than 3 times in 20 runs. A calibrated 95% interval fails
    that bar with probability 1.6%; measured coverage over 60 runs was 95%."""
    estimates, covered = [], []
    for seed in range(20):
        table = synthetic_units(effect=0.0, rows=1500, seed=seed)
        matches = match(table, k=5, caliper=0.2)
        (effect,) = estimate_effects(table, matches, ["d_xrv100"], n_bootstrap=300, seed=1)
        estimates.append(effect.estimate)
        covered.append(effect.ci_low < 0.0 < effect.ci_high)
    assert abs(np.mean(estimates)) < 0.05
    assert sum(covered) >= 17


def test_matching_improves_balance() -> None:
    table = synthetic_units(effect=0.0)
    matches = match(table, k=5, caliper=0.2)
    balance = balance_table(table, matches).set_index("covariate")
    velocity = balance.loc["release_speed_mean_pre"]
    assert abs(velocity["smd_before"]) > 0.5
    assert abs(velocity["smd_after"]) < 0.1


def test_caliper_drops_unmatchable_redesigns() -> None:
    table = synthetic_units(effect=0.0)
    far = table.index[table["status"].eq(TREATED)][:5]
    table.loc[far, list(COVARIATES)] = -50.0
    matches = match(table, k=5, caliper=0.2)
    assert not set(far).intersection(matches["treated"])


def test_matching_stays_inside_exact_cells() -> None:
    table = synthetic_units(effect=0.0)
    table.loc[table.index % 3 == 0, "pair"] = "2023-2024"
    matches = match(table, k=5, caliper=0.2)
    pairs = table["pair"].to_numpy()
    assert (pairs[matches["treated"]] == pairs[matches["control"]]).all()
