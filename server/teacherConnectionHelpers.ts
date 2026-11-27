import crypto from 'crypto';
import type {
  LocalizedText,
  TeacherJoinCodeDto,
  TeacherJoinCodeRecord,
  UserNotification,
  UserNotificationType,
} from '../src/types/nonoland';
import type { ServerDb } from './dbTypes';
import { ensureFamilyCollections } from './familyHelpers';
import { decryptSensitiveField, encryptSensitiveField, hashToken } from './security';

// Unambiguous uppercase alphanumeric charset (excludes I, L, O, 0, 1)
export const TEACHER_CODE_CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const TEACHER_CODE_PREFIX = 'TEA';
export const TEACHER_JOIN_CODE_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
export const CONNECTION_REQUEST_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

export function normalizeTeacherJoinCode(raw: string): string | null {
  const cleaned = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '');
  const match = /^TEA([ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6})$/.exec(cleaned);
  if (!match) return null;
  return `${TEACHER_CODE_PREFIX}-${match[1]}`;
}

export function maskTeacherJoinCode(codeLast4: string): string {
  const suffix = String(codeLast4 || '').slice(-4).padStart(4, '•');
  return `${TEACHER_CODE_PREFIX}-••${suffix}`;
}

export function generateUniqueTeacherJoinCode(db: ServerDb): {
  code: string;
  codeHash: string;
  codeEncrypted: string;
  codeLast4: string;
} {
  ensureFamilyCollections(db);
  const existingHashes = new Set(
    Object.values(db.teacherJoinCodes || {}).map((r) => r.codeHash),
  );

  for (let attempt = 0; attempt < 25; attempt += 1) {
    const bytes = crypto.randomBytes(6);
    let suffix = '';
    for (let i = 0; i < 6; i += 1) {
      suffix += TEACHER_CODE_CHARSET[bytes[i] % TEACHER_CODE_CHARSET.length];
    }
    const code = `${TEACHER_CODE_PREFIX}-${suffix}`;
    const codeHash = hashToken(code);
    if (!existingHashes.has(codeHash)) {
      return {
        code,
        codeHash,
        codeEncrypted: encryptSensitiveField(code),
        codeLast4: suffix.slice(-4),
      };
    }
  }

  throw new Error('Unable to allocate unique teacher join code');
}

export function toTeacherJoinCodeDto(
  record: TeacherJoinCodeRecord,
  explicitPlainCode?: string,
): TeacherJoinCodeDto {
  const maskedCode = maskTeacherJoinCode(record.codeLast4);
  const plainCode =
    explicitPlainCode ??
    (record.status === 'active'
      ? decryptSensitiveField(record.codeEncrypted) || maskedCode
      : maskedCode);

  return {
    id: record.id,
    code: plainCode,
    maskedCode,
    codeLast4: record.codeLast4,
    status: record.status,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    revokedAt: record.revokedAt,
  };
}

export function expireStaleTeacherCodesAndRequests(db: ServerDb, nowMs = Date.now()): boolean {
  ensureFamilyCollections(db);
  let changed = false;
  const nowIso = new Date(nowMs).toISOString();

  for (const rec of Object.values(db.teacherJoinCodes || {})) {
    if (rec.status === 'active') {
      const expMs = Date.parse(rec.expiresAt);
      if (Number.isFinite(expMs) && expMs <= nowMs) {
        rec.status = 'expired';
        rec.updatedAt = nowIso;
        changed = true;
      }
    }
  }

  for (const reqRec of Object.values(db.teacherStudentConnectionRequests || {})) {
    if (reqRec.status === 'pending' && reqRec.expiresAt) {
      const expMs = Date.parse(reqRec.expiresAt);
      if (Number.isFinite(expMs) && expMs <= nowMs) {
        reqRec.status = 'expired';
        reqRec.updatedAt = nowIso;
        changed = true;
      }
    }
  }

  return changed;
}

export function getTeacherClassStudentIds(db: ServerDb, teacherId: string): Set<string> {
  const ids = new Set<string>();
  for (const cls of Object.values(db.classes || {})) {
    if (cls.teacherId === teacherId && cls.active) {
      for (const sid of cls.studentIds) {
        ids.add(sid);
      }
    }
  }
  return ids;
}

export function getTeacherConnectedStudentIds(db: ServerDb, teacherId: string): Set<string> {
  ensureFamilyCollections(db);
  const ids = new Set<string>();
  for (const conn of Object.values(db.teacherStudentConnections || {})) {
    if (conn.teacherId === teacherId && conn.status === 'active') {
      ids.add(conn.childId);
    }
  }
  return ids;
}

export function getTeacherAuthorizedStudentIds(db: ServerDb, teacherId: string): Set<string> {
  const classIds = getTeacherClassStudentIds(db, teacherId);
  const connectedIds = getTeacherConnectedStudentIds(db, teacherId);
  const merged = new Set<string>(classIds);
  for (const sid of connectedIds) {
    merged.add(sid);
  }
  return merged;
}

export function isTeacherAuthorizedForStudent(
  db: ServerDb,
  teacherId: string,
  studentId: string,
): boolean {
  return getTeacherAuthorizedStudentIds(db, teacherId).has(studentId);
}

export function createNotification(
  db: ServerDb,
  params: {
    userId: string;
    type: UserNotificationType;
    title: LocalizedText;
    message: LocalizedText;
    relatedType?: string;
    relatedId?: string;
  },
): UserNotification {
  ensureFamilyCollections(db);
  const id = `notif_${crypto.randomBytes(6).toString('hex')}`;
  const notif: UserNotification = {
    id,
    userId: params.userId,
    type: params.type,
    title: params.title,
    message: params.message,
    relatedType: params.relatedType,
    relatedId: params.relatedId,
    createdAt: new Date().toISOString(),
  };
  db.notifications![id] = notif;
  return notif;
}
