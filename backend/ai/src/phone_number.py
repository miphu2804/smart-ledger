"""Detector for Vietnamese phone numbers.

`InputRedaction` leaves phone numbers in the owner's message, because the owner may
ask about a customer by number. The memory rules use this pattern to keep phone
numbers out of what is stored for later turns.
"""

import re

# A Vietnamese phone number: 0, 84 or +84, then nine digits that spaces, dots or
# dashes may split. The lookbehind keeps a digit run inside a longer number, such as
# the money amount "120.000.000đ", from matching.
PHONE_NUMBER = re.compile(r"(?<![\d.,])(?:\+84|84|0)(?:[\s.\-]?\d){9}(?!\d)")
