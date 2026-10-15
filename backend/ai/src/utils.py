"""Helpers shared by more than one feature package."""

from datetime import UTC, datetime
from zoneinfo import ZoneInfo

# Shops are in Vietnam; the SQL prompt groups sales by the same zone.
SHOP_TIMEZONE = ZoneInfo("Asia/Ho_Chi_Minh")


def get_time(moment: datetime | None = None) -> datetime:
    """`moment` (now when omitted) on the shop's clock; the database stores UTC."""
    return (moment or datetime.now(UTC)).astimezone(SHOP_TIMEZONE)
