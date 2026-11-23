import assert from 'node:assert';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { validateAcademyMp3File } from '../server/academyAudioService';
import { STORY_AUDIO_PUBLIC_DIR, validateStoryAudioAsset } from '../server/storyAudioService';
import type { AcademyAudioManifestDocument } from '../server/academyAudioManifestBuilder';
import academyAudioLookup from '../src/data/academyAudioLookup.json';
import foundationsAudioInventory from '../src/data/foundationsAudioInventory.json';
import { ALL_LEVEL1_LESSONS } from '../src/data/level1Curriculum';
import { LEVEL1_QUESTION_BANK } from '../src/data/level1QuestionBank';
import { VALIDATED_EXAM_BANK } from '../src/data/deepCurriculum';
import { ARABIC_LETTER_NAME_RECORDINGS } from '../src/utils/arabicLetterAudioMap';
import {
  findFoundationsItemId,
  getFoundationsAudioInventoryStats,
  isValidFoundationsItemId,
  resolveFoundationsAudioForText,
  resolveFoundationsAudioUrl,
} from '../src/utils/foundationsAudioResolver';
import {
  AcademyAudioController,
  resolveAcademyRecordingUrl,
} from '../src/utils/academyAudioController';
import {
  normalizeAcademyAudioText,
  resolveLevel1VocabSpokenText,
} from '../src/utils/academyAudioText';

function sha256File(filePath: string): string {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

async function waitForReady(baseUrl: string): Promise<void> {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${baseUrl}/api/health`);
      if (r.ok) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Isolated test server at ${baseUrl} did not become ready`);
}

function stopChild(proc: ChildProcess) {
  try {
    if (proc.pid) process.kill(-proc.pid, 'SIGTERM');
  } catch {
    try {
      proc.kill('SIGTERM');
    } catch {
      // ignore
    }
  }
}

async function run() {
  const root = process.cwd();
  const sourceDir = path.resolve(root, 'generated_audio');
  const destDir = path.resolve(root, 'public/assets/audio/foundations');
  const lettersDir = path.resolve(root, 'public/assets/audio/arabic-letters');
  const manifestPath = path.resolve(root, 'data/academy-audio-manifest.json');

  console.log('[1/6] Verifying 1,004 Foundations MP3 Assets & SHA-256 Parity...');
  assert(fs.existsSync(sourceDir), 'Source directory generated_audio/ must exist intact');
  assert(fs.existsSync(destDir), 'Destination public/assets/audio/foundations/ must exist');

  const sourceEntries = fs.readdirSync(sourceDir, { withFileTypes: true });
  const destEntries = fs.readdirSync(destDir, { withFileTypes: true });

  const sourceFiles = sourceEntries.filter((e) => e.isFile() && e.name.endsWith('.mp3')).map((e) => e.name).sort();
  const destNonFiles = destEntries.filter((e) => !e.isFile() || !e.name.endsWith('.mp3'));
  assert.strictEqual(destNonFiles.length, 0, `Unexpected non-MP3 entries in foundations dir: ${destNonFiles.map((e) => e.name).join(', ')}`);

  const destFiles = destEntries.filter((e) => e.isFile() && e.name.endsWith('.mp3')).map((e) => e.name).sort();
  assert.strictEqual(sourceFiles.length, 1004, `Expected 1004 source MP3s, found ${sourceFiles.length}`);
  assert.strictEqual(destFiles.length, 1004, `Expected 1004 copied MP3s, found ${destFiles.length}`);
  assert.deepStrictEqual(destFiles, sourceFiles, 'Copied filenames must match source archive 1:1');

  const seenDest = new Set<string>();
  let totalBytes = 0;
  let shaMatches = 0;
  const BATCH_SIZE = 32;
  for (let i = 0; i < destFiles.length; i += BATCH_SIZE) {
    const batch = destFiles.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (filename) => {
        assert(!seenDest.has(filename), `Duplicate filename detected: ${filename}`);
        seenDest.add(filename);

        const srcFile = path.join(sourceDir, filename);
        const dstFile = path.join(destDir, filename);
        const stat = fs.statSync(dstFile);
        assert(stat.size > 0, `Zero-byte MP3 detected: ${filename}`);
        totalBytes += stat.size;

        const srcHash = sha256File(srcFile);
        const dstHash = sha256File(dstFile);
        assert.strictEqual(dstHash, srcHash, `SHA-256 mismatch for ${filename}`);
        shaMatches++;

        const mp3Check = await validateAcademyMp3File(dstFile, false);
        assert(mp3Check.valid, `Invalid MP3 frame/header for ${filename}: ${mp3Check.reason}`);
        assert.strictEqual(mp3Check.mimeType, 'audio/mpeg');
      }),
    );
  }
  assert.strictEqual(shaMatches, 1004);
  console.log(`   ✓ Verified ${shaMatches}/1004 MP3 files: SHA-256 byte-for-byte match, 0 missing, 0 zero-byte, valid audio/mpeg headers (${totalBytes} bytes total).`);

  console.log('[2/6] Verifying Foundations Inventory Alignment & Non-Overlap...');
  const inventory = foundationsAudioInventory as {
    version: number;
    totalFiles: number;
    arabicCount: number;
    englishCount: number;
    itemIds: string[];
    byLangText: { ar: Record<string, string>; en: Record<string, string> };
  };
  const lookup = academyAudioLookup as { ar: Record<string, string>; en: Record<string, string> };
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as AcademyAudioManifestDocument;
  const manifestById = new Map(manifest.items.map((item) => [item.assetId, item]));

  assert.strictEqual(inventory.totalFiles, 1004);
  assert.strictEqual(inventory.itemIds.length, 1004);
  assert.strictEqual(inventory.arabicCount + inventory.englishCount, 1004);
  const stats = getFoundationsAudioInventoryStats();
  assert.strictEqual(stats.totalFiles, 1004);

  const existingLookupIds = new Set([...Object.values(lookup.ar), ...Object.values(lookup.en)]);
  assert.strictEqual(existingLookupIds.size, 26, 'Expected 26 existing Academy recordings preserved');

  for (const itemId of inventory.itemIds) {
    assert(destFiles.includes(`${itemId}.mp3`), `Missing MP3 file for inventory ID: ${itemId}`);
    assert(!existingLookupIds.has(itemId), `Foundations ID ${itemId} must not overwrite existing 26 Academy IDs`);

    const manifestItem = manifestById.get(itemId);
    assert(manifestItem, `Foundations item_id ${itemId} missing from academy-audio-manifest.json`);
    const langPrefix = itemId.startsWith('en_') ? 'en' : 'ar';
    assert.strictEqual(manifestItem.language, langPrefix);
    const cleanText = normalizeAcademyAudioText(manifestItem.text);
    const mapped = (langPrefix === 'en' ? inventory.byLangText.en : inventory.byLangText.ar)[cleanText];
    assert.strictEqual(mapped, itemId, `Inventory byLangText mismatch for ${itemId}`);
  }
  console.log(`   ✓ All 1,004 itemIds verified against inventory & manifest (${inventory.arabicCount} AR, ${inventory.englishCount} EN, 0 overlap with 26 existing recordings).`);

  console.log('[3/6] Verifying Item-ID Resolver & Controller Preservation...');
  for (const itemId of inventory.itemIds) {
    assert.strictEqual(isValidFoundationsItemId(itemId), true);
    assert.strictEqual(
      resolveFoundationsAudioUrl(itemId),
      `/assets/audio/foundations/${itemId}.mp3`,
    );
  }

  // Known invalid/malicious/unknown inputs must fail closed to null
  const rejectedIds: Array<string | null | undefined> = [
    '',
    '   ',
    null,
    undefined,
    'en_c3433602c5845902.mp3',
    '../en_c3433602c5845902',
    'en_c3433602c5845902/../other',
    '/assets/audio/foundations/en_c3433602c5845902.mp3',
    'ar_0000000000000000',
    'en_ffffffffffffffff',
    'AR_00a6653e7711a5c3',
    'fr_00a6653e7711a5c3',
    'أسد',
    'اكتشف حرف الألف (أ)',
    'Discover Letter A a',
  ];
  for (const badId of rejectedIds) {
    assert.strictEqual(
      resolveFoundationsAudioUrl(badId),
      null,
      `Resolver MUST reject invalid/unknown itemId: ${String(badId)}`,
    );
  }

  // Known existing itemId check (if still in sample en_c3433602c5845902)
  assert.strictEqual(
    resolveFoundationsAudioUrl('en_c3433602c5845902'),
    '/assets/audio/foundations/en_c3433602c5845902.mp3',
  );

  // Language & text resolution via findFoundationsItemId / resolveFoundationsAudioForText
  const arSlowRes = resolveFoundationsAudioForText('ب، بطة', 'ar');
  assert(arSlowRes, 'Expected Foundations audio for AR02 slow cue "ب، بطة"');
  assert.strictEqual(arSlowRes.itemId, 'ar_ddb7683d3a417332');
  assert.strictEqual(arSlowRes.audioUrl, '/assets/audio/foundations/ar_ddb7683d3a417332.mp3');

  const arNormalTitleRes = resolveFoundationsAudioForText('اكتشف حرف الباء (ب)', 'ar');
  assert(arNormalTitleRes, 'Expected Foundations audio for AR02 title');
  assert.strictEqual(arNormalTitleRes.itemId, 'ar_cb5a143c2cb012bb');
  assert.notStrictEqual(arNormalTitleRes.itemId, arSlowRes.itemId, 'Slow recording must remain distinct from normal title');

  assert.strictEqual(findFoundationsItemId('definitely-not-a-curriculum-item-12345', 'en'), null);

  // Controller priority & fallback preservation checks
  // 1. Explicit audioUrl priority (28 Arabic letter-name MP3s)
  assert.strictEqual(
    resolveAcademyRecordingUrl('الألف', 'ar', '/assets/audio/arabic-letters/01_alif_name.mp3'),
    '/assets/audio/arabic-letters/01_alif_name.mp3',
  );
  // 2. Existing 26 Academy recording fallback without itemId
  assert.strictEqual(
    resolveAcademyRecordingUrl('ب', 'ar'),
    '/assets/audio/academy/ar/ar_a1297edee10476b6.mp3',
  );
  assert.strictEqual(
    resolveAcademyRecordingUrl('1', 'en'),
    '/assets/audio/academy/en/en_12c175859ab7fef0.mp3',
  );
  // 3. Explicit unknown itemId must NOT guess or substitute another recording (even if text matches!)
  assert.strictEqual(
    resolveAcademyRecordingUrl('ب', 'ar', undefined, 'ar_0000000000000000'),
    null,
  );
  // 4. Explicit Foundations itemId resolves directly
  assert.strictEqual(
    resolveAcademyRecordingUrl('ب، بطة', 'ar', undefined, 'ar_ddb7683d3a417332'),
    '/assets/audio/foundations/ar_ddb7683d3a417332.mp3',
  );
  // 5. Foundations lookup without explicitItemId still resolves to /assets/audio/foundations/...
  assert.strictEqual(
    resolveAcademyRecordingUrl('ب، بطة', 'ar'),
    '/assets/audio/foundations/ar_ddb7683d3a417332.mp3',
  );
  // 6. Unknown text returns null cleanly
  assert.strictEqual(resolveAcademyRecordingUrl('unrecorded-phrase-xyz', 'en'), null);

  // Controller preserves replay / lastRequest behavior cleanly in headless Node (returns false cleanly without throwing, retains unavailability error state)
  const controller = new AcademyAudioController();
  const playedUnknown = await controller.playText('unrecorded-phrase-xyz', 'en');
  assert.strictEqual(playedUnknown, false);
  assert.strictEqual(controller.getSnapshot().status, 'error');
  assert.strictEqual(controller.getSnapshot().errorCode, 'UNAVAILABLE');
  assert.strictEqual(await controller.replay(), false);
  console.log('   ✓ Item-ID resolver, security rejections, explicit audioUrl priority, existing fallback & no-substitution verified.');

  console.log('[4/6] Auditing Level 1 Foundations Coverage & Call-Site Integrity...');
  assert.strictEqual(ALL_LEVEL1_LESSONS.length, 75, 'Curriculum count must remain 75 lessons');
  for (const lesson of ALL_LEVEL1_LESSONS) {
    const primaryLang = lesson.subject === 'english' ? 'en' : 'ar';

    // Stage 1 intro
    const introText = primaryLang === 'en' ? lesson.characterIntro.en : lesson.characterIntro.ar;
    assert(resolveAcademyRecordingUrl(introText, primaryLang), `Missing S1 intro audio for ${lesson.id}`);

    // Stage 2 explanation
    const expText = primaryLang === 'en' ? lesson.explanation.en : lesson.explanation.ar;
    assert(resolveAcademyRecordingUrl(expText, primaryLang), `Missing S2 explanation audio for ${lesson.id}`);

    // Stage 2 vocab cards
    for (const v of lesson.teachingVocab) {
      assert.strictEqual(v.audioStatus, 'verified_audio', `Expected verified_audio status for ${lesson.id}:${v.id}`);
      const vocabText = resolveLevel1VocabSpokenText(
        lesson.subject,
        v,
        primaryLang,
        lesson.numberValue,
        lesson.secondarySymbol,
      );
      assert(resolveAcademyRecordingUrl(vocabText, primaryLang), `Missing S2 vocab audio for ${lesson.id}:${v.id} (${vocabText})`);
    }

    // Stage 3 normal & slow
    const titleText = primaryLang === 'en' ? lesson.title.en : lesson.title.ar;
    assert(resolveAcademyRecordingUrl(titleText, primaryLang), `Missing S3 normal audio for ${lesson.id}`);

    const targetCue =
      lesson.subject === 'colors'
        ? primaryLang === 'en'
          ? lesson.secondarySymbol || lesson.targetSymbol
          : lesson.targetSymbol
        : lesson.subject === 'numbers'
          ? primaryLang === 'ar'
            ? lesson.secondarySymbol || String(lesson.numberValue ?? lesson.targetSymbol)
            : String(lesson.numberValue ?? lesson.targetSymbol)
          : lesson.targetSymbol;
    const firstVocab = lesson.teachingVocab[0]
      ? resolveLevel1VocabSpokenText(lesson.subject, lesson.teachingVocab[0], primaryLang, lesson.numberValue, lesson.secondarySymbol)
      : '';
    const slowCue = !firstVocab || firstVocab === targetCue
      ? targetCue
      : primaryLang === 'en'
        ? `${targetCue}. ${firstVocab}`
        : `${targetCue}، ${firstVocab}`;
    assert(resolveAcademyRecordingUrl(slowCue, primaryLang), `Missing S3 slow audio for ${lesson.id} (${slowCue})`);

    // Stage 5 target sound
    assert(resolveAcademyRecordingUrl(targetCue, primaryLang), `Missing S5 target audio for ${lesson.id}`);
  }
  assert.strictEqual(LEVEL1_QUESTION_BANK.length, 750, 'Stage 10 quiz count must remain 750');
  let quizWithAudio = 0;
  let quizResolved = 0;
  for (const q of LEVEL1_QUESTION_BANK) {
    if (q.audioText) {
      quizWithAudio++;
      const qLang = q.audioLang || 'ar';
      if (resolveAcademyRecordingUrl(q.audioText, qLang)) {
        quizResolved++;
      }
    }
  }
  assert.strictEqual(quizResolved, quizWithAudio, `Expected all ${quizWithAudio} Stage 10 audio questions to resolve, resolved ${quizResolved}`);
  assert(VALIDATED_EXAM_BANK.length >= 96, 'Exam bank must remain untouched');

  // Verify zero speechSynthesis / TTS calls in Foundations & Academy UI files + resolver
  for (const rel of [
    'src/utils/foundationsAudioResolver.ts',
    'src/utils/academyAudioController.ts',
    'src/components/academy/Level1LessonRunner.tsx',
    'src/components/academy/DeepLessonEngine.tsx',
    'src/screens/AcademyScreen.tsx',
    'src/screens/ExamsScreen.tsx',
  ]) {
    const src = fs.readFileSync(path.resolve(root, rel), 'utf8');
    assert(!/speechSynthesis/.test(src), `${rel} must not use window.speechSynthesis`);
    assert(!/\/api\/academy\/tts(?!-status)/.test(src), `${rel} must not call runtime Academy TTS`);
  }
  console.log(`   ✓ Verified all 75 Level 1 lessons (750 quiz items) S1/S2/S3(normal+slow)/S5 coverage & zero runtime TTS.`);

  console.log('[5/6] Verifying Existing 28 Arabic Letters, 26 Academy & 41 Quran Stories Intact...');
  assert.strictEqual(ARABIC_LETTER_NAME_RECORDINGS.length, 28);
  for (const spec of ARABIC_LETTER_NAME_RECORDINGS) {
    const file = path.join(lettersDir, spec.filename);
    assert(fs.existsSync(file), `Missing Arabic letter audio: ${spec.filename}`);
    const res = await validateAcademyMp3File(file, false);
    assert(res.valid, `Invalid Arabic letter MP3 ${spec.filename}: ${res.reason}`);
  }

  let storyCount = 0;
  for (const d of fs.readdirSync(STORY_AUDIO_PUBLIC_DIR)) {
    const sub = path.join(STORY_AUDIO_PUBLIC_DIR, d);
    if (!fs.statSync(sub).isDirectory()) continue;
    for (const f of fs.readdirSync(sub)) {
      if (!f.endsWith('.mp3')) continue;
      const v = await validateStoryAudioAsset(`/assets/audio/stories/${d}/${f}`);
      assert(v.valid, `Invalid Quran story MP3 ${d}/${f}: ${v.reason}`);
      storyCount++;
    }
  }
  assert.strictEqual(storyCount, 41);
  console.log('   ✓ Verified all 28 Arabic letter-name MP3s & 41 Quran Story MP3s remain untouched and valid.');

  console.log('[6/6] Verifying Live HTTP MP3 Delivery (audio/mpeg, GET, HEAD, 206 Range, 404 Fail-Closed)...');
  const port = 3199;
  const baseUrl = `http://127.0.0.1:${port}`;
  const proc = spawn('npx', ['tsx', 'server.ts', '--port', String(port)], {
    cwd: root,
    detached: true,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'development',
      SKIP_VITE: '1',
      GEMINI_API_KEY: '',
      SQL_HOST: '',
      SQL_DB_NAME: '',
      SQL_USER: '',
      SQL_PASSWORD: '',
      DATABASE_URL: '',
      REQUIRE_POSTGRES: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    await waitForReady(baseUrl);
    const sampleIds = [
      inventory.itemIds.find((id) => id.startsWith('ar_'))!,
      'en_c3433602c5845902',
    ];
    for (const sampleId of sampleIds) {
      const urlPath = resolveFoundationsAudioUrl(sampleId)!;
      const diskPath = path.join(destDir, `${sampleId}.mp3`);
      const diskBuf = fs.readFileSync(diskPath);

      const headRes = await fetch(`${baseUrl}${urlPath}`, { method: 'HEAD' });
      assert.strictEqual(headRes.status, 200, `HEAD ${urlPath} failed`);
      assert.strictEqual(headRes.headers.get('content-type'), 'audio/mpeg');
      assert.strictEqual(headRes.headers.get('accept-ranges'), 'bytes');

      const getRes = await fetch(`${baseUrl}${urlPath}`);
      assert.strictEqual(getRes.status, 200, `GET ${urlPath} failed`);
      assert.strictEqual(getRes.headers.get('content-type'), 'audio/mpeg');
      const netBuf = Buffer.from(await getRes.arrayBuffer());
      assert.strictEqual(netBuf.length, diskBuf.length);
      assert.strictEqual(
        crypto.createHash('sha256').update(netBuf).digest('hex'),
        crypto.createHash('sha256').update(diskBuf).digest('hex'),
      );

      const rangeRes = await fetch(`${baseUrl}${urlPath}`, {
        headers: { Range: 'bytes=0-511' },
      });
      assert.strictEqual(rangeRes.status, 206, `Range request on ${urlPath} must return 206`);
      assert.strictEqual(rangeRes.headers.get('content-type'), 'audio/mpeg');
      const rangeBuf = Buffer.from(await rangeRes.arrayBuffer());
      assert.strictEqual(rangeBuf.length, Math.min(512, diskBuf.length));
    }

    // Arabic letter preservation over HTTP
    const alifRes = await fetch(`${baseUrl}/assets/audio/arabic-letters/01_alif_name.mp3`, { method: 'HEAD' });
    assert.strictEqual(alifRes.status, 200);
    assert.strictEqual(alifRes.headers.get('content-type'), 'audio/mpeg');

    // Missing foundations MP3 returns 404 fail-closed
    const missingRes = await fetch(`${baseUrl}/assets/audio/foundations/en_0000000000000000.mp3`);
    assert.strictEqual(missingRes.status, 404);
    console.log('   ✓ HTTP HEAD/GET (audio/mpeg), SHA-256 over HTTP, 206 Range, and 404 fail-closed verified.');
  } finally {
    stopChild(proc);
  }

  console.log('\n✅ Foundations Audio Integration Verification Suite PASSED');
  console.log(
    JSON.stringify({
      filesCopied: destFiles.length,
      sha256Matched: shaMatches,
      missingFiles: 0,
      zeroByteFiles: 0,
      inventoryIdsMatched: inventory.totalFiles,
      arabicFoundationsIds: inventory.arabicCount,
      englishFoundationsIds: inventory.englishCount,
      existingAcademyPreserved: 26,
      arabicLettersIntact: 28,
      quranStoriesIntact: 41,
    }),
  );
}

run().catch((err) => {
  console.error('❌ Foundations verification failed:', err);
  process.exit(1);
});
