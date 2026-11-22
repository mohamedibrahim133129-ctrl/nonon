import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { GoogleGenAI } from '@google/genai';
import {
  type AcademyAudioManifestDocument,
  type AcademyAudioManifestItem,
  type AcademyTtsPromptSpec,
  type PronunciationReviewStatus,
  buildFullAcademyAudioManifest,
  resolveAcademyTtsPromptSpec,
} from './academyAudioManifestBuilder';
import {
  hasValidAudioMagicBytes,
  probeLocalAudioDurationSeconds,
  transcodeAudioBufferToMp3File,
} from './storyAudioService';
import { type AcademyAudioLang, normalizeAcademyAudioText } from '../src/utils/academyAudioText';

const execFileAsync = promisify(execFile);

export const ACADEMY_AUDIO_ROOT_DIR = path.resolve(process.cwd(), 'public', 'assets', 'audio', 'academy');
export const ACADEMY_AUDIO_AR_DIR = path.join(ACADEMY_AUDIO_ROOT_DIR, 'ar');
export const ACADEMY_AUDIO_EN_DIR = path.join(ACADEMY_AUDIO_ROOT_DIR, 'en');
export const ACADEMY_MANIFEST_FILE = path.resolve(process.cwd(), 'data', 'academy-audio-manifest.json');
export const ACADEMY_LOOKUP_FILE = path.resolve(process.cwd(), 'src', 'data', 'academyAudioLookup.json');

export const ACADEMY_TTS_PRIMARY_MODEL = 'gemini-3.8-flash-lite-tts';
export const ACADEMY_TTS_FALLBACK_MODEL = 'gemini-3.8-flash-tts';
export const ACADEMY_TTS_VOICE = 'Zephyr';

export interface FreeTierModelRateLimit {
  rpm: number;
  rpd: number;
  minIntervalMs: number;
  defaultIntervalMs: number;
}

export const FREE_TIER_TTS_MODEL_LIMITS: Record<string, FreeTierModelRateLimit> = {
  [ACADEMY_TTS_PRIMARY_MODEL]: {
    rpm: 3,
    rpd: 10,
    minIntervalMs: 21_000,
    defaultIntervalMs: 22_000,
  },
  [ACADEMY_TTS_FALLBACK_MODEL]: {
    rpm: 3,
    rpd: 10,
    minIntervalMs: 21_000,
    defaultIntervalMs: 22_000,
  },
};

export function getFreeTierModelRateLimit(model: string): FreeTierModelRateLimit {
  return (
    FREE_TIER_TTS_MODEL_LIMITS[model] || {
      rpm: 3,
      rpd: 10,
      minIntervalMs: 21_000,
      defaultIntervalMs: 22_000,
    }
  );
}

/**
 * Computes the safest inter-request delay for a set of TTS models.
 * Never allows a 6.5s (6500ms) or faster interval when any selected model is limited to 3 RPM.
 */
export function computeStrictFreeTierBatchDelayMs(models: string[], requestedDelayMs?: number): number {
  const effectiveModels = models.length > 0 ? models : [ACADEMY_TTS_PRIMARY_MODEL];
  let strictMinMs = 21_000;
  let strictDefaultMs = 22_000;
  for (const m of effectiveModels) {
    const lim = getFreeTierModelRateLimit(m);
    if (lim.minIntervalMs > strictMinMs) strictMinMs = lim.minIntervalMs;
    if (lim.defaultIntervalMs > strictDefaultMs) strictDefaultMs = lim.defaultIntervalMs;
  }
  const base = typeof requestedDelayMs === 'number' && Number.isFinite(requestedDelayMs) ? requestedDelayMs : strictDefaultMs;
  return Math.max(strictMinMs, base);
}

const PACIFIC_DATE_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Los_Angeles',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function getPacificDayKey(date: Date | number | string = Date.now()): string {
  const d = date instanceof Date ? date : new Date(date);
  return Number.isNaN(d.getTime()) ? '' : PACIFIC_DATE_FMT.format(d);
}

export interface AcademyQuotaRenewalState {
  quotaRenewed: boolean | 'UNKNOWN';
  knownQuotaResetAt: string | null;
  latest429At: string | null;
  remainingCooldownSeconds: number;
  strictRpmLimit: number;
  strictRpdLimitPerModel: number;
  minIntervalMs: number;
  defaultIntervalMs: number;
  reason: string;
}

export function computeQuotaRenewalState(
  items: AcademyAudioManifestItem[],
  nowMs = Date.now(),
): AcademyQuotaRenewalState {
  const strictMinMs = computeStrictFreeTierBatchDelayMs([ACADEMY_TTS_PRIMARY_MODEL, ACADEMY_TTS_FALLBACK_MODEL]);
  const primaryLim = getFreeTierModelRateLimit(ACADEMY_TTS_PRIMARY_MODEL);

  let latestResetMs = 0;
  let latest429Ms = 0;

  for (const item of items) {
    if (!item.lastError || !item.updatedAt) continue;
    const isDaily429 = /\b429\b|RESOURCE_EXHAUSTED|GenerateRequestsPerDay|PerDay/i.test(item.lastError);
    if (!isDaily429) continue;

    const updatedMs = Date.parse(item.updatedAt);
    if (!Number.isFinite(updatedMs)) continue;

    const retryMatch = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/i.exec(item.lastError);
    if (!retryMatch) continue;

    const retrySec = Number.parseFloat(retryMatch[1]);
    if (!Number.isFinite(retrySec) || retrySec <= 0) continue;

    const resetMs = updatedMs + Math.ceil(retrySec * 1000);
    if (resetMs > latestResetMs) {
      latestResetMs = resetMs;
    }
    if (updatedMs > latest429Ms) {
      latest429Ms = updatedMs;
    }
  }

  if (latestResetMs <= 0) {
    return {
      quotaRenewed: 'UNKNOWN',
      knownQuotaResetAt: null,
      latest429At: null,
      remainingCooldownSeconds: 0,
      strictRpmLimit: primaryLim.rpm,
      strictRpdLimitPerModel: primaryLim.rpd,
      minIntervalMs: primaryLim.minIntervalMs,
      defaultIntervalMs: strictMinMs,
      reason: 'No recorded daily 429 RetryInfo cooldown window found; model quota availability remains UNKNOWN until verified.',
    };
  }

  const remainingMs = Math.max(0, latestResetMs - nowMs);
  const resetIso = new Date(latestResetMs).toISOString();
  const latest429Iso = latest429Ms > 0 ? new Date(latest429Ms).toISOString() : null;

  if (remainingMs > 0) {
    return {
      quotaRenewed: false,
      knownQuotaResetAt: resetIso,
      latest429At: latest429Iso,
      remainingCooldownSeconds: Math.ceil(remainingMs / 1000),
      strictRpmLimit: primaryLim.rpm,
      strictRpdLimitPerModel: primaryLim.rpd,
      minIntervalMs: primaryLim.minIntervalMs,
      defaultIntervalMs: strictMinMs,
      reason: `Gemini Free Tier daily quota has NOT renewed yet. Recorded 429 RetryInfo resets at ${resetIso} (~${Math.ceil(remainingMs / 60_000)}m remaining).`,
    };
  }

  return {
    quotaRenewed: true,
    knownQuotaResetAt: resetIso,
    latest429At: latest429Iso,
    remainingCooldownSeconds: 0,
    strictRpmLimit: primaryLim.rpm,
    strictRpdLimitPerModel: primaryLim.rpd,
    minIntervalMs: primaryLim.minIntervalMs,
    defaultIntervalMs: strictMinMs,
    reason: `Recorded RetryInfo reset time (${resetIso}) has elapsed. Ready for paced Free Tier generation (${primaryLim.rpm} RPM / ${primaryLim.rpd} RPD).`,
  };
}

export interface AcademyMp3ValidationResult {
  valid: boolean;
  status: 'valid' | 'missing' | 'invalid';
  mimeType: string | null;
  bytes: number;
  durationSeconds: number | null;
  maxVolumeDb: number | null;
  reason?: string;
}

export async function probeAudioMaxVolumeDb(filePath: string): Promise<number | null> {
  try {
    const { stderr } = await execFileAsync(
      'ffmpeg',
      ['-hide_banner', '-nostats', '-i', filePath, '-af', 'volumedetect', '-f', 'null', '-'],
      { timeout: 10_000 },
    );
    const m = /max_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/i.exec(stderr || '');
    if (m) {
      const val = Number.parseFloat(m[1]);
      if (Number.isFinite(val)) return val;
    }
    if (/max_volume:\s*-inf\s*dB/i.test(stderr || '')) {
      return -120;
    }
  } catch (err) {
    const stderr = (err as { stderr?: string })?.stderr || '';
    const m = /max_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/i.exec(stderr);
    if (m) {
      const val = Number.parseFloat(m[1]);
      if (Number.isFinite(val)) return val;
    }
  }
  return null;
}

export async function validateAcademyMp3File(
  absPath: string,
  checkVolume = true,
): Promise<AcademyMp3ValidationResult> {
  if (!fs.existsSync(absPath)) {
    return {
      valid: false,
      status: 'missing',
      mimeType: null,
      bytes: 0,
      durationSeconds: null,
      maxVolumeDb: null,
      reason: 'MP3 file does not exist on disk.',
    };
  }

  const stat = fs.statSync(absPath);
  if (!stat.isFile() || stat.size < 1024 || stat.size > 5 * 1024 * 1024) {
    return {
      valid: false,
      status: 'invalid',
      mimeType: null,
      bytes: stat.size,
      durationSeconds: null,
      maxVolumeDb: null,
      reason: `MP3 size (${stat.size} bytes) is outside valid range (1KB–5MB).`,
    };
  }

  const fd = fs.openSync(absPath, 'r');
  const head = Buffer.alloc(16);
  try {
    fs.readSync(fd, head, 0, 16, 0);
  } finally {
    fs.closeSync(fd);
  }

  const magic = hasValidAudioMagicBytes(head);
  if (!magic.ok || magic.mimeType !== 'audio/mpeg') {
    return {
      valid: false,
      status: 'invalid',
      mimeType: magic.mimeType,
      bytes: stat.size,
      durationSeconds: null,
      maxVolumeDb: null,
      reason: `File signature is not audio/mpeg (detected=${magic.mimeType || 'unknown'}).`,
    };
  }

  const durationSeconds = await probeLocalAudioDurationSeconds(absPath);
  if (durationSeconds === null || durationSeconds < 0.2 || durationSeconds > 90) {
    return {
      valid: false,
      status: 'invalid',
      mimeType: 'audio/mpeg',
      bytes: stat.size,
      durationSeconds,
      maxVolumeDb: null,
      reason: `Measured duration (${durationSeconds ?? 'null'}s) is outside allowed range (0.2s–90s).`,
    };
  }

  let maxVolumeDb: number | null = null;
  if (checkVolume) {
    maxVolumeDb = await probeAudioMaxVolumeDb(absPath);
    if (maxVolumeDb !== null && maxVolumeDb <= -48) {
      return {
        valid: false,
        status: 'invalid',
        mimeType: 'audio/mpeg',
        bytes: stat.size,
        durationSeconds,
        maxVolumeDb,
        reason: `Audio appears silent (max_volume=${maxVolumeDb} dB).`,
      };
    }
  }

  return {
    valid: true,
    status: 'valid',
    mimeType: 'audio/mpeg',
    bytes: stat.size,
    durationSeconds,
    maxVolumeDb,
  };
}

export function loadExistingManifestFromDisk(): AcademyAudioManifestItem[] {
  if (!fs.existsSync(ACADEMY_MANIFEST_FILE)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(ACADEMY_MANIFEST_FILE, 'utf8')) as Partial<AcademyAudioManifestDocument>;
    return Array.isArray(raw.items) ? raw.items : [];
  } catch {
    return [];
  }
}

export function recomputeManifestCounts(items: AcademyAudioManifestItem[]): AcademyAudioManifestDocument {
  const arabicAssets = items.filter((i) => i.language === 'ar').length;
  const englishAssets = items.filter((i) => i.language === 'en').length;
  const readyCount = items.filter((i) => i.generationStatus === 'ready').length;
  const validCount = items.filter((i) => i.validationStatus === 'valid').length;
  const missingCount = items.filter((i) => i.validationStatus === 'missing' || i.validationStatus === 'pending').length;
  const invalidCount = items.filter((i) => i.validationStatus === 'invalid').length;
  const needsReviewCount = items.filter((i) => i.pronunciationReviewStatus === 'needs-review').length;
  const verifiedCorrectCount = items.filter((i) => i.pronunciationReviewStatus === 'verified-correct').length;

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    totalAssets: items.length,
    arabicAssets,
    englishAssets,
    readyCount,
    validCount,
    missingCount,
    invalidCount,
    needsReviewCount,
    verifiedCorrectCount,
    items,
  };
}

export function saveManifestAndClientLookup(doc: AcademyAudioManifestDocument): void {
  fs.mkdirSync(path.dirname(ACADEMY_MANIFEST_FILE), { recursive: true });
  const tmpManifest = `${ACADEMY_MANIFEST_FILE}.tmp`;
  fs.writeFileSync(tmpManifest, JSON.stringify(doc, null, 2));
  fs.renameSync(tmpManifest, ACADEMY_MANIFEST_FILE);

  // Build compact client lookup mapping only for valid assets (never fake unrecorded assets)
  const arMap: Record<string, string> = {};
  const enMap: Record<string, string> = {};
  for (const item of doc.items) {
    if (item.validationStatus === 'valid' && item.generationStatus === 'ready') {
      const key = normalizeAcademyAudioText(item.text);
      if (item.language === 'ar') {
        arMap[key] = item.assetId;
      } else {
        enMap[key] = item.assetId;
      }
    }
  }

  fs.mkdirSync(path.dirname(ACADEMY_LOOKUP_FILE), { recursive: true });
  const tmpLookup = `${ACADEMY_LOOKUP_FILE}.tmp`;
  fs.writeFileSync(tmpLookup, JSON.stringify({ ar: arMap, en: enMap }, null, 2));
  fs.renameSync(tmpLookup, ACADEMY_LOOKUP_FILE);
}

export async function syncAndValidateAcademyManifest(opts?: {
  checkVolume?: boolean;
  migrateLegacy?: boolean;
}): Promise<AcademyAudioManifestDocument> {
  fs.mkdirSync(ACADEMY_AUDIO_AR_DIR, { recursive: true });
  fs.mkdirSync(ACADEMY_AUDIO_EN_DIR, { recursive: true });

  const prev = loadExistingManifestFromDisk();
  const doc = buildFullAcademyAudioManifest(prev);
  const checkVolume = opts?.checkVolume !== false;
  const migrateLegacy = opts?.migrateLegacy !== false;

  for (const item of doc.items) {
    const destPath = path.resolve(process.cwd(), item.mp3Path);

    // Preserve & reuse any already-generated valid legacy file matching legacyCacheKey
    if (migrateLegacy && !fs.existsSync(destPath)) {
      const legacyMp3 = path.join(ACADEMY_AUDIO_ROOT_DIR, `${item.legacyCacheKey}.mp3`);
      if (fs.existsSync(legacyMp3)) {
        const legacyCheck = await validateAcademyMp3File(legacyMp3, true);
        if (legacyCheck.valid) {
          fs.mkdirSync(path.dirname(destPath), { recursive: true });
          fs.copyFileSync(legacyMp3, destPath);
        }
      }
    }

    if (!fs.existsSync(destPath)) {
      item.generationStatus = item.generationStatus === 'failed' ? 'failed' : 'pending';
      item.validationStatus = 'missing';
      item.bytes = 0;
      item.durationSeconds = null;
      item.maxVolumeDb = null;
      continue;
    }

    // Fast path: if already validated & size matches on disk, skip heavy ffprobe/ffmpeg unless forced
    const stat = fs.statSync(destPath);
    if (
      !checkVolume &&
      item.validationStatus === 'valid' &&
      item.generationStatus === 'ready' &&
      item.bytes === stat.size &&
      stat.size >= 1024
    ) {
      continue;
    }

    const res = await validateAcademyMp3File(destPath, checkVolume);
    if (res.valid) {
      item.generationStatus = 'ready';
      item.validationStatus = 'valid';
      item.bytes = res.bytes;
      item.durationSeconds = res.durationSeconds;
      if (res.maxVolumeDb !== null) item.maxVolumeDb = res.maxVolumeDb;
      item.lastError = undefined;
    } else {
      item.generationStatus = 'failed';
      item.validationStatus = res.status;
      item.bytes = res.bytes;
      item.durationSeconds = res.durationSeconds;
      item.maxVolumeDb = res.maxVolumeDb;
      item.lastError = res.reason;
    }
  }

  const finalDoc = recomputeManifestCounts(doc.items);
  saveManifestAndClientLookup(finalDoc);
  return finalDoc;
}

function wrapPcmOrAudioToBuffer(base64Audio: string, mimeType?: string): { buffer: Buffer; mimeType: string } {
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

function parseTtsError(err: unknown): {
  isQuota429: boolean;
  isDailyExhausted: boolean;
  isTransient: boolean;
  isFatalAuth: boolean;
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
  const isQuota429 = /\b429\b|RESOURCE_EXHAUSTED|quota|rate.?limit/i.test(redacted);
  const quotaIds = [...redacted.matchAll(/"quotaId"\s*:\s*"([^"]+)"/g)].map((m) => m[1]);
  const hasPerMin = quotaIds.some((id) => /PerMinute/i.test(id));
  const hasPerDay =
    quotaIds.some((id) => /PerDay/i.test(id)) ||
    (/GenerateRequestsPerDay|RequestsPerDay/i.test(redacted) && !hasPerMin);
  const isDailyExhausted = isQuota429 && hasPerDay && !hasPerMin;

  let retryDelayMs = 12_000;
  const r1 = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/i.exec(redacted);
  const r2 = /retry\s+in\s+(\d+(?:\.\d+)?)s/i.exec(redacted);
  const sec = Number(r1?.[1] || r2?.[1] || 0);
  if (Number.isFinite(sec) && sec > 0) {
    retryDelayMs = Math.min(75_000, Math.max(4_000, Math.ceil((sec + 1.5) * 1000)));
  }

  const isTransient =
    isQuota429 ||
    /\b500\b|\b502\b|\b503\b|\b504\b|UNAVAILABLE|timeout|abort|ECONNRESET|ETIMEDOUT|fetch failed/i.test(redacted);

  const quotaMetric = quotaIds.length ? `quota=[${quotaIds.join(',')}] ` : '';
  return {
    isQuota429,
    isDailyExhausted,
    isTransient,
    isFatalAuth,
    retryDelayMs,
    summary: `${quotaMetric}${redacted}`.slice(0, 1500),
  };
}

const ENGLISH_LETTER_TRANSCRIPT_ALIASES: Record<string, string[]> = {
  A: ['a', 'ay', 'eh'],
  B: ['b', 'be', 'bee'],
  C: ['c', 'see', 'sea'],
  D: ['d', 'dee'],
  E: ['e', 'ee'],
  F: ['f', 'ef'],
  G: ['g', 'gee', 'jee'],
  H: ['h', 'aitch', 'aych', 'ach'],
  I: ['i', 'eye'],
  J: ['j', 'jay'],
  K: ['k', 'kay'],
  L: ['l', 'el'],
  M: ['m', 'em'],
  N: ['n', 'en'],
  O: ['o', 'oh'],
  P: ['p', 'pee'],
  Q: ['q', 'cue', 'queue'],
  R: ['r', 'ar', 'are'],
  S: ['s', 'ess'],
  T: ['t', 'tee', 'tea'],
  U: ['u', 'you'],
  V: ['v', 'vee'],
  W: ['w', 'double u', 'double you'],
  X: ['x', 'ex'],
  Y: ['y', 'why'],
  Z: ['z', 'zee', 'zed'],
};

function normalizeArabicForLetterMatch(raw: string): string {
  return String(raw || '')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\u0621-\u064A\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchesExpectedSpokenLetterTranscript(
  transcript: string,
  spec: AcademyTtsPromptSpec,
  language: AcademyAudioLang,
): { ok: boolean; reason?: string } {
  if (!spec.isLetterAsset) {
    return { ok: true };
  }

  const raw = String(transcript || '').trim();
  if (!raw) {
    return { ok: false, reason: 'Empty spoken letter transcription.' };
  }

  if (language === 'ar' && spec.expectedArabicLetterBaseName) {
    const normTranscript = normalizeArabicForLetterMatch(raw);
    const normExpected = normalizeArabicForLetterMatch(spec.expectedArabicLetterBaseName);
    const normChar = normalizeArabicForLetterMatch(spec.expectedLetterDisplay || '');
    const truncated = normExpected.endsWith('ء') ? normExpected.slice(0, -1) : normExpected;

    const acceptedPhrases = new Set<string>([
      normExpected,
      `ال${normExpected}`,
      `حرف ${normExpected}`,
      `حرف ال${normExpected}`,
      ...(truncated.length >= 2 ? [`حرف ${truncated}`, `حرف ال${truncated}`] : []),
      ...(normChar ? [`حرف ${normChar}`, `حرف ال${normChar}`] : []),
    ]);

    if (acceptedPhrases.has(normTranscript)) {
      return { ok: true };
    }
    const tokens = normTranscript.split(' ').filter(Boolean);
    const hasHarf = tokens.includes('حرف');
    const matchesToken =
      tokens.length <= 4 &&
      tokens.some(
        (t) =>
          t === normExpected ||
          t === `ال${normExpected}` ||
          (hasHarf && truncated.length >= 2 && (t === truncated || t === `ال${truncated}`)),
      );
    if (matchesToken || (tokens.length <= 4 && hasHarf && normChar && tokens.includes(normChar))) {
      return { ok: true };
    }
    return {
      ok: false,
      reason: `Spoken Arabic letter mismatch: expected "${spec.promptText}", heard "${raw}".`,
    };
  }

  if (language === 'en' && spec.expectedEnglishLetterUpper) {
    const upper = spec.expectedEnglishLetterUpper.toUpperCase();
    const normTranscript = raw
      .toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const aliases = ENGLISH_LETTER_TRANSCRIPT_ALIASES[upper] || [upper.toLowerCase()];
    const accepted = new Set<string>();
    for (const a of aliases) {
      accepted.add(a);
      accepted.add(`letter ${a}`);
      accepted.add(`the letter ${a}`);
    }
    if (spec.expectedEnglishNameSound) {
      const ns = spec.expectedEnglishNameSound.toLowerCase().replace(/[^a-z\s]/g, ' ').trim();
      accepted.add(ns);
      accepted.add(`letter ${ns}`);
      accepted.add(`the letter ${ns}`);
    }
    if (accepted.has(normTranscript)) {
      return { ok: true };
    }
    for (const phrase of accepted) {
      if (
        normTranscript.startsWith(`the letter ${phrase}`) ||
        normTranscript.startsWith(`letter ${phrase}`) ||
        normTranscript === phrase
      ) {
        return { ok: true };
      }
    }
    return {
      ok: false,
      reason: `Spoken English letter mismatch: expected "${spec.promptText}", heard "${raw}".`,
    };
  }

  return { ok: true };
}

export type LetterTranscribeFn = (params: {
  mp3Path: string;
  language: AcademyAudioLang;
}) => Promise<string>;

export const ACADEMY_LETTER_TRANSCRIBE_MODELS = ['gemini-3.5-transcribe', 'gemini-4-hydrogen'] as const;

async function defaultTranscribeLetterAudio(params: {
  mp3Path: string;
  language: AcademyAudioLang;
}): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw Object.assign(new Error('GEMINI_API_KEY not configured for letter transcription check.'), {
      status: 401,
    });
  }
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });
  const base64Audio = fs.readFileSync(params.mp3Path).toString('base64');
  const instruction =
    params.language === 'ar'
      ? 'Transcribe the exact Arabic spoken phrase in this audio verbatim without adding explanations.'
      : 'Transcribe the exact English spoken phrase in this audio verbatim without adding explanations.';

  let lastErr: unknown;
  for (const model of ACADEMY_LETTER_TRANSCRIBE_MODELS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType: 'audio/mpeg', data: base64Audio } },
              { text: instruction },
            ],
          },
        ],
        config: { abortSignal: controller.signal },
      });
      const text = String(response.text || '').trim();
      if (text) return text;
    } catch (err) {
      lastErr = err;
      const diag = parseTtsError(err);
      if (diag.isQuota429 || diag.isFatalAuth) {
        throw err;
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Letter audio transcription returned empty text.');
}

export async function validateGeneratedLetterPronunciation(
  mp3Path: string,
  item: Pick<AcademyAudioManifestItem, 'text' | 'language' | 'activityOrStageIds'>,
  durationSeconds: number | null,
  opts?: { transcribeFn?: LetterTranscribeFn },
): Promise<{
  ok: true;
  pronunciationReviewStatus: PronunciationReviewStatus;
  transcript?: string;
} | {
  ok: false;
  isQuota429: boolean;
  isFatalAuth: boolean;
  reason: string;
}> {
  const promptSpec = resolveAcademyTtsPromptSpec(item);
  if (!promptSpec.isLetterAsset) {
    return { ok: true, pronunciationReviewStatus: 'not-applicable' };
  }

  // Ensure isolated single-character prompt was never sent directly
  if (item.language === 'ar' && !promptSpec.promptText.startsWith('حرف ال')) {
    return {
      ok: false,
      isQuota429: false,
      isFatalAuth: false,
      reason: `Unsafe Arabic letter prompt "${promptSpec.promptText}" lacks explicit "حرف ال..." context.`,
    };
  }
  if (item.language === 'en' && !/^The letter [A-Z]\.$/.test(promptSpec.promptText)) {
    return {
      ok: false,
      isQuota429: false,
      isFatalAuth: false,
      reason: `Unsafe English letter prompt "${promptSpec.promptText}" lacks explicit "The letter X." context.`,
    };
  }

  if (durationSeconds === null || durationSeconds < 0.45 || durationSeconds > 15) {
    return {
      ok: false,
      isQuota429: false,
      isFatalAuth: false,
      reason: `Letter phrase audio duration (${durationSeconds ?? 'null'}s) is outside valid spoken-letter range (0.45s–15s).`,
    };
  }

  try {
    const transcribe = opts?.transcribeFn || defaultTranscribeLetterAudio;
    const transcript = await transcribe({ mp3Path, language: item.language });
    const match = matchesExpectedSpokenLetterTranscript(transcript, promptSpec, item.language);
    if (!match.ok) {
      return {
        ok: false,
        isQuota429: false,
        isFatalAuth: false,
        reason: match.reason || 'Spoken letter verification mismatch.',
      };
    }
    return {
      ok: true,
      pronunciationReviewStatus: 'verified-correct',
      transcript,
    };
  } catch (err) {
    const diag = parseTtsError(err);
    return {
      ok: false,
      isQuota429: diag.isQuota429,
      isFatalAuth: diag.isFatalAuth,
      reason: `Spoken letter validation failed: ${diag.summary}`,
    };
  }
}

export async function generateAcademyAudioItem(
  item: AcademyAudioManifestItem,
  opts?: {
    preferredModel?: string;
    skipModels?: Set<string>;
    stopOn429?: boolean;
    transcribeFn?: LetterTranscribeFn;
  },
): Promise<{
  ok: true;
  model: string;
  bytes: number;
  durationSeconds: number | null;
  maxVolumeDb: number | null;
  ttsPromptText: string;
  pronunciationReviewStatus: PronunciationReviewStatus;
} | {
  ok: false;
  isQuota429: boolean;
  isDailyExhausted: boolean;
  isFatalAuth: boolean;
  retryDelayMs: number;
  dailyExhaustedModels: string[];
  error: string;
}> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      isQuota429: false,
      isDailyExhausted: false,
      isFatalAuth: true,
      retryDelayMs: 0,
      dailyExhaustedModels: [],
      error: 'GEMINI_API_KEY not configured.',
    };
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });

  const baseOrder = opts?.preferredModel
    ? Array.from(new Set([opts.preferredModel, ACADEMY_TTS_PRIMARY_MODEL, ACADEMY_TTS_FALLBACK_MODEL]))
    : [ACADEMY_TTS_PRIMARY_MODEL, ACADEMY_TTS_FALLBACK_MODEL];
  const models = opts?.skipModels?.size
    ? baseOrder.filter((m) => !opts.skipModels!.has(m))
    : baseOrder;

  if (models.length === 0) {
    return {
      ok: false,
      isQuota429: true,
      isDailyExhausted: true,
      isFatalAuth: false,
      retryDelayMs: 0,
      dailyExhaustedModels: baseOrder,
      error: 'All configured TTS models reached daily quota limit.',
    };
  }

  const stopOn429 = opts?.stopOn429 !== false;
  const promptSpec = resolveAcademyTtsPromptSpec(item);
  const ttsInputText = promptSpec.promptText;
  const isNumberItem = item.screens.includes('AcademyScreen:numbers');

  const style =
    item.language === 'ar'
      ? promptSpec.isLetterAsset
        ? 'Warm, gentle, consistent Egyptian-friendly Arabic early-childhood teacher voice for ages 1 to 4. Pronounce the Arabic letter-name phrase clearly and naturally, with no extra commentary, no chanting, and no long pauses.'
        : isNumberItem
          ? 'Warm, gentle, consistent Arabic early-childhood teacher voice for ages 1 to 4. Say ONLY this Arabic number clearly and naturally, with no extra commentary.'
          : 'Warm, gentle, consistent, child-directed Egyptian-friendly Arabic early-childhood teacher voice for ages 1 to 4. Clear, cheerful articulation, no long pauses, never chanting or Quran recitation.'
      : promptSpec.isLetterAsset
        ? 'Warm, cheerful, natural English early-childhood teacher voice for ages 1 to 4. Pronounce the English letter phrase clearly and distinctly, with no extra commentary or pauses.'
        : isNumberItem
          ? 'Warm, cheerful, natural English early-childhood teacher voice for ages 1 to 4. Say ONLY this English number clearly and naturally, with no extra commentary.'
          : 'Warm, cheerful, natural, consistent English early-childhood teacher voice for ages 1 to 4. Clear phonics and gentle pacing, no long pauses.';

  let lastDiag = {
    isQuota429: false,
    isDailyExhausted: false,
    isFatalAuth: false,
    retryDelayMs: 5000,
    summary: 'Synthesis did not complete.',
  };
  const dailyExhaustedModels: string[] = [];

  for (const model of models) {
    const modelLim = getFreeTierModelRateLimit(model);
    const lastAt = lastTtsRequestAtByModel.get(model) || 0;
    const elapsedSinceLast = Date.now() - lastAt;
    if (lastAt > 0 && elapsedSinceLast < modelLim.minIntervalMs) {
      await new Promise((r) => setTimeout(r, modelLim.minIntervalMs - elapsedSinceLast));
    }
    lastTtsRequestAtByModel.set(model, Date.now());

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 28_000);
    try {
      const partPayload = /^gemini-3\.8-/i.test(model)
        ? { text: ttsInputText, speechMetadata: { style } }
        : { text: `${item.language === 'ar' ? 'انطق بلطف ووضوح للأطفال' : 'Speak clearly and warmly for a young child'}: ${ttsInputText}` };
      const response = await ai.models.generateContent({
        model,
        contents: [
          {
            role: 'user',
            parts: [partPayload],
          },
        ],
        config: {
          abortSignal: controller.signal,
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: ACADEMY_TTS_VOICE },
            },
          },
        },
      });

      const parts = response.candidates?.[0]?.content?.parts || [];
      const inline = parts.find((p) => Boolean(p?.inlineData?.data))?.inlineData;
      if (!inline?.data) {
        lastDiag = {
          isQuota429: false,
          isDailyExhausted: false,
          isFatalAuth: false,
          retryDelayMs: 2500,
          summary: `Model ${model} returned empty audio payload.`,
        };
        continue;
      }

      const wrapped = wrapPcmOrAudioToBuffer(inline.data, inline.mimeType);
      if (wrapped.buffer.length < 256) {
        lastDiag = {
          isQuota429: false,
          isDailyExhausted: false,
          isFatalAuth: false,
          retryDelayMs: 2500,
          summary: `Model ${model} returned undersized buffer (${wrapped.buffer.length} bytes).`,
        };
        continue;
      }

      const destPath = path.resolve(process.cwd(), item.mp3Path);
      const tmpDest = path.join(path.dirname(destPath), `.tmp-${crypto.randomUUID()}.mp3`);
      await transcodeAudioBufferToMp3File(wrapped.buffer, tmpDest, wrapped.mimeType);
      const val = await validateAcademyMp3File(tmpDest, true);
      if (!val.valid) {
        if (fs.existsSync(tmpDest)) fs.unlinkSync(tmpDest);
        lastDiag = {
          isQuota429: false,
          isDailyExhausted: false,
          isFatalAuth: false,
          retryDelayMs: 2500,
          summary: val.reason || 'Generated MP3 failed audio/silence validation.',
        };
        continue;
      }

      let pronunciationReviewStatus: PronunciationReviewStatus = 'not-applicable';
      if (promptSpec.isLetterAsset) {
        const letterCheck = await validateGeneratedLetterPronunciation(
          tmpDest,
          item,
          val.durationSeconds,
          { transcribeFn: opts?.transcribeFn },
        );
        if (!letterCheck.ok) {
          if (fs.existsSync(tmpDest)) fs.unlinkSync(tmpDest);
          lastDiag = {
            isQuota429: letterCheck.isQuota429,
            isDailyExhausted: letterCheck.isQuota429,
            isFatalAuth: letterCheck.isFatalAuth,
            retryDelayMs: 2500,
            summary: letterCheck.reason,
          };
          if (letterCheck.isFatalAuth || (letterCheck.isQuota429 && stopOn429)) {
            break;
          }
          continue;
        }
        pronunciationReviewStatus = letterCheck.pronunciationReviewStatus;
      }

      fs.renameSync(tmpDest, destPath);
      return {
        ok: true,
        model,
        bytes: val.bytes,
        durationSeconds: val.durationSeconds,
        maxVolumeDb: val.maxVolumeDb,
        ttsPromptText: ttsInputText,
        pronunciationReviewStatus,
      };
    } catch (err) {
      const diag = parseTtsError(err);
      lastDiag = {
        ...diag,
        summary: `[${model}] ${diag.summary}`,
      };
      if (diag.isDailyExhausted) {
        dailyExhaustedModels.push(model);
      }
      if (diag.isFatalAuth || (diag.isQuota429 && stopOn429)) break;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    ok: false,
    isQuota429: lastDiag.isQuota429,
    isDailyExhausted:
      lastDiag.isDailyExhausted ||
      (dailyExhaustedModels.length > 0 && dailyExhaustedModels.length >= models.length),
    isFatalAuth: lastDiag.isFatalAuth,
    retryDelayMs: lastDiag.retryDelayMs,
    dailyExhaustedModels,
    error: lastDiag.summary,
  };
}

export interface AcademyBatchStatus {
  running: boolean;
  state: 'idle' | 'running' | 'completed' | 'partial' | 'failed';
  startedAt: string | null;
  finishedAt: string | null;
  totalAssets: number;
  validCount: number;
  pendingCount: number;
  failedCount: number;
  attemptedThisRun: number;
  succeededThisRun: number;
  currentAssetId: string | null;
  currentText: string | null;
  activeModel: string;
  delayMs: number;
  lastError: string | null;
}

const batchStatus: AcademyBatchStatus = {
  running: false,
  state: 'idle',
  startedAt: null,
  finishedAt: null,
  totalAssets: 0,
  validCount: 0,
  pendingCount: 0,
  failedCount: 0,
  attemptedThisRun: 0,
  succeededThisRun: 0,
  currentAssetId: null,
  currentText: null,
  activeModel: ACADEMY_TTS_PRIMARY_MODEL,
  delayMs: 22_000,
  lastError: null,
};

let activeBatchPromise: Promise<AcademyBatchStatus> | null = null;
let stopRequested = false;
const lastTtsRequestAtByModel = new Map<string, number>();

export function getAcademyBatchStatus(): AcademyBatchStatus {
  return { ...batchStatus };
}

export function requestStopAcademyBatch(): void {
  stopRequested = true;
}

export interface NonConsumingModelAvailabilityEntry {
  model: string;
  tier: 'free-tier-confirmed' | 'unconfirmed';
  available: 'UNKNOWN';
  outcome: 'UNKNOWN';
  quotaStatus: 'UNKNOWN';
  nonConsuming: true;
  listedInCatalog: boolean | 'UNKNOWN';
  supportedActions?: string[];
  detail: string;
}

/**
 * Non-consuming model availability diagnosis.
 * NEVER sends `generateContent` or TTS synthesis requests to probe quota/availability.
 * Uses only `ai.models.list` metadata when GEMINI_API_KEY is present and reports
 * per-model quota availability as `UNKNOWN` rather than consuming Free Tier requests.
 */
export async function diagnoseGeminiTtsAvailability(): Promise<{
  configured: boolean;
  nonConsuming: true;
  probeMethod: 'metadata_only_no_generation';
  quotaMetadataApiAvailable: false;
  quotaRenewalGate: AcademyQuotaRenewalState;
  listedTtsAndAudioModels: Array<{
    name: string;
    displayName?: string;
    supportedActions?: string[];
  }>;
  modelProbes: NonConsumingModelAvailabilityEntry[];
}> {
  const apiKey = process.env.GEMINI_API_KEY;
  const candidateModels: Array<{ model: string; tier: 'free-tier-confirmed' | 'unconfirmed' }> = [
    { model: ACADEMY_TTS_PRIMARY_MODEL, tier: 'free-tier-confirmed' },
    { model: ACADEMY_TTS_FALLBACK_MODEL, tier: 'free-tier-confirmed' },
  ];

  if (!apiKey) {
    const manifestItems = loadExistingManifestFromDisk();
    return {
      configured: false,
      nonConsuming: true,
      probeMethod: 'metadata_only_no_generation',
      quotaMetadataApiAvailable: false,
      quotaRenewalGate: computeQuotaRenewalState(manifestItems),
      listedTtsAndAudioModels: [],
      modelProbes: candidateModels.map(({ model, tier }) => ({
        model,
        tier,
        available: 'UNKNOWN',
        outcome: 'UNKNOWN',
        quotaStatus: 'UNKNOWN',
        nonConsuming: true,
        listedInCatalog: 'UNKNOWN',
        detail: 'GEMINI_API_KEY is not configured; availability is UNKNOWN (no generation probe sent).',
      })),
    };
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });

  const listedTtsAndAudioModels: Array<{
    name: string;
    displayName?: string;
    supportedActions?: string[];
  }> = [];
  const catalogById = new Map<string, { supportedActions?: string[] }>();
  let catalogListed = false;

  try {
    const pager = await ai.models.list({ config: { pageSize: 100 } });
    catalogListed = true;
    for await (const m of pager) {
      const fullName = String(m.name || '');
      const shortName = fullName.replace(/^models\//, '');
      catalogById.set(shortName, { supportedActions: m.supportedActions });
      if (/tts|audio|live|3\.8-flash|2\.5-flash/i.test(fullName)) {
        listedTtsAndAudioModels.push({
          name: fullName,
          displayName: m.displayName,
          supportedActions: m.supportedActions,
        });
      }
    }
  } catch (err) {
    listedTtsAndAudioModels.push({
      name: 'LIST_ERROR',
      displayName: parseTtsError(err).summary.slice(0, 300),
    });
  }

  const modelProbes: NonConsumingModelAvailabilityEntry[] = candidateModels.map(({ model, tier }) => {
    const catalogEntry = catalogById.get(model);
    const listedInCatalog: boolean | 'UNKNOWN' = catalogListed ? Boolean(catalogEntry) : 'UNKNOWN';
    return {
      model,
      tier,
      available: 'UNKNOWN',
      outcome: 'UNKNOWN',
      quotaStatus: 'UNKNOWN',
      nonConsuming: true,
      listedInCatalog,
      ...(catalogEntry?.supportedActions ? { supportedActions: catalogEntry.supportedActions } : {}),
      detail:
        'No non-consuming Gemini Free Tier quota metadata API is available. Availability reported as UNKNOWN without sending generateContent or TTS requests.',
    };
  });

  const manifestItems = loadExistingManifestFromDisk();
  const quotaRenewalGate = computeQuotaRenewalState(manifestItems);

  return {
    configured: true,
    nonConsuming: true,
    probeMethod: 'metadata_only_no_generation',
    quotaMetadataApiAvailable: false,
    quotaRenewalGate,
    listedTtsAndAudioModels,
    modelProbes,
  };
}

function getAcademyItemPriorityScore(item: AcademyAudioManifestItem): number {
  const len = item.text.length;
  const screens = item.screens;
  const stages = item.activityOrStageIds;

  // 1. Arabic and English alphabet
  if (screens.includes('AcademyScreen:arabic') && stages.includes('letter-name')) {
    return 100 + len;
  }
  if (screens.includes('AcademyScreen:english') && stages.includes('letter-upper')) {
    return 115 + len;
  }
  if (screens.includes('AcademyScreen:arabic') && stages.includes('letter-char')) {
    return 130 + len;
  }
  if (screens.includes('AcademyScreen:english') && stages.includes('letter-lower')) {
    return 145 + len;
  }

  // 2. Arabic and English numbers
  if (screens.includes('AcademyScreen:numbers')) {
    return 200 + len;
  }

  // 3. Colors and shapes
  if (
    screens.includes('AcademyScreen:colors-shapes') &&
    (stages.includes('color-card') || stages.includes('shape-card'))
  ) {
    return 300 + len;
  }
  if (screens.includes('AcademyScreen:colors-shapes')) {
    return 330 + len;
  }

  // 4. Basic vocabulary and animal/object names
  if (stages.some((s) => s === 'letter-word' || s === 'letter-word-pair' || s === 'cvc-builder')) {
    return 400 + len;
  }
  if (stages.some((s) => s.startsWith('vocab-'))) {
    return 440 + len;
  }

  // 5. Core Level 1 lesson instructions and questions
  if (
    screens.includes('Level1LessonRunner') &&
    stages.some(
      (s) =>
        s === 'stage5-listen-select' ||
        s === 'stage3-normal-title' ||
        s === 'stage3-slow-cue' ||
        s === 'stage1-intro' ||
        s === 'stage2-explanation',
    )
  ) {
    return 500 + Math.min(90, len);
  }
  if (screens.includes('Level1LessonRunner:stage10')) {
    return 560 + Math.min(90, len);
  }

  // 6. Remaining Level 1 lessons & Daily Path
  if (screens.includes('Level1LessonRunner') || screens.includes('AcademyScreen:daily')) {
    return 650 + Math.min(90, len);
  }

  // 7. Deep Journey modules
  if (screens.some((s) => s.startsWith('DeepLessonEngine:'))) {
    return 750 + Math.min(90, len);
  }

  // 8. Exams and remaining Academy content
  return 850 + Math.min(90, len);
}

export function getNextAcademyResumeItem(
  items: AcademyAudioManifestItem[],
  opts?: { language?: 'ar' | 'en'; minTextLength?: number },
): AcademyAudioManifestItem | null {
  const minLen = typeof opts?.minTextLength === 'number' ? Math.max(1, opts.minTextLength) : 1;
  const pending = items
    .filter(
      (i) =>
        i.validationStatus !== 'valid' &&
        (!opts?.language || i.language === opts.language) &&
        i.text.length >= minLen,
    )
    .sort((a, b) => getAcademyItemPriorityScore(a) - getAcademyItemPriorityScore(b));
  return pending[0] || null;
}

export async function startAcademyAudioBatchGeneration(opts?: {
  limit?: number;
  delayMs?: number;
  validateExisting?: boolean;
  preferredModel?: string;
  singleModelOnly?: boolean;
  stopOn429?: boolean;
  language?: 'ar' | 'en';
  minTextLength?: number;
}): Promise<AcademyBatchStatus> {
  if (activeBatchPromise) {
    return activeBatchPromise;
  }

  stopRequested = false;
  activeBatchPromise = (async () => {
    batchStatus.running = true;
    batchStatus.state = 'running';
    batchStatus.startedAt = new Date().toISOString();
    batchStatus.finishedAt = null;
    batchStatus.attemptedThisRun = 0;
    batchStatus.succeededThisRun = 0;
    batchStatus.lastError = null;
    // Strict RPM floor (>= 21,000ms, default 22,000ms) for 3-RPM Free Tier TTS models — never 6.5s
    const confirmedFreeTierModels = new Set([ACADEMY_TTS_PRIMARY_MODEL, ACADEMY_TTS_FALLBACK_MODEL]);
    let preferredModel =
      opts?.preferredModel && confirmedFreeTierModels.has(opts.preferredModel)
        ? opts.preferredModel
        : ACADEMY_TTS_PRIMARY_MODEL;
    const activeModels = opts?.singleModelOnly
      ? [preferredModel]
      : [ACADEMY_TTS_PRIMARY_MODEL, ACADEMY_TTS_FALLBACK_MODEL];
    batchStatus.delayMs = computeStrictFreeTierBatchDelayMs(activeModels, opts?.delayMs);

    try {
      const doc = await syncAndValidateAcademyManifest({
        checkVolume: Boolean(opts?.validateExisting),
        migrateLegacy: true,
      });

      const refreshCounts = (items: AcademyAudioManifestItem[]) => {
        batchStatus.totalAssets = items.length;
        batchStatus.validCount = items.filter((i) => i.validationStatus === 'valid').length;
        batchStatus.failedCount = items.filter((i) => i.validationStatus === 'invalid' || i.generationStatus === 'failed').length;
        batchStatus.pendingCount = items.filter((i) => i.validationStatus !== 'valid').length;
      };

      refreshCounts(doc.items);

      // Do not consume quota before recorded daily RetryInfo reset timestamp
      const quotaGate = computeQuotaRenewalState(doc.items);
      if (quotaGate.quotaRenewed === false) {
        batchStatus.state = 'partial';
        batchStatus.lastError = quotaGate.reason;
        batchStatus.finishedAt = new Date().toISOString();
        batchStatus.currentAssetId = null;
        batchStatus.currentText = null;
        return getAcademyBatchStatus();
      }

      // Prioritize strictly by curriculum order (alphabet -> numbers -> colors/shapes -> vocab -> Level 1 -> Deep -> Exams)
      const minLen = typeof opts?.minTextLength === 'number' ? Math.max(1, opts.minTextLength) : 1;
      const queue = doc.items
        .filter(
          (i) =>
            i.validationStatus !== 'valid' &&
            (!opts?.language || i.language === opts.language) &&
            i.text.length >= minLen,
        )
        .sort((a, b) => getAcademyItemPriorityScore(a) - getAcademyItemPriorityScore(b));

      const maxToProcess = opts?.limit && opts.limit > 0 ? Math.min(queue.length, opts.limit) : queue.length;

      const skipModels = new Set<string>();
      if (opts?.singleModelOnly) {
        for (const m of confirmedFreeTierModels) {
          if (m !== preferredModel) skipModels.add(m);
        }
      }

      // Track per-model daily requests in current Pacific day to enforce strict RPD cap
      const todayPacific = getPacificDayKey();
      const dailyCountByModel = new Map<string, number>();
      for (const m of confirmedFreeTierModels) {
        const usedToday = doc.items.filter(
          (i) => i.model === m && i.updatedAt && getPacificDayKey(i.updatedAt) === todayPacific,
        ).length;
        dailyCountByModel.set(m, usedToday);
        if (usedToday >= getFreeTierModelRateLimit(m).rpd) {
          skipModels.add(m);
        }
      }
      const stopOn429 = opts?.stopOn429 !== false; // Strict default: stop & save progress on HTTP 429

      for (let idx = 0; idx < maxToProcess; idx++) {
        if (stopRequested) break;
        const item = queue[idx];
        const absPath = path.resolve(process.cwd(), item.mp3Path);

        // Resume safety: never overwrite or regenerate if valid on disk
        if (fs.existsSync(absPath)) {
          const check = await validateAcademyMp3File(absPath, true);
          if (check.valid) {
            item.generationStatus = 'ready';
            item.validationStatus = 'valid';
            item.bytes = check.bytes;
            item.durationSeconds = check.durationSeconds;
            if (check.maxVolumeDb !== null) item.maxVolumeDb = check.maxVolumeDb;
            item.lastError = undefined;
            refreshCounts(doc.items);
            continue;
          }
        }

        // Stop gracefully if all active Free Tier models reached their strict RPD cap
        const availableActive = activeModels.filter((m) => !skipModels.has(m));
        if (availableActive.length === 0) {
          batchStatus.state = 'partial';
          batchStatus.lastError = `Strict Free Tier RPD cap (${getFreeTierModelRateLimit(preferredModel).rpd}/day per model) reached for active models; stopping before exceeding daily limit.`;
          break;
        }
        if (skipModels.has(preferredModel)) {
          preferredModel = availableActive[0];
        }

        batchStatus.currentAssetId = item.assetId;
        batchStatus.currentText = item.text;
        batchStatus.activeModel = preferredModel;

        batchStatus.attemptedThisRun++;
        dailyCountByModel.set(preferredModel, (dailyCountByModel.get(preferredModel) || 0) + 1);
        const res = await generateAcademyAudioItem(item, {
          preferredModel,
          skipModels,
          stopOn429,
        });
        const actualModelUsed = res.ok ? res.model : preferredModel;
        if (dailyCountByModel.get(actualModelUsed)! >= getFreeTierModelRateLimit(actualModelUsed).rpd) {
          skipModels.add(actualModelUsed);
        }

        if (res.ok) {
          item.generationStatus = 'ready';
          item.validationStatus = 'valid';
          item.ttsPromptText = res.ttsPromptText;
          item.pronunciationReviewStatus = res.pronunciationReviewStatus;
          item.pronunciationReviewReason = undefined;
          item.bytes = res.bytes;
          item.durationSeconds = res.durationSeconds;
          item.maxVolumeDb = res.maxVolumeDb;
          item.model = res.model;
          item.voiceName = ACADEMY_TTS_VOICE;
          item.lastError = undefined;
          item.updatedAt = new Date().toISOString();
          batchStatus.succeededThisRun++;
          batchStatus.lastError = null;
          if (res.model !== preferredModel && !opts?.singleModelOnly) {
            preferredModel = res.model;
          }
        } else {
          item.generationStatus = 'failed';
          item.validationStatus = fs.existsSync(absPath) ? 'invalid' : 'missing';
          item.lastError = res.error;
          item.updatedAt = new Date().toISOString();
          batchStatus.lastError = `${item.assetId}: ${res.error}`;

          if (res.isFatalAuth || (res.isQuota429 && stopOn429)) {
            saveManifestAndClientLookup(recomputeManifestCounts(doc.items));
            refreshCounts(doc.items);
            batchStatus.state = res.isFatalAuth ? 'failed' : 'partial';
            batchStatus.running = false;
            batchStatus.finishedAt = new Date().toISOString();
            batchStatus.currentAssetId = null;
            batchStatus.currentText = null;
            return getAcademyBatchStatus();
          }
        }

        refreshCounts(doc.items);

        // Save after every single successful item so progress resumes cleanly without duplication
        saveManifestAndClientLookup(recomputeManifestCounts(doc.items));

        if (idx + 1 < maxToProcess && !stopRequested) {
          await new Promise((r) => setTimeout(r, batchStatus.delayMs));
        }
      }

      const finalDoc = recomputeManifestCounts(doc.items);
      saveManifestAndClientLookup(finalDoc);
      refreshCounts(finalDoc.items);

      batchStatus.state = finalDoc.missingCount === 0 && finalDoc.invalidCount === 0 ? 'completed' : 'partial';
      batchStatus.finishedAt = new Date().toISOString();
      batchStatus.currentAssetId = null;
      batchStatus.currentText = null;
      return getAcademyBatchStatus();
    } catch (err) {
      batchStatus.state = 'failed';
      batchStatus.lastError = String((err as Error)?.message || err);
      batchStatus.finishedAt = new Date().toISOString();
      return getAcademyBatchStatus();
    } finally {
      batchStatus.running = false;
      activeBatchPromise = null;
    }
  })();

  return activeBatchPromise;
}
