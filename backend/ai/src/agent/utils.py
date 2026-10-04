from langchain_core.messages import HumanMessage


def get_latest_human_message(messages: list) -> HumanMessage | None:
    """Return the owner's newest message, scanning back past the run's replies.

    History comes before the new message and the run appends AI and tool messages
    after it, so the last `HumanMessage` is the one this turn sent.
    """
    for message in reversed(messages):
        if isinstance(message, HumanMessage):
            return message
    return None
