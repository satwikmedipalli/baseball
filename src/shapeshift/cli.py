"""ShapeShift command-line interface."""

from __future__ import annotations

from datetime import date
from pathlib import Path
from typing import Annotated

import typer
from rich.console import Console
from rich.table import Table

from shapeshift.config import load_settings
from shapeshift.data.ingest import fetch_range
from shapeshift.data.store import build_pitch_table, quality_summary

app = typer.Typer(
    name="shapeshift",
    help="Which MLB pitch redesigns work, measured on public Statcast data.",
    no_args_is_help=True,
)
console = Console()

ConfigOption = Annotated[
    Path,
    typer.Option("--config", "-c", help="Validated YAML configuration file."),
]


@app.command()
def fetch(
    start: Annotated[str, typer.Option(help="Inclusive start date (YYYY-MM-DD).")],
    end: Annotated[str, typer.Option(help="Inclusive end date (YYYY-MM-DD).")],
    config: ConfigOption = Path("config/default.yaml"),
    force: Annotated[bool, typer.Option(help="Replace existing partitions.")] = False,
) -> None:
    """Download resumable Statcast partitions."""
    settings = load_settings(config)
    try:
        start_date = date.fromisoformat(start)
        end_date = date.fromisoformat(end)
    except ValueError as error:
        raise typer.BadParameter("Dates must use YYYY-MM-DD format.") from error
    paths = fetch_range(
        start_date,
        end_date,
        settings.paths.raw,
        chunk_days=settings.data.chunk_days,
        force=force,
    )
    console.print(f"[green]Ready:[/green] {len(paths)} partition(s) in {settings.paths.raw}")


@app.command("build-store")
def build_store(config: ConfigOption = Path("config/default.yaml")) -> None:
    """Build the validated DuckDB pitch table."""
    settings = load_settings(config)
    rows = build_pitch_table(settings.paths.raw, settings.paths.database)
    console.print(f"[green]Ready:[/green] {rows:,} unique pitches in {settings.paths.database}")


@app.command()
def audit(config: ConfigOption = Path("config/default.yaml")) -> None:
    """Print the current data-quality scorecard."""
    settings = load_settings(config)
    summary = quality_summary(settings.paths.database)
    table = Table(title="ShapeShift data-quality scorecard")
    for column in summary.columns:
        table.add_column(column)
    for row in summary.to_dict(orient="records"):
        table.add_row(
            *(
                str(int(value))
                if column == "season"
                else f"{value:.3f}"
                if column.endswith("_missing")
                else f"{int(value):,}"
                for column, value in row.items()
            )
        )
    console.print(table)


@app.command()
def study(config: ConfigOption = Path("config/default.yaml")) -> None:
    """Run the offseason redesign study and write artifacts/reports/study.json."""
    from shapeshift.study.run import PRIMARY, run_study

    settings = load_settings(config)
    report = run_study(settings)
    table = Table(title="Effect of a redesign on luck-adjusted runs saved per 100 pitches")
    for column in ("era", "redesigns", "estimate", "95% interval", "pre-trend"):
        table.add_column(column)
    for era, result in report["results"].items():
        effect = result["effects"][PRIMARY]
        pre = result["pretrend"].get("pretrend_xrv100", {})
        table.add_row(
            era,
            str(effect["n_treated"]),
            f"{effect['estimate']:+.2f}",
            f"{effect['ci_low']:+.2f} to {effect['ci_high']:+.2f}",
            f"{pre.get('estimate', float('nan')):+.2f}",
        )
    console.print(table)


@app.command()
def report(config: ConfigOption = Path("config/default.yaml")) -> None:
    """Turn study.json into figures, docs/results.md, and the website's data file."""
    from shapeshift.study.report import write_report

    settings = load_settings(config)
    for path in write_report(settings):
        console.print(f"[green]Wrote[/green] {path}")


if __name__ == "__main__":
    app()
