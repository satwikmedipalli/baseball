"""Typed configuration loading."""

from __future__ import annotations

from datetime import date
from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, ConfigDict, Field


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ProjectConfig(StrictModel):
    name: str
    random_seed: int = 42


class PathConfig(StrictModel):
    raw: Path
    interim: Path
    processed: Path
    database: Path
    artifacts: Path


class DataConfig(StrictModel):
    source: str
    chunk_days: int = Field(ge=1, le=31)
    start_date: date


class StudyConfig(StrictModel):
    min_pitches_per_season: int = Field(gt=0)
    material_change: dict[str, float]
    min_noise_z: float = Field(gt=0)
    control_band: float = Field(gt=0, lt=1)
    persistence_share: float = Field(gt=0, le=1)
    mixed_type_share: float = Field(gt=0, lt=1)
    development_pairs: list[tuple[int, int]]
    confirmation_pairs: list[tuple[int, int]]
    n_controls: int = Field(gt=0)
    caliper: float = Field(gt=0)
    n_bootstrap: int = Field(ge=100)
    n_placebo: int = Field(ge=10)
    min_subgroup: int = Field(gt=1)
    shape_model_sample: int = Field(gt=1000)

    @property
    def all_pairs(self) -> list[tuple[int, int]]:
        return [*self.development_pairs, *self.confirmation_pairs]


class Settings(StrictModel):
    project: ProjectConfig
    paths: PathConfig
    data: DataConfig
    study: StudyConfig


def load_settings(path: Path = Path("config/default.yaml")) -> Settings:
    """Load and validate a YAML configuration file."""
    with path.open(encoding="utf-8") as file:
        payload: Any = yaml.safe_load(file)
    return Settings.model_validate(payload)
