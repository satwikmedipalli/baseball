"""Run the offseason redesign study end to end and write its artifacts."""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import duckdb
import numpy as np
import pandas as pd

from shapeshift.config import Settings
from shapeshift.models.shape_value import MODEL_FEATURES, add_arsenal_context
from shapeshift.study.aggregate import PITCH_COLUMNS, SHAPE_FEATURES, season_table
from shapeshift.study.estimate import (
    COVARIATES,
    Effect,
    balance_table,
    estimate_effects,
    match,
    prepare_covariates,
)
from shapeshift.study.stuff import cross_fit_grades, grade_reliability
from shapeshift.study.treatment import (
    CONTROL,
    TREATED,
    attach_prior_season,
    build_pairs,
    classify_changes,
    outcome_deltas,
)

PRIMARY = "d_xrv100"
OUTCOMES = (
    "d_xrv100",
    "d_whiff_rate",
    "d_csw_rate",
    "d_chase_rate",
    "d_zone_rate",
    "d_xwoba_contact",
    "d_hard_rate",
    "d_rv100",
    "d_stuff100",
    "d_pitcher_xrv100",
    "d_usage",
)
PRETREND = ("pretrend_xrv100", "pretrend_whiff_rate", "pretrend_csw_rate")

# Thresholds from protocol v1, kept so the amendment can be checked.
V1_THRESHOLDS = {
    "release_speed": 1.0,
    "induced_vertical_break": 2.0,
    "arm_side_break": 2.0,
    "release_spin_rate": 150.0,
    "arm_angle": 4.0,
    "release_pos_z": 0.25,
    "release_side": 0.25,
    "release_extension": 0.3,
}


def load_pitches(database: Path) -> pd.DataFrame:
    columns = list(dict.fromkeys([*PITCH_COLUMNS, "pitch_family", "stand", *MODEL_FEATURES]))
    columns = [c for c in columns if not c.startswith("fb_")]
    with duckdb.connect(str(database), read_only=True) as connection:
        frame = connection.execute(
            f"SELECT {', '.join(columns)} FROM pitches WHERE NOT qa_exclude_primary"
        ).fetchdf()
    frame["game_date"] = pd.to_datetime(frame["game_date"])
    return frame


def graded_pitches(settings: Settings) -> tuple[pd.DataFrame, list[dict[str, Any]]]:
    """Pitches with out-of-season shape grades, cached next to the database."""
    cache = settings.paths.interim / "graded_pitches.parquet"
    card_path = settings.paths.interim / "grade_scorecards.json"
    if cache.exists() and card_path.exists():
        return pd.read_parquet(cache), json.loads(card_path.read_text())
    pitches = add_arsenal_context(load_pitches(settings.paths.database))
    pitches = pitches.loc[pitches["season"] >= settings.data.start_date.year - 1]
    grades, cards = cross_fit_grades(
        pitches,
        sample_size=settings.study.shape_model_sample,
        seed=settings.project.random_seed,
    )
    pitches = pitches.assign(stuff_xrv=grades)
    cache.parent.mkdir(parents=True, exist_ok=True)
    pitches.to_parquet(cache, index=False)
    card_path.write_text(json.dumps(cards, indent=2))
    return pitches, cards


def classify(
    seasons: pd.DataFrame,
    settings: Settings,
    scale: float = 1.0,
    thresholds: dict[str, float] | None = None,
    control_band: float | None = None,
) -> pd.DataFrame:
    study = settings.study
    material = thresholds or study.material_change
    pairs = build_pairs(
        seasons,
        study.all_pairs,
        min_pitches=study.min_pitches_per_season,
        mixed_type_share=study.mixed_type_share,
    )
    table = classify_changes(
        pairs,
        {feature: value * scale for feature, value in material.items()},
        min_noise_z=study.min_noise_z,
        control_band=control_band or study.control_band,
        persistence_share=study.persistence_share,
    )
    table = attach_prior_season(outcome_deltas(table), seasons, material)
    table["era"] = np.where(
        table["pair"].isin([f"{a}-{b}" for a, b in study.confirmation_pairs]),
        "confirmation",
        "development",
    )
    return prepare_covariates(table).reset_index(drop=True)


def _effects(
    table: pd.DataFrame,
    settings: Settings,
    *,
    outcomes: tuple[str, ...] = OUTCOMES,
    k: int | None = None,
    caliper: float | None = None,
    adjust: bool = True,
    n_bootstrap: int | None = None,
    subset: pd.Series | None = None,
    covariates: tuple[str, ...] = COVARIATES,
) -> tuple[list[Effect], pd.DataFrame]:
    study = settings.study
    treated_mask = table["status"].eq(TREATED)
    if subset is not None:
        treated_mask &= subset
    matches = match(
        table,
        k=k or study.n_controls,
        caliper=caliper or study.caliper,
        treated_mask=treated_mask,
        covariates=covariates,
    )
    effects = estimate_effects(
        table,
        matches,
        outcomes,
        n_bootstrap=n_bootstrap or study.n_bootstrap,
        seed=settings.project.random_seed,
        adjust=adjust,
        covariates=covariates,
    )
    return effects, matches


def _as_dict(effects: list[Effect]) -> dict[str, dict[str, Any]]:
    return {effect.outcome: effect.to_dict() for effect in effects}


def _primary(effects: list[Effect]) -> dict[str, Any] | None:
    for effect in effects:
        if effect.outcome == PRIMARY:
            return effect.to_dict()
    return None


def placebo_distribution(table: pd.DataFrame, settings: Settings) -> list[float]:
    """Primary-outcome estimates when fake redesigns are drawn from unchanged pitches.

    Each draw picks, cell by cell, as many controls as there are real redesigns and
    pretends they changed. The real estimate should sit outside this null distribution.
    """
    rng = np.random.default_rng(settings.project.random_seed + 1)
    controls = table.loc[table["status"].eq(CONTROL)]
    needed = table.loc[table["status"].eq(TREATED)].groupby(["study_group", "pair"]).size()
    estimates: list[float] = []
    for _ in range(settings.study.n_placebo):
        fake: list[int] = []
        for (group, pair), count in needed.items():
            pool = controls.index[(controls["study_group"] == group) & (controls["pair"] == pair)]
            # Leave at least two controls in the cell for every fake redesign.
            take = min(int(count), len(pool) // 3)
            if take > 0:
                fake.extend(rng.choice(pool, size=take, replace=False))
        if not fake:
            continue
        placebo = table.loc[table["status"].eq(CONTROL)].copy()
        placebo.loc[fake, "status"] = TREATED
        placebo = placebo.reset_index(drop=True)
        effects, _ = _effects(placebo, settings, outcomes=(PRIMARY,), n_bootstrap=100)
        if effects:
            estimates.append(effects[0].estimate)
    return estimates


def _benjamini_hochberg(p_values: list[float]) -> list[float]:
    """False-discovery-rate adjusted p-values (Benjamini-Hochberg)."""
    order = np.argsort(p_values)
    ranked = np.asarray(p_values)[order] * len(p_values) / (np.arange(len(p_values)) + 1)
    adjusted = np.minimum.accumulate(ranked[::-1])[::-1].clip(max=1.0)
    result = np.empty(len(p_values))
    result[order] = adjusted
    return result.tolist()


def subgroup_effects(
    table: pd.DataFrame,
    settings: Settings,
    matches: pd.DataFrame,
    *,
    by_group: bool = True,
) -> list[dict[str, Any]]:
    """Effects by type of change (optionally within pitch group), each era separately.

    Subgroups are slices of the one all-seasons matched design, so a subgroup's
    all-seasons estimate is always a blend of its two era estimates. p-values for the
    all-seasons estimate are adjusted for the number of cells tested.
    """
    rows: list[dict[str, Any]] = []
    treated = table.loc[table["status"].eq(TREATED)]
    keys = ["study_group", "change_label"] if by_group else ["change_label"]
    combos = treated.groupby(keys).size()
    outcomes = ("d_xrv100", "d_whiff_rate", "d_csw_rate", "d_stuff100", "d_usage")
    for key, count in combos.items():
        if count < settings.study.min_subgroup:
            continue
        group, label = key if by_group else ("any", key)
        subset = table["status"].eq(TREATED) & table["change_label"].eq(label)
        if by_group:
            subset &= table["study_group"].eq(group)
        row: dict[str, Any] = {"study_group": group, "change_label": label, "n": int(count)}
        for era, era_mask in (
            ("all", pd.Series(True, index=table.index)),
            ("development", table["era"].eq("development")),
            ("confirmation", table["era"].eq("confirmation")),
        ):
            positions = np.flatnonzero((subset & era_mask).to_numpy())
            effects = estimate_effects(
                table,
                matches,
                outcomes,
                n_bootstrap=1000,
                seed=settings.project.random_seed,
                treated_subset=positions,
            )
            row[era] = _as_dict(effects)
        rows.append(row)
    usable = [r for r in rows if PRIMARY in r["all"]]
    adjusted = _benjamini_hochberg([r["all"][PRIMARY]["p_value"] for r in usable]) if usable else []
    for r, q in zip(usable, adjusted, strict=True):
        r["q_value"] = q
    return sorted(rows, key=lambda r: -(r["all"].get(PRIMARY, {}).get("estimate", 0.0)))


def sensitivity(seasons: pd.DataFrame, table: pd.DataFrame, settings: Settings) -> list[dict]:
    """The primary estimate under reasonable alternative specifications."""
    rows: list[dict[str, Any]] = []

    def add(name: str, effects: list[Effect]) -> None:
        rows.append({"specification": name, **(_primary(effects) or {})})

    add("pre-registered", _effects(table, settings, outcomes=(PRIMARY,))[0])
    add("1 control per redesign", _effects(table, settings, outcomes=(PRIMARY,), k=1)[0])
    add("10 controls per redesign", _effects(table, settings, outcomes=(PRIMARY,), k=10)[0])
    add(
        "tighter caliper (0.05 SD)", _effects(table, settings, outcomes=(PRIMARY,), caliper=0.05)[0]
    )
    add("no regression adjustment", _effects(table, settings, outcomes=(PRIMARY,), adjust=False)[0])
    for scale in (0.75, 1.5):
        rescored = classify(seasons, settings, scale=scale)
        add(f"thresholds x{scale}", _effects(rescored, settings, outcomes=(PRIMARY,))[0])
    add(
        "also match on whole-arsenal results",
        _effects(
            table, settings, outcomes=(PRIMARY,), covariates=(*COVARIATES, "pitcher_xrv100_pre")
        )[0],
    )
    add(
        "only pitchers with one changed feature",
        _effects(table, settings, outcomes=(PRIMARY,), subset=table["n_material_features"].eq(1))[
            0
        ],
    )
    add(
        "exclude rebounds (feature moved back the year before)",
        _effects(table, settings, outcomes=(PRIMARY,), subset=~table["rebound"])[0],
    )
    add(
        "only units with a prior season",
        _effects(table, settings, outcomes=(PRIMARY,), subset=table["n_prior"].notna())[0],
    )
    add(
        "protocol v1 thresholds",
        _effects(
            classify(seasons, settings, thresholds=V1_THRESHOLDS, control_band=0.5),
            settings,
            outcomes=(PRIMARY,),
        )[0],
    )
    for pair in sorted(table["pair"].unique()):
        add(
            f"drop {pair}",
            _effects(
                table.loc[table["pair"].ne(pair)].reset_index(drop=True),
                settings,
                outcomes=(PRIMARY,),
            )[0],
        )
    return rows


def _velocity_check(table: pd.DataFrame, settings: Settings, matches: pd.DataFrame) -> dict:
    """Is the velocity result just pitchers winning back velocity they had lost?"""
    gain = table["status"].eq(TREATED) & table["change_label"].eq("more velocity")
    result: dict[str, Any] = {
        "gains": int(gain.sum()),
        "rebounds": int((gain & table["rebound"]).sum()),
    }
    for name, mask in (("all_gains", gain), ("excluding_rebounds", gain & ~table["rebound"])):
        effects = estimate_effects(
            table,
            matches,
            ("d_xrv100", "d_whiff_rate"),
            n_bootstrap=1000,
            seed=settings.project.random_seed,
            treated_subset=np.flatnonzero(mask.to_numpy()),
        )
        result[name] = _as_dict(effects)
    return result


def _fingerprint(settings: Settings) -> str:
    digest = hashlib.sha256()
    for path in sorted(settings.paths.raw.glob("year=*/*.manifest.json")):
        digest.update(path.read_bytes())
    return digest.hexdigest()[:16]


def run_study(settings: Settings) -> dict[str, Any]:
    reports = settings.paths.artifacts / "reports"
    reports.mkdir(parents=True, exist_ok=True)

    pitches, scorecards = graded_pitches(settings)
    reliability = grade_reliability(pitches)
    seasons = season_table(pitches)
    del pitches
    seasons.to_parquet(settings.paths.interim / "season_table.parquet", index=False)
    table = classify(seasons, settings)

    counts = table.groupby(["pair", "status"]).size().unstack(fill_value=0).reset_index()
    results: dict[str, Any] = {}
    matches_by_era: dict[str, pd.DataFrame] = {}
    for era in ("development", "confirmation", "all"):
        part = table if era == "all" else table.loc[table["era"].eq(era)].reset_index(drop=True)
        effects, matches = _effects(part, settings)
        pretrend, _ = _effects(part, settings, outcomes=PRETREND)
        treated_total = int(part["status"].eq(TREATED).sum())
        results[era] = {
            "effects": _as_dict(effects),
            "pretrend": _as_dict(pretrend),
            "balance": balance_table(part, matches).to_dict(orient="records"),
            "redesigns": treated_total,
            "matched_share": float(matches["treated"].nunique() / max(treated_total, 1)),
            "mean_match_distance": float(matches["distance"].mean()),
        }
        matches_by_era[era] = matches

    placebo = placebo_distribution(table, settings)
    actual = results["all"]["effects"][PRIMARY]["estimate"]
    report: dict[str, Any] = {
        "created_at_utc": datetime.now(UTC).isoformat(),
        "data_fingerprint": _fingerprint(settings),
        "config": settings.study.model_dump(),
        "units": {
            "outcome_scale": "change from season t to t+1, pitcher-side positive",
            "xrv100": "luck-adjusted runs saved per 100 pitches of that pitch",
            "rates": "proportions (0.01 = one percentage point)",
        },
        "counts": counts.to_dict(orient="records"),
        "shape_model": {
            "scorecards": scorecards,
            "reliability": reliability.to_dict(orient="records"),
        },
        "results": results,
        "placebo": {
            "estimates": placebo,
            "actual": actual,
            "share_as_extreme": float(np.mean(np.abs(placebo) >= abs(actual))) if placebo else None,
        },
        "subgroups": subgroup_effects(table, settings, matches_by_era["all"]),
        "change_types": subgroup_effects(table, settings, matches_by_era["all"], by_group=False),
        "sensitivity": sensitivity(seasons, table, settings),
        "velocity_check": _velocity_check(table, settings, matches_by_era["all"]),
    }

    keep = [
        "pitcher",
        "player_name_pre",
        "p_throws_pre",
        "study_group",
        "pair",
        "era",
        "status",
        "primary_feature",
        "direction",
        "change_label",
        "n_material_features",
        "pitcher_xrv100_pre",
        "rebound",
        "n_prior",
        "n_pre",
        "n_post",
        "starter_pre",
        "age_pre",
        "usage_pre",
        *[f"delta_{f}" for f in SHAPE_FEATURES],
        *[f"{f}_mean_pre" for f in SHAPE_FEATURES],
        *[f"{f}_mean_post" for f in SHAPE_FEATURES],
        *OUTCOMES,
        *PRETREND,
        "xrv100_pre",
        "xrv100_post",
        "stuff100_pre",
        "stuff100_post",
    ]
    table[[c for c in keep if c in table.columns]].to_parquet(
        reports / "study_units.parquet", index=False
    )
    matches_by_era["all"].to_parquet(reports / "study_matches.parquet", index=False)
    (reports / "study.json").write_text(json.dumps(report, indent=2, default=float) + "\n")
    return report
