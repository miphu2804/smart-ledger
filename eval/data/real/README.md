# Real-catalogue evaluation inputs

`eval/runner/realdata.ts` reads these two files. They are the only way to get resolver
numbers that are not produced by the same matcher they are meant to judge.

## Why this exists

`eval/lib/corpus.ts` states that no audio exists in this repository. D1 is therefore written
reference transcripts, and an in-catalogue D1 span is the catalogue name `parseOrder` matched —
so D1 sits at the ceiling for every resolver and cannot separate two of them. The bake-off says
this about itself. These inputs are the alternative: a catalogue exported from a real shop, and
spans a person wrote down while listening to a speaker.

## `--catalog`

JSON. Either a flat array, which is what a shop export naturally is:

```json
[
  { "id": "1", "name": "Sting dâu chai 330ml", "unit": "chai" },
  { "id": "2", "name": "Bia Tiger lon 330ml", "unit": "lon" }
]
```

or the bake-off's registry shape `{ "<catalogId>": CatalogItem[] }` holding exactly one catalogue.
`id` is a **string** in the frozen `CatalogItem` type. Exporting from Core:

```bash
# Core returns ProductView with a numeric id and a unit; stringify the id and keep the unit.
curl -s "$API/api/v1/products?size=100" -H "Authorization: Bearer $TOKEN" -H "X-Shop-Id: $SHOP" \
  | jq '[.items[] | {id: (.id|tostring), name, unit}]' > shop.json
```

`unit` matters. It is the one gate feature the bake-off never exercised: every record there set
`unit: null`, so `unit_ok` was always `unknown` and the rule never fired. A run with real units is
the first measurement of it.

## `--lines`

JSONL, one object per line:

```json
{ "id": "s01-03", "span": "xi ting", "goldProductId": "1", "qty": 2, "unit": "chai", "note": "nam, mic điện thoại" }
```

| field | meaning |
|---|---|
| `id` | unique within the set |
| `span` | what the speaker said for the product, **as heard**, without quantity or unit |
| `goldProductId` | the product they meant, as a string; `null` when the shop does not sell it |
| `qty`, `unit` | optional; `unit` feeds the gate's `unit_ok` |
| `note` | free-form, never parsed — speaker, dialect, device, recording id |

Rules that decide whether the numbers mean anything:

- **Transcribe what was said, not what should have been said.** If the speaker said "xi ting",
  `span` is `xi ting`. Cleaning it up measures your transcription, not the resolver.
- **`goldProductId` must be in the catalogue.** The runner refuses to run otherwise: a stale id
  scores as a resolver miss for every configuration while looking like a resolver failure.
- **One line per product mention**, not per utterance. A two-item sentence is two lines.
- **Label the intent, not the best available match.** If the shop does not sell what was asked
  for, `goldProductId` is `null`; that is the `NEW` case and it is half the safety story.

## Size

Fifty lines is a smoke test, not a measurement. The false-auto rate is bounded by the rule of
three, so N autos can only bound it at `3/N`: a set producing 100 autos cannot demonstrate a
false-auto rate below 3%, and the plan's budget is 1%. Either collect enough lines, or read the
interval as the honest answer.

## Run

```bash
node eval/runner/realdata.ts --catalog eval/data/real/shop.json --lines eval/data/real/shop.jsonl
```

With at least 30 lines and no `--gate`, the thresholds are fitted on the lines being reported. The
report says so, because that is optimistic. To remove the optimism, fit on one shop and pass the
thresholds to another:

```bash
node eval/runner/realdata.ts --catalog shop-b.json --lines shop-b.jsonl --gate 0.58,1,0
```

Below 30 lines the runner refuses to fit at all and asks for `--gate`. A five-line set drove the
search to `sFloor -0.01`, which put a floor under every score and reported an unsold product as
`ASK` rather than `NEW` — a wrong answer, not merely a noisy one.

`example_catalog.json` and `example_lines.jsonl` exist so the runner is runnable and testable. They
are three products and five lines written by hand. They measure the runner, nothing else.
