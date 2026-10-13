import { parseOrder } from '../../../frontend/mobile/src/lib/parseOrder.ts';
const products = [
  { id: 1, name: 'Gạo ST25 5kg', price: 180000, aliases: ['gạo st25', 'gạo st hai lăm'] },
  { id: 2, name: 'Nước mắm Nam Ngư 500ml', price: 35000, aliases: ['nước mắm'] },
  { id: 3, name: 'Mì Hảo Hảo tôm chua cay', price: 4500, aliases: ['mì hảo hảo'] },
  { id: 4, name: 'Trứng gà (vỉ 10)', price: 32000, aliases: ['trứng'] },
  { id: 5, name: 'Đường trắng 1kg', price: 25000 },
  { id: 6, name: 'Coca-Cola lon 330ml', price: 10000, aliases: ['coca', 'coca lon'] },
];
const qs = [
  'hai bao gạo st hai lăm',
  'hai ký gạo với một chai nước mắm',
  'ban 3 goi mi hao hao',
  'bán một vỉ trứng và hai lon coca',
  'gạo hai bao nước mắm một chai',
  'cho chị ba gói mì hảo hảo nha',
  'hai nước mắm nam ngư',
  'một đường',
  'mì hảo hão hai gói',
  'chi năm trăm nghìn tiền điện',
];
for (const q of qs) {
  const r = parseOrder(q, products as any);
  console.log(JSON.stringify(q), '=>', JSON.stringify({ items: r.items.map((i: any) => [i.name ?? i.productName ?? i.productId, i.qty ?? i.quantity]), unknown: r.unknown.map((i: any) => i.name), missingQty: r.missingQuantityItems, exp: r.expenses?.map((e: any) => [e.description ?? e.note ?? e.category, e.amount]) }));
}
const N = 2000; const t = performance.now();
for (let i = 0; i < N; i++) parseOrder(qs[i % qs.length], products as any);
console.log('avg ms/parse (6 products, node):', ((performance.now() - t) / N).toFixed(3));
