/**
 * Chấm một kết quả `parseOrder` theo nhãn vàng ở mức dòng nháp (§6–§7 của brief).
 * Món: đúng khi có dòng tự nhận cùng `product_id` và `qty`; món mơ hồ: đúng khi parser hỏi lại với các lựa chọn chứa đủ
 * lựa chọn vàng và đúng số lượng; món ngoài danh mục: đúng khi nằm ở `unknown` (hoặc `missingQuantityItems` nếu không nói
 * số lượng) với đúng số lượng.
 */
import type { ParsedOrder } from '../../../src/lib/parseOrder';

export type GoldLine =
  | { product_id: number; qty: number }
  | { product_id: null; options: number[]; qty: number }
  | { product_id: null; name: string; qty: number | null };

export interface GoldCase {
  id: string;
  split: 'dev' | 'test' | 'free-dev' | 'free-test';
  catalog: string;
  category: string;
  text: string;
  lines: GoldLine[];
  expenses: Array<{ amount: number }>;
  note?: string;
}

export interface CaseScore {
  goldLines: number;
  goldCatalogLines: number;
  correctLines: number;
  correctCatalogLines: number;
  accepted: number;
  wrongAccepted: number;
  asked: boolean;
  expenseOk: boolean;
  exact: boolean;
  /** Mô tả ngắn chỗ sai, để in khi soát lỗi trên tập dev. */
  problems: string[];
}

export interface ScoredResult extends ParsedOrder {
  /** Parser báo sẽ gửi câu cho LLM (`draft_parse`); baseline không có. */
  fallback?: boolean;
}

const sameMultiset = (a: number[], b: number[]) => {
  const x = [...a].sort((p, q) => p - q);
  const y = [...b].sort((p, q) => p - q);
  return x.length === y.length && x.every((v, i) => v === y[i]);
};

export function scoreCase(gold: GoldCase, r: ScoredResult): CaseScore {
  const accepted = r.items.map((i) => ({ id: Number(i.productId), qty: i.qty, used: false }));
  const asks = (r.disambiguations ?? []).map((d) => ({ ids: d.options.map((o) => Number(o.product_id)), qty: d.qty, used: false }));
  const unknowns = [
    ...r.unknown.map((u) => ({ qty: u.qty as number | null, name: u.name, used: false })),
    ...(r.missingQuantityItems ?? []).map((name) => ({ qty: null as number | null, name, used: false })),
  ];
  const problems: string[] = [];
  let correct = 0;
  let correctCatalog = 0;
  let catalogLines = 0;

  for (const g of gold.lines) {
    if (g.product_id !== null) {
      catalogLines++;
      const hit = accepted.find((a) => !a.used && a.id === g.product_id && a.qty === g.qty);
      if (hit) {
        hit.used = true;
        correct++;
        correctCatalog++;
      } else problems.push(`thiếu món ${g.product_id}×${g.qty}`);
    } else if ('options' in g) {
      const hit = asks.find((d) => !d.used && d.qty === g.qty && g.options.every((o) => d.ids.includes(o)));
      if (hit) {
        hit.used = true;
        correct++;
      } else problems.push(`thiếu câu hỏi chọn [${g.options.join(',')}]×${g.qty}`);
    } else {
      const hit = unknowns.find((u) => !u.used && u.qty === g.qty);
      if (hit) {
        hit.used = true;
        correct++;
      } else problems.push(`thiếu món ngoài danh mục "${g.name}"×${g.qty ?? '?'}`);
    }
  }

  const wrongAccepted = accepted.filter((a) => !a.used);
  for (const a of wrongAccepted) problems.push(`tự nhận sai ${a.id}×${a.qty}`);
  for (const d of asks.filter((x) => !x.used)) problems.push(`hỏi thừa [${d.ids.join(',')}]×${d.qty}`);
  for (const u of unknowns.filter((x) => !x.used)) problems.push(`món lạ thừa "${u.name}"×${u.qty ?? '?'}`);
  const expenseOk = sameMultiset(
    gold.expenses.map((e) => e.amount),
    (r.expenses ?? []).map((e) => e.amount),
  );
  if (!expenseOk) {
    problems.push(`chi: cần [${gold.expenses.map((e) => e.amount).join(',')}] có [${(r.expenses ?? []).map((e) => e.amount).join(',')}]`);
  }

  return {
    goldLines: gold.lines.length,
    goldCatalogLines: catalogLines,
    correctLines: correct,
    correctCatalogLines: correctCatalog,
    accepted: accepted.length,
    wrongAccepted: wrongAccepted.length,
    asked: asks.length > 0 || !!r.fallback,
    expenseOk,
    exact: problems.length === 0,
    problems,
  };
}

export interface Metrics {
  sentences: number;
  /** Tỉ lệ dòng vàng đúng (món trong danh mục, món mơ hồ, món ngoài danh mục). */
  lineExact: number;
  /** Chỉ tính các dòng là món trong danh mục. */
  catalogLineExact: number;
  sentenceExact: number;
  /** Số dòng tự nhận sai / số dòng tự nhận. */
  wrongAcceptRate: number;
  wrongAccepted: number;
  accepted: number;
  /** Tỉ lệ câu có tự nhận sai ít nhất một dòng. */
  wrongAcceptSentenceRate: number;
  /** Tỉ lệ câu phải hỏi lại hoặc gửi LLM. */
  askRate: number;
  expenseExact: number;
}

export function aggregate(scores: CaseScore[], golds: GoldCase[]): Metrics {
  const sum = (f: (s: CaseScore) => number) => scores.reduce((n, s) => n + f(s), 0);
  const ratio = (a: number, b: number, empty = 1) => (b ? a / b : empty);
  const withExpense = scores.filter((_, i) => golds[i].expenses.length > 0);
  return {
    sentences: scores.length,
    lineExact: ratio(sum((s) => s.correctLines), sum((s) => s.goldLines)),
    catalogLineExact: ratio(sum((s) => s.correctCatalogLines), sum((s) => s.goldCatalogLines)),
    sentenceExact: ratio(sum((s) => (s.exact ? 1 : 0)), scores.length),
    wrongAcceptRate: ratio(sum((s) => s.wrongAccepted), sum((s) => s.accepted), 0),
    wrongAccepted: sum((s) => s.wrongAccepted),
    accepted: sum((s) => s.accepted),
    wrongAcceptSentenceRate: ratio(sum((s) => (s.wrongAccepted ? 1 : 0)), scores.length),
    askRate: ratio(sum((s) => (s.asked ? 1 : 0)), scores.length),
    expenseExact: ratio(withExpense.filter((s) => s.expenseOk).length, withExpense.length),
  };
}
