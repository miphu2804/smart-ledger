export interface ParsedExpenseVoice {
  title: string;
  amount: number | null;
  rawText: string;
}

const DIGIT_WORDS: Record<string, number> = {
  mot: 1,
  hai: 2,
  ba: 3,
  bon: 4,
  tu: 4,
  nam: 5,
  lam: 5,
  sau: 6,
  bay: 7,
  tam: 8,
  chin: 9,
};

function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .trim();
}

interface MoneyMatch {
  amount: number;
  startIndex: number;
  endIndex: number;
}

/**
 * 1. Nhận diện số viết bằng chữ số:
 * Hỗ trợ mọi định dạng:
 * - "1 tỷ", "1 tỷ đồng", "1.5 tỷ", "2 tỉ", "hai tỷ rưỡi"
 * - "1,5 triệu", "15tr", "500k", "20.000đ", "200000 đồng", "50000"
 */
function extractDigitMoney(text: string): MoneyMatch | null {
  // Regex bắt [số] + [đơn vị tiền] sử dụng Unicode property escape để không bị lỗi với tiếng Việt có dấu
  const regex =
    /(?<!\p{L})(\d+(?:[.,]\d+)*)\s*((?:tỷ|ty|tỉ|ti|triệu|trieu|tr|nghìn|nghin|ngàn|ngan|k|ka|cành|canh)(?:\s*(?:đồng|dong|d|đ))?|đồng|dong|d|đ)?(?!\p{L})/gui;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const rawNum = match[1];
    const rawUnit = match[2] ? fold(match[2]) : '';

    // Phân tích giá trị số:
    let num: number;
    // Kiểm tra định dạng ngăn hàng nghìn: vd "200.000" hoặc "1.500.000"
    if (/^\d{1,3}([.,]\d{3})+$/.test(rawNum)) {
      num = parseInt(rawNum.replace(/[.,]/g, ''), 10);
    } else {
      num = parseFloat(rawNum.replace(',', '.'));
    }

    if (isNaN(num) || num <= 0) continue;

    let scale = 1;
    if (rawUnit.startsWith('ty') || rawUnit.startsWith('ti')) {
      scale = 1_000_000_000;
    } else if (rawUnit.startsWith('trieu') || rawUnit.startsWith('tr')) {
      scale = 1_000_000;
    } else if (
      rawUnit.startsWith('nghin') ||
      rawUnit.startsWith('ngan') ||
      rawUnit.startsWith('k') ||
      rawUnit.startsWith('ka') ||
      rawUnit.startsWith('canh')
    ) {
      scale = 1_000;
    } else if (rawUnit.startsWith('dong') || rawUnit.startsWith('d')) {
      scale = 1;
    } else if (!rawUnit) {
      // Số đứng một mình không có đơn vị: từ 1.000 trở lên mới tính là tiền
      if (num >= 1000) {
        scale = 1;
      } else {
        continue;
      }
    }

    const amount = Math.round(num * scale);
    if (amount >= 500) {
      return {
        amount,
        startIndex: match.index,
        endIndex: match.index + match[0].length,
      };
    }
  }

  return null;
}

/**
 * 2. Nhận diện số đọc hoàn toàn bằng chữ tiếng Việt:
 * Ví dụ: "một tỷ", "hai tỷ rưỡi", "một triệu rưỡi", "năm mươi nghìn", "hai lăm ca", "hai trăm rưỡi"
 */
function extractSpokenMoney(text: string): MoneyMatch | null {
  const words = text.split(/\s+/);
  const foldedWords = words.map(fold);

  const SPOKEN_NUM_WORDS = new Set([
    'mot',
    'hai',
    'ba',
    'bon',
    'tu',
    'nam',
    'lam',
    'sau',
    'bay',
    'tam',
    'chin',
    'muoi',
    'chuc',
    'tram',
    'linh',
    'le',
    'ruoi',
    'nghin',
    'ngan',
    'k',
    'ka',
    'canh',
    'trieu',
    'tr',
    'ty',
    'ti',
    'dong',
    'd',
  ]);

  for (let i = 0; i < foldedWords.length; i++) {
    if (!DIGIT_WORDS[foldedWords[i]] && foldedWords[i] !== 'muoi' && foldedWords[i] !== 'tram') {
      continue;
    }

    let j = i;
    while (j < foldedWords.length && SPOKEN_NUM_WORDS.has(foldedWords[j])) {
      j++;
    }

    if (j > i) {
      const slice = foldedWords.slice(i, j);
      const parsed = parseSpokenNumberRun(slice);
      if (parsed && parsed.amount >= 500) {
        const rawSlice = words.slice(i, j).join(' ');
        const startIndex = text.indexOf(rawSlice);
        if (startIndex !== -1) {
          return {
            amount: parsed.amount,
            startIndex,
            endIndex: startIndex + rawSlice.length,
          };
        }
      }
    }
  }

  return null;
}

function parseSpokenNumberRun(tokens: string[]): { amount: number } | null {
  let total = 0;
  let group = 0;
  let pend: number | null = null;
  let pendAfterHundred = false;
  let prev = '';
  let lastScale = 0;
  let hasScale = false;

  const flush = () => {
    if (pend === null) return;
    group += pendAfterHundred && group % 100 === 0 ? pend * 10 : pend;
    pend = null;
    pendAfterHundred = false;
  };

  for (const w of tokens) {
    const d = DIGIT_WORDS[w];
    if (d !== undefined) {
      if (pend !== null && prev === 'digit') {
        group += pend * 10 + d;
        pend = null;
        prev = 'pair';
      } else {
        flush();
        pend = d;
        pendAfterHundred = prev === 'tram';
        prev = 'digit';
      }
      continue;
    }

    switch (w) {
      case 'muoi':
      case 'chuc':
        group += (pend ?? 1) * 10;
        pend = null;
        prev = 'tens';
        break;
      case 'tram':
        group += (pend ?? 1) * 100;
        pend = null;
        prev = 'tram';
        lastScale = 100;
        break;
      case 'linh':
      case 'le':
        flush();
        prev = 'zero';
        break;
      case 'ruoi':
        flush();
        if (lastScale === 1_000_000_000) total += 500_000_000;
        else if (lastScale === 1_000_000) total += 500_000;
        else if (lastScale === 1000) total += 500;
        else if (lastScale === 100) group += 50;
        else return null;
        prev = 'half';
        break;
      case 'nghin':
      case 'ngan':
      case 'k':
      case 'ka':
      case 'canh':
        flush();
        if (group === 0 && pend === null) group = 1;
        total += group * 1000;
        group = 0;
        lastScale = 1000;
        hasScale = true;
        prev = 'scale';
        break;
      case 'trieu':
      case 'tr':
        flush();
        if (group === 0 && pend === null) group = 1;
        total += group * 1_000_000;
        group = 0;
        lastScale = 1_000_000;
        hasScale = true;
        prev = 'scale';
        break;
      case 'ty':
      case 'ti':
        flush();
        if (group === 0 && pend === null) group = 1;
        total += group * 1_000_000_000;
        group = 0;
        lastScale = 1_000_000_000;
        hasScale = true;
        prev = 'scale';
        break;
      case 'dong':
      case 'd':
        flush();
        prev = 'dong';
        break;
      default:
        break;
    }
  }

  flush();
  total += group;

  if (!hasScale && total < 1000) return null;

  return total > 0 ? { amount: total } : null;
}

/**
 * Bóc tách nội dung người nói và giá tiền:
 * - Giá tiền: nhận diện chính xác các đơn vị tỷ, triệu, nghìn, k, đ...
 * - Nội dung: giữ trọn vẹn câu nói người dùng ("Mua 2 cây đá", "Tiền mặt bằng tháng 10").
 * - Không lọc bừa bãi từ ngữ của người dùng.
 */
export function parseExpenseVoice(text: string): ParsedExpenseVoice {
  const raw = text.trim();
  if (!raw) {
    return {
      title: '',
      amount: null,
      rawText: '',
    };
  }

  // 1. Tìm giá tiền trong câu
  const moneyMatch = extractDigitMoney(raw) || extractSpokenMoney(raw);

  let amount: number | null = null;
  let remainingText = raw;

  if (moneyMatch) {
    amount = moneyMatch.amount;
    // Cắt bỏ phần giá tiền ra khỏi chuỗi gốc
    remainingText = (raw.slice(0, moneyMatch.startIndex) + ' ' + raw.slice(moneyMatch.endIndex)).trim();
  }

  // 2. Làm sạch nhẹ nhàng (chỉ bỏ dấu câu thừa và từ 'chi / khoản chi' ở đầu):
  let cleanedTitle = remainingText
    .replace(/^[,;.!?\s]+/, '')
    .replace(/[,;.!?\s]+$/, '')
    .replace(/^(chi\s+tiền|khoản\s+chi|chi\s+phí|chi|trả\s+tiền)\s+/i, '')
    .replace(/\s+(hết|mất|đồng|đ|vnđ)$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Nếu chỉ nói tiền hoặc còn sót lại mỗi chữ 'chi', 'tiền' -> để trống
  if (!cleanedTitle || /^(chi|tiền|khoản chi|chi phí|hết|mất)$/i.test(cleanedTitle)) {
    cleanedTitle = '';
  } else {
    // Viết hoa chữ cái đầu
    cleanedTitle = cleanedTitle.charAt(0).toUpperCase() + cleanedTitle.slice(1);
  }

  return {
    title: cleanedTitle,
    amount,
    rawText: raw,
  };
}
