import assert from 'node:assert';
import crypto from 'node:crypto';
import { spawn, ChildProcess } from 'node:child_process';

class IsolatedClient {
  private cookies = new Map<string, string>();
  public csrfToken: string | null = null;

  private storeCookies(res: Response) {
    const hdrs = res.headers as Headers & { getSetCookie?: () => string[] };
    const setCookies = typeof hdrs.getSetCookie === 'function' ? hdrs.getSetCookie() : [];
    const fallback = res.headers.get('set-cookie');
    const all = setCookies.length > 0 ? setCookies : fallback ? [fallback] : [];
    for (const raw of all) {
      const [nv] = raw.split(';');
      const idx = nv.indexOf('=');
      if (idx > 0) {
        const name = nv.slice(0, idx).trim();
        const val = nv.slice(idx + 1).trim();
        if (!val || /Max-Age=0/i.test(raw)) this.cookies.delete(name);
        else this.cookies.set(name, val);
      }
    }
  }

  async req<T = Record<string, unknown>>(
    baseUrl: string,
    method: string,
    urlPath: string,
    body?: unknown,
    opts?: { skipCsrf?: boolean; extraHeaders?: Record<string, string> },
  ): Promise<{ status: number; data: T; rawText: string }> {
    const headers: Record<string, string> = { ...(opts?.extraHeaders || {}) };
    const cookieStr = Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
    if (cookieStr) headers['cookie'] = cookieStr;
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (!opts?.skipCsrf && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && this.csrfToken) {
      headers['x-csrf-token'] = this.csrfToken;
    }

    const res = await fetch(`${baseUrl}${urlPath}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    this.storeCookies(res);
    const rawText = await res.text();
    let data = {} as T & { csrfToken?: string };
    try {
      data = rawText
        ? (JSON.parse(rawText) as T & { csrfToken?: string })
        : ({} as T & { csrfToken?: string });
    } catch {
      data = {} as T & { csrfToken?: string };
    }
    if (data && typeof data === 'object' && typeof data.csrfToken === 'string') {
      this.csrfToken = data.csrfToken;
    }
    return { status: res.status, data, rawText };
  }
}

async function waitForReady(baseUrl: string): Promise<void> {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`${baseUrl}/api/health`);
      if (r.ok) {
        const body = (await r.json().catch(() => ({}))) as { serverReady?: boolean };
        if (body.serverReady !== false) return;
      }
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
  const port = 3197;
  const baseUrl = `http://127.0.0.1:${port}`;
  const runtimeSetupSecret = crypto.randomBytes(24).toString('hex');
  const explicitPin = `pin_${crypto.randomBytes(8).toString('hex')}`;

  const proc = spawn('npx', ['tsx', 'server.ts', '--port', String(port)], {
    cwd: process.cwd(),
    detached: true,
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'development',
      SKIP_VITE: '1',
      SQL_HOST: '',
      SQL_DB_NAME: '',
      SQL_USER: '',
      SQL_PASSWORD: '',
      DATABASE_URL: '',
      REQUIRE_POSTGRES: '',
      ADMIN_PIN: explicitPin,
      NONOLAND_ADMIN_SETUP_SECRET: runtimeSetupSecret,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  proc.stderr?.on('data', (chunk) => {
    const line = chunk.toString();
    if (/error|fatal/i.test(line)) process.stderr.write(`[test-server] ${line}`);
  });

  try {
    await waitForReady(baseUrl);

    // 1. Bootstrap Admin & create Teacher A + Teacher B
    const admin = new IsolatedClient();
    const adminEmail = `adm.tconn.${crypto.randomBytes(4).toString('hex')}@example.com`;
    const adminPw = `Adm1n!${crypto.randomBytes(8).toString('hex')}9Z`;
    const boot = await admin.req(baseUrl, 'POST', '/api/auth/admin-bootstrap', {
      setupSecret: runtimeSetupSecret,
      displayName: 'Portal Admin',
      email: adminEmail,
      password: adminPw,
      confirmPassword: adminPw,
    });
    assert.strictEqual(boot.status, 201, `Admin bootstrap failed: ${boot.rawText}`);

    const teacherAEmail = `tcha.${crypto.randomBytes(4).toString('hex')}@example.com`;
    const teacherAPw = `TchA!${crypto.randomBytes(8).toString('hex')}8X`;
    const createTA = await admin.req<{ teacher: { id: string } }>(baseUrl, 'POST', '/api/admin/teachers', {
      displayName: 'Ms. Nadia',
      email: teacherAEmail,
      password: teacherAPw,
      subjects: ['arabic', 'math'],
    });
    assert.strictEqual(createTA.status, 201, `Create Teacher A failed: ${createTA.rawText}`);
    const teacherAId = createTA.data.teacher.id;

    const teacherBEmail = `tchb.${crypto.randomBytes(4).toString('hex')}@example.com`;
    const teacherBPw = `TchB!${crypto.randomBytes(8).toString('hex')}8Y`;
    const createTB = await admin.req<{ teacher: { id: string } }>(baseUrl, 'POST', '/api/admin/teachers', {
      displayName: 'Mr. Tariq',
      email: teacherBEmail,
      password: teacherBPw,
      subjects: ['english'],
    });
    assert.strictEqual(createTB.status, 201, `Create Teacher B failed: ${createTB.rawText}`);

    // Sign in Teacher A & Teacher B
    const teacherA = new IsolatedClient();
    const loginTA = await teacherA.req(baseUrl, 'POST', '/api/auth/login', {
      email: teacherAEmail,
      password: teacherAPw,
    });
    assert.strictEqual(loginTA.status, 200);

    const teacherB = new IsolatedClient();
    const loginTB = await teacherB.req(baseUrl, 'POST', '/api/auth/login', {
      email: teacherBEmail,
      password: teacherBPw,
    });
    assert.strictEqual(loginTB.status, 200);

    // 2. Register Parent A (2 children: Child 1 & Child 2) + Parent B (Child 3)
    const parentA = new IsolatedClient();
    const parentAEmail = `parA.${crypto.randomBytes(4).toString('hex')}@example.com`;
    const parentAPw = `ParA!${crypto.randomBytes(8).toString('hex')}7Q`;
    assert.strictEqual(
      (
        await parentA.req(baseUrl, 'POST', '/api/auth/register', {
          displayName: 'Parent Amina',
          email: parentAEmail,
          password: parentAPw,
          termsAccepted: true,
        })
      ).status,
      201,
    );

    const child1Res = await parentA.req<{ child: { id: string } }>(baseUrl, 'POST', '/api/children', {
      displayName: 'Layla',
      language: 'ar',
      birthYear: new Date().getUTCFullYear() - 3,
      birthMonth: 5,
    });
    assert.strictEqual(child1Res.status, 201);
    const child1Id = child1Res.data.child.id;

    const child2Res = await parentA.req<{ child: { id: string } }>(baseUrl, 'POST', '/api/children', {
      displayName: 'Zaid',
      language: 'en',
      birthYear: new Date().getUTCFullYear() - 2,
      birthMonth: 8,
    });
    assert.strictEqual(child2Res.status, 201);
    const child2Id = child2Res.data.child.id;

    // Issue Child 1 access code so we can test child token RBAC rejection
    assert.strictEqual(
      (await parentA.req(baseUrl, 'POST', '/api/parent/verify-password', { password: parentAPw })).status,
      200,
    );
    const c1Cred = await parentA.req<{ credentials?: { accessCode?: string }; accessCode?: string }>(
      baseUrl,
      'POST',
      `/api/family/children/${encodeURIComponent(child1Id)}/credentials`,
      { pin: '3579' },
    );
    assert.ok(c1Cred.status === 200 || c1Cred.status === 201);
    const child1AccessCode = c1Cred.data.credentials?.accessCode || c1Cred.data.accessCode || '';
    assert.ok(child1AccessCode, `Missing accessCode: ${c1Cred.rawText}`);
    const child1Client = new IsolatedClient();
    const child1Login = await child1Client.req(baseUrl, 'POST', '/api/auth/child-login', {
      accessCode: child1AccessCode,
      pin: '3579',
    });
    assert.strictEqual(child1Login.status, 200, `Child login failed: ${child1Login.rawText}`);

    const parentB = new IsolatedClient();
    const parentBEmail = `parB.${crypto.randomBytes(4).toString('hex')}@example.com`;
    const parentBPw = `ParB!${crypto.randomBytes(8).toString('hex')}7W`;
    assert.strictEqual(
      (
        await parentB.req(baseUrl, 'POST', '/api/auth/register', {
          displayName: 'Parent Omar',
          email: parentBEmail,
          password: parentBPw,
          termsAccepted: true,
        })
      ).status,
      201,
    );
    const child3Res = await parentB.req<{ child: { id: string } }>(baseUrl, 'POST', '/api/children', {
      displayName: 'Salma',
      language: 'ar',
      birthYear: new Date().getUTCFullYear() - 4,
      birthMonth: 3,
    });
    assert.strictEqual(child3Res.status, 201);
    const child3Id = child3Res.data.child.id;

    // =========================================================================
    // TEST 1: Teacher Join Code Generate, Regenerate, Deactivate (old code invalid)
    // =========================================================================
    const gen1 = await teacherA.req<{ activeCode: { code: string; codeLast4: string } }>(
      baseUrl,
      'POST',
      '/api/teacher/join-code/generate',
    );
    assert.strictEqual(gen1.status, 201, `Generate failed: ${gen1.rawText}`);
    const code1 = gen1.data.activeCode.code;
    assert.match(code1, /^TEA-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);

    // Duplicate generate blocked cleanly with 409
    const dupGen = await teacherA.req(baseUrl, 'POST', '/api/teacher/join-code/generate');
    assert.strictEqual(dupGen.status, 409);

    // Regenerate -> old code fails, new code succeeds
    const regen = await teacherA.req<{ activeCode: { code: string }; revokedPreviousCount: number }>(
      baseUrl,
      'POST',
      '/api/teacher/join-code/regenerate',
    );
    assert.strictEqual(regen.status, 201);
    assert.strictEqual(regen.data.revokedPreviousCount, 1);
    const code2 = regen.data.activeCode.code;
    assert.notStrictEqual(code2, code1);

    const oldVal = await parentA.req(baseUrl, 'POST', '/api/parent/teacher-connections/validate-code', {
      code: code1,
    });
    assert.strictEqual(oldVal.status, 404, 'Revoked code1 must fail validation');

    // Deactivate -> code2 also fails, then generate fresh code3
    const deact = await teacherA.req(baseUrl, 'POST', '/api/teacher/join-code/deactivate');
    assert.strictEqual(deact.status, 200);
    const deactVal = await parentA.req(baseUrl, 'POST', '/api/parent/teacher-connections/validate-code', {
      code: code2,
    });
    assert.strictEqual(deactVal.status, 404, 'Deactivated code2 must fail validation');

    const gen3 = await teacherA.req<{ activeCode: { code: string } }>(
      baseUrl,
      'POST',
      '/api/teacher/join-code/generate',
    );
    assert.strictEqual(gen3.status, 201);
    const code3 = gen3.data.activeCode.code;

    // Verify audit logs contain zero plaintext join code strings
    const logsRes = await admin.req<{ logs: Array<{ eventType: string; summary: string }> }>(
      baseUrl,
      'GET',
      '/api/admin/audit-logs?limit=40',
    );
    if (logsRes.status === 200 && Array.isArray(logsRes.data.logs)) {
      const serialized = JSON.stringify(logsRes.data.logs);
      assert.ok(!serialized.includes(code1), 'Audit logs must never store plaintext code1');
      assert.ok(!serialized.includes(code2), 'Audit logs must never store plaintext code2');
      assert.ok(!serialized.includes(code3), 'Audit logs must never store plaintext code3');
    }
    console.log('PASS [1]: Teacher join code generate/regenerate/deactivate + zero plaintext audit leak.');

    // =========================================================================
    // TEST 2: Malformed / invalid code + rate limiting (429) on validate-code
    // =========================================================================
    const malRes = await parentA.req(baseUrl, 'POST', '/api/parent/teacher-connections/validate-code', {
      code: 'BAD!1',
    });
    assert.strictEqual(malRes.status, 400);

    // Rate limit test using Parent B (limit is 15 per 10 min per user)
    let got429 = false;
    for (let i = 0; i < 18; i++) {
      const r = await parentB.req(baseUrl, 'POST', '/api/parent/teacher-connections/validate-code', {
        code: 'TEA-ZZZZZZ',
      });
      if (r.status === 429) {
        got429 = true;
        break;
      }
    }
    assert.strictEqual(got429, true, 'Parent validate-code rate limit (429) must trigger');
    console.log('PASS [2]: Malformed format rejection (400) & brute-force rate limiting (429) verified.');

    // =========================================================================
    // TEST 3: Parent validates active code -> limited public preview only, submits & cancels
    // =========================================================================
    const valOk = await parentA.req<{ valid: boolean; teacher: Record<string, unknown> }>(
      baseUrl,
      'POST',
      '/api/parent/teacher-connections/validate-code',
      { code: code3.toLowerCase() },
    );
    assert.strictEqual(valOk.status, 200);
    assert.strictEqual(valOk.data.valid, true);
    assert.strictEqual(valOk.data.teacher.teacherDisplayName, 'Ms. Nadia');
    assert.strictEqual(valOk.data.teacher.email, undefined, 'Preview must NOT leak teacher email');
    assert.strictEqual(valOk.data.teacher.classes, undefined, 'Preview must NOT leak classes');

    const submitCancelTarget = await parentA.req<{ request: { id: string; status: string } }>(
      baseUrl,
      'POST',
      '/api/parent/teacher-connections/requests',
      { childId: child1Id, code: code3 },
    );
    assert.strictEqual(submitCancelTarget.status, 201);
    const reqCancelId = submitCancelTarget.data.request.id;

    // Cancel pending request by Parent A
    const cancelRes = await parentA.req(
      baseUrl,
      'POST',
      `/api/parent/teacher-connections/requests/${encodeURIComponent(reqCancelId)}/cancel`,
    );
    assert.strictEqual(cancelRes.status, 200);
    console.log('PASS [3]: Limited teacher preview + request submission + parent cancellation verified.');

    // =========================================================================
    // TEST 4: Teacher approves request -> deduplication + full authorized access
    // =========================================================================
    // Also place Child 1 inside an Admin class for Teacher A to test deduplication ('both')
    const clsRes = await admin.req<{ classroom: { id: string } }>(baseUrl, 'POST', '/api/admin/classes', {
      name: 'KG-A',
      subject: 'arabic',
      level: 1,
      teacherId: teacherAId,
      studentIds: [child1Id],
    });
    assert.strictEqual(clsRes.status, 201);

    // Parent A re-requests connection for Child 1 (will become 'both')
    const req1Res = await parentA.req<{ request: { id: string } }>(
      baseUrl,
      'POST',
      '/api/parent/teacher-connections/requests',
      { childId: child1Id, code: code3 },
    );
    assert.strictEqual(req1Res.status, 201);
    const req1Id = req1Res.data.request.id;

    // Duplicate pending request blocked cleanly (409)
    const dupReq = await parentA.req(baseUrl, 'POST', '/api/parent/teacher-connections/requests', {
      childId: child1Id,
      code: code3,
    });
    assert.strictEqual(dupReq.status, 409);

    // Teacher A approves Child 1
    const app1 = await teacherA.req<{ approved: boolean; connection: { id: string } }>(
      baseUrl,
      'POST',
      `/api/teacher/connection-requests/${encodeURIComponent(req1Id)}/approve`,
    );
    assert.strictEqual(app1.status, 200);
    const conn1Id = app1.data.connection.id;

    // Parent A also requests Child 2 -> Teacher A rejects with reason
    const req2Res = await parentA.req<{ request: { id: string } }>(
      baseUrl,
      'POST',
      '/api/parent/teacher-connections/requests',
      { childId: child2Id, code: code3 },
    );
    assert.strictEqual(req2Res.status, 201);
    const req2Id = req2Res.data.request.id;

    const rej2 = await teacherA.req(
      baseUrl,
      'POST',
      `/api/teacher/connection-requests/${encodeURIComponent(req2Id)}/reject`,
      { reason: 'Class capacity is currently full' },
    );
    assert.strictEqual(rej2.status, 200);

    // Parent A removes Child 1 from class later or checks deduplication right now -> must appear once with 'both'
    const stuList = await teacherA.req<{
      students: Array<{ id: string; connectionSource: string; connectionId?: string }>;
    }>(baseUrl, 'GET', '/api/teacher/students');
    assert.strictEqual(stuList.status, 200);
    const child1Rows = stuList.data.students.filter((s) => s.id === child1Id);
    assert.strictEqual(child1Rows.length, 1, 'Child 1 in class AND connected must be deduplicated to 1 row');
    assert.strictEqual(child1Rows[0].connectionSource, 'both');
    assert.strictEqual(child1Rows[0].connectionId, conn1Id);

    // Now test a PURE connected-only student: Admin creates empty class or parent connects Child 2 after re-approval
    const req2b = await parentA.req<{ request: { id: string } }>(
      baseUrl,
      'POST',
      '/api/parent/teacher-connections/requests',
      { childId: child2Id, code: code3 },
    );
    assert.strictEqual(req2b.status, 201);
    const app2b = await teacherA.req<{ connection: { id: string } }>(
      baseUrl,
      'POST',
      `/api/teacher/connection-requests/${encodeURIComponent(req2b.data.request.id)}/approve`,
    );
    assert.strictEqual(app2b.status, 200);
    const conn2Id = app2b.data.connection.id;

    // Connected-only Child 2: Teacher A can view progress, create/assign exam, create homework
    assert.strictEqual(
      (await teacherA.req(baseUrl, 'GET', `/api/teacher/students/${encodeURIComponent(child2Id)}/progress`)).status,
      200,
    );

    const lessonsRes = await teacherA.req<{ lessons: Array<{ id: string; level: number; subject: string }> }>(
      baseUrl,
      'GET',
      '/api/teacher/lessons',
    );
    assert.strictEqual(lessonsRes.status, 200);
    const validLessonId =
      lessonsRes.data.lessons.find((l) => l.level === 1 && l.subject === 'arabic')?.id ||
      lessonsRes.data.lessons[0]?.id;
    assert.ok(validLessonId, 'Expected at least one valid teacher lesson');

    const qRes = await teacherA.req<{ question: { id: string } }>(baseUrl, 'POST', '/api/teacher/questions', {
      subject: 'arabic',
      level: 1,
      lessonId: validLessonId,
      questionType: 'multiple-choice',
      promptAr: 'ما هو الحرف الأول؟',
      promptEn: 'What is the first letter?',
      options: [
        { id: 'a', textAr: 'أ', textEn: 'Alif' },
        { id: 'b', textAr: 'ب', textEn: 'Ba' },
      ],
      correctOptionId: 'a',
      marks: 2,
      difficulty: 'easy',
    });
    assert.strictEqual(qRes.status, 201, `Question create failed: ${qRes.rawText}`);

    const exRes = await teacherA.req<{ exam: { id: string } }>(baseUrl, 'POST', '/api/teacher/exams', {
      title: { ar: 'اختبار الحروف', en: 'Letters Quiz' },
      subject: 'arabic',
      level: 1,
      ageGroup: '1-4',
      questionIds: [qRes.data.question.id],
      totalMarks: 2,
      passingPercentage: 50,
      durationMinutes: 10,
      startDate: new Date(Date.now() - 60_000).toISOString(),
      endDate: new Date(Date.now() + 86400_000).toISOString(),
      allowedAttempts: 2,
      status: 'published',
    });
    assert.strictEqual(exRes.status, 201, `Exam create failed: ${exRes.rawText}`);

    const assignEx = await teacherA.req(
      baseUrl,
      'POST',
      `/api/teacher/exams/${encodeURIComponent(exRes.data.exam.id)}/assign`,
      { studentIds: [child2Id], publishNow: true },
    );
    assert.ok(
      assignEx.status === 200 || assignEx.status === 201,
      `Exam assign failed: ${assignEx.status} ${assignEx.rawText}`,
    );

    const hwRes = await teacherA.req(baseUrl, 'POST', '/api/teacher/homework', {
      title: { ar: 'واجب الحرف الأول', en: 'First Letter Homework' },
      instructions: { ar: 'أكمل التمرين', en: 'Complete the exercise' },
      homeworkType: 'reading-practice',
      subject: 'arabic',
      level: 1,
      lessonIds: [validLessonId],
      studentIds: [child2Id],
      startDate: new Date(Date.now() - 60_000).toISOString(),
      deadline: new Date(Date.now() + 86400_000).toISOString(),
      maxAttempts: 2,
      publish: true,
    });
    assert.strictEqual(hwRes.status, 201, `Homework create failed: ${hwRes.rawText}`);
    console.log('PASS [4 & 5]: Request approve/reject + deduplication + progress/exam/homework access verified.');

    // =========================================================================
    // TEST 6: Strict Cross-User Isolation (403 checks)
    // =========================================================================
    // Teacher A cannot access Parent B's unconnected Child 3
    assert.strictEqual(
      (await teacherA.req(baseUrl, 'GET', `/api/teacher/students/${encodeURIComponent(child3Id)}/progress`)).status,
      403,
    );
    // Teacher B cannot access Teacher A's connected Child 2
    assert.strictEqual(
      (await teacherB.req(baseUrl, 'GET', `/api/teacher/students/${encodeURIComponent(child2Id)}/progress`)).status,
      403,
    );
    // Teacher B cannot disconnect Teacher A's connection
    assert.strictEqual(
      (await teacherB.req(baseUrl, 'DELETE', `/api/teacher/connections/${encodeURIComponent(conn2Id)}`)).status,
      403,
    );
    // Parent B cannot disconnect Parent A's connection
    assert.strictEqual(
      (await parentB.req(baseUrl, 'DELETE', `/api/parent/teacher-connections/${encodeURIComponent(conn2Id)}`)).status,
      403,
    );
    // Child session cannot call teacher or parent connection endpoints
    assert.strictEqual(
      (await child1Client.req(baseUrl, 'GET', '/api/teacher/join-code')).status,
      403,
    );
    assert.strictEqual(
      (await child1Client.req(baseUrl, 'GET', '/api/parent/teacher-connections')).status,
      403,
    );
    console.log('PASS [6]: Cross-teacher, cross-parent, unconnected child, and child-token isolation enforced (403).');

    // =========================================================================
    // TEST 7: Disconnect immediately revokes access + allows clean reconnection
    // =========================================================================
    const disc2 = await parentA.req(
      baseUrl,
      'DELETE',
      `/api/parent/teacher-connections/${encodeURIComponent(conn2Id)}`,
    );
    assert.strictEqual(disc2.status, 200);

    // Immediate revocation on Teacher A progress, exam assign, homework create
    assert.strictEqual(
      (await teacherA.req(baseUrl, 'GET', `/api/teacher/students/${encodeURIComponent(child2Id)}/progress`)).status,
      403,
    );
    assert.strictEqual(
      (
        await teacherA.req(
          baseUrl,
          'POST',
          `/api/teacher/exams/${encodeURIComponent(exRes.data.exam.id)}/assign`,
          { studentIds: [child2Id] },
        )
      ).status,
      403,
    );
    assert.strictEqual(
      (
        await teacherA.req(baseUrl, 'POST', '/api/teacher/homework', {
          title: { ar: 'واجب بعد الفصل', en: 'After disconnect' },
          homeworkType: 'reading-practice',
          subject: 'arabic',
          level: 1,
          lessonIds: [validLessonId],
          studentIds: [child2Id],
          startDate: new Date(Date.now() - 60_000).toISOString(),
          deadline: new Date(Date.now() + 86400_000).toISOString(),
        })
      ).status,
      403,
    );

    // Reconnection allowed cleanly
    const reReq = await parentA.req<{ request: { id: string } }>(
      baseUrl,
      'POST',
      '/api/parent/teacher-connections/requests',
      { childId: child2Id, code: code3 },
    );
    assert.strictEqual(reReq.status, 201);
    const reApp = await teacherA.req(
      baseUrl,
      'POST',
      `/api/teacher/connection-requests/${encodeURIComponent(reReq.data.request.id)}/approve`,
    );
    assert.strictEqual(reApp.status, 200);
    assert.strictEqual(
      (await teacherA.req(baseUrl, 'GET', `/api/teacher/students/${encodeURIComponent(child2Id)}/progress`)).status,
      200,
    );
    console.log('PASS [7]: Immediate revocation upon disconnect (403) + clean reconnection verified.');

    // =========================================================================
    // TEST 8: Persistent Notifications & Parent Overview connectedTeachers
    // =========================================================================
    const tNotifs = await teacherA.req<{ notifications: Array<{ id: string }>; unreadCount: number }>(
      baseUrl,
      'GET',
      '/api/notifications',
    );
    assert.strictEqual(tNotifs.status, 200);
    assert.ok(tNotifs.data.notifications.length >= 2);
    assert.ok(tNotifs.data.unreadCount >= 1);

    const markAll = await teacherA.req<{ updatedCount: number }>(baseUrl, 'POST', '/api/notifications/read-all');
    assert.strictEqual(markAll.status, 200);

    const tNotifsAfter = await teacherA.req<{ unreadCount: number }>(baseUrl, 'GET', '/api/notifications');
    assert.strictEqual(tNotifsAfter.data.unreadCount, 0);

    const pOverview = await parentA.req<{ connectedTeachers?: Array<{ teacherId: string; teacherName: string }> }>(
      baseUrl,
      'GET',
      `/api/parent/children/${encodeURIComponent(child2Id)}/overview`,
    );
    assert.strictEqual(pOverview.status, 200);
    assert.ok(
      pOverview.data.connectedTeachers?.some((ct) => ct.teacherId === teacherAId),
      'Parent child overview must include connectedTeachers',
    );
    console.log('PASS [8]: Persistent notifications + read-all + parent child overview verified.');

    console.log('\nALL TEACHER CONNECTION & SECURITY ISOLATION TESTS PASSED.');
  } finally {
    stopChild(proc);
  }
}

run().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
