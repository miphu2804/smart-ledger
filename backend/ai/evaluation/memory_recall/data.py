"""Synthetic owner memories and queries for the agent-memory recall benchmark.

Every shop gets a store of facts in the shapes MEMORY_EXTRACT_PROMPT asks for
(preference, semantic, procedural, episodic), with dates, importance and a share of
"two versions" pairs that reconcile missed. Queries target one fact each, in three
surface forms (accented, typed without diacritics, paraphrase with no shared content
word), plus queries that need no memory at all.

The lexicon and query templates are split in two halves: dev uses half A, the
held-out test uses half B, so a config cannot win by fitting names or phrasings.
"""

import random
import unicodedata
from dataclasses import dataclass, field

# --- lexicon, split A (dev) / B (test) -------------------------------------------

PRODUCTS = {
    "A": [
        ("gạo ST25", "loại hạt nấu cơm"),
        ("nước mắm Nam Ngư", "đồ chấm làm từ cá"),
        ("dầu ăn Tường An", "thứ để chiên xào"),
        ("bia Tiger", "đồ uống có cồn"),
        ("mì Hảo Hảo", "đồ ăn liền úp nước sôi"),
        ("trứng gà", "hàng do gia cầm đẻ"),
        ("sữa Vinamilk", "đồ uống cho trẻ con"),
        ("bột giặt OMO", "đồ giặt quần áo"),
        ("nước đá", "hàng làm lạnh đồ uống"),
        ("bánh mì", "hàng nướng buổi sáng"),
    ],
    "B": [
        ("đường cát", "thứ tạo vị ngọt"),
        ("cà phê Trung Nguyên", "hạt rang pha uống buổi sáng"),
        ("nước ngọt Coca", "lon có ga"),
        ("thuốc lá Jet", "hàng để hút"),
        ("xà phòng Lifebuoy", "đồ rửa tay"),
        ("kẹo Alpenliebe", "đồ ngọt cho con nít"),
        ("bột ngọt Ajinomoto", "gia vị làm đậm vị canh"),
        ("rau muống", "đồ xanh nấu canh"),
        ("thịt heo", "đồ tươi từ lợn"),
        ("than tổ ong", "chất đốt nấu bếp"),
    ],
}
PEOPLE = {
    "A": [
        "chị Lan",
        "anh Tùng",
        "cô Hoa",
        "anh Minh",
        "chú Bảy",
        "chị Mai",
        "bé Thảo",
        "anh Khoa",
        "bà Tư",
        "chú Sáu",
        "anh Hùng",
        "cô Hạnh",
    ],
    "B": [
        "chị Nga",
        "anh Phong",
        "cô Duyên",
        "anh Quang",
        "chú Tám",
        "chị Thu",
        "bé Vy",
        "anh Đạt",
        "bà Năm",
        "chú Hai",
        "anh Lộc",
        "cô Trinh",
    ],
}
WEEKDAYS = ["thứ hai", "thứ ba", "thứ tư", "thứ năm", "thứ sáu", "thứ bảy", "chủ nhật"]

# --- fact templates: (relation, memory_type, importance range, text) -------------
# {p} product, {x} person, {d} weekday, {n} number

FACTS = [
    ("supplier", "semantic", (0.5, 0.7), "{p} lấy của {x}, {x} giao vào {d}."),
    (
        "price",
        "procedural",
        (0.6, 0.8),
        "Khách sỉ mua {p} thì bớt {n} nghìn mỗi thùng.",
    ),
    ("stock", "procedural", (0.6, 0.8), "{p} còn dưới {n} thùng thì báo để đặt thêm."),
    ("staff", "semantic", (0.5, 0.7), "{x} phụ bán ca chiều, nghỉ {d}."),
    ("debt", "procedural", (0.7, 0.9), "{x} chỉ được ghi nợ tối đa {n}0 nghìn."),
    ("customer", "semantic", (0.4, 0.6), "{x} hay mua {p} và trả tiền cuối tuần."),
    ("event", "episodic", (0.2, 0.4), "Hôm {d} tuần rồi {x} làm đổ cả két {p}."),
]
PREFERENCES = [
    "Thích báo cáo ngắn, có bảng.",
    "Muốn được gọi là anh.",
    "Báo doanh thu theo tuần.",
    "Không cần giải thích dài dòng.",
    "Số tiền ghi theo nghìn đồng.",
]

# --- query templates per relation, split A (dev) / B (test) ----------------------
# lex: shares content words with the fact; sem: uses the paraphrase {q}, never {p}.

QUERIES = {
    "supplier": {
        "A": ["{p} mình lấy của ai vậy?", "Ai giao {p} cho tiệm?"],
        "B": ["Mối {p} là ai nhỉ?", "Hết {p} thì gọi ai giao?"],
        "semA": ["{q} mình nhập ở đâu?"],
        "semB": ["Muốn đặt thêm {q} thì gọi ai?"],
    },
    "price": {
        "A": ["Bán {p} cho khách sỉ bớt bao nhiêu?"],
        "B": ["Khách mua sỉ {p} thì giảm giá sao?"],
        "semA": ["Người mua nhiều {q} được bớt bao nhiêu?"],
        "semB": ["Bớt cho mối lớn lấy {q} thế nào?"],
    },
    "stock": {
        "A": ["{p} còn mấy thùng thì đặt thêm?"],
        "B": ["Khi nào cần nhập lại {p}?"],
        "semA": ["Mức tối thiểu của {q} là bao nhiêu?"],
        "semB": ["Bao giờ phải gom hàng {q} lại?"],
    },
    "staff": {
        "A": ["{x} làm ca nào?"],
        "B": ["Lịch làm của {x} sao?"],
        "semA": None,
        "semB": None,
    },
    "debt": {
        "A": ["{x} được nợ tối đa bao nhiêu?"],
        "B": ["Hạn mức ghi sổ của {x}?"],
        "semA": None,
        "semB": None,
    },
    "customer": {
        "A": ["{x} hay mua gì?"],
        "B": ["{x} thường lấy món nào?"],
        "semA": None,
        "semB": None,
    },
    "event": {
        "A": ["Ai làm đổ két {p}?"],
        "B": ["Vụ đổ {p} tuần rồi là ai?"],
        "semA": ["Ai làm vỡ {q} hôm trước?"],
        "semB": ["Chuyện rơi hàng {q} là ai?"],
    },
}
NO_MEMORY = {
    "A": [
        "Doanh thu hôm nay bao nhiêu?",
        "Còn bao nhiêu khách đang nợ?",
        "Tuần này bán được mấy đơn?",
        "Món nào bán chạy nhất tháng này?",
    ],
    "B": [
        "Lãi tháng trước được bao nhiêu?",
        "Hôm qua thu được bao nhiêu tiền?",
        "Tồn kho tổng cộng còn bao nhiêu?",
        "Đơn nào lớn nhất hôm nay?",
    ],
}


def strip_accents(text: str) -> str:
    text = text.replace("đ", "d").replace("Đ", "D")
    return "".join(
        c for c in unicodedata.normalize("NFD", text) if unicodedata.category(c) != "Mn"
    )


@dataclass
class Memory:
    id: int
    relation: str
    memory_type: str
    content: str
    importance: float
    created_day: float
    product: str | None
    person: str | None
    # Id of the newer version of the same fact that reconcile failed to link.
    newer: int | None = None
    older: int | None = None
    last_used_day: float | None = None
    use_count: int = 0


@dataclass
class Query:
    text: str
    form: str  # lex | unacc | sem | none
    gold: int | None
    stale: int | None = None  # an older version the answer must not rely on alone
    target_relation: str | None = None


@dataclass
class Shop:
    memories: list[Memory]
    preferences: list[str]
    queries: list[Query] = field(default_factory=list)
    history: list[Query] = field(default_factory=list)


def make_shop(
    rng: random.Random,
    half: str,
    size: int,
    now: float = 0.0,
    stale_share: float = 0.15,
    max_age: float = 180.0,
) -> Shop:
    products = PRODUCTS[half][:]
    people = PEOPLE[half][:]
    rng.shuffle(products)
    rng.shuffle(people)
    memories: list[Memory] = []
    seen = set()
    tries = 0
    while len(memories) < size and tries < size * 50:
        tries += 1
        relation, mtype, (lo, hi), text = rng.choice(FACTS)
        p = rng.choice(products) if "{p}" in text else None
        x = rng.choice(people) if "{x}" in text else None
        key = (relation, p and p[0], x)
        if key in seen:
            continue
        seen.add(key)
        content = text.format(
            p=p[0] if p else "", x=x or "", d=rng.choice(WEEKDAYS), n=rng.randint(2, 9)
        )
        content = content[0].upper() + content[1:]
        memories.append(
            Memory(
                len(memories),
                relation,
                mtype,
                content,
                round(rng.uniform(lo, hi), 2),
                now - rng.uniform(0, max_age),
                p and p[0],
                x,
            )
        )
    # Two versions of one fact: the older stays live because reconcile missed it.
    for memory in list(memories):
        if (
            memory.relation in ("supplier", "staff", "debt", "price")
            and rng.random() < stale_share
        ):
            if memory.relation == "supplier":
                x = rng.choice([y for y in people if y != memory.person])
                content = f"Từ giờ {memory.product} chuyển sang lấy của {x}."
            elif memory.relation == "staff":
                x = memory.person
                content = f"{x} đổi sang ca sáng, nghỉ {rng.choice(WEEKDAYS)}."
            elif memory.relation == "debt":
                x = memory.person
                content = f"Hạ mức nợ của {x} xuống còn {rng.randint(1, 9)}0 nghìn."
            else:
                x = None
                off = rng.randint(1, 5)
                content = f"Khách sỉ mua {memory.product} giờ chỉ bớt {off} nghìn."
            content = content[0].upper() + content[1:]
            newer = Memory(
                len(memories),
                memory.relation,
                memory.memory_type,
                content,
                memory.importance,
                rng.uniform(memory.created_day, now),
                memory.product,
                x or memory.person,
                older=memory.id,
            )
            memory.newer = newer.id
            memories.append(newer)
    paraphrase = dict(products)
    return Shop(memories, rng.sample(PREFERENCES, rng.randint(1, 3))), paraphrase


def query_for(
    rng: random.Random, memory: Memory, half: str, form: str, paraphrase: dict
) -> Query | None:
    spec = QUERIES[memory.relation]
    if form == "sem":
        templates = spec["sem" + half]
        if not templates or memory.product is None:
            return None
        text = rng.choice(templates).format(
            q=paraphrase[memory.product], x=memory.person or ""
        )
    else:
        templates = spec[half]
        text = rng.choice(templates).format(
            p=memory.product or "", x=memory.person or ""
        )
        if form == "unacc":
            text = strip_accents(text).lower()
    gold = memory.newer if memory.newer is not None else memory.id
    stale = memory.id if memory.newer is not None else None
    return Query(text, form, gold, stale, memory.relation)


def build(
    seed: int,
    half: str,
    size: int,
    n_queries: int = 60,
    n_history: int = 200,
    max_age: float = 180.0,
):
    """One shop with its past traffic (for use counts) and its scored queries."""
    rng = random.Random(seed * 1000 + size + int(max_age) * 7)
    shop, paraphrase = make_shop(rng, half, size, max_age=max_age)
    roots = [m for m in shop.memories if m.older is None]
    # Past traffic is skewed: a few facts are asked about often (Zipf), a fifth of the
    # turns need no memory at all.
    weights = [1 / (rank + 1) ** 1.1 for rank in range(len(roots))]
    order = roots[:]
    rng.shuffle(order)
    for _ in range(n_history):
        if rng.random() < 0.2:
            shop.history.append(Query(rng.choice(NO_MEMORY[half]), "none", None))
            continue
        memory = rng.choices(order, weights)[0]
        q = query_for(
            rng, memory, half, rng.choice(["lex", "lex", "unacc", "sem"]), paraphrase
        )
        if q:
            shop.history.append(q)
    # Scored queries cover facts uniformly, so rarely asked facts count as much.
    forms = ["lex", "unacc", "sem"]
    while len(shop.queries) < n_queries:
        if rng.random() < 0.15:
            shop.queries.append(Query(rng.choice(NO_MEMORY[half]), "none", None))
            continue
        q = query_for(rng, rng.choice(roots), half, rng.choice(forms), paraphrase)
        if q:
            shop.queries.append(q)
    return shop
