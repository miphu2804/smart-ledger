/**
 * Synthetic catalog generator for the D3 stress set (plan section 7.1).
 *
 * Catalogs of N in {100, 1000, 5000, 20000} items are built from
 * `brand x flavour x size` combinations, laid out so that every brand forms a
 * **near-duplicate family**: members share the brand and differ in one or two
 * slots ("Sting dâu 330ml" / "Sting dâu 500ml" / "Sting nhân sâm 330ml"), so
 * they are each other's hard negatives. `CatalogItem.family` is set to the
 * brand slug.
 *
 * Family key choice: the plan's example groups three items that vary in both
 * flavour and size, so the family key is the **brand**, not the full
 * brand x flavour x size triple (which would make every family a singleton and
 * produce no near-duplicates). Within a family, many pairs still differ in
 * exactly one slot, which is what the D3 tests assert.
 *
 * Everything is deterministic given a seed: the attribute lists are permuted
 * with a seeded PRNG, never `Math.random`. `generateD3Catalog` returns the
 * catalog; the JSON registry is written by `corpus.ts`.
 */

import { synthesize, rulesToTags } from './synth.ts';
import type { CatalogItem } from '../../frontend/mobile/src/lib/resolver/types.ts';
import type { EvalRecord } from './corpus.ts';

/** Catalog sizes the stress set covers. */
export const D3_SIZES: number[] = [100, 1000, 5000, 20000];

const BRANDS: string[] = [
  'Sting', 'Coca-Cola', 'Pepsi', 'Number One', 'Aquafina', 'Vinamilk', 'Trà Xanh 0 Độ', 'Red Bull',
  'Bò Húc', 'Cà Phê Phố', 'Trà Sữa Gongcha', 'Sữa Milo', 'Bia Tiger', 'Bia Heineken', 'Nước Mắm Nam Ngư',
  'Nước Tương Maggi', 'Mì Hảo Hảo', 'Mì Omachi', 'Sữa Chua Vinamilk', 'Nước Suối Lavie', 'Bánh Chocopie',
  'Kem Merino', 'Sữa Ensure', 'Nước Cam Twister', 'Trà Lipton', 'Nước Yến Sanest', 'Cà Phê Birdy',
  'Sữa Đặc Ông Thọ', 'Bia Sài Gòn', 'Nước Ngọt 7Up', 'Nước Tăng Lực Wake Up', 'Sữa Tươi TH True Milk',
  'Nước Dừa Cocoxim', 'Trà Thảo Mộc Dr Thanh', 'Kẹo Alpenliebe', 'Bánh Oreo', 'Mì Kokomi',
  'Nước Rửa Chén Sunlight', 'Bột Giặt Omo', 'Dầu Gội Clear',
];

const FLAVOURS: string[] = [
  'dâu', 'nhân sâm', 'vàng', 'cam', 'chanh', 'táo', 'nho', 'xoài', 'dừa', 'cà phê', 'sô-cô-la', 'vanilla',
  'matcha', 'đào', 'vải', 'mật ong', 'gừng', 'bạc hà', 'tắc', 'sữa', 'dâu tây', 'việt quất', 'chanh dây',
  'cam sả', 'chanh leo', 'ổi', 'mãng cầu', 'mít', 'khoai môn', 'trà xanh', 'đường đen', 'hạt chia',
  'yến mạch', 'hạnh nhân', 'chuối', 'dưa hấu', 'kiwi', 'lựu', 'nho đen', 'cam vàng', 'quýt', 'bưởi',
  'dứa', 'sung', 'me', 'táo xanh', 'dâu tằm', 'mận', 'đào tiên', 'sen',
];

const SIZES: string[] = ['330ml', '500ml', '1l', '1.5l', '250ml', '750ml', '2l', '220ml', '240ml', '600ml'];

const CATALOG_CAPACITY = BRANDS.length * FLAVOURS.length * SIZES.length; // 20000

/** Small deterministic PRNG (mulberry32), kept local to avoid a cross-module edge. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(list: T[], rng: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Fold to a stable, filename-safe key. */
function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Build a catalog of `n` items. Deterministic given `seed`; `n` must be at most
 * `CATALOG_CAPACITY` (20000) so that every `(brand, flavour, size)` triple is
 * unique.
 */
export function generateD3Catalog(n: number, seed = 0): CatalogItem[] {
  if (n > CATALOG_CAPACITY) throw new Error(`D3 catalog size ${n} exceeds capacity ${CATALOG_CAPACITY}`);
  const rng = mulberry32(seed >>> 0);
  const brands = shuffled(BRANDS, rng);
  const flavours = shuffled(FLAVOURS, rng);
  const sizes = shuffled(SIZES, rng);
  const b = brands.length;
  const f = flavours.length;
  const items: CatalogItem[] = [];
  for (let i = 0; i < n; i += 1) {
    const brand = brands[i % b];
    const flavour = flavours[Math.floor(i / b) % f];
    const size = sizes[Math.floor(i / (b * f)) % sizes.length];
    items.push({
      id: `d3-${n}-${i}`,
      name: `${brand} ${flavour} ${size}`,
      brand,
      family: slug(brand),
    });
  }
  return items;
}

/** The four D3 catalogs, keyed `d3_<N>`, in the registry shape. */
export function buildD3CatalogRegistry(seed = 0): Record<string, CatalogItem[]> {
  const registry: Record<string, CatalogItem[]> = {};
  for (const n of D3_SIZES) registry[`d3_${n}`] = generateD3Catalog(n, seed);
  return registry;
}

/**
 * One D3 eval record per item: the item's own name lightly noised by the
 * confusion simulator, so confusion-under-crowding is measurable.
 */
export function buildD3(seed = 0): EvalRecord[] {
  const records: EvalRecord[] = [];
  for (const n of D3_SIZES) {
    const catalogId = `d3_${n}`;
    const items = generateD3Catalog(n, seed);
    items.forEach((item, i) => {
      const result = synthesize(item.name, { seed: seed + 1_000_003 * (n % 97_777) + i });
      records.push({
        id: `${catalogId}-${i}`,
        dataset: 'd3',
        catalogId,
        goldProductId: item.id,
        family: item.family,
        tags: rulesToTags(result.rules),
        rules: result.rules,
        category: 'd3',
        line: { rawProductSpan: result.text, qty: 1, unit: null },
        referenceSpan: item.name,
      });
    });
  }
  return records;
}
