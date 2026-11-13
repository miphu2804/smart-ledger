"""Screen buttons: the app screens a reply can link to, and the block that carries them.

The model asks for a button through `suggest_screen`; after the run, the screens it
asked for are appended to the answer as an ```actions block, which the mobile app
renders as buttons. Nothing here does I/O.
"""

import json
import re
from typing import Literal

from pydantic_ai import ToolReturn
from pydantic_ai.messages import ModelMessage, ToolReturnPart

# App screens a reply can link to; the mobile app maps each to its route and label.
Screen = Literal[
    "sales", "voice_order", "orders", "products", "debts", "expenses", "reports"
]


def suggest_screen(screen: Screen) -> ToolReturn:
    """Add a button under the reply that opens this app screen; the reply still says
    where the screen is in the app."""
    # The screen travels as metadata, which the model never reads back; the service
    # turns it into the button after the run, so no model text reaches the button.
    return ToolReturn(
        return_value=f"Button to {screen} added.", metadata={"screen": screen}
    )


# A reply links to at most this many screens, so the buttons fit under it on a phone.
MAX_SCREEN_BUTTONS = 2
# The screen-button block with_screen_buttons appends to a stored answer.
SCREEN_BUTTONS = re.compile(r"\n*```actions\n.*?\n```\s*$", re.DOTALL)


def accepted_screens(messages: list[ModelMessage]) -> list[str]:
    """The screens suggest_screen accepted this run, in order, without repeats."""
    screens = []
    for message in messages:
        for part in message.parts:
            if (
                isinstance(part, ToolReturnPart)
                and part.tool_name == suggest_screen.__name__
                and part.metadata["screen"] not in screens
            ):
                screens.append(part.metadata["screen"])
    return screens[:MAX_SCREEN_BUTTONS]


def with_screen_buttons(answer: str, screens: list[str]) -> str:
    """`answer` followed by the ```actions block of `screens`, if there are any.

    Stored with the answer, so the buttons come back with the conversation; the app
    renders the block as buttons, like a ```ui block as charts and cards.
    """
    if not screens:
        return answer
    return f"{answer}\n\n```actions\n{json.dumps(screens)}\n```"
