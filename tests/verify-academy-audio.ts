import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import {
  type AcademyAudioManifestDocument,
  FLAGGED_QUESTIONABLE_ACADEMY_ASSETS,
  resolveAcademyTtsPromptSpec,
} from '../server/academyAudioManifestBuilder';
import {
  ACADEMY_LOOKUP_FILE,
  ACADEMY_MANIFEST_FILE,
  ACADEMY_TTS_FALLBACK_MODEL,
  ACADEMY_TTS_PRIMARY_MODEL,
  FREE_TIER_TTS_MODEL_LIMITS,
  computeQuotaRenewalState,
  computeStrictFreeTierBatchDelayMs,
  diagnoseGeminiTtsAvailability,
  getNextAcademyResumeItem,
  matchesExpectedSpokenLetterTranscript,
  validateAcademyMp3File,
  validateGeneratedLetterPronunciation,
} from '../server/academyAudioService';
import { STORY_AUDIO_PUBLIC_DIR, validateStoryAudioAsset } from '../server/storyAudioService';
import { ALL_LEVEL1_LESSONS } from '../src/data/level1Curriculum';
import { VALIDATED_EXAM_BANK } from '../src/data/deepCurriculum';
import { normalizeAcademyAudioText } from '../src/utils/academyAudioText';

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
  console.log('[1/6] Auditing Academy Audio Manifest & Coverage...');
  assert(fs.existsSync(ACADEMY_MANIFEST_FILE), 'data/academy-audio-manifest.json must exist');
  assert(fs.existsSync(ACADEMY_LOOKUP_FILE), 'src/data/academyAudioLookup.json must exist');

  const manifest = JSON.parse(
    fs.readFileSync(ACADEMY_MANIFEST_FILE, 'utf8'),
  ) as AcademyAudioManifestDocument;
  const lookup = JSON.parse(fs.readFileSync(ACADEMY_LOOKUP_FILE, 'utf8')) as {
    ar: Record<string, string>;
    en: Record<string, string>;
  };

  assert(manifest.totalAssets > 1400, `Expected full Academy manifest (>1400 assets), got ${manifest.totalAssets}`);
  assert.strictEqual(manifest.totalAssets, manifest.items.length, 'totalAssets must equal items.length');
  assert.strictEqual(
    manifest.arabicAssets + manifest.englishAssets,
    manifest.totalAssets,
    'arabicAssets + englishAssets must equal totalAssets',
  );

  // Deduplication check
  const seenKeys = new Set<string>();
  const screenSet = new Set<string>();
  const lessonSet = new Set<string>();
  for (const item of manifest.items) {
    const dedupKey = `${item.language}|${normalizeAcademyAudioText(item.text)}`;
    assert(!seenKeys.has(dedupKey), `Duplicate manifest entry for ${dedupKey}`);
    seenKeys.add(dedupKey);
    for (const s of item.screens) screenSet.add(s);
    for (const l of item.lessonIds) lessonSet.add(l);
  }

  for (const requiredScreen of [
    'AcademyScreen:arabic',
    'AcademyScreen:english',
    'AcademyScreen:numbers',
    'AcademyScreen:colors-shapes',
    'AcademyScreen:daily',
    'Level1LessonRunner',
    'Level1LessonRunner:stage10',
    'DeepLessonEngine:color',
    'DeepLessonEngine:arabic',
    'DeepLessonEngine:english',
    'DeepLessonEngine:math',
    'ExamsScreen',
    'ReadingAdventureScreen',
    'SmartAdaptiveAssessmentPanel',
  ]) {
    assert(screenSet.has(requiredScreen), `Manifest missing screen coverage: ${requiredScreen}`);
  }

  assert.strictEqual(ALL_LEVEL1_LESSONS.length, 75, 'Expected 75 Level 1 lessons');
  for (const lesson of ALL_LEVEL1_LESSONS) {
    assert(lessonSet.has(lesson.id), `Manifest missing Level 1 lessonId: ${lesson.id}`);
  }

  const uniqueExamTexts = new Set(
    VALIDATED_EXAM_BANK.filter((q) => Boolean(q.audioText)).map(
      (q) => `${q.audioLang || 'ar'}|${normalizeAcademyAudioText(q.audioText!)}`,
    ),
  );
  const manifestExamItems = manifest.items.filter((i) => i.screens.includes('ExamsScreen'));
  assert(
    manifestExamItems.length >= uniqueExamTexts.size,
    `Manifest missing exam bank audio coverage (${manifestExamItems.length} < ${uniqueExamTexts.size})`,
  );

  console.log(
    `   ✓ Manifest verified: ${manifest.totalAssets} unique items (${manifest.arabicAssets} AR, ${manifest.englishAssets} EN) across ${screenSet.size} screen buckets and all 75 Level 1 lessons.`,
  );

  console.log('[2/6] Validating Stored MP3 Files, Questionable Review Flags & Exact Resume Position...');
  const validItems = manifest.items.filter((i) => i.validationStatus === 'valid');
  let lookupValidEntries = 0;
  for (const item of manifest.items) {
    const clean = normalizeAcademyAudioText(item.text);
    const mappedId = (item.language === 'en' ? lookup.en : lookup.ar)?.[clean];
    if (item.validationStatus === 'valid') {
      assert.strictEqual(item.generationStatus, 'ready', `Valid item ${item.assetId} must have generationStatus=ready`);
      assert.strictEqual(mappedId, item.assetId, `Lookup map must point to ${item.assetId}`);
      lookupValidEntries++;

      const absPath = path.resolve(process.cwd(), item.mp3Path);
      const check = await validateAcademyMp3File(absPath, true);
      assert(check.valid, `Valid manifest MP3 failed re-validation (${item.mp3Path}): ${check.reason}`);
      assert.strictEqual(check.mimeType, 'audio/mpeg');
      assert(check.durationSeconds !== null && check.durationSeconds >= 0.2);
      assert(check.maxVolumeDb === null || check.maxVolumeDb > -48, `Silent audio detected: ${item.assetId}`);
    } else {
      assert.strictEqual(
        mappedId,
        undefined,
        `Unrecorded item ${item.assetId} must NOT appear in client lookup (no fake audio)`,
      );
    }
  }
  assert.strictEqual(lookupValidEntries, validItems.length);
  assert(manifest.validCount >= 54, `Expected at least 54 valid Academy recordings (26 baseline + 28 pre-session), got ${manifest.validCount}`);

  // Verify the 4 questionable existing isolated letter assets are flagged for review & NOT verified-correct
  const flaggedIds = [
    'ar_a1297edee10476b6',
    'ar_124315331f64f556',
    'ar_24be271a98354ce7',
    'ar_42f9bf089dc3e0e5',
  ];
  assert.strictEqual(Object.keys(FLAGGED_QUESTIONABLE_ACADEMY_ASSETS).length, 4);
  for (const flaggedId of flaggedIds) {
    const item = manifest.items.find((i) => i.assetId === flaggedId);
    assert(item, `Flagged asset ${flaggedId} must exist in manifest`);
    assert.strictEqual(item.validationStatus, 'valid', `Flagged asset ${flaggedId} must not be deleted or overwritten`);
    assert.strictEqual(
      item.pronunciationReviewStatus,
      'needs-review',
      `Flagged asset ${flaggedId} must be marked needs-review`,
    );
    assert.notStrictEqual(
      item.pronunciationReviewStatus,
      'verified-correct',
      `Flagged asset ${flaggedId} must NOT be classified as verified-correct`,
    );
  }

  // Verify exact next resume item
  const nextResume = getNextAcademyResumeItem(manifest.items);
  assert(nextResume, 'Next resume item must exist');
  assert.strictEqual(
    nextResume.assetId,
    'ar_0a3e5cafc71b1872',
    `Expected exact next resume asset ar_0a3e5cafc71b1872 ("هَاء"), got ${nextResume.assetId} ("${nextResume.text}")`,
  );
  assert.strictEqual(nextResume.text, 'هَاء');
  assert.strictEqual(nextResume.ttsPromptText, 'حرف الهاء');

  console.log(
    `   ✓ On-disk audit: valid=${manifest.validCount}, missing=${manifest.missingCount}, invalid=${manifest.invalidCount}, needsReview=${manifest.needsReviewCount}, nextResume=${nextResume.assetId} ("${nextResume.text}").`,
  );

  if (process.env.STRICT_ACADEMY_AUDIO_COMPLETE === '1') {
    assert.strictEqual(manifest.missingCount, 0, `STRICT mode: ${manifest.missingCount} Academy MP3 files missing`);
    assert.strictEqual(manifest.invalidCount, 0, `STRICT mode: ${manifest.invalidCount} Academy MP3 files invalid`);
  }

  console.log('[3/6] Verifying Explicit Letter Pronunciation Prompts & Transcript Validation (Zero API calls)...');
  const promptCases: Array<{
    assetId: string;
    expectedDisplayed: string;
    expectedPrompt: string;
    goodTranscript: string;
    badTranscript: string;
  }> = [
    {
      assetId: 'ar_a1297edee10476b6',
      expectedDisplayed: 'ب',
      expectedPrompt: 'حرف الباء',
      goodTranscript: 'حرف الباء',
      badTranscript: 'با',
    },
    {
      assetId: 'ar_124315331f64f556',
      expectedDisplayed: 'ش',
      expectedPrompt: 'حرف الشين',
      goodTranscript: 'حرف الشين',
      badTranscript: 'ش',
    },
    {
      assetId: 'ar_24be271a98354ce7',
      expectedDisplayed: 'ل',
      expectedPrompt: 'حرف اللام',
      goodTranscript: 'حرف اللام',
      badTranscript: 'ل',
    },
    {
      assetId: 'ar_42f9bf089dc3e0e5',
      expectedDisplayed: 'و',
      expectedPrompt: 'حرف الواو',
      goodTranscript: 'حرف الواو',
      badTranscript: 'و',
    },
    {
      assetId: 'ar_0a3e5cafc71b1872',
      expectedDisplayed: 'هَاء',
      expectedPrompt: 'حرف الهاء',
      goodTranscript: 'حرف الهاء',
      badTranscript: 'هاء فقط بدون سياق خطأ',
    },
  ];
  for (const tc of promptCases) {
    const item = manifest.items.find((i) => i.assetId === tc.assetId);
    assert(item, `Missing Arabic letter manifest item ${tc.assetId}`);
    assert.strictEqual(item.text, tc.expectedDisplayed, 'Curriculum displayed text must remain unchanged');
    const spec = resolveAcademyTtsPromptSpec(item);
    assert.strictEqual(spec.isLetterAsset, true);
    assert.strictEqual(spec.promptText, tc.expectedPrompt);
    const passCheck = matchesExpectedSpokenLetterTranscript(tc.goodTranscript, spec, 'ar');
    assert.strictEqual(passCheck.ok, true, `Expected good transcript "${tc.goodTranscript}" to pass`);
    const failCheck = matchesExpectedSpokenLetterTranscript(tc.badTranscript, spec, 'ar');
    assert.strictEqual(failCheck.ok, false, `Expected ambiguous/bad transcript "${tc.badTranscript}" to fail`);
  }

  for (const [letter, spoken] of [
    ['A', 'The letter A.'],
    ['B', 'The letter B.'],
  ] as const) {
    const enItem = manifest.items.find(
      (i) => i.language === 'en' && i.text === letter && i.activityOrStageIds.includes('letter-upper'),
    );
    assert(enItem, `Missing English letter item ${letter}`);
    const spec = resolveAcademyTtsPromptSpec(enItem);
    assert.strictEqual(spec.isLetterAsset, true);
    assert.strictEqual(spec.promptText, spoken);
    assert.strictEqual(matchesExpectedSpokenLetterTranscript(spoken, spec, 'en').ok, true);
    assert.strictEqual(matchesExpectedSpokenLetterTranscript('The letter Z.', spec, 'en').ok, false);

    const mockOk = await validateGeneratedLetterPronunciation('mock.mp3', enItem, 1.1, {
      transcribeFn: async () => spoken,
    });
    assert.strictEqual(mockOk.ok, true);
    if (mockOk.ok) {
      assert.strictEqual(mockOk.pronunciationReviewStatus, 'verified-correct');
    }
    const mockFail = await validateGeneratedLetterPronunciation('mock.mp3', enItem, 1.1, {
      transcribeFn: async () => 'Hello world',
    });
    assert.strictEqual(mockFail.ok, false);
  }
  console.log('   ✓ Explicit letter-name prompts & spoken-letter verification logic validated without touching quota.');

  console.log('[4/6] Auditing Code for Zero speechSynthesis, Non-Consuming Diagnostics & Gated Startup Backfill...');
  const academyFiles = [
    'src/screens/AcademyScreen.tsx',
    'src/components/academy/Level1LessonRunner.tsx',
    'src/components/academy/DeepLessonEngine.tsx',
    'src/components/academy/AcademyAudioBar.tsx',
    'src/screens/ExamsScreen.tsx',
    'src/utils/academyAudioController.ts',
  ];
  for (const rel of academyFiles) {
    const content = fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8');
    assert(!/speechSynthesis/.test(content), `${rel} must NOT reference window.speechSynthesis`);
    assert(!/soundEngine\.speak/.test(content), `${rel} must NOT call soundEngine.speak`);
    assert(!/\/api\/academy\/tts(?!-status)/.test(content), `${rel} must NOT call POST /api/academy/tts`);
  }

  // Ensure diagnoseGeminiTtsAvailability does NOT call generateContent
  const serviceSrc = fs.readFileSync(path.resolve(process.cwd(), 'server/academyAudioService.ts'), 'utf8');
  const diagStart = serviceSrc.indexOf('export async function diagnoseGeminiTtsAvailability');
  const diagEnd = serviceSrc.indexOf('function getAcademyItemPriorityScore');
  assert(diagStart !== -1 && diagEnd > diagStart, 'Could not locate diagnoseGeminiTtsAvailability block');
  const diagBlock = serviceSrc.slice(diagStart, diagEnd);
  assert(!/\.generateContent\s*\(/.test(diagBlock), 'diagnoseGeminiTtsAvailability MUST NOT call generateContent');
  assert(
    serviceSrc.includes('computeStrictFreeTierBatchDelayMs('),
    'Batch generation must enforce strict Free Tier 3-RPM interval via computeStrictFreeTierBatchDelayMs',
  );
  assert(
    serviceSrc.includes('computeQuotaRenewalState('),
    'Batch generation must check RetryInfo quota renewal gate before consuming requests',
  );

  // Verify 3-RPM models never use 6.5s (6500ms) or faster intervals and respect 10-RPD caps
  assert.strictEqual(FREE_TIER_TTS_MODEL_LIMITS[ACADEMY_TTS_PRIMARY_MODEL].rpm, 3);
  assert.strictEqual(FREE_TIER_TTS_MODEL_LIMITS[ACADEMY_TTS_PRIMARY_MODEL].rpd, 10);
  assert.strictEqual(FREE_TIER_TTS_MODEL_LIMITS[ACADEMY_TTS_FALLBACK_MODEL].rpm, 3);
  assert.strictEqual(FREE_TIER_TTS_MODEL_LIMITS[ACADEMY_TTS_FALLBACK_MODEL].rpd, 10);
  const clamped6500 = computeStrictFreeTierBatchDelayMs(
    [ACADEMY_TTS_PRIMARY_MODEL, ACADEMY_TTS_FALLBACK_MODEL],
    6500,
  );
  assert(clamped6500 >= 21_000, `Expected >=21000ms for 3-RPM model even when 6500ms requested, got ${clamped6500}`);
  const defaultDelay = computeStrictFreeTierBatchDelayMs([ACADEMY_TTS_PRIMARY_MODEL]);
  assert(defaultDelay >= 21_000, `Expected default batch delay >=21000ms for 3-RPM model, got ${defaultDelay}`);

  // Verify RetryInfo cooldown gate blocks pre-renewal execution without making API calls
  const preRenewalGate = computeQuotaRenewalState(manifest.items, Date.parse('2026-11-22T16:00:00.000Z'));
  assert.strictEqual(preRenewalGate.quotaRenewed, false);
  assert(
    preRenewalGate.knownQuotaResetAt && /^2026-11-23T0(7:59|8:00):/.test(preRenewalGate.knownQuotaResetAt),
    `Unexpected knownQuotaResetAt: ${preRenewalGate.knownQuotaResetAt}`,
  );
  const postRenewalGate = computeQuotaRenewalState(manifest.items, Date.parse('2026-11-23T08:05:00.000Z'));
  assert.strictEqual(postRenewalGate.quotaRenewed, true);

  // Ensure server.ts does not automatically trigger story audio backfill on startup unless explicitly opted in
  const serverSrc = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');
  assert(
    serverSrc.includes("process.env.ENABLE_STARTUP_STORY_AUDIO_BACKFILL === '1'"),
    'server.ts must gate automatic startup story audio backfill behind ENABLE_STARTUP_STORY_AUDIO_BACKFILL',
  );
  console.log(`   ✓ Verified zero runtime TTS, 3-RPM (>=21s) & 10-RPD limits, non-consuming diagnosis, renewal gate, and gated startup backfill.`);

  console.log('[5/6] Verifying Quran Story MP3s (41 assets) remain untouched & valid...');
  let storyValid = 0;
  for (const storyDir of fs.readdirSync(STORY_AUDIO_PUBLIC_DIR)) {
    const fullDir = path.join(STORY_AUDIO_PUBLIC_DIR, storyDir);
    if (!fs.statSync(fullDir).isDirectory()) continue;
    for (const file of fs.readdirSync(fullDir)) {
      if (!file.endsWith('.mp3')) continue;
      const v = await validateStoryAudioAsset(`/assets/audio/stories/${storyDir}/${file}`);
      assert(v.valid, `Quran story asset invalid: ${storyDir}/${file}: ${v.reason}`);
      storyValid++;
    }
  }
  assert.strictEqual(storyValid, 41, `Expected all 41 Quran story MP3s intact, found ${storyValid}`);
  console.log(`   ✓ All 41 Quran Story MP3 assets validated intact.`);

  console.log('[6/6] Verifying Offline / Quota-Exhausted Server Behavior & Non-Consuming Diagnose Endpoint...');
  const port = 3197;
  const baseUrl = `http://127.0.0.1:${port}`;
  const proc = spawn('npx', ['tsx', 'server.ts', '--port', String(port)], {
    cwd: process.cwd(),
    detached: true,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'development',
      SKIP_VITE: '1',
      GEMINI_API_KEY: '', // Explicitly simulate exhausted/missing Gemini TTS key
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

    // 1. tts-status reports pregenerated-mp3 mode & nextResumeAssetId even with GEMINI_API_KEY=""
    const statusRes = await fetch(`${baseUrl}/api/academy/tts-status`);
    assert.strictEqual(statusRes.status, 200);
    const statusJson = (await statusRes.json()) as {
      configured: boolean;
      academyAudioMode: string;
      runtimeTtsDisabledForAcademy: boolean;
      manifestSummary: {
        totalAssets: number;
        validCount: number;
        needsReviewCount: number;
        nextResumeAssetId: string | null;
      };
    };
    assert.strictEqual(statusJson.configured, false);
    assert.strictEqual(statusJson.academyAudioMode, 'pregenerated-mp3');
    assert.strictEqual(statusJson.runtimeTtsDisabledForAcademy, true);
    assert.strictEqual(statusJson.manifestSummary.totalAssets, manifest.totalAssets);
    assert.strictEqual(statusJson.manifestSummary.validCount, manifest.validCount);
    assert.strictEqual(statusJson.manifestSummary.needsReviewCount, 4);
    assert.strictEqual(statusJson.manifestSummary.nextResumeAssetId, 'ar_0a3e5cafc71b1872');

    // 2. Non-consuming /api/academy/audio/diagnose-models returns UNKNOWN without calling generateContent
    const diagRes = await fetch(`${baseUrl}/api/academy/audio/diagnose-models`);
    assert.strictEqual(diagRes.status, 200);
    const diagJson = (await diagRes.json()) as Awaited<ReturnType<typeof diagnoseGeminiTtsAvailability>>;
    assert.strictEqual(diagJson.nonConsuming, true);
    assert.strictEqual(diagJson.probeMethod, 'metadata_only_no_generation');
    assert.strictEqual(diagJson.quotaMetadataApiAvailable, false);
    assert(diagJson.modelProbes.length >= 2);
    for (const probe of diagJson.modelProbes) {
      assert.strictEqual(probe.available, 'UNKNOWN');
      assert.strictEqual(probe.outcome, 'UNKNOWN');
      assert.strictEqual(probe.quotaStatus, 'UNKNOWN');
      assert.strictEqual(probe.nonConsuming, true);
    }

    // 3. Manifest endpoint surfaces flaggedAssets & exact nextResumeAsset
    const manifestRes = await fetch(`${baseUrl}/api/academy/audio-manifest`);
    assert.strictEqual(manifestRes.status, 200);
    const manifestJson = (await manifestRes.json()) as {
      validCount: number;
      needsReviewCount: number;
      verifiedCorrectCount: number;
      flaggedAssets: Array<{ assetId: string; pronunciationReviewStatus: string }>;
      nextResumeAsset: { assetId: string; text: string; ttsPromptText: string } | null;
    };
    assert.strictEqual(manifestJson.validCount, manifest.validCount);
    assert.strictEqual(manifestJson.needsReviewCount, 4);
    assert.strictEqual(manifestJson.verifiedCorrectCount, 0);
    assert.strictEqual(manifestJson.flaggedAssets.length, 4);
    assert.strictEqual(manifestJson.nextResumeAsset?.assetId, 'ar_0a3e5cafc71b1872');

    // 4. Runtime POST /api/academy/tts returns 410 Gone
    const disabledRes = await fetch(`${baseUrl}/api/academy/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'أسد', language: 'ar' }),
    });
    assert.strictEqual(disabledRes.status, 410, 'POST /api/academy/tts must return 410 Gone');

    // 5. Static MP3 delivery works via GET, HEAD, and Range: 206 even with GEMINI_API_KEY=""
    if (validItems.length > 0) {
      const sample = validItems[0];
      const relUrl = `/assets/audio/academy/${sample.language}/${sample.assetId}.mp3`;

      const headRes = await fetch(`${baseUrl}${relUrl}`, { method: 'HEAD' });
      assert.strictEqual(headRes.status, 200, `HEAD ${relUrl} failed`);
      assert.strictEqual(headRes.headers.get('content-type'), 'audio/mpeg');
      assert.strictEqual(headRes.headers.get('accept-ranges'), 'bytes');

      const getRes = await fetch(`${baseUrl}${relUrl}`);
      assert.strictEqual(getRes.status, 200, `GET ${relUrl} failed`);
      const buf = Buffer.from(await getRes.arrayBuffer());
      assert.strictEqual(buf.length, sample.bytes);

      const rangeRes = await fetch(`${baseUrl}${relUrl}`, {
        headers: { Range: 'bytes=0-1023' },
      });
      assert.strictEqual(rangeRes.status, 206, `Range request on ${relUrl} must return 206`);
      const slice = Buffer.from(await rangeRes.arrayBuffer());
      assert.strictEqual(slice.length, 1024);
    }

    // 6. Missing asset fails closed with 404 JSON
    const missingRes = await fetch(`${baseUrl}/assets/audio/academy/ar/does-not-exist.mp3`);
    assert.strictEqual(missingRes.status, 404);

    // 7. Nono AI /api/ai/status remains independent
    const nonoStatusRes = await fetch(`${baseUrl}/api/ai/status`);
    assert.strictEqual(nonoStatusRes.status, 200);
    const nonoSrc = fs.readFileSync(path.resolve(process.cwd(), 'server/nonoAiRoutes.ts'), 'utf8');
    assert(nonoSrc.includes("app.post('/api/ai/tts'"), 'Nono AI TTS route must remain intact');
    assert(nonoSrc.includes("app.post('/api/ai/nono-chat'"), 'Nono AI chat route must remain intact');

    console.log('   ✓ Server offline/keyless MP3 delivery, non-consuming diagnose-models, flagged manifest state, HTTP 206 Range, 410 disabled runtime Academy TTS, 404 fail-closed, and Nono AI separation all verified.');
  } finally {
    stopChild(proc);
  }

  console.log('\n✅ Academy Audio Verification Suite PASSED');
  console.log(
    JSON.stringify({
      totalManifestItems: manifest.totalAssets,
      arabicItems: manifest.arabicAssets,
      englishItems: manifest.englishAssets,
      validRecordings: manifest.validCount,
      missingRecordings: manifest.missingCount,
      invalidRecordings: manifest.invalidCount,
      needsReviewCount: manifest.needsReviewCount,
      verifiedCorrectCount: manifest.verifiedCorrectCount,
      nextResumeAssetId: nextResume.assetId,
      quranStoriesIntact: storyValid,
    }),
  );
}

run().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
