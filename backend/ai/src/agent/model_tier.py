from enum import IntEnum


class Tier(IntEnum):
    """How much work a chat request takes; ordered, so a higher tier wins.

    Its own module because both the classifier that answers with a tier and the
    selector that maps it to a model need it.
    """

    SIMPLE = 0
    MEDIUM = 1
    COMPLEX = 2
