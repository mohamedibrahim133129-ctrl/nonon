import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenAI } from '@google/genai';
import {
  ACADEMY_TTS_VOICE,
  loadExistingManifestFromDisk,
  recomputeManifestCounts,
  saveManifestAndClientLookup,
  validateAcademyMp3File,
} from './academyAudioService';
import { hasValidAudioMagicBytes, transcodeAudioBufferToMp3File } from './storyAudioService';
import { type AcademyAudioLang, normalizeAcademyAudioText } from '../src/utils/academyAudioText';

export const APPROVED_PACKAGE3_BATCH_FILE = path.resolve(
  process.cwd(),
  'data',
  'approved-package3-batch.json',
);
export const PACKAGE3_CHECKPOINT_FILE = path.resolve(
  process.cwd(),
  'data',
  'package3-generation-checkpoint.json',
);

export const PACKAGE3_TTS_MODELS = [
  'gemini-3.8-flash-lite-tts',
  'gemini-3.8-flash-tts',
  'gemini-3.1-flash-tts-preview',
  'gemini-2.5-flash-preview-tts',
  'gemini-2.5-pro-preview-tts',
] as const;

export interface ApprovedPackage3Item {
  masterId: string;
  tier: string;
  moduleGroup: string;
  language: AcademyAudioLang;
  text: string;
  normalizedText: string;
  ttsPromptText: string;
  assetId: string;
  mp3Path: string;
  audioUrl: string;
}

export interface ApprovedPackage3Document {
  version: number;
  packageName: string;
  totalCount: number;
  arabicCount: number;
  englishCount: number;
  items: ApprovedPackage3Item[];
}

export interface Package3FailureEntry {
  masterId: string;
  assetId: string;
  language: AcademyAudioLang;
  text: string;
  model: string;
  error: string;
  at: string;
}

export interface Package3CheckpointDocument {
  version: number;
  packageName: string;
  startedAt: string | null;
  updatedAt: string;
  finishedAt: string | null;
  running: boolean;
  state: 'idle' | 'running' | 'completed' | 'partial' | 'failed';
  totalApprovedCount: number;
  generatedCount: number;
  registeredCount: number;
  remainingCount: number;
  attemptedThisRun: number;
  succeededThisRun: number;
  completedIds: string[];
  completedMasterIds: string[];
  failedItems: Package3FailureEntry[];
  exhaustedModels: Record<string, string>;
  succeededByModel: Record<string, number>;
  batchApiSupport: {
    tested: boolean;
    supported: boolean | null;
    lastAttemptAt: string | null;
    detail: string | null;
  };
  nextPendingAssetId: string | null;
  lastError: string | null;
}

let activePackage3Run: Promise<Package3CheckpointDocument> | null = null;

export const FINAL_MASTER_CSV_FILE = path.resolve(
  process.cwd(),
  'NONOLAND_FINAL_AUDIO_PRODUCTION_MASTER.csv',
);

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

export function loadApprovedPackage3Items(): ApprovedPackage3Document {
  if (!fs.existsSync(APPROVED_PACKAGE3_BATCH_FILE)) {
    throw new Error(`Missing ${APPROVED_PACKAGE3_BATCH_FILE}`);
  }
  return JSON.parse(fs.readFileSync(APPROVED_PACKAGE3_BATCH_FILE, 'utf8')) as ApprovedPackage3Document;
}

/**
 * Loads strictly authorized Group A items from NONOLAND_FINAL_AUDIO_PRODUCTION_MASTER.csv
 * prioritized as P1 (CVC / Shapes) -> P3 (ReadingAdventure / SmartAssessment / Offline) -> P2 (Deep Journey).
 * Excludes the 10 alternate Arabic number word rows (since canonical '11'..'20' recordings are already active on disk)
 * and strictly excludes Group D (Deep Colors pending approval), Group E (Optional), and Group F (Manual review).
 */
export function loadAuthorizedGroupAItems(): ApprovedPackage3Item[] {
  if (!fs.existsSync(FINAL_MASTER_CSV_FILE)) {
    throw new Error(`Missing ${FINAL_MASTER_CSV_FILE}`);
  }
  const rows = parseCsvRows(fs.readFileSync(FINAL_MASTER_CSV_FILE, 'utf8'));
  const header = rows[0] || [];
  const idx = (name: string) => header.indexOf(name);
  const gIdx = idx('Production Group');
  const pIdx = idx('Priority');
  const idIdx = idx('Asset ID');
  const tpIdx = idx('Target Path');
  const lIdx = idx('Language');
  const stIdx = idx('Spoken Text');
  const ptIdx = idx('Suggested TTS Prompt Text');
  const smIdx = idx('Source Modules');

  const priorityRank: Record<string, number> = { P1: 1, P3: 2, P2: 3 };
  const out: Array<{ rank: number; item: ApprovedPackage3Item }> = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length < header.length) continue;
    if (row[gIdx] !== 'A') continue;
    const sourceMod = row[smIdx] || '';
    // Skip alternate Arabic word-form 11..20 entries because canonical '11'..'20' recordings already exist & resolve cleanly
    if (sourceMod === 'AcademyScreen:Numbers') continue;
    const priority = row[pIdx] || 'P2';
    const assetId = row[idIdx];
    const lang = (row[lIdx] === 'en' ? 'en' : 'ar') as AcademyAudioLang;
    const text = row[stIdx];
    const ttsPromptText = row[ptIdx] || text;
    const audioUrl = row[tpIdx] || `/assets/audio/academy/${lang}/${assetId}.mp3`;
    const mp3Path = `public${audioUrl}`;
    out.push({
      rank: priorityRank[priority] ?? 9,
      item: {
        masterId: `GRP-A-${priority}-${assetId}`,
        tier: priority === 'P1' ? 'P1-CORE-ACADEMY' : priority === 'P3' ? 'P3-EDUCATIONAL-APP' : 'P2-DEEP-JOURNEY',
        moduleGroup: sourceMod,
        language: lang,
        text,
        normalizedText: normalizeAcademyAudioText(text),
        ttsPromptText,
        assetId,
        mp3Path,
        audioUrl,
      },
    });
  }

  out.sort((a, b) => a.rank - b.rank);
  return out.map((x) => x.item);
}

function wrapPcmOrAudioBuffer(base64Audio: string, mimeType?: string): { buffer: Buffer; mimeType: string } {
  const raw = Buffer.from(base64Audio, 'base64');
  const magic = hasValidAudioMagicBytes(raw);
  if (magic.ok && magic.mimeType) {
    return { buffer: raw, mimeType: magic.mimeType };
  }
  const mt = (mimeType || '').toLowerCase();
  let sampleRate = 24000;
  const rateMatch = mt.match(/rate=(\d+)/);
  if (rateMatch) {
    const parsed = Number(rateMatch[1]);
    if (Number.isFinite(parsed) && parsed >= 8000 && parsed <= 48000) sampleRate = parsed;
  }
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + raw.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(raw.length, 40);
  return { buffer: Buffer.concat([header, raw]), mimeType: 'audio/wav' };
}

function classifyPkg3Error(err: unknown): {
  isDailyExhausted: boolean;
  isPerMinuteRateLimit: boolean;
  isFatalAuth: boolean;
  isBadRequest: boolean;
  retryDelayMs: number;
  summary: string;
} {
  let raw = err instanceof Error ? err.message : String(err ?? 'Unknown error');
  try {
    const extra = JSON.stringify(err);
    if (extra && extra.length > raw.length && extra !== '{}') raw = `${raw} ${extra}`;
  } catch {
    // ignore
  }
  const redacted = raw.replace(/AIza[0-9A-Za-z_-]+/g, '[REDACTED]');
  const isFatalAuth = /\b401\b|\b403\b|API_KEY_INVALID|PERMISSION_DENIED|UNAUTHENTICATED/i.test(redacted);
  const isBadRequest = /\b400\b|\b404\b|INVALID_ARGUMENT|NOT_FOUND/i.test(redacted);
  const isQuota429 = /\b429\b|RESOURCE_EXHAUSTED|quota|rate.?limit/i.test(redacted);
  const quotaIds = [...redacted.matchAll(/"quotaId"\s*:\s*"([^"]+)"/g)].map((m) => m[1]);
  const hasPerMin = quotaIds.some((id) => /PerMinute/i.test(id));
  const hasPerDay =
    quotaIds.some((id) => /PerDay/i.test(id)) ||
    (/GenerateRequestsPerDay|RequestsPerDay|free_tier_requests/i.test(redacted) && !hasPerMin);

  const retryMatch =
    /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/i.exec(redacted) ||
    /retry\s+in\s+(\d+(?:\.\d+)?)s/i.exec(redacted);
  const parsedSec = retryMatch ? Number(retryMatch[1]) : 0;
  const isDailyExhausted = isQuota429 && (hasPerDay || (Number.isFinite(parsedSec) && parsedSec > 120));
  const isPerMinuteRateLimit = isQuota429 && !isDailyExhausted;

  let retryDelayMs = 21_000;
  if (isPerMinuteRateLimit && Number.isFinite(parsedSec) && parsedSec > 0) {
    retryDelayMs = Math.min(65_000, Math.max(3_000, Math.ceil((parsedSec + 1.5) * 1000)));
  }

  return {
    isDailyExhausted,
    isPerMinuteRateLimit,
    isFatalAuth,
    isBadRequest,
    retryDelayMs,
    summary: redacted.slice(0, 1200),
  };
}

function buildSpeechStyleForItem(item: ApprovedPackage3Item): string {
  const isNumber = item.moduleGroup === 'Academy:Numbers' || item.moduleGroup === 'Deep:Math';
  if (item.language === 'ar') {
    if (isNumber) {
      return 'Warm, gentle, consistent Arabic early-childhood teacher voice for ages 1 to 4. Say ONLY this Arabic number phrase clearly and naturally, with no extra commentary.';
    }
    return 'Warm, gentle, consistent, child-directed Arabic early-childhood teacher voice for ages 1 to 4. Clear cheerful articulation, natural pacing, never chanting or Quran recitation.';
  }
  if (isNumber) {
    return 'Warm, cheerful, natural English early-childhood teacher voice for ages 1 to 4. Say ONLY this English number clearly and naturally, with no extra commentary.';
  }
  return 'Warm, cheerful, natural, consistent English early-childhood teacher voice for ages 1 to 4. Clear articulation and gentle pacing, no long pauses.';
}

function buildGenerateContentRequest(item: ApprovedPackage3Item, model: string) {
  const style = buildSpeechStyleForItem(item);
  const inputText = item.ttsPromptText || item.normalizedText || item.text;
  const partPayload = /^gemini-3\.8-/i.test(model)
    ? { text: inputText, speechMetadata: { style } }
    : {
        text: `${item.language === 'ar' ? 'انطق بلطف ووضوح للأطفال' : 'Speak clearly and warmly for a young child'}: ${inputText}`,
      };
  return {
    contents: [{ role: 'user' as const, parts: [partPayload] }],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: ACADEMY_TTS_VOICE },
        },
      },
    },
  };
}

async function saveAndValidateInlineAudio(
  item: ApprovedPackage3Item,
  base64Data: string,
  mimeType: string | undefined,
): Promise<{ ok: true; bytes: number; durationSeconds: number | null; maxVolumeDb: number | null } | { ok: false; reason: string }> {
  const wrapped = wrapPcmOrAudioBuffer(base64Data, mimeType);
  if (wrapped.buffer.length < 256) {
    return { ok: false, reason: `Undersized audio buffer (${wrapped.buffer.length} bytes)` };
  }
  const destPath = path.resolve(process.cwd(), item.mp3Path);
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const tmpDest = path.join(path.dirname(destPath), `.tmp-${crypto.randomUUID()}.mp3`);
  try {
    await transcodeAudioBufferToMp3File(wrapped.buffer, tmpDest, wrapped.mimeType);
    const val = await validateAcademyMp3File(tmpDest, true);
    if (!val.valid) {
      if (fs.existsSync(tmpDest)) fs.unlinkSync(tmpDest);
      return { ok: false, reason: val.reason || 'Generated MP3 failed validation' };
    }
    fs.renameSync(tmpDest, destPath);
    return {
      ok: true,
      bytes: val.bytes,
      durationSeconds: val.durationSeconds,
      maxVolumeDb: val.maxVolumeDb,
    };
  } catch (err) {
    if (fs.existsSync(tmpDest)) fs.unlinkSync(tmpDest);
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

export async function syncApprovedPackage3Registrations(opts?: {
  validateNewOnly?: boolean;
}): Promise<{
  totalApprovedCount: number;
  generatedCount: number;
  registeredCount: number;
  completedIds: string[];
  completedMasterIds: string[];
  nextPendingAssetId: string | null;
}> {
  const doc = loadApprovedPackage3Items();
  const groupAItems = fs.existsSync(FINAL_MASTER_CSV_FILE) ? loadAuthorizedGroupAItems() : [];
  const manifestItems = loadExistingManifestFromDisk();
  const manifestByKey = new Map(
    manifestItems.map((m) => [`${m.language}|${normalizeAcademyAudioText(m.text)}`, m]),
  );

  const completedIds: string[] = [];
  const completedMasterIds: string[] = [];
  let nextPendingAssetId: string | null = null;
  let manifestMutated = false;

  for (const item of doc.items) {
    const absPath = path.resolve(process.cwd(), item.mp3Path);
    if (fs.existsSync(absPath)) {
      const stat = fs.statSync(absPath);
      if (stat.isFile() && stat.size >= 1024) {
        completedIds.push(item.assetId);
        completedMasterIds.push(item.masterId);
        const mKey = `${item.language}|${normalizeAcademyAudioText(item.text)}`;
        const mItem = manifestByKey.get(mKey);
        if (mItem && (mItem.validationStatus !== 'valid' || mItem.generationStatus !== 'ready')) {
          const check = await validateAcademyMp3File(absPath, false);
          if (check.valid) {
            mItem.generationStatus = 'ready';
            mItem.validationStatus = 'valid';
            mItem.bytes = check.bytes;
            mItem.durationSeconds = check.durationSeconds;
            mItem.ttsPromptText = item.ttsPromptText;
            mItem.lastError = undefined;
            mItem.updatedAt = new Date().toISOString();
            manifestMutated = true;
          }
        }
        continue;
      }
    }
    if (!nextPendingAssetId) {
      nextPendingAssetId = item.assetId;
    }
  }

  for (const item of groupAItems) {
    const absPath = path.resolve(process.cwd(), item.mp3Path);
    if (!fs.existsSync(absPath)) continue;
    const stat = fs.statSync(absPath);
    if (!stat.isFile() || stat.size < 1024) continue;
    const mKey = `${item.language}|${normalizeAcademyAudioText(item.text)}`;
    const mItem = manifestByKey.get(mKey);
    if (mItem && (mItem.validationStatus !== 'valid' || mItem.generationStatus !== 'ready')) {
      const check = await validateAcademyMp3File(absPath, opts?.validateNewOnly ?? false);
      if (check.valid) {
        mItem.generationStatus = 'ready';
        mItem.validationStatus = 'valid';
        mItem.bytes = check.bytes;
        mItem.durationSeconds = check.durationSeconds;
        if (check.maxVolumeDb !== null) mItem.maxVolumeDb = check.maxVolumeDb;
        mItem.ttsPromptText = item.ttsPromptText;
        mItem.lastError = undefined;
        mItem.updatedAt = new Date().toISOString();
        manifestMutated = true;
      }
    }
  }

  // Always rewrite client lookup (merges manifest + valid on-disk Package 3 items)
  const updatedManifest = manifestMutated
    ? recomputeManifestCounts(manifestItems)
    : recomputeManifestCounts(manifestItems);
  saveManifestAndClientLookup(updatedManifest);

  const lookupJson = JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), 'src', 'data', 'academyAudioLookup.json'), 'utf8'),
  ) as { ar: Record<string, string>; en: Record<string, string> };
  const lookupIds = new Set([...Object.values(lookupJson.ar), ...Object.values(lookupJson.en)]);
  const registeredCount = completedIds.filter((id) => lookupIds.has(id)).length;

  return {
    totalApprovedCount: doc.items.length,
    generatedCount: completedIds.length,
    registeredCount,
    completedIds,
    completedMasterIds,
    nextPendingAssetId,
  };
}

export function loadPackage3Checkpoint(): Package3CheckpointDocument {
  if (fs.existsSync(PACKAGE3_CHECKPOINT_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(PACKAGE3_CHECKPOINT_FILE, 'utf8')) as Package3CheckpointDocument;
    } catch {
      // fall through
    }
  }
  const doc = loadApprovedPackage3Items();
  return {
    version: 1,
    packageName: doc.packageName,
    startedAt: null,
    updatedAt: new Date().toISOString(),
    finishedAt: null,
    running: false,
    state: 'idle',
    totalApprovedCount: doc.items.length,
    generatedCount: 0,
    registeredCount: 0,
    remainingCount: doc.items.length,
    attemptedThisRun: 0,
    succeededThisRun: 0,
    completedIds: [],
    completedMasterIds: [],
    failedItems: [],
    exhaustedModels: {},
    succeededByModel: {},
    batchApiSupport: {
      tested: false,
      supported: null,
      lastAttemptAt: null,
      detail: null,
    },
    nextPendingAssetId: doc.items[0]?.assetId || null,
    lastError: null,
  };
}

function savePackage3Checkpoint(cp: Package3CheckpointDocument): void {
  fs.mkdirSync(path.dirname(PACKAGE3_CHECKPOINT_FILE), { recursive: true });
  const tmp = `${PACKAGE3_CHECKPOINT_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cp, null, 2));
  fs.renameSync(tmp, PACKAGE3_CHECKPOINT_FILE);
}

/**
 * Probes Gemini Batch API (batchGenerateContent via ai.batches.create) on real pending Package 3 items.
 * Never invents fake prompts; every generated response is validated and saved directly to target MP3 path.
 */
export async function probeAndExecuteBatchApiChunk(opts?: {
  model?: string;
  chunkSize?: number;
  pollTimeoutMs?: number;
}): Promise<{
  supported: boolean;
  batchName?: string;
  jobState?: string;
  succeededCount: number;
  failedCount: number;
  detail: string;
}> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { supported: false, succeededCount: 0, failedCount: 0, detail: 'GEMINI_API_KEY missing' };
  }

  const doc = loadApprovedPackage3Items();
  const pending = doc.items.filter((i) => !fs.existsSync(path.resolve(process.cwd(), i.mp3Path)));
  if (pending.length === 0) {
    return { supported: true, succeededCount: 0, failedCount: 0, detail: 'All 793 items already exist on disk.' };
  }

  const model = opts?.model || 'gemini-3.8-flash-lite-tts';
  const chunkSize = Math.max(1, Math.min(opts?.chunkSize ?? 5, pending.length));
  const chunk = pending.slice(0, chunkSize);

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });

  try {
    const inlinedRequests = chunk.map((item) => buildGenerateContentRequest(item, model));
    const batchJob = await ai.batches.create({
      model,
      src: inlinedRequests,
      config: {
        displayName: `nonoland-pkg3-${Date.now()}`,
      },
    });

    const batchName = batchJob.name;
    if (!batchName) {
      return {
        supported: false,
        succeededCount: 0,
        failedCount: 0,
        detail: `Batch API returned job without name: ${JSON.stringify(batchJob).slice(0, 400)}`,
      };
    }

    const deadline = Date.now() + (opts?.pollTimeoutMs ?? 90_000);
    let current = batchJob;
    while (
      Date.now() < deadline &&
      current.state !== 'JOB_STATE_SUCCEEDED' &&
      current.state !== 'JOB_STATE_FAILED' &&
      current.state !== 'JOB_STATE_CANCELLED' &&
      current.state !== 'JOB_STATE_EXPIRED'
    ) {
      await new Promise((r) => setTimeout(r, 3_000));
      current = await ai.batches.get({ name: batchName });
    }

    const inlinedResponses = current.dest?.inlinedResponses || [];
    let succeededCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < chunk.length; i++) {
      const item = chunk[i];
      const respWrap = inlinedResponses[i];
      const inlineData = respWrap?.response?.candidates?.[0]?.content?.parts?.find(
        (p) => Boolean(p?.inlineData?.data),
      )?.inlineData;
      if (inlineData?.data) {
        const saved = await saveAndValidateInlineAudio(item, inlineData.data, inlineData.mimeType);
        if (saved.ok) {
          succeededCount++;
        } else {
          failedCount++;
          errors.push(`${item.assetId}: ${saved.reason}`);
        }
      } else {
        failedCount++;
        errors.push(
          `${item.assetId}: ${respWrap?.error?.message || current.error?.message || `state=${current.state}`}`,
        );
      }
    }

    if (succeededCount > 0) {
      await syncApprovedPackage3Registrations();
    }

    return {
      supported: current.state === 'JOB_STATE_SUCCEEDED' && succeededCount > 0,
      batchName,
      jobState: String(current.state || ''),
      succeededCount,
      failedCount,
      detail:
        errors.length > 0
          ? `Batch job ${batchName} (${current.state}): ok=${succeededCount}, err=${errors.slice(0, 3).join(' | ')}`
          : `Batch job ${batchName} (${current.state}): generated ${succeededCount}/${chunk.length}`,
    };
  } catch (err) {
    const diag = classifyPkg3Error(err);
    return {
      supported: false,
      succeededCount: 0,
      failedCount: chunk.length,
      detail: `Batch API error: ${diag.summary}`,
    };
  }
}

export async function runApprovedPackage3Generation(opts?: {
  limit?: number;
  delayMs?: number;
  tryBatchApiFirst?: boolean;
  batchChunkSize?: number;
  models?: string[];
  groupAOnly?: boolean;
}): Promise<Package3CheckpointDocument> {
  if (activePackage3Run) {
    return activePackage3Run;
  }

  activePackage3Run = (async () => {
    const cp = loadPackage3Checkpoint();
    const doc = loadApprovedPackage3Items();
    const apiKey = process.env.GEMINI_API_KEY;
    const nowIso = new Date().toISOString();

    cp.running = true;
    cp.state = 'running';
    cp.startedAt = cp.startedAt || nowIso;
    cp.updatedAt = nowIso;
    cp.finishedAt = null;
    cp.attemptedThisRun = 0;
    cp.succeededThisRun = 0;
    cp.lastError = null;
    savePackage3Checkpoint(cp);

    try {
      const reg0 = await syncApprovedPackage3Registrations();
      cp.totalApprovedCount = reg0.totalApprovedCount;
      cp.generatedCount = reg0.generatedCount;
      cp.registeredCount = reg0.registeredCount;
      cp.remainingCount = reg0.totalApprovedCount - reg0.generatedCount;
      cp.completedIds = reg0.completedIds;
      cp.completedMasterIds = reg0.completedMasterIds;
      cp.nextPendingAssetId = reg0.nextPendingAssetId;
      savePackage3Checkpoint(cp);

      if (!apiKey) {
        cp.state = 'failed';
        cp.lastError = 'GEMINI_API_KEY is not configured.';
        cp.finishedAt = new Date().toISOString();
        cp.updatedAt = cp.finishedAt;
        cp.running = false;
        savePackage3Checkpoint(cp);
        return cp;
      }

      if (cp.remainingCount === 0) {
        cp.state = 'completed';
        cp.finishedAt = new Date().toISOString();
        cp.updatedAt = cp.finishedAt;
        cp.running = false;
        savePackage3Checkpoint(cp);
        return cp;
      }

      // Step A: Optionally test Batch API once if requested and not yet confirmed unsupported
      if (opts?.tryBatchApiFirst && cp.batchApiSupport.supported !== false) {
        const probe = await probeAndExecuteBatchApiChunk({
          model: 'gemini-3.8-flash-lite-tts',
          chunkSize: opts?.batchChunkSize ?? 25,
          pollTimeoutMs: 120_000,
        });
        cp.batchApiSupport = {
          tested: true,
          supported: probe.supported,
          lastAttemptAt: new Date().toISOString(),
          detail: probe.detail,
        };
        if (probe.succeededCount > 0) {
          cp.succeededThisRun += probe.succeededCount;
          cp.attemptedThisRun += probe.succeededCount + probe.failedCount;
          cp.succeededByModel['gemini-3.8-flash-lite-tts:batch'] =
            (cp.succeededByModel['gemini-3.8-flash-lite-tts:batch'] || 0) + probe.succeededCount;
        }
        savePackage3Checkpoint(cp);

        // If Batch API works, keep submitting batch chunks until complete or quota stops
        if (probe.supported) {
          const chunkSize = Math.max(10, Math.min(opts?.batchChunkSize ?? 50, 100));
          while (true) {
            const syncNow = await syncApprovedPackage3Registrations();
            cp.generatedCount = syncNow.generatedCount;
            cp.registeredCount = syncNow.registeredCount;
            cp.remainingCount = syncNow.totalApprovedCount - syncNow.generatedCount;
            cp.completedIds = syncNow.completedIds;
            cp.completedMasterIds = syncNow.completedMasterIds;
            cp.nextPendingAssetId = syncNow.nextPendingAssetId;
            if (cp.remainingCount === 0 || (opts?.limit && cp.attemptedThisRun >= opts.limit)) {
              break;
            }
            const nextChunk = await probeAndExecuteBatchApiChunk({
              model: 'gemini-3.8-flash-lite-tts',
              chunkSize: opts?.limit ? Math.min(chunkSize, opts.limit - cp.attemptedThisRun) : chunkSize,
              pollTimeoutMs: 180_000,
            });
            cp.attemptedThisRun += nextChunk.succeededCount + nextChunk.failedCount;
            cp.succeededThisRun += nextChunk.succeededCount;
            if (nextChunk.succeededCount > 0) {
              cp.succeededByModel['gemini-3.8-flash-lite-tts:batch'] =
                (cp.succeededByModel['gemini-3.8-flash-lite-tts:batch'] || 0) + nextChunk.succeededCount;
            }
            cp.batchApiSupport.detail = nextChunk.detail;
            cp.batchApiSupport.lastAttemptAt = new Date().toISOString();
            savePackage3Checkpoint(cp);
            if (!nextChunk.supported || nextChunk.succeededCount === 0) {
              cp.lastError = nextChunk.detail;
              break;
            }
          }
        }
      }

      // Step B: Direct generateContent across healthy TTS models for any remaining pending items
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });

      const candidateModels =
        opts?.models && opts.models.length > 0 ? opts.models : [...PACKAGE3_TTS_MODELS];
      const exhaustedModels = new Set<string>();
      const perModelCooldownMs = typeof opts?.delayMs === 'number' ? Math.max(1000, opts.delayMs) : 20_500;
      const lastCallAtByModel = new Map<string, number>();

      const sourceItems = opts?.groupAOnly ? loadAuthorizedGroupAItems() : doc.items;
      const pendingItems = sourceItems.filter(
        (i) => !fs.existsSync(path.resolve(process.cwd(), i.mp3Path)),
      );
      const maxItems =
        opts?.limit && opts.limit > 0
          ? Math.min(pendingItems.length, Math.max(0, opts.limit - cp.attemptedThisRun))
          : pendingItems.length;

      for (let idx = 0; idx < maxItems; idx++) {
        const item = pendingItems[idx];
        const absPath = path.resolve(process.cwd(), item.mp3Path);
        if (fs.existsSync(absPath)) continue;

        const healthyModels = candidateModels.filter((m) => !exhaustedModels.has(m));
        if (healthyModels.length === 0) {
          cp.lastError = `All candidate TTS models exhausted daily/auth quota: ${candidateModels.join(', ')}`;
          break;
        }

        cp.attemptedThisRun++;
        let itemDone = false;
        let itemLastErr = '';

        for (const model of healthyModels) {
          const lastAt = lastCallAtByModel.get(model) || 0;
          const waitNeeded = lastAt > 0 ? perModelCooldownMs - (Date.now() - lastAt) : 0;
          if (waitNeeded > 0) {
            await new Promise((r) => setTimeout(r, waitNeeded));
          }

          for (let attempt = 1; attempt <= 2; attempt++) {
            lastCallAtByModel.set(model, Date.now());
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 28_000);
            try {
              const req = buildGenerateContentRequest(item, model);
              const timeoutPromise = new Promise<never>((_, reject) => {
                controller.signal.addEventListener(
                  'abort',
                  () => reject(new Error(`Gemini TTS (${model}) timed out after 28s`)),
                  { once: true },
                );
              });
              const response = await Promise.race([
                ai.models.generateContent({
                  model,
                  contents: req.contents,
                  config: {
                    ...req.config,
                    abortSignal: controller.signal,
                  },
                }),
                timeoutPromise,
              ]);
              const parts = response.candidates?.[0]?.content?.parts || [];
              const inline = parts.find((p) => Boolean(p?.inlineData?.data))?.inlineData;
              if (!inline?.data) {
                itemLastErr = `[${model}] Empty inlineData audio response`;
                continue;
              }
              const saved = await saveAndValidateInlineAudio(item, inline.data, inline.mimeType);
              if (!saved.ok) {
                itemLastErr = `[${model}] ${saved.reason}`;
                continue;
              }
              cp.succeededThisRun++;
              cp.succeededByModel[model] = (cp.succeededByModel[model] || 0) + 1;
              itemDone = true;
              break;
            } catch (err) {
              const diag = classifyPkg3Error(err);
              itemLastErr = `[${model}] ${diag.summary}`;
              if (diag.isFatalAuth) {
                exhaustedModels.add(model);
                cp.exhaustedModels[model] = diag.summary;
                break;
              }
              if (diag.isBadRequest) {
                exhaustedModels.add(model);
                cp.exhaustedModels[model] = diag.summary;
                break;
              }
              if (diag.isDailyExhausted) {
                exhaustedModels.add(model);
                cp.exhaustedModels[model] = diag.summary;
                break;
              }
              if (diag.isPerMinuteRateLimit && attempt === 1) {
                await new Promise((r) => setTimeout(r, diag.retryDelayMs));
                continue;
              }
              break;
            } finally {
              clearTimeout(timer);
            }
          }

          if (itemDone) break;
        }

        if (!itemDone) {
          cp.failedItems.push({
            masterId: item.masterId,
            assetId: item.assetId,
            language: item.language,
            text: item.text,
            model: healthyModels[healthyModels.length - 1] || 'none',
            error: itemLastErr.slice(0, 600),
            at: new Date().toISOString(),
          });
          cp.lastError = itemLastErr.slice(0, 600);
        }

        const reg = await syncApprovedPackage3Registrations();
        cp.totalApprovedCount = reg.totalApprovedCount;
        cp.generatedCount = reg.generatedCount;
        cp.registeredCount = reg.registeredCount;
        cp.remainingCount = reg.totalApprovedCount - reg.generatedCount;
        cp.completedIds = reg.completedIds;
        cp.completedMasterIds = reg.completedMasterIds;
        cp.nextPendingAssetId = reg.nextPendingAssetId;
        cp.updatedAt = new Date().toISOString();
        savePackage3Checkpoint(cp);

        if (exhaustedModels.size >= candidateModels.length) {
          cp.lastError = `All candidate TTS models exhausted daily/permanent quota (${candidateModels.length}/${candidateModels.length}).`;
          break;
        }
      }

      const finalReg = await syncApprovedPackage3Registrations();
      cp.totalApprovedCount = finalReg.totalApprovedCount;
      cp.generatedCount = finalReg.generatedCount;
      cp.registeredCount = finalReg.registeredCount;
      cp.remainingCount = finalReg.totalApprovedCount - finalReg.generatedCount;
      cp.completedIds = finalReg.completedIds;
      cp.completedMasterIds = finalReg.completedMasterIds;
      cp.nextPendingAssetId = finalReg.nextPendingAssetId;
      cp.state = cp.remainingCount === 0 ? 'completed' : 'partial';
      cp.finishedAt = new Date().toISOString();
      cp.updatedAt = cp.finishedAt;
      cp.running = false;
      savePackage3Checkpoint(cp);
      return cp;
    } catch (err) {
      cp.state = 'failed';
      cp.lastError = err instanceof Error ? err.message : String(err);
      cp.finishedAt = new Date().toISOString();
      cp.updatedAt = cp.finishedAt;
      cp.running = false;
      savePackage3Checkpoint(cp);
      return cp;
    } finally {
      activePackage3Run = null;
    }
  })();

  return activePackage3Run;
}
