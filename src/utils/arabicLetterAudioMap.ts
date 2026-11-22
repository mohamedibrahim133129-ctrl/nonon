export interface ArabicLetterNameRecording {
  index: number;
  manifestId: string;
  academyId: string;
  manifestLetter: string;
  academyChar: string;
  nameAr: string;
  filename: string;
  audioUrl: string;
}

export interface ArabicLetterNameQuery {
  letterId?: string | null;
  char?: string | null;
  nameAr?: string | null;
}

export const ARABIC_LETTER_AUDIO_BASE_URL = '/assets/audio/arabic-letters';

const RAW_ARABIC_LETTER_NAME_RECORDS: ReadonlyArray<
  Omit<ArabicLetterNameRecording, 'audioUrl'>
> = [
  {
    index: 1,
    manifestId: 'alif',
    academyId: 'ar-alif',
    manifestLetter: 'ا',
    academyChar: 'أ',
    nameAr: 'أَلِف',
    filename: '01_alif_name.mp3',
  },
  {
    index: 2,
    manifestId: 'baa',
    academyId: 'ar-baa',
    manifestLetter: 'ب',
    academyChar: 'ب',
    nameAr: 'بَاء',
    filename: '02_baa_name.mp3',
  },
  {
    index: 3,
    manifestId: 'taa',
    academyId: 'ar-taa',
    manifestLetter: 'ت',
    academyChar: 'ت',
    nameAr: 'تَاء',
    filename: '03_taa_name.mp3',
  },
  {
    index: 4,
    manifestId: 'thaa',
    academyId: 'ar-thaa',
    manifestLetter: 'ث',
    academyChar: 'ث',
    nameAr: 'ثَاء',
    filename: '04_thaa_name.mp3',
  },
  {
    index: 5,
    manifestId: 'jeem',
    academyId: 'ar-jeem',
    manifestLetter: 'ج',
    academyChar: 'ج',
    nameAr: 'جِيم',
    filename: '05_jeem_name.mp3',
  },
  {
    index: 6,
    manifestId: 'haa',
    academyId: 'ar-haa',
    manifestLetter: 'ح',
    academyChar: 'ح',
    nameAr: 'حَاء',
    filename: '06_haa_name.mp3',
  },
  {
    index: 7,
    manifestId: 'khaa',
    academyId: 'ar-khaa',
    manifestLetter: 'خ',
    academyChar: 'خ',
    nameAr: 'خَاء',
    filename: '07_khaa_name.mp3',
  },
  {
    index: 8,
    manifestId: 'dal',
    academyId: 'ar-daal',
    manifestLetter: 'د',
    academyChar: 'د',
    nameAr: 'دَال',
    filename: '08_dal_name.mp3',
  },
  {
    index: 9,
    manifestId: 'thal',
    academyId: 'ar-dhaal',
    manifestLetter: 'ذ',
    academyChar: 'ذ',
    nameAr: 'ذَال',
    filename: '09_thal_name.mp3',
  },
  {
    index: 10,
    manifestId: 'raa',
    academyId: 'ar-raa',
    manifestLetter: 'ر',
    academyChar: 'ر',
    nameAr: 'رَاء',
    filename: '10_raa_name.mp3',
  },
  {
    index: 11,
    manifestId: 'zay',
    academyId: 'ar-zaay',
    manifestLetter: 'ز',
    academyChar: 'ز',
    nameAr: 'زَاي',
    filename: '11_zay_name.mp3',
  },
  {
    index: 12,
    manifestId: 'seen',
    academyId: 'ar-seen',
    manifestLetter: 'س',
    academyChar: 'س',
    nameAr: 'سِين',
    filename: '12_seen_name.mp3',
  },
  {
    index: 13,
    manifestId: 'sheen',
    academyId: 'ar-sheen',
    manifestLetter: 'ش',
    academyChar: 'ش',
    nameAr: 'شِين',
    filename: '13_sheen_name.mp3',
  },
  {
    index: 14,
    manifestId: 'sad',
    academyId: 'ar-saad',
    manifestLetter: 'ص',
    academyChar: 'ص',
    nameAr: 'صَاد',
    filename: '14_sad_name.mp3',
  },
  {
    index: 15,
    manifestId: 'dad',
    academyId: 'ar-daad',
    manifestLetter: 'ض',
    academyChar: 'ض',
    nameAr: 'ضَاد',
    filename: '15_dad_name.mp3',
  },
  {
    index: 16,
    manifestId: 'taa2',
    academyId: 'ar-taa2',
    manifestLetter: 'ط',
    academyChar: 'ط',
    nameAr: 'طَاء',
    filename: '16_taa2_name.mp3',
  },
  {
    index: 17,
    manifestId: 'zaa',
    academyId: 'ar-dhaa2',
    manifestLetter: 'ظ',
    academyChar: 'ظ',
    nameAr: 'ظَاء',
    filename: '17_zaa_name.mp3',
  },
  {
    index: 18,
    manifestId: 'ain',
    academyId: 'ar-ayn',
    manifestLetter: 'ع',
    academyChar: 'ع',
    nameAr: 'عَيْن',
    filename: '18_ain_name.mp3',
  },
  {
    index: 19,
    manifestId: 'ghain',
    academyId: 'ar-ghayn',
    manifestLetter: 'غ',
    academyChar: 'غ',
    nameAr: 'غَيْن',
    filename: '19_ghain_name.mp3',
  },
  {
    index: 20,
    manifestId: 'faa',
    academyId: 'ar-faa',
    manifestLetter: 'ف',
    academyChar: 'ف',
    nameAr: 'فَاء',
    filename: '20_faa_name.mp3',
  },
  {
    index: 21,
    manifestId: 'qaf',
    academyId: 'ar-qaaf',
    manifestLetter: 'ق',
    academyChar: 'ق',
    nameAr: 'قَاف',
    filename: '21_qaf_name.mp3',
  },
  {
    index: 22,
    manifestId: 'kaf',
    academyId: 'ar-kaaf',
    manifestLetter: 'ك',
    academyChar: 'ك',
    nameAr: 'كَاف',
    filename: '22_kaf_name.mp3',
  },
  {
    index: 23,
    manifestId: 'lam',
    academyId: 'ar-laam',
    manifestLetter: 'ل',
    academyChar: 'ل',
    nameAr: 'لَام',
    filename: '23_lam_name.mp3',
  },
  {
    index: 24,
    manifestId: 'meem',
    academyId: 'ar-meem',
    manifestLetter: 'م',
    academyChar: 'م',
    nameAr: 'مِيم',
    filename: '24_meem_name.mp3',
  },
  {
    index: 25,
    manifestId: 'noon',
    academyId: 'ar-noon',
    manifestLetter: 'ن',
    academyChar: 'ن',
    nameAr: 'نُون',
    filename: '25_noon_name.mp3',
  },
  {
    index: 26,
    manifestId: 'haa2',
    academyId: 'ar-haa2',
    manifestLetter: 'ه',
    academyChar: 'هـ',
    nameAr: 'هَاء',
    filename: '26_haa2_name.mp3',
  },
  {
    index: 27,
    manifestId: 'waw',
    academyId: 'ar-waaw',
    manifestLetter: 'و',
    academyChar: 'و',
    nameAr: 'وَاو',
    filename: '27_waw_name.mp3',
  },
  {
    index: 28,
    manifestId: 'yaa',
    academyId: 'ar-yaa',
    manifestLetter: 'ي',
    academyChar: 'ي',
    nameAr: 'يَاء',
    filename: '28_yaa_name.mp3',
  },
];

export const ARABIC_LETTER_NAME_RECORDINGS: ReadonlyArray<ArabicLetterNameRecording> =
  RAW_ARABIC_LETTER_NAME_RECORDS.map((entry) => ({
    ...entry,
    audioUrl: `${ARABIC_LETTER_AUDIO_BASE_URL}/${entry.filename}`,
  }));

function stripArabicDiacriticsAndTatweel(value: string): string {
  return value
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeLetterToken(raw: string | null | undefined): string {
  return String(raw || '').trim();
}

const BY_NAME_EXACT = new Map<string, ArabicLetterNameRecording>();
const BY_NAME_PLAIN = new Map<string, ArabicLetterNameRecording>();
const BY_CHAR = new Map<string, ArabicLetterNameRecording>();
const BY_ID = new Map<string, ArabicLetterNameRecording>();

for (const rec of ARABIC_LETTER_NAME_RECORDINGS) {
  BY_NAME_EXACT.set(rec.nameAr, rec);
  BY_NAME_PLAIN.set(stripArabicDiacriticsAndTatweel(rec.nameAr), rec);

  BY_CHAR.set(rec.manifestLetter, rec);
  BY_CHAR.set(rec.academyChar, rec);
  const plainAcademyChar = stripArabicDiacriticsAndTatweel(rec.academyChar);
  if (plainAcademyChar) {
    BY_CHAR.set(plainAcademyChar, rec);
  }

  BY_ID.set(rec.academyId.toLowerCase(), rec);
  BY_ID.set(rec.manifestId.toLowerCase(), rec);
}

// Explicit Alif / Haa spelling equivalences between manifest.json and curriculum display symbols
BY_CHAR.set('ا', ARABIC_LETTER_NAME_RECORDINGS[0]);
BY_CHAR.set('أ', ARABIC_LETTER_NAME_RECORDINGS[0]);
BY_CHAR.set('ه', ARABIC_LETTER_NAME_RECORDINGS[25]);
BY_CHAR.set('هـ', ARABIC_LETTER_NAME_RECORDINGS[25]);

function lookupByName(nameAr: string): ArabicLetterNameRecording | null {
  const clean = normalizeLetterToken(nameAr);
  if (!clean) return null;
  return (
    BY_NAME_EXACT.get(clean) ||
    BY_NAME_PLAIN.get(stripArabicDiacriticsAndTatweel(clean)) ||
    null
  );
}

function lookupByChar(char: string): ArabicLetterNameRecording | null {
  const clean = normalizeLetterToken(char);
  if (!clean) return null;
  return (
    BY_CHAR.get(clean) ||
    BY_CHAR.get(stripArabicDiacriticsAndTatweel(clean)) ||
    null
  );
}

function lookupById(letterId: string): ArabicLetterNameRecording | null {
  const clean = normalizeLetterToken(letterId).toLowerCase();
  if (!clean) return null;
  return BY_ID.get(clean) || null;
}

/**
 * Resolves the exact pre-recorded Arabic letter-name MP3 entry for all 28 letters.
 * Avoids relying solely on ID matching because 12 manifest IDs differ from ARABIC_ALPHABET IDs,
 * and handles explicit character differences (ا/أ and ه/هـ).
 */
export function resolveArabicLetterNameRecording(
  query: ArabicLetterNameQuery | string,
): ArabicLetterNameRecording | null {
  if (typeof query === 'string') {
    const token = normalizeLetterToken(query);
    if (!token) return null;
    return lookupByName(token) || lookupByChar(token) || lookupById(token);
  }

  const byName = query.nameAr ? lookupByName(query.nameAr) : null;
  const byChar = query.char ? lookupByChar(query.char) : null;
  const byId = query.letterId ? lookupById(query.letterId) : null;

  const resolved = [byName, byChar, byId].filter(
    (item): item is ArabicLetterNameRecording => item !== null,
  );
  if (resolved.length === 0) return null;

  const firstIndex = resolved[0].index;
  if (resolved.some((item) => item.index !== firstIndex)) {
    return null;
  }

  return resolved[0];
}

export function resolveArabicLetterNameAudioUrl(
  query: ArabicLetterNameQuery | string,
): string | null {
  return resolveArabicLetterNameRecording(query)?.audioUrl ?? null;
}
