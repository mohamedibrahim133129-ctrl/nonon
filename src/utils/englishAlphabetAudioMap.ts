import { findFoundationsItemId, resolveFoundationsAudioUrl } from './foundationsAudioResolver';

export interface EnglishAlphabetAnchorMapping {
  letter: string;
  combinedText: string;
  word: string;
  letterItemId: string;
  wordItemId: string;
  urls: [string, string];
}

const REVIEWED_ENGLISH_ANCHOR_PAIRS: ReadonlyArray<{
  letter: string;
  word: string;
  letterItemId: string;
  wordItemId: string;
}> = [
  { letter: 'E', word: 'Elephant', letterItemId: 'en_818271c09bd84c9e', wordItemId: 'en_944187f9fed6e693' },
  { letter: 'G', word: 'Grapes', letterItemId: 'en_353b17665fe2ac0a', wordItemId: 'en_ef30c485c9cf95d1' },
  { letter: 'N', word: 'Nest', letterItemId: 'en_fab30426c368b8bd', wordItemId: 'en_cee5e474276c40b3' },
  { letter: 'P', word: 'Panda', letterItemId: 'en_c1b7f153b6f135dd', wordItemId: 'en_d486a2622d3cb2b5' },
  { letter: 'R', word: 'Rainbow', letterItemId: 'en_590d3e6c61930e97', wordItemId: 'en_d022bc2eb0e33749' },
  { letter: 'T', word: 'Tree', letterItemId: 'en_c6fa89699047a3b1', wordItemId: 'en_5b35ffc8243d85c0' },
  { letter: 'V', word: 'Violin', letterItemId: 'en_47e7df8959b30957', wordItemId: 'en_2b97b865b697b2d1' },
  { letter: 'W', word: 'Whale', letterItemId: 'en_95a7d8722561f336', wordItemId: 'en_1ae6c7e7665cebab' },
  { letter: 'X', word: 'Xylophone', letterItemId: 'en_097c91ad43e403bf', wordItemId: 'en_9e5890c1b200f7c0' },
];

export const ENGLISH_ALPHABET_ANCHOR_SEQUENCES: ReadonlyMap<string, EnglishAlphabetAnchorMapping> =
  new Map(
    REVIEWED_ENGLISH_ANCHOR_PAIRS.flatMap((entry) => {
      const verifiedLetterId = findFoundationsItemId(entry.letter, 'en');
      const verifiedWordId = findFoundationsItemId(entry.word, 'en');
      if (
        verifiedLetterId !== entry.letterItemId ||
        verifiedWordId !== entry.wordItemId
      ) {
        return [];
      }
      const letterUrl = resolveFoundationsAudioUrl(entry.letterItemId);
      const wordUrl = resolveFoundationsAudioUrl(entry.wordItemId);
      if (!letterUrl || !wordUrl) {
        return [];
      }
      const combinedText = `${entry.letter}. ${entry.word}`;
      return [
        [
          combinedText,
          {
            letter: entry.letter,
            combinedText,
            word: entry.word,
            letterItemId: entry.letterItemId,
            wordItemId: entry.wordItemId,
            urls: [letterUrl, wordUrl] as [string, string],
          },
        ],
      ];
    }),
  );

/**
 * Resolves the 9 explicit ENGLISH_ALPHABET anchor mismatches (E, G, N, P, R, T, V, W, X)
 * to a two-clip sequence of existing verified Foundations recordings ([letter, word])
 * without altering displayed lesson vocabulary or generating new audio.
 */
export function resolveEnglishAlphabetAnchorSequence(
  text: string,
  lang: 'ar' | 'en',
): [string, string] | null {
  if (lang !== 'en') return null;
  const hit = ENGLISH_ALPHABET_ANCHOR_SEQUENCES.get(text.trim());
  return hit ? [hit.urls[0], hit.urls[1]] : null;
}
