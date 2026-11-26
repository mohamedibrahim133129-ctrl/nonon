import arabicLetterAudioLookup from '../data/arabicLetterAudioLookup.json';

export interface ArabicLetterNameRecording {
  index: number;
  manifestId: string;
  academyId: string;
  manifestLetter: string;
  academyChar: string;
  nameAr: string;
  namePlain: string;
  filename: string;
  audioUrl: string;
}

export interface ArabicLetterNameQuery {
  letterId?: string | null;
  char?: string | null;
  nameAr?: string | null;
}

interface ArabicLetterLookupRecord {
  index: number;
  letterId: string;
  manifestId: string;
  glyph: string;
  curriculumChar: string;
  nameAr: string;
  nameWithDiacritics: string;
  filename: string;
  audioUrl: string;
  bytes: number;
  sha256: string;
}

export const ARABIC_LETTER_AUDIO_BASE_URL = '/assets/audio/arabic-letters/names';

const LOOKUP_DATA = arabicLetterAudioLookup as {
  version: number;
  baseUrl: string;
  totalLetters: number;
  letters: Record<string, ArabicLetterLookupRecord>;
};

export const ARABIC_LETTER_NAME_RECORDINGS: ReadonlyArray<ArabicLetterNameRecording> = Object.values(
  LOOKUP_DATA.letters,
)
  .sort((a, b) => a.index - b.index)
  .map((entry) => ({
    index: entry.index,
    manifestId: entry.manifestId,
    academyId: entry.letterId,
    manifestLetter: entry.glyph,
    academyChar: entry.curriculumChar,
    nameAr: entry.nameWithDiacritics,
    namePlain: entry.nameAr,
    filename: entry.filename,
    audioUrl: entry.audioUrl,
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
  BY_NAME_EXACT.set(rec.namePlain, rec);
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

// Explicit Alif / Haa spelling equivalences between lookup glyphs and curriculum display symbols
const ALIF_RECORD = BY_ID.get('ar-alif');
const HAA2_RECORD = BY_ID.get('ar-haa2');
if (ALIF_RECORD) {
  BY_CHAR.set('ا', ALIF_RECORD);
  BY_CHAR.set('أ', ALIF_RECORD);
  BY_CHAR.set('إ', ALIF_RECORD);
  BY_CHAR.set('آ', ALIF_RECORD);
}
if (HAA2_RECORD) {
  BY_CHAR.set('ه', HAA2_RECORD);
  BY_CHAR.set('هـ', HAA2_RECORD);
}

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
 * Resolves the exact pre-recorded Arabic letter-name MP3 entry for all 28 letters
 * deterministically via src/data/arabicLetterAudioLookup.json.
 */
export function resolveArabicLetterNameRecording(
  query: ArabicLetterNameQuery | string,
): ArabicLetterNameRecording | null {
  if (typeof query === 'string') {
    const token = normalizeLetterToken(query);
    if (!token) return null;
    return lookupById(token) || lookupByName(token) || lookupByChar(token);
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
