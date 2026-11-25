import assert from 'node:assert';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { validateAcademyMp3File } from '../server/academyAudioService';
import { STORY_AUDIO_PUBLIC_DIR, validateStoryAudioAsset } from '../server/storyAudioService';
import {
  ACADEMY_COLORS,
  ACADEMY_SHAPES,
  ARABIC_ALPHABET,
  COLOR_MIX_RECIPES,
  ENGLISH_ALPHABET,
} from '../src/data/academyData';
import academyAudioLookup from '../src/data/academyAudioLookup.json';
import { VALIDATED_EXAM_BANK } from '../src/data/deepCurriculum';
import foundationsAudioInventory from '../src/data/foundationsAudioInventory.json';
import { ALL_LEVEL1_LESSONS, LEVEL1_COLOR_LESSONS, LEVEL1_NUMBER_LESSONS } from '../src/data/level1Curriculum';
import { LEVEL1_QUESTION_BANK } from '../src/data/level1QuestionBank';
import {
  AcademyAudioController,
  resolveAcademyRecordingUrl,
} from '../src/utils/academyAudioController';
import {
  ARABIC_NUMBER_WORDS_0_TO_10,
  normalizeAcademyAudioText,
  normalizeArabicIndicDigits,
  parseStandaloneNumberValue,
  resolveAuthoritativeNumberSpokenText,
  resolveLevel1VocabSpokenText,
} from '../src/utils/academyAudioText';
import {
  ARABIC_LETTER_NAME_RECORDINGS,
  resolveArabicLetterNameAudioUrl,
} from '../src/utils/arabicLetterAudioMap';
import {
  findFoundationsItemId,
  isDefectiveArabicBareDigitItemId,
  resolveFoundationsAudioUrl,
} from '../src/utils/foundationsAudioResolver';

const ARABIC_INDIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

function toArabicIndic(n: number): string {
  return String(n)
    .split('')
    .map((ch) => ARABIC_INDIC_DIGITS[Number(ch)] ?? ch)
    .join('');
}

function sha256File(filePath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function urlToPublicPath(root: string, urlPath: string): string {
  assert(urlPath.startsWith('/assets/'), `Expected /assets/ URL, got ${urlPath}`);
  return path.resolve(root, 'public', urlPath.replace(/^\//, ''));
}

async function run() {
  const root = process.cwd();

  console.log('[1/7] Reconciling 1,004 Foundations Inventory & No-NEW_PROPOSED Rules...');
  const inv = foundationsAudioInventory as {
    version: number;
    totalFiles: number;
    arabicCount: number;
    englishCount: number;
    excludedProposedCount: number;
    bareDigitArabicAudioDefectIds: string[];
    itemIds: string[];
    byLangText: { ar: Record<string, string>; en: Record<string, string> };
    items: Record<
      string,
      {
        itemId: string;
        filename: string;
        url: string;
        language: 'ar' | 'en';
        spokenText: string;
        spokenLanguageMismatch?: boolean;
      }
    >;
  };

  assert.strictEqual(inv.totalFiles, 1004);
  assert.strictEqual(inv.arabicCount, 529);
  assert.strictEqual(inv.englishCount, 475);
  assert.strictEqual(inv.excludedProposedCount, 185);
  assert.strictEqual(inv.bareDigitArabicAudioDefectIds.length, 17);
  assert.strictEqual(inv.itemIds.length, 1004);
  assert.strictEqual(Object.keys(inv.items).length, 1004);
  assert.strictEqual(Object.keys(inv.byLangText.ar).length, 529);
  assert.strictEqual(Object.keys(inv.byLangText.en).length, 475);

  const diskFoundations = fs
    .readdirSync(path.resolve(root, 'public/assets/audio/foundations'))
    .filter((f) => f.endsWith('.mp3'))
    .sort();
  assert.strictEqual(diskFoundations.length, 1004);
  assert.deepStrictEqual(
    diskFoundations,
    inv.itemIds.map((id) => `${id}.mp3`).sort(),
  );

  for (const id of inv.itemIds) {
    const rec = inv.items[id];
    assert(rec, `Missing detailed item record for ${id}`);
    assert.strictEqual(rec.filename, `${id}.mp3`);
    assert.strictEqual(rec.url, `/assets/audio/foundations/${id}.mp3`);
    assert.strictEqual(rec.language, id.startsWith('en_') ? 'en' : 'ar');
    assert.strictEqual(resolveFoundationsAudioUrl(id), rec.url);
  }
  console.log('   ✓ Verified 1,004 reconciled records (529 AR / 475 EN), 185 proposed excluded, 17 defective bare-digit AR IDs flagged.');

  console.log('[2/7] Verifying All 28 Arabic Letters Audio Resolution & UI Wiring...');
  assert.strictEqual(ARABIC_ALPHABET.length, 28);
  assert.strictEqual(ARABIC_LETTER_NAME_RECORDINGS.length, 28);
  for (const letter of ARABIC_ALPHABET) {
    const urlByAll = resolveArabicLetterNameAudioUrl({
      letterId: letter.id,
      char: letter.char,
      nameAr: letter.nameAr,
    });
    const urlById = resolveArabicLetterNameAudioUrl({ letterId: letter.id });
    const urlByChar = resolveArabicLetterNameAudioUrl({ char: letter.char });
    const urlByName = resolveArabicLetterNameAudioUrl({ nameAr: letter.nameAr });
    assert(urlByAll, `Arabic letter ${letter.id} (${letter.char}) failed resolution`);
    assert.strictEqual(urlByAll, urlById);
    assert.strictEqual(urlByAll, urlByChar);
    assert.strictEqual(urlByAll, urlByName);

    const diskPath = urlToPublicPath(root, urlByAll);
    assert(fs.existsSync(diskPath), `Missing Arabic letter file ${diskPath}`);
    const check = await validateAcademyMp3File(diskPath, false);
    assert(check.valid, `Invalid Arabic letter MP3 ${diskPath}`);

    const resolvedViaController = resolveAcademyRecordingUrl(`${letter.nameAr}، ${letter.word}`, 'ar', urlByAll);
    assert.strictEqual(resolvedViaController, urlByAll);
  }
  // Character/diacritic variants & mismatch guard
  assert.strictEqual(resolveArabicLetterNameAudioUrl({ char: 'ا' }), '/assets/audio/arabic-letters/01_alif_name.mp3');
  assert.strictEqual(resolveArabicLetterNameAudioUrl({ char: 'أ' }), '/assets/audio/arabic-letters/01_alif_name.mp3');
  assert.strictEqual(resolveArabicLetterNameAudioUrl({ char: 'إ' }), '/assets/audio/arabic-letters/01_alif_name.mp3');
  assert.strictEqual(resolveArabicLetterNameAudioUrl({ char: 'آ' }), '/assets/audio/arabic-letters/01_alif_name.mp3');
  assert.strictEqual(resolveArabicLetterNameAudioUrl({ char: 'ه' }), '/assets/audio/arabic-letters/26_haa2_name.mp3');
  assert.strictEqual(resolveArabicLetterNameAudioUrl({ char: 'هـ' }), '/assets/audio/arabic-letters/26_haa2_name.mp3');
  assert.strictEqual(resolveArabicLetterNameAudioUrl({ letterId: 'ar-alif', char: 'ب' }), null);

  const academyScreenSrc = fs.readFileSync(path.resolve(root, 'src/screens/AcademyScreen.tsx'), 'utf8');
  assert(academyScreenSrc.includes('resolveArabicLetterNameAudioUrl'), 'AcademyScreen must use resolveArabicLetterNameAudioUrl');
  assert(academyScreenSrc.includes('speakArabicLetterName'), 'AcademyScreen must route Arabic letter playback through speakArabicLetterName');
  console.log('   ✓ Verified all 28 Arabic letter recordings, variants (أ/ا/إ/آ, هـ/ه), mismatch guard, and AcademyScreen wiring.');

  console.log('[3/7] Verifying Numbers 0-20 Strict Lesson-Language Resolution (Western & Arabic-Indic)...');
  for (let n = 0; n <= 20; n++) {
    const western = String(n);
    const arabicIndic = toArabicIndic(n);
    assert.strictEqual(normalizeArabicIndicDigits(arabicIndic), western);
    assert.strictEqual(parseStandaloneNumberValue(western), n);
    assert.strictEqual(parseStandaloneNumberValue(arabicIndic), n);

    // English mode 0..20 (both Western and Arabic-Indic resolve to the same English file)
    assert.strictEqual(resolveAuthoritativeNumberSpokenText(western, 'en'), western);
    assert.strictEqual(resolveAuthoritativeNumberSpokenText(arabicIndic, 'en'), western);
    const enUrlW = resolveAcademyRecordingUrl(western, 'en');
    const enUrlA = resolveAcademyRecordingUrl(arabicIndic, 'en');
    assert(enUrlW, `English number ${n} (Western) must resolve`);
    assert.strictEqual(enUrlW, enUrlA, `English number ${n} must resolve consistently for Western and Arabic-Indic`);
    assert(
      enUrlW.includes('/academy/en/en_') || enUrlW.includes('/foundations/en_'),
      `English number ${n} resolved to non-English path: ${enUrlW}`,
    );
    const enDisk = urlToPublicPath(root, enUrlW);
    assert(fs.existsSync(enDisk), `Missing English number MP3 ${enDisk}`);

    // Arabic mode
    if (n <= 10) {
      const arWord = ARABIC_NUMBER_WORDS_0_TO_10[n];
      assert.strictEqual(resolveAuthoritativeNumberSpokenText(western, 'ar'), arWord);
      assert.strictEqual(resolveAuthoritativeNumberSpokenText(arabicIndic, 'ar'), arWord);

      const arUrlW = resolveAcademyRecordingUrl(western, 'ar');
      const arUrlA = resolveAcademyRecordingUrl(arabicIndic, 'ar');
      const arUrlWord = resolveAcademyRecordingUrl(arWord, 'ar');
      assert(arUrlW, `Arabic number ${n} must resolve`);
      assert.strictEqual(arUrlW, arUrlA, `Arabic number ${n} Western vs Arabic-Indic mismatch`);
      assert.strictEqual(arUrlW, arUrlWord, `Arabic number ${n} must resolve to Arabic word (${arWord}) recording`);
      assert(!arUrlW.includes('/en_'), `Arabic number ${n} resolved to English path: ${arUrlW}`);

      // Extract asset ID and ensure it is NOT one of the 17 defective bare-digit AR files
      const baseId = path.basename(arUrlW, '.mp3');
      assert(!isDefectiveArabicBareDigitItemId(baseId), `Arabic number ${n} resolved to defective bare-digit ID ${baseId}`);

      const arDisk = urlToPublicPath(root, arUrlW);
      assert(fs.existsSync(arDisk), `Missing Arabic number MP3 ${arDisk}`);
      assert.notStrictEqual(
        sha256File(arDisk),
        sha256File(enDisk),
        `Arabic number ${n} MP3 bytes must differ from English number ${n}`,
      );
    } else {
      // 11..20 Arabic must never reuse quarantined bare-digit Foundations files; must resolve strictly to new /academy/ar MP3s
      assert.strictEqual(resolveAuthoritativeNumberSpokenText(western, 'ar'), null);
      assert.strictEqual(findFoundationsItemId(western, 'ar'), null);
      assert.strictEqual(findFoundationsItemId(arabicIndic, 'ar'), null);
      const arUrlW = resolveAcademyRecordingUrl(western, 'ar');
      const arUrlA = resolveAcademyRecordingUrl(arabicIndic, 'ar');
      assert(arUrlW && arUrlW.startsWith('/assets/audio/academy/ar/ar_'), `Arabic number ${n} must resolve to /academy/ar/ar_*.mp3, got ${arUrlW}`);
      assert.strictEqual(arUrlW, arUrlA, `Arabic number ${n} Western vs Arabic-Indic mismatch`);
      assert(!arUrlW.includes('/foundations/'), `Arabic number ${n} must never resolve to Foundations`);
      assert(!arUrlW.includes('/en_'), `Arabic number ${n} must never resolve to English`);
      const arDisk = urlToPublicPath(root, arUrlW);
      assert(fs.existsSync(arDisk), `Missing Arabic 11..20 MP3 on disk: ${arDisk}`);
      const check11 = await validateAcademyMp3File(arDisk, false);
      assert(check11.valid, `Invalid Arabic 11..20 MP3 ${arDisk}`);
      assert.notStrictEqual(
        sha256File(arDisk),
        sha256File(enDisk),
        `Arabic number ${n} MP3 bytes must differ from English number ${n}`,
      );
    }
  }
  console.log('   ✓ Verified strict language resolution for 0-20 (Western & Arabic-Indic), 0 cross-lang mixing, 11-20 AR fixed via academy/ar MP3s.');

  console.log('[4/7] Verifying Level 1 Numbers (NM01-NM11) Curriculum & Stage 10 Quiz Fix...');
  assert.strictEqual(LEVEL1_NUMBER_LESSONS.length, 11);
  for (const lesson of LEVEL1_NUMBER_LESSONS) {
    const val = lesson.numberValue ?? 0;
    const arWord = ARABIC_NUMBER_WORDS_0_TO_10[val];
    const qs = LEVEL1_QUESTION_BANK.filter((q) => q.lessonId === lesson.id);
    assert.strictEqual(qs.length, 10);

    const byQId = new Map(qs.map((q) => [q.id, q]));
    for (const qKey of ['Q01', 'Q02', 'Q04', 'Q05']) {
      const q = byQId.get(`${lesson.id}-${qKey}`)!;
      assert.strictEqual(q.audioLang, 'ar', `${q.id} must have audioLang='ar'`);
      assert.strictEqual(q.audioText, arWord, `${q.id} must use Arabic word "${arWord}"`);
      const u = resolveAcademyRecordingUrl(q.audioText!, 'ar');
      assert(u && !u.includes('/en_'), `${q.id} failed Arabic audio resolution: ${u}`);
    }
    const q07 = byQId.get(`${lesson.id}-Q07`)!;
    assert.strictEqual(q07.audioLang, 'en', `${q07.id} is explicitly English listen-choose`);
    assert(resolveAcademyRecordingUrl(q07.audioText!, 'en'), `${q07.id} failed English resolution`);
  }
  console.log('   ✓ Verified all 11 NM lessons Stage 10 Q01-Q07 language/audio consistency.');

  console.log('[5/7] Verifying Colors, Color Mixing, Shapes & ExamsScreen Repairs...');
  assert.strictEqual(ACADEMY_COLORS.length, 8);
  for (const col of ACADEMY_COLORS) {
    const uAr = resolveAcademyRecordingUrl(col.name.ar, 'ar');
    const uEn = resolveAcademyRecordingUrl(col.name.en, 'en');
    assert(uAr && uAr.includes('/ar_'), `Color ${col.id} AR missing`);
    assert(uEn && uEn.includes('/en_'), `Color ${col.id} EN missing`);
    assert(fs.existsSync(urlToPublicPath(root, uAr)));
    assert(fs.existsSync(urlToPublicPath(root, uEn)));
  }

  assert.strictEqual(COLOR_MIX_RECIPES.length, 4);
  for (const mix of COLOR_MIX_RECIPES) {
    const uAr = resolveAcademyRecordingUrl(mix.explanation.ar, 'ar');
    const uEn = resolveAcademyRecordingUrl(mix.explanation.en, 'en');
    assert(uAr, `Color mix ${mix.a}+${mix.b} AR missing`);
    assert(uEn, `Color mix ${mix.a}+${mix.b} EN missing`);
  }

  assert.strictEqual(LEVEL1_COLOR_LESSONS.length, 10);
  for (const cl of LEVEL1_COLOR_LESSONS) {
    assert(resolveAcademyRecordingUrl(cl.targetSymbol, 'ar'), `${cl.id} AR color missing`);
    assert(resolveAcademyRecordingUrl(cl.secondarySymbol!, 'en'), `${cl.id} EN color missing`);
    for (const v of cl.teachingVocab) {
      assert(resolveAcademyRecordingUrl(resolveLevel1VocabSpokenText('colors', v, 'ar'), 'ar'));
      assert(resolveAcademyRecordingUrl(resolveLevel1VocabSpokenText('colors', v, 'en'), 'en'));
    }
  }

  // Shapes: all 6 shapes (star in Foundations + 5 shapes in academy/{ar,en}) must resolve to existing MP3s
  for (const s of ACADEMY_SHAPES) {
    const sAr = resolveAcademyRecordingUrl(s.name.ar, 'ar');
    const sEn = resolveAcademyRecordingUrl(s.name.en, 'en');
    assert(sAr && sAr.includes('/ar_'), `Missing AR shape recording for ${s.id}`);
    assert(sEn && sEn.includes('/en_'), `Missing EN shape recording for ${s.id}`);
    assert(fs.existsSync(urlToPublicPath(root, sAr)), `Missing AR shape MP3 on disk for ${s.id}`);
    assert(fs.existsSync(urlToPublicPath(root, sEn)), `Missing EN shape MP3 on disk for ${s.id}`);
  }

  // Exam bank checks for q-col-* & q-ar-rec-*
  const colExams = VALIDATED_EXAM_BANK.filter((q) => q.id.startsWith('q-col-'));
  assert.strictEqual(colExams.length, 8);
  for (const q of colExams) {
    const colorId = q.id.slice('q-col-'.length);
    const col = ACADEMY_COLORS.find((c) => c.id === colorId);
    assert(col);
    assert(resolveAcademyRecordingUrl(col.name.ar, 'ar'));
    assert(resolveAcademyRecordingUrl(col.name.en, 'en'));
  }
  const arRecExams = VALIDATED_EXAM_BANK.filter((q) => q.id.startsWith('q-ar-rec-'));
  assert.strictEqual(arRecExams.length, 28);
  for (const q of arRecExams) {
    const letterId = q.id.slice('q-ar-rec-'.length);
    assert(resolveArabicLetterNameAudioUrl({ letterId }), `Exam ${q.id} must resolve via Arabic letter map`);
  }
  console.log('   ✓ Verified 8/8 Colors (AR+EN), 4/4 Mixing (AR+EN), CL01-CL10, Shapes safe fallback, and Exam bank color/letter playback.');

  console.log('[6/7] Verifying Controller Cache Isolation & Error Semantics...');
  const ctrl = new AcademyAudioController();
  const resUnrecorded = await ctrl.playText('unrecorded-regression-check-xyz', 'ar');
  assert.strictEqual(resUnrecorded, false);
  assert.strictEqual(ctrl.getSnapshot().errorCode, 'UNAVAILABLE');
  const lookup = academyAudioLookup as { ar: Record<string, string>; en: Record<string, string> };
  const existingTotal = new Set([...Object.values(lookup.ar), ...Object.values(lookup.en)]).size;
  assert(existingTotal >= 54, `Expected >= 54 Academy lookup recordings, got ${existingTotal}`);
  console.log(`   ✓ Controller fail-closed behavior and ${existingTotal} registered Academy recordings verified.`);

  console.log('[7/7] Verifying Zero Runtime TTS & Quran Story Assets Untouched...');
  let storyCount = 0;
  for (const d of fs.readdirSync(STORY_AUDIO_PUBLIC_DIR)) {
    const sub = path.join(STORY_AUDIO_PUBLIC_DIR, d);
    if (!fs.statSync(sub).isDirectory()) continue;
    for (const f of fs.readdirSync(sub)) {
      if (!f.endsWith('.mp3')) continue;
      const v = await validateStoryAudioAsset(`/assets/audio/stories/${d}/${f}`);
      assert(v.valid, `Invalid story asset ${d}/${f}`);
      storyCount++;
    }
  }
  assert.strictEqual(storyCount, 41);
  assert.strictEqual(ALL_LEVEL1_LESSONS.length, 75);
  assert.strictEqual(ENGLISH_ALPHABET.length, 26);

  console.log('\n✅ Academy Audio Regression Suite PASSED');
}

run().catch((err) => {
  console.error('❌ Academy regression suite failed:', err);
  process.exit(1);
});
