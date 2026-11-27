import crypto from 'crypto';
import type express from 'express';
import type {
  TeacherJoinCodePublicPreview,
  TeacherJoinCodeRecord,
  TeacherStudentConnection,
  TeacherStudentConnectionRequest,
} from '../src/types/nonoland';
import { isValidSafeId, sanitizeShortText } from '../src/utils/validation';
import type { AuthenticatedRequest, ServerDb } from './dbTypes';
import { recordAuditEvent } from './auditLog';
import {
  canUserAccessChild,
  ensureChildFamilyAndGarden,
  ensureFamilyCollections,
  getAccessibleChildrenForUser,
  recordFamilyEvent,
} from './familyHelpers';
import { checkRateLimitPg, runWithPgDbLock } from './pgStore';
import { appendSecurityLog, getClientIp, hashToken } from './security';
import {
  CONNECTION_REQUEST_TTL_MS,
  createNotification,
  expireStaleTeacherCodesAndRequests,
  generateUniqueTeacherJoinCode,
  maskTeacherJoinCode,
  normalizeTeacherJoinCode,
  TEACHER_JOIN_CODE_TTL_MS,
  toTeacherJoinCodeDto,
} from './teacherConnectionHelpers';

export interface TeacherConnectionRoutesDeps {
  app: express.Application;
  getDb: () => ServerDb;
  saveDb: (db: ServerDb) => void;
  requireAuth: express.RequestHandler;
}

function findValidActiveCode(
  db: ServerDb,
  normalizedCode: string,
): { codeRecord: TeacherJoinCodeRecord; teacher: NonNullable<ServerDb['users'][string]> } | null {
  ensureFamilyCollections(db);
  const codeHash = hashToken(normalizedCode);
  const rec = Object.values(db.teacherJoinCodes || {}).find(
    (c) => c.codeHash === codeHash && c.status === 'active',
  );
  if (!rec) return null;
  if (Date.parse(rec.expiresAt) <= Date.now()) {
    return null;
  }
  const teacher = db.users[rec.teacherId];
  if (!teacher || teacher.role !== 'teacher' || teacher.status !== 'active') {
    return null;
  }
  return { codeRecord: rec, teacher };
}

function safeAsync(
  handler: (req: AuthenticatedRequest, res: express.Response) => Promise<unknown>,
): express.RequestHandler {
  return (req, res) => {
    Promise.resolve(handler(req as AuthenticatedRequest, res)).catch((err) => {
      console.error('[TeacherConnectionRouteError]', (err as Error)?.message || err);
      if (!res.headersSent) {
        const code = (err as { code?: string })?.code;
        res.status(code === 'TEACHER_CONN_SCHEMA_PENDING' ? 503 : 500).json({
          error: (err as Error)?.message || 'Internal server error',
          ...(code ? { code } : {}),
        });
      }
    });
  };
}

export function registerTeacherConnectionRoutes(deps: TeacherConnectionRoutesDeps) {
  const { app, getDb, saveDb, requireAuth } = deps;

  const requireActiveTeacher = (
    req: AuthenticatedRequest,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    const user = req.authSession?.user;
    if (!user) return res.status(401).json({ error: 'Authentication required' });
    if (user.role !== 'teacher' || user.status !== 'active') {
      const db = getDb();
      appendSecurityLog(db.securityLogs, {
        eventType: 'ACCESS_DENIED',
        actorId: user.id,
        role: user.role,
        ip: getClientIp(req),
        summary: `Blocked non-teacher role (${user.role}) from teacher connection endpoint`,
      });
      saveDb(db);
      return res.status(403).json({ error: 'Forbidden: active Teacher account required' });
    }
    return next();
  };

  const requireActiveParent = (
    req: AuthenticatedRequest,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    const user = req.authSession?.user;
    if (!user) return res.status(401).json({ error: 'Authentication required' });
    if (user.role !== 'parent' || user.status !== 'active') {
      const db = getDb();
      appendSecurityLog(db.securityLogs, {
        eventType: 'ACCESS_DENIED',
        actorId: user.id,
        role: user.role,
        ip: getClientIp(req),
        summary: `Blocked non-parent role (${user.role}) from parent teacher-connection endpoint`,
      });
      saveDb(db);
      return res.status(403).json({ error: 'Forbidden: active Parent account required' });
    }
    return next();
  };

  // =========================================================================
  // 1. TEACHER JOIN CODE MANAGEMENT
  // =========================================================================
  app.get('/api/teacher/join-code', requireActiveTeacher, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const teacher = req.authSession!.user;
    const changed = expireStaleTeacherCodesAndRequests(db);
    if (changed) saveDb(db);

    const mine = Object.values(db.teacherJoinCodes || {})
      .filter((c) => c.teacherId === teacher.id)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

    const activeRecord = mine.find((c) => c.status === 'active') || null;
    const recentHistory = mine
      .filter((c) => c.status !== 'active')
      .slice(0, 5)
      .map((c) => toTeacherJoinCodeDto(c, maskTeacherJoinCode(c.codeLast4)));

    return res.json({
      activeCode: activeRecord ? toTeacherJoinCodeDto(activeRecord) : null,
      recentHistory,
    });
  });

  app.post('/api/teacher/join-code/generate', requireActiveTeacher, safeAsync(async (req: AuthenticatedRequest, res) => {
    const teacher = req.authSession!.user;
    const ip = getClientIp(req);

    const outcome = await runWithPgDbLock(`tjc:${teacher.id}`, async (db) => {
      expireStaleTeacherCodesAndRequests(db);
      const existingActive = Object.values(db.teacherJoinCodes || {}).find(
        (c) => c.teacherId === teacher.id && c.status === 'active',
      );
      if (existingActive) {
        return {
          status: 409,
          body: {
            error: 'An active join code already exists. Use regenerate to replace it.',
            code: 'JOIN_CODE_ALREADY_ACTIVE',
          },
        };
      }

      const generated = generateUniqueTeacherJoinCode(db);
      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();
      const rec: TeacherJoinCodeRecord = {
        id: `tjc_${crypto.randomBytes(6).toString('hex')}`,
        teacherId: teacher.id,
        codeHash: generated.codeHash,
        codeEncrypted: generated.codeEncrypted,
        codeLast4: generated.codeLast4,
        status: 'active',
        createdAt: nowIso,
        expiresAt: new Date(nowMs + TEACHER_JOIN_CODE_TTL_MS).toISOString(),
        updatedAt: nowIso,
      };
      db.teacherJoinCodes![rec.id] = rec;

      recordAuditEvent(db, {
        eventType: 'TEACHER_CODE_GENERATED',
        actorId: teacher.id,
        actorRole: teacher.role,
        actionType: 'TEACHER_CODE_GENERATE',
        recordType: 'teacher_join_code',
        recordId: rec.id,
        newValue: { codeLast4: rec.codeLast4, expiresAt: rec.expiresAt },
        outcome: 'success',
        ip,
        summary: `Teacher ${teacher.id} generated join code ending in ${rec.codeLast4}`,
      });

      return {
        status: 201,
        body: { activeCode: toTeacherJoinCodeDto(rec, generated.code) },
      };
    });

    return res.status(outcome.status).json(outcome.body);
  }));

  app.post('/api/teacher/join-code/regenerate', requireActiveTeacher, safeAsync(async (req: AuthenticatedRequest, res) => {
    const teacher = req.authSession!.user;
    const ip = getClientIp(req);

    const outcome = await runWithPgDbLock(`tjc:${teacher.id}`, async (db) => {
      expireStaleTeacherCodesAndRequests(db);
      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();
      let revokedPreviousCount = 0;

      for (const existing of Object.values(db.teacherJoinCodes || {})) {
        if (existing.teacherId === teacher.id && existing.status === 'active') {
          existing.status = 'revoked';
          existing.revokedAt = nowIso;
          existing.updatedAt = nowIso;
          revokedPreviousCount += 1;
        }
      }

      const generated = generateUniqueTeacherJoinCode(db);
      const rec: TeacherJoinCodeRecord = {
        id: `tjc_${crypto.randomBytes(6).toString('hex')}`,
        teacherId: teacher.id,
        codeHash: generated.codeHash,
        codeEncrypted: generated.codeEncrypted,
        codeLast4: generated.codeLast4,
        status: 'active',
        createdAt: nowIso,
        expiresAt: new Date(nowMs + TEACHER_JOIN_CODE_TTL_MS).toISOString(),
        updatedAt: nowIso,
      };
      db.teacherJoinCodes![rec.id] = rec;

      recordAuditEvent(db, {
        eventType: 'TEACHER_CODE_REGENERATED',
        actorId: teacher.id,
        actorRole: teacher.role,
        actionType: 'TEACHER_CODE_REGENERATE',
        recordType: 'teacher_join_code',
        recordId: rec.id,
        previousValue: { revokedPreviousCount },
        newValue: { codeLast4: rec.codeLast4, expiresAt: rec.expiresAt },
        outcome: 'success',
        ip,
        summary: `Teacher ${teacher.id} regenerated join code ending in ${rec.codeLast4} (revoked ${revokedPreviousCount} old code)`,
      });

      return {
        status: 201,
        body: {
          activeCode: toTeacherJoinCodeDto(rec, generated.code),
          revokedPreviousCount,
        },
      };
    });

    return res.status(outcome.status).json(outcome.body);
  }));

  app.post('/api/teacher/join-code/deactivate', requireActiveTeacher, safeAsync(async (req: AuthenticatedRequest, res) => {
    const teacher = req.authSession!.user;
    const ip = getClientIp(req);

    const outcome = await runWithPgDbLock(`tjc:${teacher.id}`, async (db) => {
      expireStaleTeacherCodesAndRequests(db);
      const nowIso = new Date().toISOString();
      const activeRec = Object.values(db.teacherJoinCodes || {}).find(
        (c) => c.teacherId === teacher.id && c.status === 'active',
      );
      if (!activeRec) {
        return {
          status: 404,
          body: { error: 'No active join code found to deactivate.' },
        };
      }

      activeRec.status = 'revoked';
      activeRec.revokedAt = nowIso;
      activeRec.updatedAt = nowIso;

      recordAuditEvent(db, {
        eventType: 'TEACHER_CODE_REVOKED',
        actorId: teacher.id,
        actorRole: teacher.role,
        actionType: 'TEACHER_CODE_DEACTIVATE',
        recordType: 'teacher_join_code',
        recordId: activeRec.id,
        previousValue: { status: 'active', codeLast4: activeRec.codeLast4 },
        newValue: { status: 'revoked' },
        outcome: 'success',
        ip,
        summary: `Teacher ${teacher.id} deactivated join code ending in ${activeRec.codeLast4}`,
      });

      return {
        status: 200,
        body: { deactivated: true, revokedCodeId: activeRec.id },
      };
    });

    return res.status(outcome.status).json(outcome.body);
  }));

  // =========================================================================
  // 2. TEACHER CONNECTION REQUESTS & ACTIVE CONNECTIONS
  // =========================================================================
  app.get('/api/teacher/connection-requests', requireActiveTeacher, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const teacher = req.authSession!.user;
    const changed = expireStaleTeacherCodesAndRequests(db);
    if (changed) saveDb(db);

    const requests = Object.values(db.teacherStudentConnectionRequests || {})
      .filter((r) => r.teacherId === teacher.id)
      .sort((a, b) => Date.parse(b.requestedAt) - Date.parse(a.requestedAt))
      .map((r) => {
        const child = db.children[r.childId];
        const parent = db.users[r.parentId];
        const codeRec = db.teacherJoinCodes?.[r.joinCodeId];
        return {
          id: r.id,
          status: r.status,
          requestedAt: r.requestedAt,
          reviewedAt: r.reviewedAt,
          rejectionReason: r.rejectionReason,
          cancelledAt: r.cancelledAt,
          expiresAt: r.expiresAt,
          childId: r.childId,
          childDisplayName: child?.displayName || 'Student',
          childAgeGroup: child?.ageGroup || '1-4',
          childLanguage: child?.language || 'ar',
          childLevel: child?.level || 1,
          parentId: r.parentId,
          parentDisplayName: parent?.displayName || 'Parent',
          joinCodeLast4: codeRec?.codeLast4 || '••••',
        };
      });

    const activeConnections = Object.values(db.teacherStudentConnections || {})
      .filter((c) => c.teacherId === teacher.id && c.status === 'active')
      .sort((a, b) => Date.parse(b.approvedAt) - Date.parse(a.approvedAt))
      .map((c) => {
        const child = db.children[c.childId];
        const parent = db.users[c.parentId];
        return {
          id: c.id,
          teacherId: c.teacherId,
          parentId: c.parentId,
          childId: c.childId,
          requestId: c.requestId,
          status: c.status,
          approvedAt: c.approvedAt,
          childDisplayName: child?.displayName || 'Student',
          childAgeGroup: child?.ageGroup || '1-4',
          childLanguage: child?.language || 'ar',
          childLevel: child?.level || 1,
          childStars: child?.stars || 0,
          parentDisplayName: parent?.displayName || 'Parent',
        };
      });

    const pendingCount = requests.filter((r) => r.status === 'pending').length;

    return res.json({
      requests,
      activeConnections,
      pendingCount,
    });
  });

  app.post(
    '/api/teacher/connection-requests/:requestId/approve',
    requireActiveTeacher,
    safeAsync(async (req: AuthenticatedRequest, res) => {
      const teacher = req.authSession!.user;
      const { requestId } = req.params;
      if (!isValidSafeId(requestId)) {
        return res.status(400).json({ error: 'Invalid request ID format' });
      }
      const ip = getClientIp(req);

      const outcome = await runWithPgDbLock(`tcr:${teacher.id}:${requestId}`, async (db) => {
        expireStaleTeacherCodesAndRequests(db);
        const connReq = db.teacherStudentConnectionRequests?.[requestId];
        if (!connReq) {
          return { status: 404, body: { error: 'Connection request not found' } };
        }
        if (connReq.teacherId !== teacher.id) {
          return { status: 403, body: { error: 'Forbidden: you do not own this connection request' } };
        }
        if (connReq.status === 'expired') {
          return { status: 410, body: { error: 'This connection request has expired' } };
        }
        if (connReq.status !== 'pending') {
          return { status: 409, body: { error: `Request is already ${connReq.status}` } };
        }

        const child = db.children[connReq.childId];
        const parent = db.users[connReq.parentId];
        if (!child || !parent) {
          return { status: 404, body: { error: 'Child or parent account no longer exists' } };
        }

        const nowIso = new Date().toISOString();
        const existingActive = Object.values(db.teacherStudentConnections || {}).find(
          (c) => c.teacherId === teacher.id && c.childId === child.id && c.status === 'active',
        );

        let connection: TeacherStudentConnection;
        if (existingActive) {
          connection = existingActive;
        } else {
          connection = {
            id: `tsc_${crypto.randomBytes(6).toString('hex')}`,
            teacherId: teacher.id,
            parentId: parent.id,
            childId: child.id,
            requestId: connReq.id,
            status: 'active',
            approvedAt: nowIso,
            createdAt: nowIso,
            updatedAt: nowIso,
          };
          db.teacherStudentConnections![connection.id] = connection;
        }

        connReq.status = 'approved';
        connReq.reviewedAt = nowIso;
        connReq.reviewedBy = teacher.id;
        connReq.updatedAt = nowIso;

        createNotification(db, {
          userId: parent.id,
          type: 'teacher_connection_approved',
          title: {
            ar: 'تمت الموافقة على ربط المعلم',
            en: 'Teacher Connection Approved',
          },
          message: {
            ar: `وافق المعلم ${teacher.displayName} على متابعة الطالب ${child.displayName}.`,
            en: `${teacher.displayName} approved the connection request for ${child.displayName}.`,
          },
          relatedType: 'teacher_connection',
          relatedId: connection.id,
        });

        recordAuditEvent(db, {
          eventType: 'TEACHER_CONNECTION_APPROVED',
          actorId: teacher.id,
          actorRole: teacher.role,
          actionType: 'TEACHER_CONNECTION_APPROVE',
          recordType: 'teacher_student_connection',
          recordId: connection.id,
          newValue: { requestId: connReq.id, childId: child.id, parentId: parent.id },
          outcome: 'success',
          ip,
          summary: `Teacher ${teacher.id} approved connection with child ${child.id} (parent ${parent.id})`,
        });

        const familyId = ensureChildFamilyAndGarden(db, child);
        recordFamilyEvent(db, {
          familyId,
          category: 'guardian',
          actionType: 'TEACHER_CONNECTION_APPROVED',
          actorId: teacher.id,
          actorName: teacher.displayName,
          actorRole: teacher.role,
          childId: child.id,
          childName: child.displayName,
          title: { ar: 'اعتماد ربط المعلم بالطالب', en: 'Teacher connection approved' },
          description: {
            ar: `وافق المعلم ${teacher.displayName} على ربط ${child.displayName} لمتابعة التعلم والواجبات`,
            en: `${teacher.displayName} approved learning connection for ${child.displayName}`,
          },
          ip,
          securityEventType: 'TEACHER_CONNECTION_APPROVED',
        });

        return {
          status: 200,
          body: { approved: true, request: connReq, connection },
        };
      });

      return res.status(outcome.status).json(outcome.body);
    }),
  );

  app.post(
    '/api/teacher/connection-requests/:requestId/reject',
    requireActiveTeacher,
    safeAsync(async (req: AuthenticatedRequest, res) => {
      const teacher = req.authSession!.user;
      const { requestId } = req.params;
      if (!isValidSafeId(requestId)) {
        return res.status(400).json({ error: 'Invalid request ID format' });
      }
      const rawReason = (req.body as { reason?: string })?.reason;
      const cleanReason = rawReason ? sanitizeShortText(String(rawReason), 240) : undefined;
      const ip = getClientIp(req);

      const outcome = await runWithPgDbLock(`tcr:${teacher.id}:${requestId}`, async (db) => {
        expireStaleTeacherCodesAndRequests(db);
        const connReq = db.teacherStudentConnectionRequests?.[requestId];
        if (!connReq) {
          return { status: 404, body: { error: 'Connection request not found' } };
        }
        if (connReq.teacherId !== teacher.id) {
          return { status: 403, body: { error: 'Forbidden: you do not own this connection request' } };
        }
        if (connReq.status === 'expired') {
          return { status: 410, body: { error: 'This connection request has expired' } };
        }
        if (connReq.status !== 'pending') {
          return { status: 409, body: { error: `Request is already ${connReq.status}` } };
        }

        const nowIso = new Date().toISOString();
        connReq.status = 'rejected';
        connReq.reviewedAt = nowIso;
        connReq.reviewedBy = teacher.id;
        connReq.rejectionReason = cleanReason;
        connReq.updatedAt = nowIso;

        const child = db.children[connReq.childId];
        const childName = child?.displayName || 'Student';

        createNotification(db, {
          userId: connReq.parentId,
          type: 'teacher_connection_rejected',
          title: {
            ar: 'تم رفض طلب ربط المعلم',
            en: 'Teacher Connection Declined',
          },
          message: {
            ar: cleanReason
              ? `رفض المعلم ${teacher.displayName} طلب ربط ${childName}: ${cleanReason}`
              : `لم يقبل المعلم ${teacher.displayName} طلب ربط ${childName} حالياً.`,
            en: cleanReason
              ? `${teacher.displayName} declined the connection request for ${childName}: ${cleanReason}`
              : `${teacher.displayName} declined the connection request for ${childName}.`,
          },
          relatedType: 'teacher_connection_request',
          relatedId: connReq.id,
        });

        recordAuditEvent(db, {
          eventType: 'TEACHER_CONNECTION_REJECTED',
          actorId: teacher.id,
          actorRole: teacher.role,
          actionType: 'TEACHER_CONNECTION_REJECT',
          recordType: 'teacher_student_connection_request',
          recordId: connReq.id,
          reason: cleanReason,
          newValue: { status: 'rejected', childId: connReq.childId },
          outcome: 'success',
          ip,
          summary: `Teacher ${teacher.id} rejected connection request ${connReq.id} for child ${connReq.childId}`,
        });

        if (child) {
          const familyId = ensureChildFamilyAndGarden(db, child);
          recordFamilyEvent(db, {
            familyId,
            category: 'guardian',
            actionType: 'TEACHER_CONNECTION_REJECTED',
            actorId: teacher.id,
            actorName: teacher.displayName,
            actorRole: teacher.role,
            childId: child.id,
            childName: child.displayName,
            title: { ar: 'رفض طلب ربط المعلم', en: 'Teacher connection declined' },
            description: {
              ar: `رفض المعلم ${teacher.displayName} طلب ربط ${child.displayName}${cleanReason ? ` (${cleanReason})` : ''}`,
              en: `${teacher.displayName} declined connection request for ${child.displayName}`,
            },
            ip,
            securityEventType: 'TEACHER_CONNECTION_REJECTED',
          });
        }

        return {
          status: 200,
          body: { rejected: true, request: connReq },
        };
      });

      return res.status(outcome.status).json(outcome.body);
    }),
  );

  app.delete(
    '/api/teacher/connections/:connectionId',
    requireActiveTeacher,
    safeAsync(async (req: AuthenticatedRequest, res) => {
      const teacher = req.authSession!.user;
      const { connectionId } = req.params;
      if (!isValidSafeId(connectionId)) {
        return res.status(400).json({ error: 'Invalid connection ID format' });
      }
      const ip = getClientIp(req);

      const outcome = await runWithPgDbLock(`tcon:${connectionId}`, async (db) => {
        ensureFamilyCollections(db);
        const conn = db.teacherStudentConnections?.[connectionId];
        if (!conn) {
          return { status: 404, body: { error: 'Connection not found' } };
        }
        if (conn.teacherId !== teacher.id) {
          return { status: 403, body: { error: 'Forbidden: you do not own this connection' } };
        }
        if (conn.status !== 'active') {
          return { status: 409, body: { error: 'Connection is already disconnected' } };
        }

        const nowIso = new Date().toISOString();
        conn.status = 'disconnected';
        conn.disconnectedAt = nowIso;
        conn.disconnectedBy = 'teacher';
        conn.updatedAt = nowIso;

        const child = db.children[conn.childId];
        const childName = child?.displayName || 'Student';

        createNotification(db, {
          userId: conn.parentId,
          type: 'teacher_connection_disconnected',
          title: {
            ar: 'تم إنهاء الربط مع المعلم',
            en: 'Teacher Connection Ended',
          },
          message: {
            ar: `أنهى المعلم ${teacher.displayName} الربط التعليمي للطالب ${childName}.`,
            en: `${teacher.displayName} disconnected the learning link for ${childName}.`,
          },
          relatedType: 'teacher_connection',
          relatedId: conn.id,
        });

        recordAuditEvent(db, {
          eventType: 'TEACHER_CONNECTION_DISCONNECTED',
          actorId: teacher.id,
          actorRole: teacher.role,
          actionType: 'TEACHER_DISCONNECT_STUDENT',
          recordType: 'teacher_student_connection',
          recordId: conn.id,
          previousValue: { status: 'active' },
          newValue: { status: 'disconnected', disconnectedBy: 'teacher' },
          outcome: 'success',
          ip,
          summary: `Teacher ${teacher.id} disconnected student ${conn.childId}`,
        });

        if (child) {
          const familyId = ensureChildFamilyAndGarden(db, child);
          recordFamilyEvent(db, {
            familyId,
            category: 'guardian',
            actionType: 'TEACHER_CONNECTION_DISCONNECTED',
            actorId: teacher.id,
            actorName: teacher.displayName,
            actorRole: teacher.role,
            childId: child.id,
            childName: child.displayName,
            title: { ar: 'فصل الربط من المعلم', en: 'Teacher disconnected student' },
            description: {
              ar: `أنهى المعلم ${teacher.displayName} ارتباطه بالطالب ${child.displayName}`,
              en: `${teacher.displayName} ended the connection with ${child.displayName}`,
            },
            ip,
            securityEventType: 'TEACHER_CONNECTION_DISCONNECTED',
          });
        }

        return { status: 200, body: { disconnected: true, connection: conn } };
      });

      return res.status(outcome.status).json(outcome.body);
    }),
  );

  // =========================================================================
  // 3. PARENT TEACHER-CONNECTION FLOW
  // =========================================================================
  app.post(
    '/api/parent/teacher-connections/validate-code',
    requireActiveParent,
    safeAsync(async (req: AuthenticatedRequest, res) => {
      const db = getDb();
      const user = req.authSession!.user;
      const ip = getClientIp(req);

      if (
        !(await checkRateLimitPg(`tcode-val-ip:${ip}`, 20, 10 * 60_000)) ||
        !(await checkRateLimitPg(`tcode-val-u:${user.id}`, 15, 10 * 60_000))
      ) {
        return res.status(429).json({
          error: 'Too many code validation attempts. Please wait a few minutes.',
        });
      }

      const changed = expireStaleTeacherCodesAndRequests(db);
      if (changed) saveDb(db);

      const rawCode = String((req.body as { code?: string })?.code || '');
      const normalized = normalizeTeacherJoinCode(rawCode);
      if (!normalized) {
        recordAuditEvent(db, {
          eventType: 'TEACHER_CODE_VALIDATE_FAIL',
          actorId: user.id,
          actorRole: user.role,
          actionType: 'TEACHER_CODE_VALIDATE',
          recordType: 'teacher_join_code',
          outcome: 'denied',
          ip,
          summary: `Invalid teacher join code format entered by parent ${user.id}`,
        });
        saveDb(db);
        return res.status(400).json({
          error: 'Invalid code format. Expected format: TEA-XXXXXX',
          code: 'INVALID_CODE_FORMAT',
        });
      }

      const found = findValidActiveCode(db, normalized);
      if (!found) {
        recordAuditEvent(db, {
          eventType: 'TEACHER_CODE_VALIDATE_FAIL',
          actorId: user.id,
          actorRole: user.role,
          actionType: 'TEACHER_CODE_VALIDATE',
          recordType: 'teacher_join_code',
          outcome: 'denied',
          ip,
          summary: `Parent ${user.id} attempted unknown/revoked/expired teacher code ending in ${normalized.slice(-4)}`,
        });
        saveDb(db);
        return res.status(404).json({
          error: 'This teacher code is invalid, revoked, or expired.',
          code: 'TEACHER_CODE_NOT_ACTIVE',
        });
      }

      // Limited public preview only — zero private teacher email/classes/students
      const preview: TeacherJoinCodePublicPreview = {
        normalizedCode: normalized,
        teacherDisplayName: found.teacher.displayName,
        subjects: found.teacher.teacherProfile?.subjects || [],
        bio: found.teacher.bio || found.teacher.teacherProfile?.bio,
        status: 'active',
        expiresAt: found.codeRecord.expiresAt,
      };

      return res.json({
        valid: true,
        teacher: preview,
      });
    }),
  );

  app.get('/api/parent/teacher-connections', requireActiveParent, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    const user = req.authSession!.user;
    const changed = expireStaleTeacherCodesAndRequests(db);
    if (changed) saveDb(db);

    const accessibleChildren = getAccessibleChildrenForUser(db, user);
    const accessibleIds = new Set(accessibleChildren.map((c) => c.id));

    const requests = Object.values(db.teacherStudentConnectionRequests || {})
      .filter((r) => accessibleIds.has(r.childId) || r.parentId === user.id)
      .filter((r) => accessibleIds.has(r.childId))
      .sort((a, b) => Date.parse(b.requestedAt) - Date.parse(a.requestedAt))
      .map((r) => {
        const teacher = db.users[r.teacherId];
        const child = db.children[r.childId];
        const codeRec = db.teacherJoinCodes?.[r.joinCodeId];
        return {
          id: r.id,
          status: r.status,
          requestedAt: r.requestedAt,
          reviewedAt: r.reviewedAt,
          rejectionReason: r.rejectionReason,
          cancelledAt: r.cancelledAt,
          expiresAt: r.expiresAt,
          childId: r.childId,
          childDisplayName: child?.displayName || 'Child',
          teacherId: r.teacherId,
          teacherDisplayName: teacher?.displayName || 'Teacher',
          teacherSubjects: teacher?.teacherProfile?.subjects || [],
          joinCodeMasked: codeRec ? maskTeacherJoinCode(codeRec.codeLast4) : 'TEA-••••••',
        };
      });

    const connections = Object.values(db.teacherStudentConnections || {})
      .filter((c) => accessibleIds.has(c.childId))
      .sort((a, b) => Date.parse(b.approvedAt) - Date.parse(a.approvedAt))
      .map((c) => {
        const teacher = db.users[c.teacherId];
        const child = db.children[c.childId];
        return {
          id: c.id,
          status: c.status,
          approvedAt: c.approvedAt,
          disconnectedAt: c.disconnectedAt,
          disconnectedBy: c.disconnectedBy,
          childId: c.childId,
          childDisplayName: child?.displayName || 'Child',
          teacherId: c.teacherId,
          teacherDisplayName: teacher?.displayName || 'Teacher',
          teacherSubjects: teacher?.teacherProfile?.subjects || [],
          teacherBio: teacher?.bio || teacher?.teacherProfile?.bio,
        };
      });

    return res.json({
      children: accessibleChildren.map((c) => ({
        id: c.id,
        displayName: c.displayName,
        ageGroup: c.ageGroup,
        level: c.level,
      })),
      requests,
      connections,
    });
  });

  app.post(
    '/api/parent/teacher-connections/requests',
    requireActiveParent,
    safeAsync(async (req: AuthenticatedRequest, res) => {
      const user = req.authSession!.user;
      const ip = getClientIp(req);

      if (!(await checkRateLimitPg(`tconn-req:${user.id}`, 12, 10 * 60_000))) {
        return res.status(429).json({
          error: 'Too many teacher connection requests. Please wait before trying again.',
        });
      }

      const { childId, code } = req.body as { childId?: string; code?: string };
      if (!childId || !isValidSafeId(childId)) {
        return res.status(400).json({ error: 'Valid childId is required' });
      }

      const normalized = normalizeTeacherJoinCode(code || '');
      if (!normalized) {
        return res.status(400).json({ error: 'Valid teacher join code (TEA-XXXXXX) is required' });
      }

      const outcome = await runWithPgDbLock(`tcreq:${user.id}`, async (db) => {
        expireStaleTeacherCodesAndRequests(db);
        const child = db.children[childId];
        if (!child) {
          return { status: 404, body: { error: 'Child profile not found' } };
        }
        if (!canUserAccessChild(db, user, child, 'manage_learning_settings')) {
          appendSecurityLog(db.securityLogs, {
            eventType: 'ACCESS_DENIED',
            actorId: user.id,
            role: user.role,
            ip,
            summary: `Blocked unauthorized teacher connection request for child ${childId}`,
          });
          return { status: 403, body: { error: 'Forbidden: you do not have permission for this child' } };
        }

        const found = findValidActiveCode(db, normalized);
        if (!found) {
          return {
            status: 404,
            body: {
              error: 'This teacher join code is invalid, revoked, or expired.',
              code: 'TEACHER_CODE_NOT_ACTIVE',
            },
          };
        }

        const teacher = found.teacher;
        const alreadyConnected = Object.values(db.teacherStudentConnections || {}).find(
          (c) => c.teacherId === teacher.id && c.childId === child.id && c.status === 'active',
        );
        if (alreadyConnected) {
          return {
            status: 409,
            body: {
              error: `${child.displayName} is already connected to ${teacher.displayName}.`,
              code: 'ALREADY_CONNECTED',
            },
          };
        }

        const alreadyPending = Object.values(db.teacherStudentConnectionRequests || {}).find(
          (r) => r.teacherId === teacher.id && r.childId === child.id && r.status === 'pending',
        );
        if (alreadyPending) {
          return {
            status: 409,
            body: {
              error: `A pending connection request for ${child.displayName} with ${teacher.displayName} already exists.`,
              code: 'REQUEST_ALREADY_PENDING',
            },
          };
        }

        const nowMs = Date.now();
        const nowIso = new Date(nowMs).toISOString();
        const reqRecord: TeacherStudentConnectionRequest = {
          id: `tcr_${crypto.randomBytes(6).toString('hex')}`,
          teacherId: teacher.id,
          parentId: user.id,
          childId: child.id,
          joinCodeId: found.codeRecord.id,
          status: 'pending',
          requestedAt: nowIso,
          expiresAt: new Date(nowMs + CONNECTION_REQUEST_TTL_MS).toISOString(),
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        db.teacherStudentConnectionRequests![reqRecord.id] = reqRecord;

        createNotification(db, {
          userId: teacher.id,
          type: 'teacher_connection_request',
          title: {
            ar: 'طلب ربط طالب جديد',
            en: 'New Student Connection Request',
          },
          message: {
            ar: `أرسل ولي الأمر ${user.displayName} طلب ربط للطالب ${child.displayName}.`,
            en: `Parent ${user.displayName} requested to connect student ${child.displayName}.`,
          },
          relatedType: 'teacher_connection_request',
          relatedId: reqRecord.id,
        });

        recordAuditEvent(db, {
          eventType: 'TEACHER_CONNECTION_REQUESTED',
          actorId: user.id,
          actorRole: user.role,
          actionType: 'TEACHER_CONNECTION_REQUEST',
          recordType: 'teacher_student_connection_request',
          recordId: reqRecord.id,
          newValue: { teacherId: teacher.id, childId: child.id, codeLast4: found.codeRecord.codeLast4 },
          outcome: 'success',
          ip,
          summary: `Parent ${user.id} requested connection for child ${child.id} to teacher ${teacher.id}`,
        });

        const familyId = ensureChildFamilyAndGarden(db, child);
        recordFamilyEvent(db, {
          familyId,
          category: 'guardian',
          actionType: 'TEACHER_CONNECTION_REQUESTED',
          actorId: user.id,
          actorName: user.displayName,
          actorRole: user.role,
          childId: child.id,
          childName: child.displayName,
          title: { ar: 'إرسال طلب ربط مع معلم', en: 'Sent teacher connection request' },
          description: {
            ar: `أرسل ${user.displayName} طلب ربط للطالب ${child.displayName} مع المعلم ${teacher.displayName}`,
            en: `${user.displayName} sent a connection request for ${child.displayName} to ${teacher.displayName}`,
          },
          ip,
          securityEventType: 'TEACHER_CONNECTION_REQUESTED',
        });

        return {
          status: 201,
          body: {
            request: {
              ...reqRecord,
              childDisplayName: child.displayName,
              teacherDisplayName: teacher.displayName,
              teacherSubjects: teacher.teacherProfile?.subjects || [],
              joinCodeMasked: maskTeacherJoinCode(found.codeRecord.codeLast4),
            },
          },
        };
      });

      return res.status(outcome.status).json(outcome.body);
    }),
  );

  app.post(
    '/api/parent/teacher-connections/requests/:requestId/cancel',
    requireActiveParent,
    safeAsync(async (req: AuthenticatedRequest, res) => {
      const user = req.authSession!.user;
      const { requestId } = req.params;
      if (!isValidSafeId(requestId)) {
        return res.status(400).json({ error: 'Invalid request ID format' });
      }
      const ip = getClientIp(req);

      const outcome = await runWithPgDbLock(`tcreq-c:${requestId}`, async (db) => {
        expireStaleTeacherCodesAndRequests(db);
        const connReq = db.teacherStudentConnectionRequests?.[requestId];
        if (!connReq) {
          return { status: 404, body: { error: 'Connection request not found' } };
        }
        const child = db.children[connReq.childId];
        if (!child || !canUserAccessChild(db, user, child, 'manage_learning_settings')) {
          return { status: 403, body: { error: 'Forbidden: you cannot cancel this request' } };
        }
        if (connReq.status !== 'pending') {
          return { status: 409, body: { error: `Request is already ${connReq.status}` } };
        }

        const nowIso = new Date().toISOString();
        connReq.status = 'cancelled';
        connReq.cancelledAt = nowIso;
        connReq.updatedAt = nowIso;

        createNotification(db, {
          userId: connReq.teacherId,
          type: 'teacher_connection_cancelled',
          title: {
            ar: 'إلغاء طلب ربط',
            en: 'Connection Request Cancelled',
          },
          message: {
            ar: `ألغى ولي الأمر ${user.displayName} طلب ربط الطالب ${child.displayName}.`,
            en: `Parent ${user.displayName} cancelled the connection request for ${child.displayName}.`,
          },
          relatedType: 'teacher_connection_request',
          relatedId: connReq.id,
        });

        recordAuditEvent(db, {
          eventType: 'TEACHER_CONNECTION_CANCELLED',
          actorId: user.id,
          actorRole: user.role,
          actionType: 'TEACHER_CONNECTION_CANCEL',
          recordType: 'teacher_student_connection_request',
          recordId: connReq.id,
          newValue: { status: 'cancelled' },
          outcome: 'success',
          ip,
          summary: `Parent ${user.id} cancelled connection request ${connReq.id}`,
        });

        const familyId = ensureChildFamilyAndGarden(db, child);
        recordFamilyEvent(db, {
          familyId,
          category: 'guardian',
          actionType: 'TEACHER_CONNECTION_CANCELLED',
          actorId: user.id,
          actorName: user.displayName,
          actorRole: user.role,
          childId: child.id,
          childName: child.displayName,
          title: { ar: 'إلغاء طلب ربط المعلم', en: 'Cancelled teacher connection request' },
          description: {
            ar: `ألغى ${user.displayName} طلب ربط ${child.displayName} قبل مراجعته`,
            en: `${user.displayName} cancelled pending teacher request for ${child.displayName}`,
          },
          ip,
          securityEventType: 'TEACHER_CONNECTION_CANCELLED',
        });

        return { status: 200, body: { cancelled: true, request: connReq } };
      });

      return res.status(outcome.status).json(outcome.body);
    }),
  );

  app.delete(
    '/api/parent/teacher-connections/:connectionId',
    requireActiveParent,
    safeAsync(async (req: AuthenticatedRequest, res) => {
      const user = req.authSession!.user;
      const { connectionId } = req.params;
      if (!isValidSafeId(connectionId)) {
        return res.status(400).json({ error: 'Invalid connection ID format' });
      }
      const ip = getClientIp(req);

      const outcome = await runWithPgDbLock(`tcon:${connectionId}`, async (db) => {
        ensureFamilyCollections(db);
        const conn = db.teacherStudentConnections?.[connectionId];
        if (!conn) {
          return { status: 404, body: { error: 'Connection not found' } };
        }
        const child = db.children[conn.childId];
        if (!child || !canUserAccessChild(db, user, child, 'manage_learning_settings')) {
          return { status: 403, body: { error: 'Forbidden: you do not have permission to disconnect this child' } };
        }
        if (conn.status !== 'active') {
          return { status: 409, body: { error: 'Connection is already disconnected' } };
        }

        const nowIso = new Date().toISOString();
        conn.status = 'disconnected';
        conn.disconnectedAt = nowIso;
        conn.disconnectedBy = 'parent';
        conn.updatedAt = nowIso;

        createNotification(db, {
          userId: conn.teacherId,
          type: 'teacher_connection_disconnected',
          title: {
            ar: 'تم فصل ارتباط طالب',
            en: 'Student Connection Ended by Parent',
          },
          message: {
            ar: `أنهى ولي الأمر ${user.displayName} الربط التعليمي للطالب ${child.displayName}.`,
            en: `Parent ${user.displayName} disconnected ${child.displayName} from your students list.`,
          },
          relatedType: 'teacher_connection',
          relatedId: conn.id,
        });

        recordAuditEvent(db, {
          eventType: 'TEACHER_CONNECTION_DISCONNECTED',
          actorId: user.id,
          actorRole: user.role,
          actionType: 'PARENT_DISCONNECT_TEACHER',
          recordType: 'teacher_student_connection',
          recordId: conn.id,
          previousValue: { status: 'active' },
          newValue: { status: 'disconnected', disconnectedBy: 'parent' },
          outcome: 'success',
          ip,
          summary: `Parent ${user.id} disconnected child ${child.id} from teacher ${conn.teacherId}`,
        });

        const familyId = ensureChildFamilyAndGarden(db, child);
        recordFamilyEvent(db, {
          familyId,
          category: 'guardian',
          actionType: 'TEACHER_CONNECTION_DISCONNECTED',
          actorId: user.id,
          actorName: user.displayName,
          actorRole: user.role,
          childId: child.id,
          childName: child.displayName,
          title: { ar: 'إنهاء الربط مع المعلم', en: 'Disconnected from teacher' },
          description: {
            ar: `فصل ${user.displayName} ارتباط الطالب ${child.displayName} بالمعلم`,
            en: `${user.displayName} disconnected ${child.displayName} from teacher`,
          },
          ip,
          securityEventType: 'TEACHER_CONNECTION_DISCONNECTED',
        });

        return { status: 200, body: { disconnected: true, connection: conn } };
      });

      return res.status(outcome.status).json(outcome.body);
    }),
  );

  // =========================================================================
  // 4. PERSISTENT NOTIFICATIONS API
  // =========================================================================
  app.get('/api/notifications', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    ensureFamilyCollections(db);
    const user = req.authSession!.user;
    const list = Object.values(db.notifications || {})
      .filter((n) => n.userId === user.id)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, 60);
    const unreadCount = list.filter((n) => !n.readAt).length;
    return res.json({ notifications: list, unreadCount });
  });

  app.post('/api/notifications/:id/read', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    ensureFamilyCollections(db);
    const user = req.authSession!.user;
    const notifId = req.params.id;
    if (!isValidSafeId(notifId)) {
      return res.status(400).json({ error: 'Invalid notification ID' });
    }
    const notif = db.notifications?.[notifId];
    if (!notif) return res.status(404).json({ error: 'Notification not found' });
    if (notif.userId !== user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (!notif.readAt) {
      notif.readAt = new Date().toISOString();
      saveDb(db);
    }
    return res.json({ notification: notif });
  });

  app.post('/api/notifications/read-all', requireAuth, (req: AuthenticatedRequest, res) => {
    const db = getDb();
    ensureFamilyCollections(db);
    const user = req.authSession!.user;
    const nowIso = new Date().toISOString();
    let updatedCount = 0;
    for (const n of Object.values(db.notifications || {})) {
      if (n.userId === user.id && !n.readAt) {
        n.readAt = nowIso;
        updatedCount += 1;
      }
    }
    if (updatedCount > 0) saveDb(db);
    return res.json({ updatedCount });
  });
}
