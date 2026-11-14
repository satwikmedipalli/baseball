from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from shapeshift.study import report as report_module

ERAS = ("development", "confirmation", "all")


def effect(outcome: str, estimate: float = 0.2) -> dict[str, object]:
    return {
        "outcome": outcome,
        "estimate": estimate,
        "ci_low": estimate - 0.1,
        "ci_high": estimate + 0.1,
        "p_value": 0.01,
        "raw_difference": estimate,
        "treated_change": estimate,
        "control_change": 0.0,
        "n_treated": 50,
        "n_pitchers": 45,
        "n_controls_used": 120,
    }


def fake_report() -> dict[str, object]:
    effects = {outcome: effect(outcome) for outcome in report_module.OUTCOME_NAME}
    subgroup = {
        "study_group": "four_seam",
        "change_label": "more velocity",
        "n": 40,
        "q_value": 0.01,
        **{
            era: {"d_xrv100": effect("d_xrv100"), "d_whiff_rate": effect("d_whiff_rate", 0.03)}
            for era in ERAS
        },
    }
    return {
        "created_at_utc": "2026-11-14T00:00:00+00:00",
        "data_fingerprint": "abc123",
        "config": {"min_subgroup": 25},
        "counts": [{"pair": "2022-2023", "redesign": 50, "control": 120, "ambiguous": 80}],
        "results": {
            era: {
                "effects": effects,
                "pretrend": {"pretrend_xrv100": effect("pretrend_xrv100", 0.0)},
                "balance": [
                    {"covariate": "release_speed_mean_pre", "smd_before": 0.4, "smd_after": 0.02}
                ],
                "matched_share": 0.9,
            }
            for era in ERAS
        },
        "placebo": {"estimates": [0.01, -0.02, 0.0, 0.03], "actual": 0.2, "share_as_extreme": 0.0},
        "subgroups": [subgroup],
        "change_types": [{**subgroup, "study_group": "any"}],
        "sensitivity": [
            {"specification": "main specification (protocol v2)", **effect("d_xrv100")}
        ],
        "velocity_check": {
            "gains": 40,
            "rebounds": 3,
            "all_gains": {"d_xrv100": effect("d_xrv100")},
            "excluding_rebounds": {"d_xrv100": effect("d_xrv100")},
        },
        "shape_model": {
            "reliability": [
                {
                    "study_group": "four_seam",
                    "pairs": 100,
                    "grade_year_to_year_r": 0.8,
                    "results_year_to_year_r": 0.3,
                    "grade_predicts_next_results_r": 0.28,
                    "results_predict_next_results_r": 0.3,
                }
            ]
        },
    }


def test_report_writes_every_output_and_only_touches_the_readme_block(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    reports = tmp_path / "artifacts" / "reports"
    reports.mkdir(parents=True)
    (reports / "study.json").write_text(json.dumps(fake_report()))
    readme = tmp_path / "README.md"
    readme.write_text("intro\n<!-- results:start -->\nold\n<!-- results:end -->\noutro\n")
    for name, value in (
        ("FIGURES", tmp_path / "figures"),
        ("RESULTS_MD", tmp_path / "results.md"),
        ("README", readme),
        ("WEB_DATA", tmp_path / "web" / "study.json"),
    ):
        monkeypatch.setattr(report_module, name, value)

    settings = SimpleNamespace(paths=SimpleNamespace(artifacts=tmp_path / "artifacts"))
    written = report_module.write_report(settings)  # type: ignore[arg-type]

    for name in ("effects", "event_time", "change_types", "placebo", "balance"):
        assert (tmp_path / "figures" / f"{name}.png").stat().st_size > 10_000
    text = readme.read_text()
    assert text.startswith("intro\n") and text.endswith("outro\n")
    assert "old" not in text
    assert "more velocity" in text
    assert "0 of 4" in text
    site = json.loads((tmp_path / "web" / "study.json").read_text())
    assert site["headline"]["replicated_change_types"][0]["change_label"] == "more velocity"
    assert readme in written
