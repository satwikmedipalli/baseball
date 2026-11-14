"""DuckDB materialization and audit summaries."""

from __future__ import annotations

from pathlib import Path

import duckdb
import pandas as pd
import pyarrow.parquet as pq

from shapeshift.data.features import add_canonical_pitch_features, flag_quality_issues
from shapeshift.data.outcomes import add_outcome_labels
from shapeshift.data.schema import source_columns

# Raw Savant columns not needed after features are derived.
_DROP_AFTER_FEATURES = ("pfx_x", "pfx_z", "api_break_x_arm", "events", "woba_denom")


def discover_partitions(raw_root: Path) -> list[Path]:
    """Return stable, sorted raw Statcast partitions."""
    return sorted(raw_root.glob("year=*/statcast_*.parquet"))


def read_partition(path: Path) -> pd.DataFrame:
    """Read only the columns the study uses; older partitions may lack optional ones."""
    available = set(pq.read_schema(path).names)
    wanted = [column for column in source_columns() if column in available]
    if not wanted:
        return pd.DataFrame()
    return pd.read_parquet(path, columns=wanted)


def transform_partition(frame: pd.DataFrame) -> pd.DataFrame:
    """Raw Savant rows -> canonical, labelled, quality-flagged pitches."""
    pitches = add_outcome_labels(flag_quality_issues(add_canonical_pitch_features(frame)))
    return pitches.drop(columns=[c for c in _DROP_AFTER_FEATURES if c in pitches.columns])


def build_pitch_table(raw_root: Path, database: Path) -> int:
    """Transform every raw partition and write one de-duplicated pitch table."""
    partitions = discover_partitions(raw_root)
    if not partitions:
        raise FileNotFoundError(f"No Statcast Parquet partitions found under {raw_root}")

    frames: list[pd.DataFrame] = []
    for path in partitions:
        raw = read_partition(path)
        if raw.empty:
            continue
        frames.append(transform_partition(raw))
    if not frames:
        raise FileNotFoundError(f"No non-empty Statcast partitions found under {raw_root}")

    columns = sorted(set().union(*(frame.columns for frame in frames)))
    pitches = pd.concat([frame.reindex(columns=columns) for frame in frames], ignore_index=True)
    del frames
    pitches = pitches.drop_duplicates(subset=["pitch_uid"], keep="last")

    database.parent.mkdir(parents=True, exist_ok=True)
    with duckdb.connect(str(database)) as connection:
        connection.register("pitch_frame", pitches)
        connection.execute(
            "CREATE OR REPLACE TABLE pitches AS SELECT * FROM pitch_frame ORDER BY game_date"
        )
        row_count = connection.execute("SELECT count(*) FROM pitches").fetchone()
    return int(row_count[0]) if row_count else 0


def quality_summary(database: Path) -> pd.DataFrame:
    """Summarize exclusions and missingness for review."""
    with duckdb.connect(str(database), read_only=True) as connection:
        return connection.execute(
            """
            SELECT
                season,
                count(*) AS pitches,
                sum(qa_exclude_primary::INTEGER) AS excluded,
                sum(qa_missing_shape::INTEGER) AS missing_shape,
                sum(qa_implausible_velocity::INTEGER) AS bad_velocity,
                sum(qa_implausible_movement::INTEGER) AS bad_movement,
                sum(qa_non_regular_season::INTEGER) AS non_regular,
                round(avg((arm_angle IS NULL)::INTEGER), 3) AS arm_angle_missing,
                count(DISTINCT pitcher) AS pitchers
            FROM pitches
            GROUP BY season
            ORDER BY season
            """
        ).fetchdf()
