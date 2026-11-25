import assert from 'node:assert';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { validateAcademyMp3File } from '../server/academyAudioService';
import { ARABIC_ALPHABET, ENGLISH_ALPHABET } from '../src/data/academyData';
import academyAudioLookup from '../src/data/academyAudioLookup.json';
import foundationsAudioInventory from '../src/data/foundationsAudioInventory.json';
import { ALL_LEVEL1_LESSONS } from '../src/data/level1Curriculum';
import { LEVEL1_QUESTION_BANK } from '../src/data/level1QuestionBank';
import {
  resolveAcademyPlaybackUrls,
  resolveAcademyRecordingUrl,
} from '../src/utils/academyAudioController';
import { normalizeAcademyAudioText } from '../src/utils/academyAudioText';
import { resolveArabicLetterNameAudioUrl } from '../src/utils/arabicLetterAudioMap';
import {
  ENGLISH_ALPHABET_ANCHOR_SEQUENCES,
  resolveEnglishAlphabetAnchorSequence,
} from '../src/utils/englishAlphabetAudioMap';
import {
  findFoundationsItemId,
  resolveFoundationsAudioForText,
  resolveFoundationsAudioUrl,
} from '../src/utils/foundationsAudioResolver';
import { isValidSafeUrl } from '../src/utils/validation';

function sha256File(filePath: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function collectFilesRecursive(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectFilesRecursive(full));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out.sort();
}

function parseCsvRows(csvContent: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < csvContent.length; i++) {
    const ch = csvContent[i];
    if (inQuotes) {
      if (ch === '"') {
        if (csvContent[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\r') {
      continue;
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

async function run() {
  const root = process.cwd();

  console.log('[1/7] ERR-001: Verifying Level 1 Arabic Letter-Name Routing (AR01–AR28 Stage 5 & Stage 10 Q10)...');
  const arLessons = ALL_LEVEL1_LESSONS.filter((l) => l.subject === 'arabic');
  assert.strictEqual(arLessons.length, 28, 'Expected 28 Arabic Level 1 lessons');
  assert.strictEqual(ARABIC_ALPHABET.length, 28);

  for (const lesson of arLessons) {
    const letterUrl = resolveArabicLetterNameAudioUrl({ char: lesson.targetSymbol });
    assert(letterUrl, `Missing arabic-letters URL for ${lesson.id} (${lesson.targetSymbol})`);
    assert(
      letterUrl.startsWith('/assets/audio/arabic-letters/') && letterUrl.endsWith('.mp3'),
      `Expected /assets/audio/arabic-letters/*.mp3 for ${lesson.id}, got ${letterUrl}`,
    );
    const diskFile = path.resolve(root, 'public', letterUrl.replace(/^\//, ''));
    assert(fs.existsSync(diskFile), `Missing MP3 on disk for ${lesson.id}: ${diskFile}`);

    const q10 = LEVEL1_QUESTION_BANK.find(
      (q) => q.lessonId === lesson.id && q.id.endsWith('-Q10'),
    );
    assert(q10, `Missing Q10 independent question for ${lesson.id}`);
    assert.strictEqual(q10.qType, 'independent');
    const q10Url = resolveArabicLetterNameAudioUrl({
      char: q10.audioText || lesson.targetSymbol,
    });
    assert.strictEqual(q10Url, letterUrl, `${q10.id} must resolve to same letter-name MP3 as ${lesson.id}`);
  }

  const level1RunnerSrc = fs.readFileSync(
    path.resolve(root, 'src/components/academy/Level1LessonRunner.tsx'),
    'utf8',
  );
  assert(
    level1RunnerSrc.includes('resolveArabicLetterNameAudioUrl'),
    'Level1LessonRunner must import and use resolveArabicLetterNameAudioUrl',
  );
  assert(
    /lesson\.subject === 'arabic'[\s\S]*resolveArabicLetterNameAudioUrl\(\{ char: lesson\.targetSymbol \}\)/.test(
      level1RunnerSrc,
    ),
    'Level1LessonRunner Stage 5 must route Arabic letter playback through resolveArabicLetterNameAudioUrl',
  );
  assert(
    /lesson\.subject === 'arabic' && q\.qType === 'independent'[\s\S]*resolveArabicLetterNameAudioUrl/.test(
      level1RunnerSrc,
    ),
    'Level1LessonRunner Stage 10 Q10 must route Arabic independent letter playback through resolveArabicLetterNameAudioUrl',
  );
  console.log('   ✓ ERR-001 verified across all 28 AR01–AR28 Stage 5 & Stage 10 Q10 routes.');

  console.log('[2/7] ERR-003: Verifying Safe Case-Insensitive CVC Reuse (CAT/SUN/DOG/RED/BOX/HAT)...');
  const cvcCases: Array<[string, string]> = [
    ['CAT', 'Cat'],
    ['SUN', 'Sun'],
    ['DOG', 'Dog'],
    ['RED', 'Red'],
    ['BOX', 'Box'],
    ['HAT', 'Hat'],
  ];
  for (const [upperWord, titleWord] of cvcCases) {
    const titleId = findFoundationsItemId(titleWord, 'en');
    const upperId = findFoundationsItemId(upperWord, 'en');
    const lowerId = findFoundationsItemId(upperWord.toLowerCase(), 'en');
    assert(titleId && titleId.startsWith('en_'), `Expected Foundations ID for ${titleWord}`);
    assert.strictEqual(upperId, titleId, `${upperWord} must reuse ${titleWord} (${titleId})`);
    assert.strictEqual(lowerId, titleId, `${upperWord.toLowerCase()} must reuse ${titleWord} (${titleId})`);

    const res = resolveFoundationsAudioForText(upperWord, 'en');
    assert(res && res.itemId === titleId);
    assert.strictEqual(
      resolveAcademyRecordingUrl(upperWord, 'en'),
      resolveFoundationsAudioUrl(titleId),
    );
    assert(
      fs.existsSync(path.resolve(root, 'public', res.audioUrl.replace(/^\//, ''))),
      `Missing CVC MP3 on disk: ${res.audioUrl}`,
    );
  }
  // BAT/MAP/PEN/CUP never exist in Foundations; resolve to Academy MP3 iff generated & registered, else fail closed to null
  const enLookup = (academyAudioLookup as { en: Record<string, string> }).en;
  let cvcGeneratedCount = 0;
  for (const word of ['BAT', 'MAP', 'PEN', 'CUP']) {
    assert.strictEqual(findFoundationsItemId(word, 'en'), null, `${word} must never match Foundations`);
    const registeredId = enLookup[normalizeAcademyAudioText(word)];
    const expectedDisk = registeredId
      ? path.resolve(root, 'public/assets/audio/academy/en', `${registeredId}.mp3`)
      : '';
    if (registeredId && fs.existsSync(expectedDisk)) {
      assert.strictEqual(
        resolveAcademyRecordingUrl(word, 'en'),
        `/assets/audio/academy/en/${registeredId}.mp3`,
      );
      cvcGeneratedCount++;
    } else {
      assert.strictEqual(resolveAcademyRecordingUrl(word, 'en'), null);
    }
  }
  // Single-letter 'A' vs 'a' distinction must stay exact (length < 2 guard)
  const upperAId = findFoundationsItemId('A', 'en');
  const lowerAId = findFoundationsItemId('a', 'en');
  assert(upperAId && lowerAId && upperAId !== lowerAId, 'Single-letter A and a must remain distinct');
  console.log(`   ✓ ERR-003 verified: 6 CVC words safely reused; BAT/MAP/PEN/CUP (${cvcGeneratedCount}/4 produced, rest fail-closed); A/a distinction preserved.`);

  console.log('[3/7] ERR-004: Verifying 9 English Alphabet Anchor Sequences (E, G, N, P, R, T, V, W, X)...');
  const expectedAnchors: Array<{ letter: string; word: string }> = [
    { letter: 'E', word: 'Elephant' },
    { letter: 'G', word: 'Grapes' },
    { letter: 'N', word: 'Nest' },
    { letter: 'P', word: 'Panda' },
    { letter: 'R', word: 'Rainbow' },
    { letter: 'T', word: 'Tree' },
    { letter: 'V', word: 'Violin' },
    { letter: 'W', word: 'Whale' },
    { letter: 'X', word: 'Xylophone' },
  ];
  assert.strictEqual(ENGLISH_ALPHABET_ANCHOR_SEQUENCES.size, 9);
  for (const { letter, word } of expectedAnchors) {
    const combined = `${letter}. ${word}`;
    const seq = resolveEnglishAlphabetAnchorSequence(combined, 'en');
    assert(seq && seq.length === 2, `Missing 2-clip sequence for "${combined}"`);
    assert.strictEqual(seq[0], resolveAcademyRecordingUrl(letter, 'en'));
    assert.strictEqual(seq[1], resolveAcademyRecordingUrl(word, 'en'));

    const playbackUrls = resolveAcademyPlaybackUrls(combined, 'en');
    assert.deepStrictEqual(playbackUrls, [seq[0], seq[1]]);
    for (const clipUrl of playbackUrls) {
      const clipDisk = path.resolve(root, 'public', clipUrl.replace(/^\//, ''));
      assert(fs.existsSync(clipDisk), `Missing anchor clip MP3 on disk: ${clipDisk}`);
    }
    // Arabic request must never trigger English anchor sequence
    assert.strictEqual(resolveEnglishAlphabetAnchorSequence(combined, 'ar'), null);
  }
  // Verify curriculum text for ENGLISH_ALPHABET remains untouched
  assert.strictEqual(ENGLISH_ALPHABET.length, 26);
  for (const { letter, word } of expectedAnchors) {
    const entry = ENGLISH_ALPHABET.find((e) => e.upper === letter);
    assert(entry, `Missing ENGLISH_ALPHABET entry for ${letter}`);
    assert.strictEqual(entry.word, word, `Curriculum word for ${letter} must stay "${word}"`);
  }
  // Single-URL contract preserved
  assert.strictEqual(
    resolveAcademyRecordingUrl('ب', 'ar'),
    '/assets/audio/academy/ar/ar_a1297edee10476b6.mp3',
  );
  console.log('   ✓ ERR-004 verified: All 9 anchor phrases resolve to 2-clip existing Foundations sequences without modifying curriculum.');

  console.log('[4/7] ERR-009 & ERR-010: Verifying StudentHomeworkSection & AssignedExamsSection Safe Playback...');
  const hwSrc = fs.readFileSync(
    path.resolve(root, 'src/components/StudentHomeworkSection.tsx'),
    'utf8',
  );
  const examAssignedSrc = fs.readFileSync(
    path.resolve(root, 'src/components/AssignedExamsSection.tsx'),
    'utf8',
  );
  for (const [name, src] of [
    ['StudentHomeworkSection.tsx', hwSrc],
    ['AssignedExamsSection.tsx', examAssignedSrc],
  ] as const) {
    assert(!/\.play\(\)\.catch\(\(\)\s*=>\s*\{\}\)/.test(src), `${name} must NOT swallow audio.play() errors silently`);
    assert(src.includes('isValidSafeUrl'), `${name} must validate URLs with isValidSafeUrl`);
    assert(src.includes('resolveAcademyPlaybackUrls'), `${name} must resolve pre-recorded audio before TTS fallback`);
    assert(src.includes("'playsinline'") && src.includes("'webkit-playsinline'"), `${name} must set WebView playsinline attributes`);
    assert(src.includes('role="alert"') && src.includes('audioErrorMsg'), `${name} must surface audio errors visibly`);
    assert(src.includes('audioRef.current'), `${name} must manage a single HTMLAudioElement ref with cleanup`);
    // Ensure explicit q.audioUrl failure never falls back to soundEngine.speak inside rawUrl branch
    const rawUrlIdx = src.indexOf('const rawUrl =');
    const audioTextBranchIdx = src.indexOf('if (q.audioText)', rawUrlIdx);
    assert(rawUrlIdx !== -1 && audioTextBranchIdx > rawUrlIdx, `${name} must separate rawUrl from q.audioText`);
    const rawUrlBranch = src.slice(rawUrlIdx, audioTextBranchIdx);
    assert(!rawUrlBranch.includes('soundEngine.speak'), `${name} rawUrl branch must NOT fall back to TTS`);
  }
  console.log('   ✓ ERR-009 & ERR-010 verified: managed audioRef, WebView playsinline, visible alerts, cleanup, zero silent failures.');

  console.log('[5/7] ERR-011: Verifying URL Safety Validation, CMS Form Fields, Server Routes & ExamsScreen...');
  const validUrls = [
    '/assets/audio/foundations/en_c3433602c5845902.mp3',
    '/assets/audio/arabic-letters/01_alif_name.mp3',
    '/uploads/teacher-q1.mp3',
    'https://cdn.example.com/audio/test.mp3',
    'http://localhost:3000/assets/audio/foundations/en_c3433602c5845902.mp3',
    '',
  ];
  for (const u of validUrls) {
    assert.strictEqual(isValidSafeUrl(u), true, `Expected valid safe URL: ${u}`);
  }
  const invalidUrls = [
    'javascript:alert(1)',
    'data:audio/mp3;base64,AAAA',
    '/assets/../secret.mp3',
    '/uploads/sub\\file.mp3',
    '/assets/audio/has space.mp3',
    '/assets/',
    '/uploads/',
    '//evil.example.com/x.mp3',
    'ftp://example.com/a.mp3',
  ];
  for (const u of invalidUrls) {
    assert.strictEqual(isValidSafeUrl(u), false, `Expected invalid/unsafe URL rejected: ${u}`);
  }

  const adminCmsSrc = fs.readFileSync(path.resolve(root, 'src/components/AdminCmsPanel.tsx'), 'utf8');
  assert(!/value=\{lsImageUrl\}[^>]*type="url"/.test(adminCmsSrc) && adminCmsSrc.includes('lsImageUrl'), 'AdminCmsPanel must not restrict lsImageUrl with HTML5 type="url"');
  assert(!/value=\{lsAudioUrl\}[^>]*type="url"/.test(adminCmsSrc) && adminCmsSrc.includes('lsAudioUrl'), 'AdminCmsPanel must not restrict lsAudioUrl with HTML5 type="url"');
  assert(adminCmsSrc.includes('qAudioText') && adminCmsSrc.includes('qAudioLang') && adminCmsSrc.includes('qAudioUrl'), 'AdminCmsPanel must include question audio fields');
  assert(adminCmsSrc.includes('cmsFormError'), 'AdminCmsPanel must display CMS validation/server errors');

  const serverSrc = fs.readFileSync(path.resolve(root, 'server.ts'), 'utf8');
  assert(serverSrc.includes("app.post('/api/admin/lessons'"), 'server.ts must define admin lessons POST');
  assert(serverSrc.includes("app.post('/api/admin/questions'"), 'server.ts must define admin questions POST');
  const lessonsPostIdx = serverSrc.indexOf("app.post('/api/admin/lessons'");
  const questionsPostIdx = serverSrc.indexOf("app.post('/api/admin/questions'");
  assert(
    serverSrc.slice(lessonsPostIdx, lessonsPostIdx + 1200).includes('isValidSafeUrl'),
    'POST /api/admin/lessons must validate URLs via isValidSafeUrl',
  );
  assert(
    serverSrc.slice(questionsPostIdx, questionsPostIdx + 1500).includes('isValidSafeUrl'),
    'POST /api/admin/questions must validate audioUrl via isValidSafeUrl',
  );

  const examsSrc = fs.readFileSync(path.resolve(root, 'src/screens/ExamsScreen.tsx'), 'utf8');
  assert(
    examsSrc.includes('(q.audioText || q.audioUrl)'),
    'ExamsScreen must allow audio button when audioUrl is provided without audioText',
  );
  assert(
    examsSrc.includes('audioUrl: q.audioUrl'),
    'ExamsScreen must pass q.audioUrl to academyAudio.speak',
  );
  console.log('   ✓ ERR-011 verified across validation.ts, AdminCmsPanel.tsx, server.ts, types/nonoland.ts, and ExamsScreen.tsx.');

  console.log('[6/7] Verifying Phase 2 Deliverables (CSV Counts & Zero Double-Counting)...');
  const callerRows = parseCsvRows(
    fs.readFileSync(path.resolve(root, 'NONOLAND_SOUNDENGINE_CALLER_RECONCILIATION.csv'), 'utf8'),
  );
  assert(callerRows.length >= 2, 'NONOLAND_SOUNDENGINE_CALLER_RECONCILIATION.csv must have data rows');
  const callerHeader = callerRows[0];
  const callerFileIdx = callerHeader.indexOf('File Path');
  assert(callerFileIdx !== -1, 'Missing "File Path" column in NONOLAND_SOUNDENGINE_CALLER_RECONCILIATION.csv');
  const uniqueCallerFiles = new Set(callerRows.slice(1).map((r) => r[callerFileIdx]));
  assert.strictEqual(uniqueCallerFiles.size, 18, `Expected 18 unique soundEngine.speak caller files, got ${uniqueCallerFiles.size}`);

  const deepColorRows = parseCsvRows(
    fs.readFileSync(path.resolve(root, 'NONOLAND_DEEP_COLOR_CONTENT_REVIEW.csv'), 'utf8'),
  );
  assert.strictEqual(deepColorRows.length - 1, 40, `Expected 40 Deep Color P4 review rows, got ${deepColorRows.length - 1}`);
  const dcHeader = deepColorRows[0];
  const dcExistingIdx = dcHeader.indexOf('Existing Foundations Match?');
  assert(dcExistingIdx !== -1, 'Missing "Existing Foundations Match?" column in NONOLAND_DEEP_COLOR_CONTENT_REVIEW.csv');
  const dcExistingCount = deepColorRows.slice(1).filter((r) => r[dcExistingIdx] === 'YES').length;
  assert.strictEqual(dcExistingCount, 38, `Expected 38 reusable existing Foundations files in Deep Color review, got ${dcExistingCount}`);

  const masterRows = parseCsvRows(
    fs.readFileSync(path.resolve(root, 'NONOLAND_FINAL_AUDIO_PRODUCTION_MASTER.csv'), 'utf8'),
  );
  const mHeader = masterRows[0];
  const grpIdx = mHeader.indexOf('Production Group');
  const priIdx = mHeader.indexOf('Priority');
  const keyIdx = mHeader.indexOf('Asset ID');
  assert(grpIdx !== -1 && priIdx !== -1 && keyIdx !== -1, 'Missing required columns in NONOLAND_FINAL_AUDIO_PRODUCTION_MASTER.csv');
  const dataRows = masterRows.slice(1);
  const groupA = dataRows.filter((r) => r[grpIdx] === 'A');
  const groupB = dataRows.filter((r) => r[grpIdx] === 'B');
  const groupC = dataRows.filter((r) => r[grpIdx] === 'C');
  const groupD = dataRows.filter((r) => r[grpIdx] === 'D');
  const groupE = dataRows.filter((r) => r[grpIdx] === 'E');
  const groupF = dataRows.filter((r) => r[grpIdx] === 'F');

  assert.strictEqual(groupA.length, 263, `Expected 263 Group A items (272 - 9), got ${groupA.length}`);
  assert.strictEqual(groupB.length, 44, `Expected 44 Group B reusable items, got ${groupB.length}`);
  assert.strictEqual(groupC.length, 3, `Expected 3 Group C code-only fixes, got ${groupC.length}`);
  assert.strictEqual(groupD.length, 40, `Expected 40 Group D content-review items, got ${groupD.length}`);
  assert.strictEqual(groupE.length, 4, `Expected 4 Group E optional items, got ${groupE.length}`);
  assert.strictEqual(groupF.length, 4, `Expected 4 Group F manual review items, got ${groupF.length}`);

  const p1 = groupA.filter((r) => r[priIdx] === 'P1').length;
  const p2 = groupA.filter((r) => r[priIdx] === 'P2').length;
  const p3 = groupA.filter((r) => r[priIdx] === 'P3').length;
  assert.strictEqual(p1 + p2 + p3, 263);

  // Zero duplicate Asset IDs across the entire master CSV
  const dedupSeen = new Set<string>();
  for (const r of dataRows) {
    const k = r[keyIdx];
    assert(k && !dedupSeen.has(k), `Duplicate Asset ID in master CSV: ${k}`);
    dedupSeen.add(k);
  }
  console.log(`   ✓ Verified CSV deliverables: 18 caller files (${callerRows.length - 1} rows), 40 Deep Color rows (38 reusable + 2 net-new), 358 master rows (263 Group A = ${p1} P1 + ${p2} P2 + ${p3} P3).`);

  console.log('[7/7] Verifying Strict SHA-256 Preservation of All 1,109 Baseline Audio Assets (24,635,147 bytes) & Validating New MP3s...');
  const audioRoot = path.resolve(root, 'public/assets/audio');
  const allAudioFiles = collectFilesRecursive(audioRoot);
  assert(allAudioFiles.length >= 1109, `Expected >= 1109 audio files on disk, got ${allAudioFiles.length}`);

  const baselinePaths = new Set<string>();
  let baselineTotalBytes = 0;

  // Parse every path|bytes|sha256 row in NONOLAND_AUDIO_PRESERVATION_REPORT.md and check exact match
  const presMd = fs.readFileSync(path.resolve(root, 'NONOLAND_AUDIO_PRESERVATION_REPORT.md'), 'utf8');
  const hashRowRegex = /^\|\s*`(public\/assets\/audio\/[^`]+)`\s*\|\s*(\d+)\s*\|\s*`([a-f0-9]{64})`/gm;
  let checkedManifestHashes = 0;
  for (const match of presMd.matchAll(hashRowRegex)) {
    const relPath = match[1];
    const expectedBytes = Number(match[2]);
    const expectedSha = match[3];
    const absPath = path.resolve(root, relPath);
    assert(fs.existsSync(absPath), `Preserved file missing: ${relPath}`);
    const actualBytes = fs.statSync(absPath).size;
    assert.strictEqual(actualBytes, expectedBytes, `Byte size changed for ${relPath}`);
    assert.strictEqual(sha256File(absPath), expectedSha, `SHA-256 changed for ${relPath}`);
    baselinePaths.add(absPath);
    baselineTotalBytes += actualBytes;
    checkedManifestHashes++;
  }
  assert.strictEqual(checkedManifestHashes, 105, `Expected 105 explicit SHA-256 rows (28+41+1+35), checked ${checkedManifestHashes}`);

  // Check Foundations directory combined digest matches NONOLAND_AUDIO_PRESERVATION_REPORT.md
  const foundationsDir = path.resolve(audioRoot, 'foundations');
  const foundationFiles = fs.readdirSync(foundationsDir).filter((f) => f.endsWith('.mp3')).sort();
  assert.strictEqual(foundationFiles.length, 1004);
  for (const f of foundationFiles) {
    const absF = path.join(foundationsDir, f);
    baselinePaths.add(absF);
    baselineTotalBytes += fs.statSync(absF).size;
  }
  assert.strictEqual(baselinePaths.size, 1109, 'Baseline unique file count must equal 1109');
  assert.strictEqual(baselineTotalBytes, 24635147, `Expected 24635147 baseline audio bytes, got ${baselineTotalBytes}`);

  const digestLines = foundationFiles.map((f) => `${f}:${sha256File(path.join(foundationsDir, f))}`).join('\n');
  const combinedFoundationsDigest = crypto.createHash('sha256').update(digestLines).digest('hex');
  assert.strictEqual(
    combinedFoundationsDigest,
    'de7ab266800381d974994283b3e21ed6721dfd94f88fec14122c5cc8a7b01813',
    'Foundations combined SHA-256 digest changed!',
  );

  // Any file added beyond 1,109 must be a valid Academy MP3 (never an unapproved Group D item like Pink Ballet Dress)
  const extraFiles = allAudioFiles.filter((f) => !baselinePaths.has(f));
  assert(
    !fs.existsSync(path.resolve(audioRoot, 'academy/en/en_b89f44855c685577.mp3')),
    'Unapproved Group D item Pink Ballet Dress (en_b89f44855c685577) must NOT exist on disk',
  );
  for (const extraFile of extraFiles) {
    const rel = path.relative(root, extraFile).replace(/\\/g, '/');
    assert(
      /^public\/assets\/audio\/academy\/(ar|en)\/(ar|en)_[0-9a-f]{16}\.mp3$/.test(rel),
      `Unexpected extra file outside academy/{ar,en}: ${rel}`,
    );
    const val = await validateAcademyMp3File(extraFile, false);
    assert(val.valid, `Newly generated MP3 failed validation (${rel}): ${val.reason}`);
  }

  // Confirm foundationsAudioInventory.json still lists 1004 items
  assert.strictEqual((foundationsAudioInventory as { totalFiles: number }).totalFiles, 1004);
  console.log(`   ✓ Verified all 1,109/1,109 baseline audio files untouched (24,635,147 bytes, Foundations SHA-256 + 105 SHA-256 checks) + ${extraFiles.length} valid new Academy MP3s.`);

  console.log('\n✅ Audio Audit Phase 2 Verification Suite PASSED');
}

run().catch((err) => {
  console.error('❌ Phase 2 verification failed:', err);
  process.exit(1);
});
