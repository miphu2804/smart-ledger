from pathlib import Path

import yaml


def load_yaml(path: Path) -> dict:
    """The data in the YAML file at `path`, with no custom tags allowed."""
    return yaml.safe_load(path.read_text())
