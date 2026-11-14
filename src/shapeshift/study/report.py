"""Figures, docs/results.md, the README results block, and the website data file.

Every number a reader sees is written here from artifacts/reports/study.json. Nothing
is typed by hand, so the README, the results page, and the site cannot disagree.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

from shapeshift.config import Settings

FIGURES = Path("docs/figures")
RESULTS_MD = Path("docs/results.md")
README = Path("README.md")
WEB_DATA = Path("web/public/study.json")
WEB_REDESIGNS = Path("web/public/redesigns.json")

# Reference palette, light mode (validated adjacent pair blue/orange).
SURFACE = "#fcfcfb"
INK = "#0b0b0b"
INK_2 = "#52514e"
MUTED = "#a3a29c"
GRID = "#e8e7e3"
ERA_COLOR = {"development": "#2a78d6", "confirmation": "#eb6834", "all": "#0b0b0b"}
ERA_NAME = {
    "development": "Development (2021-24)",
    "confirmation": "Held out (2024-26)",
    "all": "All seasons",
}

OUTCOME_NAME = {
    "d_xrv100": "Runs saved / 100 pitches (luck-adjusted)",
    "d_pitcher_xrv100": "Whole-arsenal runs saved / 100",
    "d_rv100": "Runs saved / 100 (actual results)",
    "d_stuff100": "Shape grade, runs / 100",
    "d_whiff_rate": "Whiff rate",
    "d_csw_rate": "Called strike + whiff rate",
    "d_chase_rate": "Chase rate",
    "d_zone_rate": "Zone rate",
    "d_hard_rate": "Hard-hit rate on contact (lower is better)",
    "d_xwoba_contact": "xwOBA on contact (lower is better)",
    "d_usage": "Usage share",
}
RATE_OUTCOMES = ("d_whiff_rate", "d_csw_rate", "d_chase_rate", "d_zone_rate", "d_hard_rate")
RUN_OUTCOMES = ("d_xrv100", "d_pitcher_xrv100", "d_rv100", "d_stuff100")
GROUP_NAME = {
    "four_seam": "Four-seam",
    "sinker": "Sinker",
    "cutter": "Cutter",
    "slider_sweeper": "Slider/sweeper",
    "curveball": "Curveball",
    "changeup": "Changeup",
    "splitter": "Splitter",
}


def _style() -> None:
    plt.rcParams.update(
        {
            "figure.facecolor": SURFACE,
            "axes.facecolor": SURFACE,
            "savefig.facecolor": SURFACE,
            "axes.edgecolor": MUTED,
            "axes.labelcolor": INK_2,
            "axes.titlecolor": INK,
            "axes.titleweight": "bold",
            "axes.titlesize": 11,
            "axes.titlelocation": "left",
            "axes.spines.top": False,
            "axes.spines.right": False,
            "axes.grid": True,
            "grid.color": GRID,
            "grid.linewidth": 0.8,
            "xtick.color": INK_2,
            "ytick.color": INK,
            "font.size": 9.5,
            "font.family": "DejaVu Sans",
            "legend.frameon": False,
        }
    )


def _forest(
    ax: Any, rows: list[tuple[str, dict[str, dict[str, Any]]]], scale: float, eras: tuple[str, ...]
) -> None:
    """Dot-and-interval rows; one dot per era, offset vertically."""
    offsets = np.linspace(-0.18, 0.18, len(eras)) if len(eras) > 1 else [0.0]
    for index, (_, by_era) in enumerate(rows):
        for offset, era in zip(offsets, eras, strict=True):
            effect = by_era.get(era)
            if not effect:
                continue
            y = index + offset
            ax.plot(
                [effect["ci_low"] * scale, effect["ci_high"] * scale],
                [y, y],
                color=ERA_COLOR[era],
                linewidth=2,
                solid_capstyle="round",
            )
            ax.plot(
                effect["estimate"] * scale,
                y,
                "o",
                color=ERA_COLOR[era],
                markersize=6.5,
                markeredgecolor=SURFACE,
                markeredgewidth=1.5,
            )
    ax.axvline(0, color=INK_2, linewidth=1)
    ax.set_yticks(range(len(rows)), [label for label, _ in rows])
    ax.invert_yaxis()
    ax.grid(axis="y", visible=False)


def _title(fig: Any, title: str, subtitle: str = "") -> None:
    """Title and subtitle placed in inches from the top, whatever the figure height."""
    height = fig.get_figheight()
    fig.text(
        0.01,
        1 - 0.12 / height,
        title,
        ha="left",
        va="top",
        fontsize=12,
        fontweight="bold",
        color=INK,
    )
    if subtitle:
        fig.text(0.01, 1 - 0.38 / height, subtitle, ha="left", va="top", fontsize=9.5, color=INK_2)


def _top(fig: Any) -> float:
    """Top of the plotting area, leaving room for `_title`."""
    return 1 - 0.68 / fig.get_figheight()


def _legend(fig: Any, eras: tuple[str, ...]) -> None:
    handles = [
        plt.Line2D([], [], color=ERA_COLOR[era], marker="o", linewidth=2, label=ERA_NAME[era])
        for era in eras
    ]
    fig.legend(handles=handles, loc="lower center", ncol=len(eras), bbox_to_anchor=(0.5, 0.0))


def figure_effects(report: dict[str, Any], path: Path) -> Path:
    eras = ("development", "confirmation")
    effects = {era: report["results"][era]["effects"] for era in eras}
    fig, (top, bottom) = plt.subplots(
        2,
        1,
        figsize=(8.2, 6.2),
        gridspec_kw={"height_ratios": [len(RUN_OUTCOMES), len(RATE_OUTCOMES)]},
    )
    _forest(
        top,
        [(OUTCOME_NAME[o], {e: effects[e].get(o) for e in eras}) for o in RUN_OUTCOMES],
        1.0,
        eras,
    )
    _title(
        fig,
        "What an average redesign did",
        "Redesign minus matched controls, change from the season before to the season after",
    )
    top.set_title("Runs")
    top.set_xlabel("runs per 100 pitches (positive = better for the pitcher)")
    _forest(
        bottom,
        [(OUTCOME_NAME[o], {e: effects[e].get(o) for e in eras}) for o in RATE_OUTCOMES],
        100.0,
        eras,
    )
    bottom.set_title("Pitch results")
    bottom.set_xlabel("percentage points")
    _legend(fig, eras)
    fig.tight_layout(rect=(0, 0.06, 1, _top(fig)))
    fig.savefig(path, dpi=200)
    plt.close(fig)
    return path


def figure_change_types(report: dict[str, Any], path: Path) -> Path:
    eras = ("all", "development", "confirmation")
    rows = [
        (f"{r['change_label']} (n={r['n']})", {era: r[era].get("d_xrv100") for era in eras})
        for r in report["change_types"]
    ]
    fig, ax = plt.subplots(figsize=(8.2, 0.42 * len(rows) + 1.8))
    _forest(ax, rows, 1.0, eras)
    _title(
        fig,
        "Which redesigns paid off?",
        "Main change in the pitch, any pitch type. "
        "Luck-adjusted runs saved per 100 pitches, 95% interval",
    )
    ax.set_xlabel("runs per 100 pitches (positive = better for the pitcher)")
    _legend(fig, eras)
    fig.tight_layout(rect=(0, 0.04, 1, _top(fig)))
    fig.savefig(path, dpi=200)
    plt.close(fig)
    return path


def figure_placebo(report: dict[str, Any], path: Path) -> Path:
    placebo = np.asarray(report["placebo"]["estimates"], dtype=float)
    actual = report["placebo"]["actual"]
    fig, ax = plt.subplots(figsize=(8.2, 3.0))
    ax.hist(placebo, bins=30, color=MUTED, edgecolor=SURFACE, linewidth=1.5)
    ax.axvline(actual, color=ERA_COLOR["development"], linewidth=2)
    ax.annotate(
        f"real redesigns: {actual:+.2f}",
        xy=(actual, ax.get_ylim()[1] * 0.92),
        xytext=(6, 0),
        textcoords="offset points",
        color=INK,
        fontsize=9,
    )
    _title(
        fig,
        "Placebo test",
        f"{len(placebo)} draws of fake redesigns from unchanged pitches, same estimator",
    )
    ax.set_xlabel("estimated effect, runs per 100 pitches")
    ax.set_ylabel("draws")
    ax.grid(axis="x", visible=False)
    fig.tight_layout(rect=(0, 0, 1, _top(fig)))
    fig.savefig(path, dpi=200)
    plt.close(fig)
    return path


def figure_event_time(report: dict[str, Any], path: Path) -> Path:
    eras = ("development", "confirmation")
    fig, ax = plt.subplots(figsize=(8.2, 3.6))
    for shift, era in zip((-0.06, 0.06), eras, strict=True):
        result = report["results"][era]
        points = [result["pretrend"].get("pretrend_xrv100"), result["effects"].get("d_xrv100")]
        xs = np.array([0, 1]) + shift
        for x, point in zip(xs, points, strict=True):
            if point:
                ax.plot(
                    [x, x], [point["ci_low"], point["ci_high"]], color=ERA_COLOR[era], linewidth=2
                )
                ax.plot(
                    x,
                    point["estimate"],
                    "o",
                    color=ERA_COLOR[era],
                    markersize=6.5,
                    markeredgecolor=SURFACE,
                    markeredgewidth=1.5,
                )
    ax.axhline(0, color=INK_2, linewidth=1)
    ax.set_xticks(
        [0, 1],
        [
            "Season before the redesign\n(t-1 to t, should be ~0)",
            "Season of the redesign\n(t to t+1)",
        ],
    )
    ax.set_xlim(-0.5, 1.5)
    ax.set_ylabel("runs per 100 pitches")
    _title(
        fig,
        "Were redesigners already trending?",
        "Redesign minus matched controls, luck-adjusted runs saved per 100 pitches, 95% interval",
    )
    ax.grid(axis="x", visible=False)
    _legend(fig, eras)
    fig.tight_layout(rect=(0, 0.08, 1, _top(fig)))
    fig.savefig(path, dpi=200)
    plt.close(fig)
    return path


def figure_balance(report: dict[str, Any], path: Path) -> Path:
    balance = report["results"]["all"]["balance"]
    fig, ax = plt.subplots(figsize=(8.2, 0.3 * len(balance) + 1.2))
    for index, row in enumerate(balance):
        ax.plot([row["smd_before"], row["smd_after"]], [index, index], color=GRID, linewidth=2)
        ax.plot(row["smd_before"], index, "o", color=MUTED, markersize=6.5)
        ax.plot(row["smd_after"], index, "o", color=ERA_COLOR["development"], markersize=6.5)
    for edge in (-0.1, 0.1):
        ax.axvline(edge, color=INK_2, linewidth=0.8, linestyle=(0, (3, 3)))
    ax.axvline(0, color=INK_2, linewidth=1)
    ax.set_yticks(range(len(balance)), [_covariate_name(r["covariate"]) for r in balance])
    ax.invert_yaxis()
    ax.grid(axis="y", visible=False)
    _title(
        fig,
        "Covariate balance",
        "Standardized gap between redesigns and controls, before and after matching",
    )
    ax.set_xlabel("standardized mean difference (|0.1| or less is well balanced)")
    handles = [
        plt.Line2D([], [], color=MUTED, marker="o", linestyle="", label="All controls"),
        plt.Line2D(
            [],
            [],
            color=ERA_COLOR["development"],
            marker="o",
            linestyle="",
            label="Matched controls",
        ),
    ]
    fig.legend(handles=handles, loc="lower center", ncol=2, bbox_to_anchor=(0.5, 0.0))
    fig.tight_layout(rect=(0, 0.07, 1, _top(fig)))
    fig.savefig(path, dpi=200)
    plt.close(fig)
    return path


def _covariate_name(column: str) -> str:
    return (
        column.replace("_mean_pre", "")
        .replace("_pre", "")
        .replace("_", " ")
        .replace("xrv100", "runs saved / 100")
        .replace("pos z", "height")
    )


def _fmt(effect: dict[str, Any] | None, scale: float = 1.0, digits: int = 2) -> str:
    if not effect:
        return "n/a"
    return (
        f"{effect['estimate'] * scale:+.{digits}f} "
        f"({effect['ci_low'] * scale:+.{digits}f} to {effect['ci_high'] * scale:+.{digits}f})"
    )


def headline(report: dict[str, Any]) -> dict[str, Any]:
    """The handful of numbers the README and site lead with."""
    results = report["results"]
    counts = report["counts"]
    total = {
        key: sum(row.get(key, 0) for row in counts) for key in ("redesign", "control", "ambiguous")
    }
    placebo = report["placebo"]
    # "Held up" = survives the false-discovery adjustment and points the same way in
    # both eras. Decided before reading the table, applied mechanically here.
    best = [
        r
        for r in report["change_types"]
        if r.get("q_value", 1.0) < 0.05
        and r["development"].get("d_xrv100", {}).get("estimate", 0) > 0
        and r["confirmation"].get("d_xrv100", {}).get("estimate", 0) > 0
    ]
    return {
        "pitch_seasons": sum(total.values()),
        "redesigns": total["redesign"],
        "controls": total["control"],
        "primary": {era: results[era]["effects"]["d_xrv100"] for era in results},
        "whiff": {era: results[era]["effects"].get("d_whiff_rate") for era in results},
        "pretrend": {era: results[era]["pretrend"].get("pretrend_xrv100") for era in results},
        "matched_share": {era: results[era]["matched_share"] for era in results},
        "placebo_share": placebo["share_as_extreme"],
        "placebo_draws": len(placebo["estimates"]),
        "replicated_change_types": [
            {
                "study_group": r["study_group"],
                "change_label": r["change_label"],
                "n": r["n"],
                "effect": r["all"]["d_xrv100"],
                "q_value": r["q_value"],
                "whiff": r["all"].get("d_whiff_rate"),
                "development": r["development"]["d_xrv100"],
                "confirmation": r["confirmation"]["d_xrv100"],
            }
            for r in best
        ],
        "velocity_check": report.get("velocity_check"),
    }


def _row(*cells: object) -> str:
    """One Markdown table row."""
    return "| " + " | ".join(str(cell) for cell in cells) + " |"


def _placebo_sentence(head: dict[str, Any]) -> str:
    if head["placebo_share"] is None:
        return "Placebo: not run."
    draws = head["placebo_draws"]
    extreme = round(head["placebo_share"] * draws)
    bound = f"p < {1 / draws:.3f}" if extreme == 0 else f"p = {head['placebo_share']:.3f}"
    return (
        f"Placebo: {draws} draws of fake redesigns from unchanged pitches, run through the "
        f"same estimator. {extreme} of {draws} were as extreme as the real estimate ({bound})."
    )


def results_markdown(report: dict[str, Any], head: dict[str, Any]) -> str:
    lines = [
        "# Results",
        "",
        "Generated by `shapeshift report` from `artifacts/reports/study.json` "
        f"(data fingerprint `{report['data_fingerprint']}`, run {report['created_at_utc'][:10]}). "
        "Do not edit by hand.",
        "",
        "All effects are **redesign minus matched controls**, measured as the change from "
        "the season before a redesign to the season after. Positive is better for the "
        "pitcher. Intervals are 95%, from a pitcher-clustered bootstrap.",
        "",
        "## Sample",
        "",
        "| Season pair | Redesigns | Controls | Ambiguous (excluded) |",
        "|---|---:|---:|---:|",
    ]
    for row in report["counts"]:
        lines.append(
            _row(
                row["pair"], row.get("redesign", 0), row.get("control", 0), row.get("ambiguous", 0)
            )
        )
    lines += [
        "",
        "## Main estimates",
        "",
        "| Outcome | Development (2021-24) | Held out (2024-26) | All |",
        "|---|---|---|---|",
    ]
    for outcome, name in OUTCOME_NAME.items():
        scale = (
            100.0
            if outcome in RATE_OUTCOMES or outcome == "d_usage"
            else (1000.0 if outcome == "d_xwoba_contact" else 1.0)
        )
        unit = " (pp)" if scale == 100.0 else (" (points)" if scale == 1000.0 else "")
        cells = [
            _fmt(report["results"][era]["effects"].get(outcome), scale)
            for era in ("development", "confirmation", "all")
        ]
        lines.append(f"| {name}{unit} | " + " | ".join(cells) + " |")
    lines += [
        "",
        "## Checks",
        "",
        "| Check | Development | Held out | All |",
        "|---|---|---|---|",
        "| Pre-trend, runs / 100 (season before the redesign) | "
        + " | ".join(
            _fmt(report["results"][e]["pretrend"].get("pretrend_xrv100"))
            for e in ("development", "confirmation", "all")
        )
        + " |",
        "| Redesigns matched within the caliper | "
        + " | ".join(
            f"{report['results'][e]['matched_share']:.0%}"
            for e in ("development", "confirmation", "all")
        )
        + " |",
        "",
        _placebo_sentence(head),
        "",
        "## Sensitivity of the main estimate",
        "",
        "| Specification | Estimate (95% interval) | Redesigns |",
        "|---|---|---:|",
    ]
    for row in report["sensitivity"]:
        lines.append(
            _row(
                row["specification"],
                _fmt(row if "estimate" in row else None),
                row.get("n_treated", 0),
            )
        )
    lines += [
        "",
        "## By type of change, any pitch",
        "",
        "Each redesign is labelled by the feature that moved most relative to its threshold. "
        "Slices of the one all-seasons matched design. q is the Benjamini-Hochberg "
        "false-discovery-adjusted p-value across these rows.",
        "",
        "| Change | n | All seasons | q | Development | Held out | Whiff rate (pp) |",
        "|---|---:|---|---:|---|---|---|",
    ]
    for r in report["change_types"]:
        lines.append(
            _row(
                r["change_label"],
                r["n"],
                _fmt(r["all"].get("d_xrv100")),
                f"{r.get('q_value', float('nan')):.3f}",
                _fmt(r["development"].get("d_xrv100")),
                _fmt(r["confirmation"].get("d_xrv100")),
                _fmt(r["all"].get("d_whiff_rate"), 100, 1),
            )
        )
    check = report.get("velocity_check")
    if check:
        lines += [
            "",
            "### Is the velocity result just injury recovery?",
            "",
            f"{check['rebounds']} of {check['gains']} velocity gains won back at least 1 mph lost "
            "the season before. Effect on runs saved per 100 pitches: "
            f"{_fmt(check['all_gains'].get('d_xrv100'))} for all gains, "
            f"{_fmt(check['excluding_rebounds'].get('d_xrv100'))} excluding rebounds.",
        ]
    lines += [
        "",
        "## By pitch and type of change",
        "",
        f"Pitch group x change type cells with at least {report['config']['min_subgroup']} "
        "redesigns. Runs saved per 100 pitches of that pitch.",
        "",
        "| Pitch | Change | n | All seasons | Development | Held out |",
        "|---|---|---:|---|---|---|",
    ]
    for r in report["subgroups"]:
        lines.append(
            _row(
                GROUP_NAME.get(r["study_group"], r["study_group"]),
                r["change_label"],
                r["n"],
                _fmt(r["all"].get("d_xrv100")),
                _fmt(r["development"].get("d_xrv100")),
                _fmt(r["confirmation"].get("d_xrv100")),
            )
        )
    lines += [
        "",
        "## Shape model",
        "",
        "Year-to-year correlation for the same pitcher and pitch "
        "(pitch-seasons with 150+ pitches). A shape grade is useful if it is stable and "
        "predicts next season's results better than this season's results do.",
        "",
        _row(
            "Pitch",
            "Pairs",
            "Grade r(t, t+1)",
            "Results r(t, t+1)",
            "Grade -> next results",
            "Results -> next results",
        ),
        "|---|---:|---:|---:|---:|---:|",
    ]
    for row in report["shape_model"]["reliability"]:
        if row["study_group"] == "other":
            continue
        lines.append(
            _row(
                GROUP_NAME.get(row["study_group"], row["study_group"]),
                row["pairs"],
                *(
                    f"{row[key]:.2f}"
                    for key in (
                        "grade_year_to_year_r",
                        "results_year_to_year_r",
                        "grade_predicts_next_results_r",
                        "results_predict_next_results_r",
                    )
                ),
            )
        )
    lines += ["", "## Figures", ""]
    for name in ("effects", "event_time", "change_types", "placebo", "balance"):
        lines.append(f"![{name}](figures/{name}.png)")
        lines.append("")
    return "\n".join(lines)


def readme_block(head: dict[str, Any]) -> str:
    primary = head["primary"]
    whiff = head["whiff"]
    lines = [
        f"- **Sample:** {head['pitch_seasons']:,} pitcher-pitch season pairs from 2021 to 2026: "
        f"{head['redesigns']:,} redesigns, {head['controls']:,} unchanged controls.",
        f"- **Average redesign, luck-adjusted runs saved per 100 pitches:** "
        f"{_fmt(primary['development'])} in development seasons, "
        f"{_fmt(primary['confirmation'])} in the held-out seasons.",
        f"- **Whiff rate:** {_fmt(whiff['development'], 100, 1)} pp (development), "
        f"{_fmt(whiff['confirmation'], 100, 1)} pp (held out).",
        "- **Pre-trend check (season before the redesign):** "
        f"{_fmt(head['pretrend']['development'])} (development), "
        f"{_fmt(head['pretrend']['confirmation'])} (held out).",
    ]
    if head["placebo_share"] is not None:
        lines.append(f"- **{_placebo_sentence(head).replace('Placebo:', 'Placebo:**', 1)}")
    if head["replicated_change_types"]:
        names = "; ".join(
            f"{r['change_label']} ({_fmt(r['effect'])} runs/100, q={r['q_value']:.3f}, n={r['n']})"
            for r in head["replicated_change_types"]
        )
        lines.append(
            "- **Change types that survive the false-discovery adjustment and point the same way "
            f"in both eras:** {names}."
        )
    else:
        lines.append("- **Change types that held up in both eras:** none cleared the bar.")
    return "\n".join(lines)


def redesign_records(reports: Path) -> dict[str, Any] | None:
    """Every matched redesign, plus a background cloud of pitch shapes, for the website.

    ``gap`` is one redesign's change in luck-adjusted runs per 100 minus the average
    change of its matched look-alikes: a noisy single-case estimate, shown as such.
    """
    units_path, matches_path = reports / "study_units.parquet", reports / "study_matches.parquet"
    if not units_path.exists() or not matches_path.exists():
        return None
    import pandas as pd

    units = pd.read_parquet(units_path)
    matches = pd.read_parquet(matches_path)
    control_change = (
        matches.assign(change=units["d_xrv100"].reindex(matches["control"]).to_numpy())
        .groupby("treated")["change"]
        .mean()
    )
    treated = units.loc[control_change.index]

    def name(raw: object) -> str:
        return " ".join(reversed(str(raw).split(", ")))

    records = []
    for index, row in treated.iterrows():
        records.append(
            {
                "id": int(index),
                "name": name(row["player_name_pre"]),
                "pitcher": int(row["pitcher"]),
                "pitch": str(row["study_group"]),
                "pair": str(row["pair"]),
                "era": str(row["era"]),
                "change": str(row["change_label"]),
                "rebound": bool(row["rebound"]),
                "velo": [
                    round(float(row["release_speed_mean_pre"]), 1),
                    round(float(row["release_speed_mean_post"]), 1),
                ],
                "ivb": [
                    round(float(row["induced_vertical_break_mean_pre"]), 1),
                    round(float(row["induced_vertical_break_mean_post"]), 1),
                ],
                "hb": [
                    round(float(row["arm_side_break_mean_pre"]), 1),
                    round(float(row["arm_side_break_mean_post"]), 1),
                ],
                "spin": [
                    round(float(row["release_spin_rate_mean_pre"])),
                    round(float(row["release_spin_rate_mean_post"])),
                ],
                "whiff": [
                    round(float(row["whiff_rate_pre"]), 3),
                    round(float(row["whiff_rate_post"]), 3),
                ],
                "n": int(row["n_post"]),
                "own": round(float(row["d_xrv100"]), 3),
                "matched": round(float(control_change.loc[index]), 3),
                "gap": round(float(row["d_xrv100"] - control_change.loc[index]), 3),
            }
        )
    cloud: dict[str, list[list[float]]] = {}
    for group, frame in units.groupby("study_group"):
        cloud[str(group)] = (
            frame[["arm_side_break_mean_pre", "induced_vertical_break_mean_pre"]]
            .dropna()
            .round(1)
            .to_numpy()
            .tolist()
        )
    return {"redesigns": records, "cloud": cloud}


def featured_example(reports: Path) -> dict[str, Any] | None:
    """The largest fastball velocity gain in the sample, with its matched comparisons.

    Picked by rule, not by hand: the four-seam "more velocity" redesign (excluding
    rebounds) with the biggest gain that has at least one matched control.
    """
    units_path, matches_path = reports / "study_units.parquet", reports / "study_matches.parquet"
    if not units_path.exists() or not matches_path.exists():
        return None
    import pandas as pd

    units = pd.read_parquet(units_path)
    matches = pd.read_parquet(matches_path)
    candidates = units.loc[
        units["status"].eq("redesign")
        & units["change_label"].eq("more velocity")
        & units["study_group"].eq("four_seam")
        & ~units["rebound"].astype(bool)
        & units.index.isin(matches["treated"])
    ]
    if candidates.empty:
        return None
    index = candidates["delta_release_speed"].idxmax()
    row = units.loc[index]
    controls = units.loc[matches.loc[matches["treated"].eq(index), "control"]]
    last, first = [*str(row["player_name_pre"]).split(", "), ""][:2]
    season_pre, season_post = (int(x) for x in str(row["pair"]).split("-"))

    def side(r: Any, when: str) -> dict[str, float]:
        return {
            "velocity": float(r[f"release_speed_mean_{when}"]),
            "ride": float(r[f"induced_vertical_break_mean_{when}"]),
            "run": float(r[f"arm_side_break_mean_{when}"]),
            "whiff_rate": float(r[f"whiff_rate_{when}"]),
            "xrv100": float(r[f"xrv100_{when}"]),
            "pitches": int(r[f"n_{when}"]),
        }

    return {
        "id": int(index),
        "name": f"{first} {last}".strip(),
        "pitch": "four-seam fastball",
        "season_pre": season_pre,
        "season_post": season_post,
        "before": side(row, "pre"),
        "after": side(row, "post"),
        "d_xrv100": float(row["d_xrv100"]),
        "matches": [
            {
                "name": " ".join(reversed(str(c["player_name_pre"]).split(", "))),
                "d_velocity": float(c["delta_release_speed"]),
                "d_xrv100": float(c["d_xrv100"]),
                "d_whiff_rate": float(c["d_whiff_rate"]),
            }
            for _, c in controls.iterrows()
        ],
    }


def pitches_per_season(reports: Path) -> int | None:
    """Median pitches a redesigned pitch was thrown in its redesign season."""
    path = reports / "study_units.parquet"
    if not path.exists():
        return None
    import pandas as pd

    units = pd.read_parquet(path, columns=["status", "n_post"])
    return int(units.loc[units["status"].eq("redesign"), "n_post"].median())


def write_report(settings: Settings) -> list[Path]:
    report = json.loads((settings.paths.artifacts / "reports" / "study.json").read_text())
    _style()
    FIGURES.mkdir(parents=True, exist_ok=True)
    written = [
        figure_effects(report, FIGURES / "effects.png"),
        figure_event_time(report, FIGURES / "event_time.png"),
        figure_change_types(report, FIGURES / "change_types.png"),
        figure_placebo(report, FIGURES / "placebo.png"),
        figure_balance(report, FIGURES / "balance.png"),
    ]
    head = headline(report)
    RESULTS_MD.write_text(results_markdown(report, head) + "\n")
    written.append(RESULTS_MD)

    if README.exists():
        text = README.read_text()
        block = f"<!-- results:start -->\n{readme_block(head)}\n<!-- results:end -->"
        updated = re.sub(r"<!-- results:start -->.*?<!-- results:end -->", block, text, flags=re.S)
        if updated != text:
            README.write_text(updated)
            written.append(README)

    WEB_DATA.parent.mkdir(parents=True, exist_ok=True)
    site = {
        "created_at_utc": report["created_at_utc"],
        "data_fingerprint": report["data_fingerprint"],
        "headline": head,
        "counts": report["counts"],
        "results": {
            era: {
                "effects": v["effects"],
                "pretrend": v["pretrend"],
                "matched_share": v["matched_share"],
            }
            for era, v in report["results"].items()
        },
        "subgroups": report["subgroups"],
        "change_types": report["change_types"],
        "sensitivity": report["sensitivity"],
        "placebo": {
            "share_as_extreme": report["placebo"]["share_as_extreme"],
            "estimates": report["placebo"]["estimates"],
            "actual": report["placebo"]["actual"],
        },
        "reliability": report["shape_model"]["reliability"],
        "config": report["config"],
        "data": report.get("data"),
        "example": featured_example(settings.paths.artifacts / "reports"),
        "pitches_per_season": pitches_per_season(settings.paths.artifacts / "reports"),
    }
    WEB_DATA.write_text(json.dumps(site, indent=1) + "\n")
    written.append(WEB_DATA)
    records = redesign_records(settings.paths.artifacts / "reports")
    if records is not None:
        WEB_REDESIGNS.write_text(json.dumps(records, separators=(",", ":")) + "\n")
        written.append(WEB_REDESIGNS)
    return written
