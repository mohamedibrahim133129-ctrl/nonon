import foundationsAudioInventory from '../data/foundationsAudioInventory.json';
import {
  type AcademyAudioLang,
  normalizeAcademyAudioText,
  parseStandaloneNumberValue,
  resolveAuthoritativeNumberSpokenText,
} from './academyAudioText';

interface FoundationsAudioInventoryDocument {
  version: number;
  totalFiles: number;
  arabicCount: number;
  englishCount: number;
  bareDigitArabicAudioDefectIds?: string[];
  itemIds: string[];
  byLangText: {
    ar: Record<string, string>;
    en: Record<string, string>;
  };
}

const inventory = foundationsAudioInventory as FoundationsAudioInventoryDocument;

const FOUNDATIONS_ITEM_ID_RE = /^(ar|en)_[a-f0-9]{16}$/;

const KNOWN_FOUNDATIONS_ITEM_IDS = new Set<string>(
  Array.isArray(inventory.itemIds) ? inventory.itemIds : [],
);

const DEFECTIVE_ARABIC_BARE_DIGIT_IDS = new Set<string>(
  Array.isArray(inventory.bareDigitArabicAudioDefectIds)
    ? inventory.bareDigitArabicAudioDefectIds
    : [],
);

const EN_UNIQUE_LOWERCASE_MAP: ReadonlyMap<string, string> = (() => {
  const grouped = new Map<string, Set<string>>();
  for (const [text, itemId] of Object.entries(inventory.byLangText?.en || {})) {
    const trimmed = text.trim();
    if (trimmed.length < 2) continue;
    const lower = trimmed.toLowerCase();
    const bucket = grouped.get(lower) ?? new Set<string>();
    bucket.add(itemId);
    grouped.set(lower, bucket);
  }
  const unique = new Map<string, string>();
  for (const [lower, ids] of grouped.entries()) {
    if (ids.size === 1) {
      const onlyId = Array.from(ids)[0];
      if (
        KNOWN_FOUNDATIONS_ITEM_IDS.has(onlyId) &&
        FOUNDATIONS_ITEM_ID_RE.test(onlyId) &&
        onlyId.startsWith('en_')
      ) {
        unique.set(lower, onlyId);
      }
    }
  }
  return unique;
})();

export function isDefectiveArabicBareDigitItemId(itemId: string): boolean {
  return DEFECTIVE_ARABIC_BARE_DIGIT_IDS.has(itemId);
}

/**
 * Validates that an identifier is an exact known Foundations curriculum item_id
 * without empty values, whitespace, path separators, traversal segments, or extensions.
 */
export function isValidFoundationsItemId(itemId: unknown): itemId is string {
  if (typeof itemId !== 'string') return false;
  if (!FOUNDATIONS_ITEM_ID_RE.test(itemId)) return false;
  return KNOWN_FOUNDATIONS_ITEM_IDS.has(itemId);
}

/**
 * Resolves an exact curriculum item_id to `/assets/audio/foundations/{item_id}.mp3`.
 * Rejects empty IDs, invalid path characters, spoken text, lesson titles, and unknown IDs.
 */
export function resolveFoundationsAudioUrl(
  itemId: string | null | undefined,
): string | null {
  if (!isValidFoundationsItemId(itemId)) {
    return null;
  }
  return `/assets/audio/foundations/${itemId}.mp3`;
}

/**
 * Looks up the exact pre-verified Foundations item_id for a curriculum spoken text
 * and language from the static inventory. Never guesses IDs, never falls back across
 * languages, and never resolves standalone Arabic numbers to defective English-spoken
 * bare-digit files.
 */
export function findFoundationsItemId(
  text: string,
  lang: AcademyAudioLang,
): string | null {
  const clean = normalizeAcademyAudioText(text);
  if (!clean) return null;

  const langMap = lang === 'en' ? inventory.byLangText?.en : inventory.byLangText?.ar;
  const standaloneNum = parseStandaloneNumberValue(clean);
  if (standaloneNum !== null && standaloneNum >= 0 && standaloneNum <= 20) {
    const authoritativeText = resolveAuthoritativeNumberSpokenText(standaloneNum, lang);
    if (!authoritativeText) {
      return null;
    }
    const numCandidateId = langMap?.[authoritativeText];
    if (
      !isValidFoundationsItemId(numCandidateId) ||
      !numCandidateId.startsWith(`${lang}_`) ||
      DEFECTIVE_ARABIC_BARE_DIGIT_IDS.has(numCandidateId)
    ) {
      return null;
    }
    return numCandidateId;
  }

  let candidateId: string | undefined = langMap?.[clean];
  if (!candidateId && lang === 'en' && clean.length >= 2) {
    candidateId = EN_UNIQUE_LOWERCASE_MAP.get(clean.toLowerCase());
  }
  if (!isValidFoundationsItemId(candidateId)) {
    return null;
  }
  if (!candidateId.startsWith(`${lang}_`)) {
    return null;
  }
  if (DEFECTIVE_ARABIC_BARE_DIGIT_IDS.has(candidateId)) {
    return null;
  }
  return candidateId;
}

/**
 * Resolves both the exact Foundations item_id and URL for a curriculum item's spoken text.
 * Returns null if no exact verified Foundations recording exists for that text and language.
 */
export function resolveFoundationsAudioForText(
  text: string,
  lang: AcademyAudioLang,
): { itemId: string; audioUrl: string } | null {
  const itemId = findFoundationsItemId(text, lang);
  if (!itemId) return null;
  const audioUrl = resolveFoundationsAudioUrl(itemId);
  if (!audioUrl) return null;
  return { itemId, audioUrl };
}

export function getFoundationsAudioInventoryStats(): {
  totalFiles: number;
  arabicCount: number;
  englishCount: number;
} {
  return {
    totalFiles: KNOWN_FOUNDATIONS_ITEM_IDS.size,
    arabicCount: inventory.arabicCount ?? 0,
    englishCount: inventory.englishCount ?? 0,
  };
}
