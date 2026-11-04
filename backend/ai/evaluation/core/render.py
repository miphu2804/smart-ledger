from dataclasses import dataclass

from rich.console import Console
from rich.table import Table as RichTable
from rich.text import Text

# Console colour of a cell whose text is exactly one of these words.
STATUS_STYLES = {"PASS": "green", "FAIL": "red"}


@dataclass
class Table:
    """A titled table of plain strings that renders to the console or to markdown."""

    title: str
    columns: list[str]
    rows: list[list[str]]


def print_table(table: Table, console: Console | None = None) -> None:
    """Prints the table; rich writes plain text, with no colour codes, when the output
    is not a terminal, so CI logs stay readable."""
    console = console or Console()
    rendered = RichTable(title=table.title)
    for column in table.columns:
        rendered.add_column(column)
    for row in table.rows:
        rendered.add_row(*(_style_cell(cell) for cell in row))
    console.print(rendered)


def markdown_table(table: Table) -> str:
    """The table as a `###` heading and a GitHub markdown table."""
    header = "| " + " | ".join(table.columns) + " |"
    divider = "|" + "---|" * len(table.columns)
    body = ["| " + " | ".join(row) + " |" for row in table.rows]
    return "\n".join([f"### {table.title}", "", header, divider, *body])


def _style_cell(cell: str) -> Text:
    # Text, not markup, so a cell such as "[a]" prints as written.
    return Text(cell, style=STATUS_STYLES.get(cell, ""))
