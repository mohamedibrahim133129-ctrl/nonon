export type AcademyAudioLang = 'ar' | 'en';

export function normalizeAcademyAudioText(raw: string): string {
  return String(raw || '')
    .replace(/[\uFE0E\uFE0F\u200D\u20E3]/g, '')
    .replace(/\p{Extended_Pictographic}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getAcademyAudioCacheKeyClientFallback(text: string, lang: AcademyAudioLang): string {
  return `${lang}|${normalizeAcademyAudioText(text)}`;
}

export function getAcademyAudioUrlFromAssetId(assetId: string, lang: AcademyAudioLang): string {
  return `/assets/audio/academy/${lang}/${assetId}.mp3`;
}

export const ARABIC_NUMBER_WORDS_0_TO_10: ReadonlyArray<string> = [
  'صفر',
  'واحد',
  'اثنان',
  'ثلاثة',
  'أربعة',
  'خمسة',
  'ستة',
  'سبعة',
  'ثمانية',
  'تسعة',
  'عشرة',
];

const ARABIC_WORD_TO_NUMBER: ReadonlyMap<string, number> = new Map(
  ARABIC_NUMBER_WORDS_0_TO_10.map((word, idx) => [word, idx]),
);

export function normalizeArabicIndicDigits(raw: string): string {
  return String(raw || '').replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (ch) => {
    const code = ch.charCodeAt(0);
    if (code >= 0x0660 && code <= 0x0669) {
      return String(code - 0x0660);
    }
    return String(code - 0x06f0);
  });
}

/**
 * Parses standalone Arabic-Indic digits (٠–٢٠) or Western ASCII digits (0–20)
 * as well as standalone Arabic number words صفر–عشرة into a canonical integer.
 * Never infers playback language from the numeral script.
 */
export function parseStandaloneNumberValue(raw: string | number): number | null {
  if (typeof raw === 'number') {
    return Number.isInteger(raw) && raw >= 0 ? raw : null;
  }
  const clean = normalizeAcademyAudioText(String(raw || ''));
  if (!clean) return null;
  const wordMatch = ARABIC_WORD_TO_NUMBER.get(clean);
  if (wordMatch !== undefined) return wordMatch;
  const ascii = normalizeArabicIndicDigits(clean);
  if (!/^[0-9]{1,3}$/.test(ascii)) return null;
  const parsed = Number.parseInt(ascii, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * Resolves the canonical spoken lookup text for a standalone number (0–20)
 * strictly according to the authoritative lesson language (`ar` or `en`).
 * - In `ar`: maps 0..10 to verified Arabic words ("صفر".."عشرة"), and returns null for 11..20
 *   (because no genuine Arabic 11..20 recording exists and bare-digit files pronounce English).
 * - In `en`: maps 0..20 to canonical ASCII digits ("0".."20").
 */
export function resolveAuthoritativeNumberSpokenText(
  numOrText: string | number,
  lang: AcademyAudioLang,
): string | null {
  const num = parseStandaloneNumberValue(numOrText);
  if (num === null || num < 0 || num > 20) return null;
  if (lang === 'ar') {
    return num <= 10 ? ARABIC_NUMBER_WORDS_0_TO_10[num] : null;
  }
  return String(num);
}

export function resolveLevel1VocabSpokenText(
  subject: 'arabic' | 'english' | 'numbers' | 'colors',
  vocab: { text: string; secondaryText?: string },
  cueLang: AcademyAudioLang,
  numberValue?: number,
  secondarySymbol?: string,
): string {
  if (subject === 'numbers') {
    if (cueLang === 'ar') {
      return normalizeAcademyAudioText(secondarySymbol || String(numberValue ?? vocab.text));
    }
    const cleanEn = (vocab.secondaryText || String(numberValue ?? vocab.text))
      .replace(/\s*\(\d+\)\s*$/, '')
      .trim();
    return normalizeAcademyAudioText(cleanEn);
  }
  if (subject === 'colors') {
    if (cueLang === 'en') {
      return normalizeAcademyAudioText(vocab.secondaryText || vocab.text);
    }
    return normalizeAcademyAudioText(vocab.text);
  }
  return normalizeAcademyAudioText(vocab.text);
}
