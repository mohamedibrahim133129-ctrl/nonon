import assert from 'node:assert';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { validateAcademyMp3File } from '../server/academyAudioService';
import { ARABIC_ALPHABET } from '../src/data/academyData';
import academyAudioLookup from '../src/data/academyAudioLookup.json';
import arabicLetterAudioLookup from '../src/data/arabicLetterAudioLookup.json';
import { buildArabicDeepJourney, VALIDATED_EXAM_BANK } from '../src/data/deepCurriculum';
import { ALL_LEVEL1_LESSONS } from '../src/data/level1Curriculum';
import { LEVEL1_QUESTION_BANK } from '../src/data/level1QuestionBank';
import { AcademyAudioController } from '../src/utils/academyAudioController';
import {
  ARABIC_LETTER_AUDIO_BASE_URL,
  ARABIC_LETTER_NAME_RECORDINGS,
  resolveArabicLetterNameAudioUrl,
  resolveArabicLetterNameRecording,
} from '../src/utils/arabicLetterAudioMap';

interface LookupLetterEntry {
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

function sha256File(filePath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function sha256Buffer(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
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

class MockHtmlAudioElement {
  static instances: MockHtmlAudioElement[] = [];
  src = '';
  preload = 'auto';
  defaultPlaybackRate = 1.0;
  playbackRate = 1.0;
  paused = true;
  currentTime = 0;
  duration = 1.872;
  attributes: Record<string, string> = {};
  private listeners = new Map<string, Set<() => void>>();

  constructor() {
    MockHtmlAudioElement.instances.push(this);
  }

  setAttribute(k: string, v: string) {
    this.attributes[k] = v;
  }

  removeAttribute(k: string) {
    delete this.attributes[k];
  }

  addEventListener(event: string, fn: () => void) {
    const set = this.listeners.get(event) ?? new Set();
    set.add(fn);
    this.listeners.set(event, set);
  }

  removeEventListener(event: string, fn: () => void) {
    this.listeners.get(event)?.delete(fn);
  }

  load() {
    // no-op
  }

  pause() {
    this.paused = true;
  }

  async play(): Promise<void> {
    if (!this.src) {
      throw new Error('Missing audio src');
    }
    this.paused = false;
    this.listeners.get('loadedmetadata')?.forEach((fn) => fn());
    this.listeners.get('canplay')?.forEach((fn) => fn());
  }
}

async function run() {
  const root = process.cwd();
  const sourceDir = path.resolve(root, 'arabic_letter_names/arabic_letters');
  const destDir = path.resolve(root, 'public/assets/audio/arabic-letters/names');
  const legacyDir = path.resolve(root, 'public/assets/audio/arabic-letters');
  const sheet2Dir = path.resolve(root, 'generated_audio_sheet2');

  console.log('[1/6] Validating All 28 Source & Copied Arabic Letter-Name MP3 Files...');
  assert(fs.existsSync(sourceDir), 'Source directory arabic_letter_names/arabic_letters must exist');
  assert(fs.existsSync(destDir), 'Destination public/assets/audio/arabic-letters/names must exist');
  assert.strictEqual(ARABIC_LETTER_AUDIO_BASE_URL, '/assets/audio/arabic-letters/names');

  const sourceMp3s = fs.readdirSync(sourceDir).filter((f) => f.endsWith('.mp3')).sort();
  const destEntries = fs.readdirSync(destDir, { withFileTypes: true });
  const destNonMp3 = destEntries.filter((e) => !e.isFile() || !e.name.endsWith('.mp3'));
  assert.strictEqual(destNonMp3.length, 0, `Unexpected non-MP3 entries in ${destDir}`);
  const destMp3s = destEntries.filter((e) => e.isFile() && e.name.endsWith('.mp3')).map((e) => e.name).sort();

  assert.strictEqual(sourceMp3s.length, 28, `Expected 28 source MP3s, got ${sourceMp3s.length}`);
  assert.strictEqual(destMp3s.length, 28, `Expected 28 destination MP3s, got ${destMp3s.length}`);
  assert.deepStrictEqual(destMp3s, sourceMp3s, 'Destination filenames must match source 1:1');

  const sourceHashes = new Map<string, string>();
  const uniqueHashes = new Set<string>();
  for (const filename of destMp3s) {
    const srcPath = path.join(sourceDir, filename);
    const dstPath = path.join(destDir, filename);
    const srcStat = fs.statSync(srcPath);
    const dstStat = fs.statSync(dstPath);
    assert(dstStat.size > 0, `Zero-byte MP3 detected: ${filename}`);
    assert.strictEqual(dstStat.size, srcStat.size, `Size mismatch for ${filename}`);

    const srcSha = sha256File(srcPath);
    const dstSha = sha256File(dstPath);
    assert.strictEqual(dstSha, srcSha, `SHA-256 mismatch for ${filename}`);
    assert(!uniqueHashes.has(dstSha), `Duplicate SHA-256 hash detected on ${filename}`);
    uniqueHashes.add(dstSha);
    sourceHashes.set(filename, dstSha);

    const check = await validateAcademyMp3File(dstPath, true);
    assert(check.valid, `Invalid MP3 ${filename}: ${check.reason}`);
    assert.strictEqual(check.mimeType, 'audio/mpeg');
    assert(check.durationSeconds !== null && check.durationSeconds >= 0.2, `Duration too short: ${filename}`);
    assert(
      check.maxVolumeDb === null || check.maxVolumeDb > -48,
      `Silent audio detected (${check.maxVolumeDb} dB): ${filename}`,
    );
  }
  assert.strictEqual(uniqueHashes.size, 28);
  console.log('   ✓ Verified 28/28 MP3 files: exact SHA-256 parity with source, 28 unique hashes, valid audio/mpeg + non-silent.');

  console.log('[2/6] Verifying Deterministic Lookup (arabicLetterAudioLookup.json & arabicLetterAudioMap.ts)...');
  const lookupDoc = arabicLetterAudioLookup as {
    version: number;
    baseUrl: string;
    totalLetters: number;
    letters: Record<string, LookupLetterEntry>;
  };
  assert.strictEqual(lookupDoc.totalLetters, 28);
  assert.strictEqual(lookupDoc.baseUrl, '/assets/audio/arabic-letters/names');
  const lookupEntries = Object.values(lookupDoc.letters).sort((a, b) => a.index - b.index);
  assert.strictEqual(lookupEntries.length, 28);
  assert.strictEqual(ARABIC_LETTER_NAME_RECORDINGS.length, 28);
  assert.strictEqual(ARABIC_ALPHABET.length, 28);

  const seenFilenames = new Set<string>();
  const seenUrls = new Set<string>();
  const seenIds = new Set<string>();

  for (const entry of lookupEntries) {
    assert(!seenFilenames.has(entry.filename), `Duplicate filename in lookup: ${entry.filename}`);
    assert(!seenUrls.has(entry.audioUrl), `Duplicate audioUrl in lookup: ${entry.audioUrl}`);
    assert(!seenIds.has(entry.letterId), `Duplicate letterId in lookup: ${entry.letterId}`);
    seenFilenames.add(entry.filename);
    seenUrls.add(entry.audioUrl);
    seenIds.add(entry.letterId);

    assert.strictEqual(entry.audioUrl, `/assets/audio/arabic-letters/names/${entry.filename}`);
    assert(!entry.audioUrl.includes('/academy/'), `Arabic letter URL must not point to Academy folder: ${entry.audioUrl}`);
    assert.strictEqual(sourceHashes.get(entry.filename), entry.sha256, `Lookup SHA-256 mismatch for ${entry.letterId}`);
  }

  // Exact phonetic mapping verification for historically tricky Arabic pairs
  const expectedPairs: Array<[string, string, string]> = [
    ['ar-alif', 'ا', 'nonoland_ar_alif.mp3'],
    ['ar-taa', 'ت', 'nonoland_ar_taa.mp3'],
    ['ar-taa2', 'ط', 'nonoland_ar_ta.mp3'],
    ['ar-haa', 'ح', 'nonoland_ar_haa.mp3'],
    ['ar-haa2', 'ه', 'nonoland_ar_ha.mp3'],
    ['ar-zaay', 'ز', 'nonoland_ar_zay.mp3'],
    ['ar-dhaa2', 'ظ', 'nonoland_ar_za.mp3'],
    ['ar-yaa', 'ي', 'nonoland_ar_yaa.mp3'],
  ];
  for (const [id, ch, file] of expectedPairs) {
    const byId = resolveArabicLetterNameRecording({ letterId: id });
    const byCh = resolveArabicLetterNameRecording({ char: ch });
    assert(byId && byCh && byId.index === byCh.index, `Pair resolution mismatch for ${id} / ${ch}`);
    assert.strictEqual(byId.filename, file, `Expected ${file} for ${id} (${ch}), got ${byId.filename}`);
  }

  // Variant forms & mismatch guards
  for (const alifChar of ['ا', 'أ', 'إ', 'آ']) {
    assert.strictEqual(
      resolveArabicLetterNameAudioUrl({ char: alifChar }),
      '/assets/audio/arabic-letters/names/nonoland_ar_alif.mp3',
    );
  }
  for (const haChar of ['ه', 'هـ']) {
    assert.strictEqual(
      resolveArabicLetterNameAudioUrl({ char: haChar }),
      '/assets/audio/arabic-letters/names/nonoland_ar_ha.mp3',
    );
  }
  assert.strictEqual(resolveArabicLetterNameAudioUrl({ letterId: 'ar-alif', char: 'ب' }), null);
  assert.strictEqual(resolveArabicLetterNameAudioUrl({ letterId: 'ar-haa', char: 'ه' }), null);
  assert.strictEqual(resolveArabicLetterNameAudioUrl({ char: 'nonexistent' }), null);

  // Verify all curriculum consumers resolve deterministically to the 28 new URLs
  for (const letter of ARABIC_ALPHABET) {
    const url = resolveArabicLetterNameAudioUrl({
      letterId: letter.id,
      char: letter.char,
      nameAr: letter.nameAr,
    });
    assert(url && url.startsWith('/assets/audio/arabic-letters/names/nonoland_ar_'));
  }

  const arL1Lessons = ALL_LEVEL1_LESSONS.filter((l) => l.subject === 'arabic');
  assert.strictEqual(arL1Lessons.length, 28);
  for (const ls of arL1Lessons) {
    const u5 = resolveArabicLetterNameAudioUrl({ char: ls.targetSymbol });
    assert(u5 && u5.startsWith('/assets/audio/arabic-letters/names/'), `L1 Stage 5 missing for ${ls.id}`);
    const q10 = LEVEL1_QUESTION_BANK.find((q) => q.lessonId === ls.id && q.id.endsWith('-Q10'));
    assert(q10, `Missing Q10 for ${ls.id}`);
    assert.strictEqual(resolveArabicLetterNameAudioUrl({ char: q10.audioText || ls.targetSymbol }), u5);
  }

  for (const letter of ARABIC_ALPHABET) {
    const deep = buildArabicDeepJourney(letter.id);
    const uDeep = resolveArabicLetterNameAudioUrl({
      letterId: deep.letterId,
      char: deep.char,
      nameAr: deep.nameAr,
    });
    assert(uDeep && uDeep.startsWith('/assets/audio/arabic-letters/names/'), `Deep Stage 2 missing for ${deep.letterId}`);
  }

  const arExamQs = VALIDATED_EXAM_BANK.filter((q) => q.id.startsWith('q-ar-rec-'));
  assert.strictEqual(arExamQs.length, 28);
  for (const q of arExamQs) {
    const letterId = q.id.slice('q-ar-rec-'.length);
    const uExam = resolveArabicLetterNameAudioUrl({ letterId });
    assert(uExam && uExam.startsWith('/assets/audio/arabic-letters/names/'), `Exam missing for ${q.id}`);
  }
  console.log('   ✓ Verified 1:1 unique mapping across all 28 letters, tricky pairs (ح/ه, ت/ط, ز/ظ), L1, Deep, and Exams.');

  console.log('[3/6] Verifying Strict Non-Fallback Isolation & Simulated Controller Playback...');
  for (const rel of [
    'src/screens/AcademyScreen.tsx',
    'src/components/academy/DeepLessonEngine.tsx',
    'src/components/academy/Level1LessonRunner.tsx',
    'src/screens/ExamsScreen.tsx',
  ]) {
    const src = fs.readFileSync(path.resolve(root, rel), 'utf8');
    assert(src.includes('requireExplicitAudioUrl: true'), `${rel} must pass requireExplicitAudioUrl: true for Arabic letter callers`);
  }

  // Test fail-closed isolation when explicit audioUrl is absent even for a letter present in academyAudioLookup ('ب')
  const prevWindow = (globalThis as { window?: unknown }).window;
  const prevAudio = (globalThis as { Audio?: unknown }).Audio;
  try {
    MockHtmlAudioElement.instances = [];
    (globalThis as { window: unknown }).window = {};
    (globalThis as { Audio: unknown }).Audio = MockHtmlAudioElement;

    const ctrl = new AcademyAudioController();
    const failClosed = await ctrl.playText('ب', 'ar', {
      requireExplicitAudioUrl: true,
      label: 'ب — باء',
    });
    assert.strictEqual(failClosed, false, 'requireExplicitAudioUrl: true must fail closed when audioUrl missing');
    assert.strictEqual(ctrl.getSnapshot().status, 'error');
    assert.strictEqual(ctrl.getSnapshot().errorCode, 'UNAVAILABLE');
    assert.strictEqual(ctrl.getSnapshot().currentUrl, null);
    assert.strictEqual(MockHtmlAudioElement.instances.length, 0, 'Fail-closed path must not instantiate Audio');

    // Play all 28 Arabic letters rapidly to verify playback, replay, anti-overlap pause, and stop()
    let prevAudioEl: MockHtmlAudioElement | null = null;
    for (const rec of ARABIC_LETTER_NAME_RECORDINGS) {
      const ok = await ctrl.playText(rec.namePlain, 'ar', {
        audioUrl: rec.audioUrl,
        requireExplicitAudioUrl: true,
        label: `${rec.academyChar} — ${rec.namePlain}`,
      });
      assert.strictEqual(ok, true, `Simulated playText failed for ${rec.academyId}`);
      const snap = ctrl.getSnapshot();
      assert.strictEqual(snap.status, 'playing');
      assert.strictEqual(snap.currentUrl, rec.audioUrl);
      assert.strictEqual(snap.slow, false);

      const currentAudioEl: MockHtmlAudioElement =
        MockHtmlAudioElement.instances[MockHtmlAudioElement.instances.length - 1];
      assert.strictEqual(currentAudioEl.attributes['playsinline'], 'true');
      assert.strictEqual(currentAudioEl.attributes['webkit-playsinline'], 'true');
      assert.strictEqual(currentAudioEl.paused, false);
      if (prevAudioEl) {
        assert.strictEqual(prevAudioEl.paused, true, 'Rapid switch must pause previous letter Audio element (no overlap)');
      }
      prevAudioEl = currentAudioEl;
    }

    // Slow replay mode
    const first = ARABIC_LETTER_NAME_RECORDINGS[0];
    const okSlow = await ctrl.playText(first.namePlain, 'ar', {
      audioUrl: first.audioUrl,
      requireExplicitAudioUrl: true,
      slow: true,
      label: `${first.academyChar} — ${first.namePlain}`,
    });
    assert.strictEqual(okSlow, true);
    assert.strictEqual(ctrl.getSnapshot().slow, true);
    const slowEl = MockHtmlAudioElement.instances[MockHtmlAudioElement.instances.length - 1];
    assert.strictEqual(slowEl.playbackRate, 0.78);

    // Replay & unmount stop()
    const okReplay = await ctrl.replay();
    assert.strictEqual(okReplay, true);
    ctrl.stop();
    assert.strictEqual(ctrl.getSnapshot().status, 'idle');
    assert.strictEqual(ctrl.getSnapshot().currentUrl, null);
  } finally {
    if (prevWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = prevWindow;
    }
    if (prevAudio === undefined) {
      delete (globalThis as { Audio?: unknown }).Audio;
    } else {
      (globalThis as { Audio?: unknown }).Audio = prevAudio;
    }
  }
  console.log('   ✓ Verified fail-closed isolation + simulated playback across all 28 letters (slow, replay, anti-overlap, stop).');

  console.log('[4/6] Verifying 219 Academy Audio Assets & 28 Legacy Files Preservation...');
  assert(fs.existsSync(sheet2Dir), 'generated_audio_sheet2 directory must exist for SHA-256 comparison');
  const sheet2Files = fs.readdirSync(sheet2Dir).filter((f) => f.endsWith('.mp3')).sort();
  assert.strictEqual(sheet2Files.length, 219, `Expected 219 MP3 files in generated_audio_sheet2, got ${sheet2Files.length}`);

  const preExistingManifestSheet2Ids = new Set([
    'ar_6fc8bfae56f7519b.mp3',
    'ar_cbaa3b5459835e55.mp3',
    'ar_d1ae105fff477efc.mp3',
  ]);
  const manifestDoc = JSON.parse(
    fs.readFileSync(path.resolve(root, 'data/academy-audio-manifest.json'), 'utf8'),
  ) as {
    validCount: number;
    items: Array<{ assetId: string; bytes: number | null; validationStatus: string }>;
  };
  assert.strictEqual(manifestDoc.validCount, 291, `Expected 291 valid items in academy-audio-manifest.json, got ${manifestDoc.validCount}`);
  const manifestById = new Map(manifestDoc.items.map((i) => [i.assetId, i]));
  let sheet2MatchedCount = 0;
  let preExistingPreservedCount = 0;

  for (const f of sheet2Files) {
    const lang = f.startsWith('ar_') ? 'ar' : f.startsWith('en_') ? 'en' : '';
    assert(lang === 'ar' || lang === 'en', `Unexpected sheet2 filename prefix: ${f}`);
    const assetId = f.replace(/\.mp3$/, '');
    const manifestRec = manifestById.get(assetId);
    assert(manifestRec && manifestRec.validationStatus === 'valid', `Sheet2 asset missing/invalid in manifest: ${assetId}`);

    const srcFile = path.join(sheet2Dir, f);
    const pubFile = path.resolve(root, 'public/assets/audio/academy', lang, f);
    assert(fs.existsSync(pubFile), `Preserved Academy MP3 missing: ${pubFile}`);
    const pubVal = await validateAcademyMp3File(pubFile, false);
    assert(pubVal.valid, `Invalid Academy MP3 on disk: ${f} (${pubVal.reason})`);

    if (preExistingManifestSheet2Ids.has(f)) {
      assert.strictEqual(
        fs.statSync(pubFile).size,
        manifestRec.bytes,
        `Pre-existing preserved Academy MP3 ${f} byte count changed from manifest`,
      );
      preExistingPreservedCount++;
    } else {
      assert.strictEqual(sha256File(pubFile), sha256File(srcFile), `Academy MP3 modified: ${f}`);
      sheet2MatchedCount++;
    }
  }
  assert.strictEqual(preExistingPreservedCount, 3);
  assert.strictEqual(sheet2MatchedCount, 216);

  const academyLookupTyped = academyAudioLookup as { ar: Record<string, string>; en: Record<string, string> };
  const totalLookupIds = new Set([
    ...Object.values(academyLookupTyped.ar),
    ...Object.values(academyLookupTyped.en),
  ]);
  assert.strictEqual(totalLookupIds.size, 291, `Expected 291 registered Academy lookup IDs, got ${totalLookupIds.size}`);

  // Confirm 28 legacy baseline files remain untouched in public/assets/audio/arabic-letters/
  const legacyMp3s = fs
    .readdirSync(legacyDir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.mp3'))
    .map((e) => e.name)
    .sort();
  assert.strictEqual(legacyMp3s.length, 28, `Expected 28 legacy baseline files in arabic-letters/, got ${legacyMp3s.length}`);
  console.log('   ✓ Verified 219/219 sheet2 Academy MP3s intact (216 exact SHA-256 + 3 baseline preserved), 291 lookup IDs intact, and 28/28 legacy files preserved.');

  console.log('[5/6] Verifying Live HTTP Static Serving (GET/HEAD/Range) & Read-Only Routes...');
  const port = 3198;
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

  const reportRows: Array<{
    index: number;
    letterId: string;
    glyph: string;
    nameAr: string;
    filename: string;
    sha256: string;
    httpStatus: number;
    result: string;
  }> = [];

  try {
    await waitForReady(baseUrl);

    for (const entry of lookupEntries) {
      const headRes = await fetch(`${baseUrl}${entry.audioUrl}`, { method: 'HEAD' });
      assert.strictEqual(headRes.status, 200, `HEAD ${entry.audioUrl} returned ${headRes.status}`);
      assert.strictEqual(headRes.headers.get('content-type'), 'audio/mpeg');
      assert.strictEqual(headRes.headers.get('accept-ranges'), 'bytes');

      const getRes = await fetch(`${baseUrl}${entry.audioUrl}`);
      assert.strictEqual(getRes.status, 200, `GET ${entry.audioUrl} returned ${getRes.status}`);
      const buf = Buffer.from(await getRes.arrayBuffer());
      assert.strictEqual(buf.length, entry.bytes, `HTTP byte size mismatch for ${entry.filename}`);
      assert.strictEqual(sha256Buffer(buf), entry.sha256, `HTTP SHA-256 mismatch for ${entry.filename}`);

      const rangeRes = await fetch(`${baseUrl}${entry.audioUrl}`, {
        headers: { Range: 'bytes=0-511' },
      });
      assert.strictEqual(rangeRes.status, 206, `Range 0-511 on ${entry.audioUrl} returned ${rangeRes.status}`);
      const slice = Buffer.from(await rangeRes.arrayBuffer());
      assert.strictEqual(slice.length, 512);

      reportRows.push({
        index: entry.index,
        letterId: entry.letterId,
        glyph: entry.glyph,
        nameAr: entry.nameAr,
        filename: entry.filename,
        sha256: entry.sha256.slice(0, 12),
        httpStatus: getRes.status,
        result: 'PASS',
      });
    }

    // Read-only health, auth/RBAC fail-closed, CMS, and disabled TTS endpoint checks
    const healthRes = await fetch(`${baseUrl}/api/health`);
    assert.strictEqual(healthRes.status, 200);

    const authMeRes = await fetch(`${baseUrl}/api/auth/me`);
    assert.strictEqual(authMeRes.status, 200);
    const authMeJson = (await authMeRes.json()) as { authenticated: boolean; user: unknown };
    assert.strictEqual(authMeJson.authenticated, false);
    assert.strictEqual(authMeJson.user, null);

    const adminRes = await fetch(`${baseUrl}/api/admin/overview`);
    assert.strictEqual(adminRes.status, 401, 'Unauthenticated /api/admin/overview must fail closed with 401');

    const cmsRes = await fetch(`${baseUrl}/api/cms/content`);
    assert.strictEqual(cmsRes.status, 200);

    const ttsRes = await fetch(`${baseUrl}/api/academy/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'ألف', language: 'ar' }),
    });
    assert.strictEqual(ttsRes.status, 410, 'POST /api/academy/tts must remain 410 Gone');

    // Missing Arabic letter filename must return 404 JSON cleanly
    const missingRes = await fetch(`${baseUrl}/assets/audio/arabic-letters/names/nonoland_ar_missing.mp3`);
    assert.strictEqual(missingRes.status, 404);
  } finally {
    stopChild(proc);
  }

  console.log('\n[6/6] Per-Letter Verification Report (All 28 Arabic Letters):');
  console.log('Idx | ID         | Glyph | Name   | Filename                     | SHA256 (12)  | HTTP | Result');
  console.log('----+------------+-------+--------+------------------------------+--------------+------+-------');
  for (const row of reportRows) {
    console.log(
      `${String(row.index).padStart(2, '0')}  | ${row.letterId.padEnd(10)} | ${row.glyph.padEnd(5)} | ${row.nameAr.padEnd(6)} | ${row.filename.padEnd(28)} | ${row.sha256} | ${row.httpStatus}  | ${row.result}`,
    );
  }

  console.log('\n✅ Arabic Letter Names Integration & Preservation Suite PASSED (28/28 Letters + 219/219 Academy)');
}

run().catch((err) => {
  console.error('❌ Arabic letter-name verification failed:', err);
  process.exit(1);
});
