"""Log line format shared by the dev terminal and Railway's log viewer."""

import logging

# ANSI colors on the level name only, so a line reads as success, warning, or error
# at a glance. Railway's viewer and a dev terminal both render these codes.
LEVEL_COLORS = {
    logging.DEBUG: "\033[2m",
    logging.INFO: "\033[32m",
    logging.WARNING: "\033[33m",
    logging.ERROR: "\033[31m",
    logging.CRITICAL: "\033[1;31m",
}
RESET = "\033[0m"


class LevelColorFormatter(logging.Formatter):
    """`asctime LEVEL name: message`, with the level name colored by severity."""

    def __init__(self) -> None:
        super().__init__("%(asctime)s %(levelname)s %(name)s: %(message)s")

    def format(self, record: logging.LogRecord) -> str:
        # The record is shared by every handler, so its level name is restored.
        original = record.levelname
        color = LEVEL_COLORS.get(record.levelno, "")
        # Padded before coloring, so the escape codes do not break the column.
        record.levelname = f"{color}{original:<8}{RESET}"
        try:
            return super().format(record)
        finally:
            record.levelname = original
