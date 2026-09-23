const FILLER_WORDS_REGEX = [
  /(?<!\p{L})à(?!\p{L})/gui,
  /(?<!\p{L})ừm(?!\p{L})/gui,
  /(?<!\p{L})ờ(?!\p{L})/gui,
  /(?<!\p{L})ơ(?!\p{L})/gui,
  /(?<!\p{L})ha(?!\p{L})/gui,
  /(?<!\p{L})ê(?!\p{L})/gui,
  /(?<!\p{L})ủa(?!\p{L})/gui,
  /(?<!\p{L})hửm(?!\p{L})/gui,
  /(?<!\p{L})kiểu\s+như(?!\p{L})/gui,
  /(?<!\p{L})í\s+mà(?!\p{L})/gui,
  /(?<!\p{L})ấy\s+nhỉ(?!\p{L})/gui,
  /(?<!\p{L})ấy\s+nha(?!\p{L})/gui,
  /(?<!\p{L})nhá(?!\p{L})/gui,
  /(?<!\p{L})nha(?!\p{L})/gui,
  /(?<!\p{L})nhé(?!\p{L})/gui,
  /(?<!\p{L})nè(?!\p{L})/gui,
  /(?<!\p{L})nghen(?!\p{L})/gui,
  /(?<!\p{L})giùm\s+em(?!\p{L})/gui,
  /(?<!\p{L})giùm\s+tui(?!\p{L})/gui,
  /(?<!\p{L})giùm\s+mình(?!\p{L})/gui,
  /(?<!\p{L})cho\s+em(?!\p{L})/gui,
  /(?<!\p{L})cho\s+mình(?!\p{L})/gui,
  /(?<!\p{L})cho\s+anh(?!\p{L})/gui,
  /(?<!\p{L})cho\s+chị(?!\p{L})/gui,
  /(?<!\p{L})cho\s+cô(?!\p{L})/gui,
  /(?<!\p{L})cho\s+chú(?!\p{L})/gui,
  /(?<!\p{L})với\s+lại(?!\p{L})/gui,
];

const PHONETIC_CORRECTIONS: Array<[RegExp, string]> = [
  // Coffee variants
  [/(?<!\p{L})(càfe|cà\s*fe|ca\s*phe|cf|caphe|càfê)(?!\p{L})/gui, 'cà phê'],
  [/(?<!\p{L})(bạc\s*sỉu|bac\s*xiu|bac\s*siu|bạc\s*siu)(?!\p{L})/gui, 'bạc xỉu'],
  // Tea variants
  [/(?<!\p{L})(trá\s*đá|tra\s*da|trà\s*da)(?!\p{L})/gui, 'trà đá'],
  [/(?<!\p{L})(trà\s*tắc|tra\s*tac)(?!\p{L})/gui, 'trà tắc'],
  [/(?<!\p{L})(trà\s*sữa|tra\s*sua)(?!\p{L})/gui, 'trà sữa'],
  // Bread variants
  [/(?<!\p{L})(bánh\s*mỳ|banh\s*mi|banh\s*my)(?!\p{L})/gui, 'bánh mì'],
  [/(?<!\p{L})(ốp\s*la|op\s*la|opla)(?!\p{L})/gui, 'ốp la'],
  [/(?<!\p{L})(pa\s*tê|pate|pa\s*te)(?!\p{L})/gui, 'pate'],
  // Soft drinks & Brands
  [/(?<!\p{L})(xì\s*ting|tin\s*dâu|xiting|siting)(?!\p{L})/gui, 'sting'],
  [/(?<!\p{L})(bò\s*húc|bò\s*hút|redbull|red\s*bull)(?!\p{L})/gui, 'bò húc'],
  [/(?<!\p{L})(coca\s*cola|co\s*ca|cocacola)(?!\p{L})/gui, 'coca'],
  [/(?<!\p{L})(pep\s*si|pepsi\s*cola)(?!\p{L})/gui, 'pepsi'],
  [/(?<!\p{L})(aquafina|a\s*qua|nước\s*khoáng)(?!\p{L})/gui, 'aquafina'],
  // Numbers & Units
  [/(?<!\p{L})(mụt|môt|mot)(?!\p{L})/gui, 'một'],
  [/(?<!\p{L})(haii|haai)(?!\p{L})/gui, 'hai'],
  [/(?<!\p{L})(rưởi)(?!\p{L})/gui, 'rưỡi'],
  [/(?<!\p{L})(bịch|bịk|bick)(?!\p{L})/gui, 'bịch'],
  [/(?<!\p{L})(cốc|cốk)(?!\p{L})/gui, 'cốc'],
];

/**
 * 3. Bộ chuẩn hóa & Fuzzy Post-Correction (Client-Side)
 * Khử lặp từ do cà lăm, khử từ đệm và sửa lỗi chính tả/ngữ âm ASR bằng Unicode regex boundary.
 */
export class ClientTextNormalizer {
  public removeStuttering(text: string): string {
    if (!text) return '';

    // Khử lặp cụm 2 từ (e.g. "bánh mì bánh mì" -> "bánh mì")
    text = text.replace(/(?<!\p{L})([\p{L}0-9]+\s+[\p{L}0-9]+)\s+\1(?!\p{L})/gui, '$1');

    // Khử lặp từ đơn (e.g. "hai hai ly" -> "hai ly", "cho cho" -> "cho")
    text = text.replace(/(?<!\p{L})([\p{L}0-9]+)(\s+\1)+(?!\p{L})/gui, '$1');

    return text;
  }

  public removeFillers(text: string): string {
    for (const pattern of FILLER_WORDS_REGEX) {
      text = text.replace(pattern, ' ');
    }
    return text;
  }

  public correctPhonetics(text: string): string {
    for (const [pattern, replacement] of PHONETIC_CORRECTIONS) {
      text = text.replace(pattern, replacement);
    }
    return text;
  }

  public normalize(rawText: string): string {
    if (!rawText) return '';

    let text = rawText.trim().normalize('NFC');
    text = this.removeStuttering(text);
    text = this.removeFillers(text);
    text = this.correctPhonetics(text);
    text = this.removeStuttering(text);
    text = text.replace(/[\s,.-]+/g, ' ').trim();

    return text;
  }
}
