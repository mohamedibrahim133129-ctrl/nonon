import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { GraduationCap } from 'lucide-react';
import { TeacherHomeworkPanel } from '../components/TeacherHomeworkPanel';
import { TeacherConnectionsSection } from '../components/teacher/TeacherConnectionsSection';
import {
  TeacherAssignExamView,
  TeacherClassesView,
  TeacherCreateExamView,
  TeacherExamsListView,
  TeacherProfileView,
  TeacherQuestionBankView,
  TeacherResultsView,
  TeacherStudentPerformanceView,
} from '../components/teacher/TeacherCurriculumSections';
import { TeacherOverviewSection } from '../components/teacher/TeacherOverviewSection';
import { TeacherPortalShell } from '../components/teacher/TeacherPortalShell';
import { TeacherStudentsSection } from '../components/teacher/TeacherStudentsSection';
import type {
  LessonOption,
  StudentDrilldownData,
  TeacherActiveConnectionRow,
  TeacherClassRow,
  TeacherConnectionRequestRow,
  TeacherDashboardData,
  TeacherExamRow,
  TeacherJoinCodeState,
  TeacherResultRow,
  TeacherSection,
  TeacherStudentRow,
} from '../components/teacher/teacherTypes';
import { useNonoLand } from '../context/NonoLandContext';
import type {
  AgeGroupId,
  ExamStatus,
  TeacherExam,
  TeacherQuestion,
  TeacherQuestionDifficulty,
  TeacherQuestionType,
  TeacherStudentSource,
  TeacherSubject,
  UserNotification,
} from '../types/nonoland';
import { UNIFIED_STAGE_ID } from '../utils/ageAdaptation';
import { validatePassword } from '../utils/validation';

export const TeacherDashboardScreen: React.FC = () => {
  const { authSession, language, setLanguage, navigate, logoutParent, refreshAuthSession } = useNonoLand();
  const isAr = language === 'ar';

  const [section, setSection] = useState<TeacherSection>('overview');
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [globalSearch, setGlobalSearch] = useState('');

  // Core server data states
  const [dashboard, setDashboard] = useState<TeacherDashboardData | null>(null);
  const [classes, setClasses] = useState<TeacherClassRow[]>([]);
  const [students, setStudents] = useState<TeacherStudentRow[]>([]);
  const [lessons, setLessons] = useState<LessonOption[]>([]);
  const [questions, setQuestions] = useState<TeacherQuestion[]>([]);
  const [exams, setExams] = useState<TeacherExamRow[]>([]);
  const [results, setResults] = useState<TeacherResultRow[]>([]);

  // Join code, connection requests, active connections & notifications
  const [joinCodeState, setJoinCodeState] = useState<TeacherJoinCodeState>({
    activeCode: null,
    recentHistory: [],
  });
  const [connectionRequests, setConnectionRequests] = useState<TeacherConnectionRequestRow[]>([]);
  const [activeConnections, setActiveConnections] = useState<TeacherActiveConnectionRow[]>([]);
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);

  // Student filters & drilldown
  const [studentSearch, setStudentSearch] = useState('');
  const [studentSourceFilter, setStudentSourceFilter] = useState<'all' | TeacherStudentSource>('all');
  const [studentLevelFilter, setStudentLevelFilter] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [studentDrilldown, setStudentDrilldown] = useState<StudentDrilldownData | null>(null);

  // Question Bank filters & builder state
  const [qFilterSubject, setQFilterSubject] = useState('');
  const [qFilterLevel, setQFilterLevel] = useState('');
  const [qFilterType, setQFilterType] = useState('');
  const [qSearch, setQSearch] = useState('');
  const [previewQuestion, setPreviewQuestion] = useState<TeacherQuestion | null>(null);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);

  const [qSubject, setQSubject] = useState<TeacherSubject>('arabic');
  const [qLevel, setQLevel] = useState<1 | 2>(1);
  const [qLessonId, setQLessonId] = useState('L1-AR01');
  const [qType, setQType] = useState<TeacherQuestionType>('multiple-choice');
  const [qPromptAr, setQPromptAr] = useState('');
  const [qPromptEn, setQPromptEn] = useState('');
  const [qAudioText, setQAudioText] = useState('');
  const [qImageUrl, setQImageUrl] = useState('');
  const [qOptAAr, setQOptAAr] = useState('');
  const [qOptAEn, setQOptAEn] = useState('');
  const [qOptBAr, setQOptBAr] = useState('');
  const [qOptBEn, setQOptBEn] = useState('');
  const [qOptCAr, setQOptCAr] = useState('');
  const [qOptCEn, setQOptCEn] = useState('');
  const [qCorrectId, setQCorrectId] = useState('a');
  const [qAcceptedAnswers, setQAcceptedAnswers] = useState('');
  const [qMatchingRaw, setQMatchingRaw] = useState('أ => 🦁 أسد\nب => 🦆 بطة');
  const [qOrderRaw, setQOrderRaw] = useState('1\n2\n3');
  const [qMarks, setQMarks] = useState(2);
  const [qDiff, setQDiff] = useState<TeacherQuestionDifficulty>('medium');
  const [qExplainAr, setQExplainAr] = useState('');
  const [qExplainEn, setQExplainEn] = useState('');

  // Bulk import state
  const [importPreview, setImportPreview] = useState<{
    importBatchId: string;
    totalRows: number;
    validCount: number;
    invalidCount: number;
    validRows: Array<{ rowNumber: number; question: { lessonId: string; promptAr: string; promptEn: string; questionType: string } }>;
    invalidRows: Array<{ rowNumber: number; errors: string[] }>;
  } | null>(null);
  const [importing, setImporting] = useState(false);

  // Exam builder state
  const [exTitleAr, setExTitleAr] = useState('');
  const [exTitleEn, setExTitleEn] = useState('');
  const [exDescAr, setExDescAr] = useState('');
  const [exDescEn, setExDescEn] = useState('');
  const [exSubject, setExSubject] = useState<TeacherExam['subject']>('arabic');
  const [exLevel, setExLevel] = useState<1 | 2>(1);
  const [exAgeGroup, setExAgeGroup] = useState<AgeGroupId>(UNIFIED_STAGE_ID);
  const [exQuestionIds, setExQuestionIds] = useState<string[]>([]);
  const [exPassingPct, setExPassingPct] = useState(70);
  const [exDurationMin, setExDurationMin] = useState(20);
  const [exStartDate, setExStartDate] = useState(() => new Date(Date.now() - 60_000).toISOString().slice(0, 16));
  const [exEndDate, setExEndDate] = useState(() => new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 16));
  const [exAttempts, setExAttempts] = useState(2);
  const [exRandQ, setExRandQ] = useState(true);
  const [exRandA, setExRandA] = useState(true);
  const [exShowRes, setExShowRes] = useState(true);
  const [exShowCorr, setExShowCorr] = useState(true);
  const [exStatus, setExStatus] = useState<ExamStatus>('draft');

  // Assign exams state
  const [assignExamId, setAssignExamId] = useState('');
  const [assignClassIds, setAssignClassIds] = useState<string[]>([]);
  const [assignStudentIds, setAssignStudentIds] = useState<string[]>([]);
  const [assignPublishNow, setAssignPublishNow] = useState(true);
  const [assignConfirmOpen, setAssignConfirmOpen] = useState(false);

  // Profile & password state
  const [profName, setProfName] = useState(authSession.user?.name || '');
  const [profBio, setProfBio] = useState(authSession.user?.teacherProfile?.bio || '');
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confPw, setConfPw] = useState('');

  const apiFetch = useCallback(
    async (url: string, init: RequestInit = {}) => {
      const headers: Record<string, string> = {
        ...(init.headers as Record<string, string> | undefined),
      };
      if (authSession.csrfToken && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(init.method || 'GET')) {
        headers['x-csrf-token'] = authSession.csrfToken;
      }
      return fetch(url, { ...init, credentials: 'include', headers });
    },
    [authSession.csrfToken],
  );

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [dRes, cRes, sRes, lRes, qRes, eRes, rRes, jcRes, crRes, nRes] = await Promise.all([
        apiFetch('/api/teacher/dashboard'),
        apiFetch('/api/teacher/classes'),
        apiFetch('/api/teacher/students'),
        apiFetch('/api/teacher/lessons'),
        apiFetch('/api/teacher/questions'),
        apiFetch('/api/teacher/exams'),
        apiFetch('/api/teacher/results'),
        apiFetch('/api/teacher/join-code'),
        apiFetch('/api/teacher/connection-requests'),
        apiFetch('/api/notifications'),
      ]);
      if (dRes.ok) setDashboard(await dRes.json());
      if (cRes.ok) setClasses((await cRes.json()).classes || []);
      if (sRes.ok) setStudents((await sRes.json()).students || []);
      if (lRes.ok) setLessons((await lRes.json()).lessons || []);
      if (qRes.ok) setQuestions((await qRes.json()).questions || []);
      if (eRes.ok) setExams((await eRes.json()).exams || []);
      if (rRes.ok) setResults((await rRes.json()).results || []);
      if (jcRes.ok) {
        const jcData = await jcRes.json();
        setJoinCodeState({
          activeCode: jcData.activeCode || null,
          recentHistory: jcData.recentHistory || [],
        });
      }
      if (crRes.ok) {
        const crData = await crRes.json();
        setConnectionRequests(crData.requests || []);
        setActiveConnections(crData.activeConnections || []);
      }
      if (nRes.ok) {
        const nData = await nRes.json();
        setNotifications(nData.notifications || []);
        setUnreadNotificationsCount(Number(nData.unreadCount || 0));
      }
    } catch {
      // handled cleanly
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    if (authSession.authenticated && authSession.user?.role === 'teacher') {
      void loadAll();
      setProfName(authSession.user.name || '');
      setProfBio(authSession.user.teacherProfile?.bio || '');
    }
  }, [authSession.authenticated, authSession.user, loadAll]);

  const lessonsForLevel = useMemo(
    () => lessons.filter((l) => l.level === qLevel),
    [lessons, qLevel],
  );

  useEffect(() => {
    if (lessonsForLevel.length > 0 && !lessonsForLevel.some((l) => l.id === qLessonId)) {
      setQLessonId(lessonsForLevel[0].id);
    }
  }, [lessonsForLevel, qLessonId]);

  const filteredQuestions = useMemo(() => {
    return questions.filter((q) => {
      if (qFilterSubject && q.subject !== qFilterSubject) return false;
      if (qFilterLevel && String(q.level) !== qFilterLevel) return false;
      if (qFilterType && q.questionType !== qFilterType) return false;
      if (
        qSearch &&
        !q.promptAr.toLowerCase().includes(qSearch.toLowerCase()) &&
        !q.promptEn.toLowerCase().includes(qSearch.toLowerCase()) &&
        !q.lessonId.toLowerCase().includes(qSearch.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [questions, qFilterSubject, qFilterLevel, qFilterType, qSearch]);

  const selectedExamMarksTotal = useMemo(() => {
    return exQuestionIds.reduce((sum, id) => {
      const q = questions.find((x) => x.id === id);
      return sum + (q?.marks || 0);
    }, 0);
  }, [exQuestionIds, questions]);

  const pendingRequests = useMemo(
    () => connectionRequests.filter((r) => r.status === 'pending'),
    [connectionRequests],
  );

  const draftExams = useMemo(
    () => exams.filter((e) => e.status === 'draft' || e.status === 'pending-review'),
    [exams],
  );
  const publishedExams = useMemo(
    () => exams.filter((e) => e.status === 'published' || e.status === 'active' || e.status === 'scheduled'),
    [exams],
  );

  if (!authSession.authenticated || authSession.user?.role !== 'teacher') {
    return (
      <div dir={isAr ? 'rtl' : 'ltr'} className="min-h-screen bg-[#FFF8E9] flex items-center justify-center p-4">
        <div className="max-w-md w-full rounded-2xl p-8 bg-white border border-[#27345C]/12 text-center space-y-4">
          <GraduationCap className="w-12 h-12 mx-auto text-[#8054D9]" />
          <h2 className="text-xl font-extrabold text-[#27345C]">
            {isAr ? 'بوابة المعلم المحمية' : 'Protected Teacher Portal'}
          </h2>
          <p className="text-xs font-semibold text-[#27345C]/70 leading-relaxed">
            {isAr
              ? 'هذه المساحة مخصصة للمعلمين المعتمدين من الإدارة فقط. يرجى تسجيل الدخول بحساب معلم نشط.'
              : 'This portal requires an active, admin-approved Teacher account.'}
          </p>
          <div className="flex justify-center gap-3">
            <button
              type="button"
              onClick={() => navigate('parent-auth')}
              className="min-h-[42px] px-5 rounded-xl bg-[#8054D9] text-white text-xs font-extrabold cursor-pointer"
            >
              {isAr ? 'تسجيل دخول المعلم' : 'Sign In as Teacher'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Join Code & Connection Handlers
  const handleGenerateCode = async () => {
    setErrorMsg('');
    setNotice('');
    setBusyAction('generate-code');
    try {
      const res = await apiFetch('/api/teacher/join-code/generate', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setErrorMsg(data.error || 'Could not generate join code');
      setNotice(isAr ? 'تم إنشاء رمز الانضمام بنجاح.' : 'Teacher join code generated.');
      await loadAll();
    } finally {
      setBusyAction(null);
    }
  };

  const handleRegenerateCode = async () => {
    setErrorMsg('');
    setNotice('');
    setBusyAction('regenerate-code');
    try {
      const res = await apiFetch('/api/teacher/join-code/regenerate', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setErrorMsg(data.error || 'Could not regenerate join code');
      setNotice(isAr ? 'تم إصدار رمز جديد وإلغاء الرمز السابق.' : 'New join code generated; previous code deactivated.');
      await loadAll();
    } finally {
      setBusyAction(null);
    }
  };

  const handleDeactivateCode = async () => {
    setErrorMsg('');
    setNotice('');
    setBusyAction('deactivate-code');
    try {
      const res = await apiFetch('/api/teacher/join-code/deactivate', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setErrorMsg(data.error || 'Could not deactivate join code');
      setNotice(isAr ? 'تم إيقاف رمز الانضمام.' : 'Teacher join code deactivated.');
      await loadAll();
    } finally {
      setBusyAction(null);
    }
  };

  const handleApproveRequest = async (requestId: string) => {
    setErrorMsg('');
    setNotice('');
    setBusyAction(`approve-${requestId}`);
    try {
      const res = await apiFetch(`/api/teacher/connection-requests/${encodeURIComponent(requestId)}/approve`, {
        method: 'POST',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setErrorMsg(data.error || 'Could not approve request');
      setNotice(isAr ? 'تمت الموافقة على ربط الطالب بنجاح.' : 'Student connection approved.');
      await loadAll();
    } finally {
      setBusyAction(null);
    }
  };

  const handleRejectRequest = async (requestId: string, reason?: string) => {
    setErrorMsg('');
    setNotice('');
    setBusyAction(`reject-${requestId}`);
    try {
      const res = await apiFetch(`/api/teacher/connection-requests/${encodeURIComponent(requestId)}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setErrorMsg(data.error || 'Could not reject request');
      setNotice(isAr ? 'تم رفض الطلب.' : 'Connection request declined.');
      await loadAll();
    } finally {
      setBusyAction(null);
    }
  };

  const handleDisconnectStudent = async (connectionId: string) => {
    setErrorMsg('');
    setNotice('');
    setBusyAction(`disconnect-${connectionId}`);
    try {
      const res = await apiFetch(`/api/teacher/connections/${encodeURIComponent(connectionId)}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setErrorMsg(data.error || 'Could not disconnect student');
      setNotice(isAr ? 'تم فصل ربط الطالب وإلغاء الوصول فوراً.' : 'Student connection disconnected.');
      await loadAll();
    } finally {
      setBusyAction(null);
    }
  };

  const handleMarkNotificationRead = async (id: string) => {
    const res = await apiFetch(`/api/notifications/${encodeURIComponent(id)}/read`, { method: 'POST' });
    if (res.ok) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)),
      );
      setUnreadNotificationsCount((c) => Math.max(0, c - 1));
    }
  };

  const handleMarkAllNotificationsRead = async () => {
    const res = await apiFetch('/api/notifications/read-all', { method: 'POST' });
    if (res.ok) {
      const now = new Date().toISOString();
      setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt || now })));
      setUnreadNotificationsCount(0);
    }
  };

  // Curriculum, Question Bank, Exam, Results, Profile Handlers
  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setNotice('');

    const payload: Record<string, unknown> = {
      subject: qSubject,
      level: qLevel,
      lessonId: qLessonId,
      questionType: qType,
      promptAr: qPromptAr,
      promptEn: qPromptEn,
      audioText: qAudioText || undefined,
      imageUrl: qImageUrl || undefined,
      marks: Number(qMarks),
      difficulty: qDiff,
      explanation: { ar: qExplainAr, en: qExplainEn },
    };

    if (qType === 'true-false') {
      payload.options = [
        { id: 'a', textAr: qOptAAr || 'صح', textEn: qOptAEn || 'True' },
        { id: 'b', textAr: qOptBAr || 'خطأ', textEn: qOptBEn || 'False' },
      ];
      payload.correctOptionId = qCorrectId === 'b' ? 'b' : 'a';
    } else if (qType === 'multiple-choice' || qType === 'picture-id' || qType === 'audio-id') {
      const opts = [
        { id: 'a', textAr: qOptAAr, textEn: qOptAEn },
        { id: 'b', textAr: qOptBAr, textEn: qOptBEn },
      ];
      if (qOptCAr || qOptCEn) opts.push({ id: 'c', textAr: qOptCAr, textEn: qOptCEn });
      payload.options = opts;
      payload.correctOptionId = qCorrectId;
    } else if (qType === 'matching') {
      payload.matchingPairs = qMatchingRaw
        .split('\n')
        .map((line, i) => {
          const [left, right] = line.split('=>').map((x) => x.trim());
          return { id: `p${i + 1}`, left: left || '', right: right || '' };
        })
        .filter((p) => p.left && p.right);
    } else if (qType === 'ordering') {
      payload.correctOrder = qOrderRaw.split('\n').map((s) => s.trim()).filter(Boolean);
    } else {
      payload.acceptedAnswers = qAcceptedAnswers.split('|').map((s) => s.trim()).filter(Boolean);
    }

    const url = editingQuestionId ? `/api/teacher/questions/${editingQuestionId}` : '/api/teacher/questions';
    const method = editingQuestionId ? 'PATCH' : 'POST';
    const res = await apiFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      setErrorMsg(data.error || 'Could not save question');
      return;
    }

    setNotice(
      editingQuestionId
        ? isAr ? 'تم تحديث السؤال' : 'Question updated'
        : isAr ? 'تم حفظ السؤال في البنك' : 'Question added to Question Bank',
    );
    setEditingQuestionId(null);
    setQPromptAr('');
    setQPromptEn('');
    setQOptAAr('');
    setQOptAEn('');
    setQOptBAr('');
    setQOptBEn('');
    setQOptCAr('');
    setQOptCEn('');
    await loadAll();
  };

  const handleBulkFile = async (file: File) => {
    setErrorMsg('');
    setNotice('');
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await apiFetch('/api/teacher/questions/import/preview', {
        method: 'POST',
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Bulk import validation failed');
        return;
      }
      setImportPreview(data);
    } catch {
      setErrorMsg('Failed to upload file');
    } finally {
      setImporting(false);
    }
  };

  const handleCommitBulkImport = async () => {
    if (!importPreview?.importBatchId) return;
    const res = await apiFetch('/api/teacher/questions/import/commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ importBatchId: importPreview.importBatchId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErrorMsg(data.error || 'Import commit failed');
      return;
    }
    setNotice(
      isAr
        ? `تم استيراد ${data.importedCount} سؤالاً بنجاح!`
        : `Successfully imported ${data.importedCount} questions!`,
    );
    setImportPreview(null);
    await loadAll();
  };

  const handleCreateExam = async (e: React.FormEvent, desiredStatus?: ExamStatus) => {
    e.preventDefault();
    setErrorMsg('');
    setNotice('');
    const res = await apiFetch('/api/teacher/exams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: { ar: exTitleAr, en: exTitleEn },
        description: { ar: exDescAr, en: exDescEn },
        subject: exSubject,
        level: exLevel,
        ageGroup: exAgeGroup,
        questionIds: exQuestionIds,
        totalMarks: selectedExamMarksTotal,
        passingPercentage: Number(exPassingPct),
        durationMinutes: Number(exDurationMin),
        startDate: new Date(exStartDate).toISOString(),
        endDate: new Date(exEndDate).toISOString(),
        allowedAttempts: Number(exAttempts),
        randomizeQuestions: exRandQ,
        randomizeAnswers: exRandA,
        showResults: exShowRes,
        showCorrectAnswers: exShowCorr,
        status: desiredStatus || exStatus,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErrorMsg(data.error || 'Failed to save exam');
      return;
    }
    setNotice(
      isAr
        ? `تم إنشاء الامتحان (${data.exam.status})`
        : `Exam created cleanly (${data.exam.status})`,
    );
    setExTitleAr('');
    setExTitleEn('');
    setExQuestionIds([]);
    await loadAll();
    setSection('my-exams');
  };

  const handleConfirmAssign = async () => {
    if (!assignExamId) return;
    setErrorMsg('');
    setNotice('');
    const res = await apiFetch(`/api/teacher/exams/${assignExamId}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        classIds: assignClassIds,
        studentIds: assignStudentIds,
        publishNow: assignPublishNow,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErrorMsg(data.error || 'Assignment failed');
      return;
    }
    setAssignConfirmOpen(false);
    setNotice(
      isAr
        ? `تم إسناد الامتحان إلى ${data.assignedCount} طالباً`
        : `Exam assigned to ${data.assignedCount} student(s) (skipped ${data.skippedDuplicates} duplicate(s)).`,
    );
    await loadAll();
  };

  const loadStudentDrilldown = async (studentId: string) => {
    setSelectedStudentId(studentId);
    const res = await apiFetch(`/api/teacher/students/${studentId}/progress`);
    if (res.ok) {
      setStudentDrilldown(await res.json());
      setSection('student-performance');
    } else {
      const data = await res.json().catch(() => ({}));
      setErrorMsg(data.error || 'Cannot access student progress');
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setNotice('');
    const res = await apiFetch('/api/auth/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: profName, bio: profBio }),
    });
    const data = await res.json();
    if (!res.ok) return setErrorMsg(data.error || 'Profile update failed');
    await refreshAuthSession();
    setNotice(isAr ? 'تم تحديث بيانات الحساب' : 'Profile updated cleanly');
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setNotice('');
    const pwEval = validatePassword(newPw, authSession.user?.email, profName);
    if (!pwEval.ok) return setErrorMsg(pwEval.error || 'Weak password');
    if (newPw !== confPw) return setErrorMsg('Passwords do not match');

    const res = await apiFetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: curPw, newPassword: newPw, confirmPassword: confPw }),
    });
    const data = await res.json();
    if (!res.ok) return setErrorMsg(data.error || 'Password change failed');
    setCurPw('');
    setNewPw('');
    setConfPw('');
    await refreshAuthSession();
    setNotice(isAr ? 'تم تغيير كلمة المرور بنجاح' : 'Password changed & sessions rotated');
  };

  const handleGlobalSearchChange = (val: string) => {
    setGlobalSearch(val);
    if (section === 'question-bank') {
      setQSearch(val);
    } else {
      setStudentSearch(val);
    }
  };

  return (
    <TeacherPortalShell
      language={language}
      onToggleLanguage={() => setLanguage(isAr ? 'en' : 'ar')}
      teacherName={authSession.user.name}
      teacherEmail={authSession.user.email}
      section={section}
      onSelectSection={(next) => {
        setSection(next);
        setErrorMsg('');
        setNotice('');
      }}
      pendingRequestsCount={pendingRequests.length}
      notifications={notifications}
      unreadNotificationsCount={unreadNotificationsCount}
      onMarkNotificationRead={handleMarkNotificationRead}
      onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
      globalSearch={globalSearch}
      onGlobalSearchChange={handleGlobalSearchChange}
      onLogout={async () => {
        await logoutParent();
        navigate('parent-auth');
      }}
      notice={notice}
      errorMsg={errorMsg}
      onDismissNotice={() => setNotice('')}
      onDismissError={() => setErrorMsg('')}
    >
      {section === 'overview' && (
        <TeacherOverviewSection
          language={language}
          teacherName={authSession.user.name}
          teacherSubjects={authSession.user.teacherProfile?.subjects || []}
          dashboard={dashboard}
          loading={loading}
          joinCodeState={joinCodeState}
          pendingRequests={pendingRequests}
          onNavigateSection={setSection}
          onApproveRequest={handleApproveRequest}
          onInspectStudent={loadStudentDrilldown}
        />
      )}

      {section === 'connections' && (
        <TeacherConnectionsSection
          language={language}
          teacherName={authSession.user.name}
          joinCodeState={joinCodeState}
          requests={connectionRequests}
          activeConnections={activeConnections}
          busyAction={busyAction}
          onGenerateCode={handleGenerateCode}
          onRegenerateCode={handleRegenerateCode}
          onDeactivateCode={handleDeactivateCode}
          onApproveRequest={handleApproveRequest}
          onRejectRequest={handleRejectRequest}
          onDisconnectStudent={handleDisconnectStudent}
          onInspectStudent={loadStudentDrilldown}
        />
      )}

      {section === 'classes' && (
        <TeacherClassesView
          language={language}
          classes={classes}
          onInspectStudent={loadStudentDrilldown}
        />
      )}

      {section === 'students' && (
        <TeacherStudentsSection
          language={language}
          students={students}
          search={studentSearch}
          onSearchChange={setStudentSearch}
          sourceFilter={studentSourceFilter}
          onSourceFilterChange={setStudentSourceFilter}
          levelFilter={studentLevelFilter}
          onLevelFilterChange={setStudentLevelFilter}
          busyAction={busyAction}
          onInspectStudent={loadStudentDrilldown}
          onDisconnectStudent={handleDisconnectStudent}
          onNavigateSection={setSection}
        />
      )}

      {section === 'homework' && (
        <TeacherHomeworkPanel
          apiFetch={apiFetch}
          classes={classes}
          students={students}
          lessons={lessons}
          questions={questions}
          onNotice={setNotice}
          onError={setErrorMsg}
        />
      )}

      {section === 'question-bank' && (
        <TeacherQuestionBankView
          language={language}
          lessonsForLevel={lessonsForLevel}
          filteredQuestions={filteredQuestions}
          qFilterSubject={qFilterSubject}
          setQFilterSubject={setQFilterSubject}
          qFilterLevel={qFilterLevel}
          setQFilterLevel={setQFilterLevel}
          qFilterType={qFilterType}
          setQFilterType={setQFilterType}
          qSearch={qSearch}
          setQSearch={setQSearch}
          previewQuestion={previewQuestion}
          setPreviewQuestion={setPreviewQuestion}
          editingQuestionId={editingQuestionId}
          setEditingQuestionId={setEditingQuestionId}
          qSubject={qSubject}
          setQSubject={setQSubject}
          qLevel={qLevel}
          setQLevel={setQLevel}
          qLessonId={qLessonId}
          setQLessonId={setQLessonId}
          qType={qType}
          setQType={setQType}
          qPromptAr={qPromptAr}
          setQPromptAr={setQPromptAr}
          qPromptEn={qPromptEn}
          setQPromptEn={setQPromptEn}
          qAudioText={qAudioText}
          setQAudioText={setQAudioText}
          qImageUrl={qImageUrl}
          setQImageUrl={setQImageUrl}
          qOptAAr={qOptAAr}
          setQOptAAr={setQOptAAr}
          qOptAEn={qOptAEn}
          setQOptAEn={setQOptAEn}
          qOptBAr={qOptBAr}
          setQOptBAr={setQOptBAr}
          qOptBEn={qOptBEn}
          setQOptBEn={setQOptBEn}
          qOptCAr={qOptCAr}
          setQOptCAr={setQOptCAr}
          qOptCEn={qOptCEn}
          setQOptCEn={setQOptCEn}
          qCorrectId={qCorrectId}
          setQCorrectId={setQCorrectId}
          qAcceptedAnswers={qAcceptedAnswers}
          setQAcceptedAnswers={setQAcceptedAnswers}
          qMatchingRaw={qMatchingRaw}
          setQMatchingRaw={setQMatchingRaw}
          qOrderRaw={qOrderRaw}
          setQOrderRaw={setQOrderRaw}
          qMarks={qMarks}
          setQMarks={setQMarks}
          qDiff={qDiff}
          setQDiff={setQDiff}
          qExplainAr={qExplainAr}
          setQExplainAr={setQExplainAr}
          qExplainEn={qExplainEn}
          setQExplainEn={setQExplainEn}
          importPreview={importPreview}
          setImportPreview={setImportPreview}
          importing={importing}
          onSaveQuestion={handleSaveQuestion}
          onBulkFile={handleBulkFile}
          onCommitBulkImport={handleCommitBulkImport}
          onSubmitQuestionReview={async (id) => {
            await apiFetch(`/api/teacher/content/question/${id}/submit-review`, { method: 'POST' });
            setNotice('Question submitted for Admin review.');
            await loadAll();
          }}
          onDuplicateQuestion={async (id) => {
            await apiFetch(`/api/teacher/questions/${id}/duplicate`, { method: 'POST' });
            await loadAll();
          }}
          onDeleteQuestion={async (id) => {
            await apiFetch(`/api/teacher/questions/${id}`, { method: 'DELETE' });
            await loadAll();
          }}
        />
      )}

      {section === 'create-exam' && (
        <TeacherCreateExamView
          language={language}
          questions={questions}
          exTitleAr={exTitleAr}
          setExTitleAr={setExTitleAr}
          exTitleEn={exTitleEn}
          setExTitleEn={setExTitleEn}
          exDescAr={exDescAr}
          setExDescAr={setExDescAr}
          exDescEn={exDescEn}
          setExDescEn={setExDescEn}
          exSubject={exSubject}
          setExSubject={setExSubject}
          exLevel={exLevel}
          setExLevel={setExLevel}
          exAgeGroup={exAgeGroup}
          setExAgeGroup={setExAgeGroup}
          exQuestionIds={exQuestionIds}
          setExQuestionIds={setExQuestionIds}
          selectedExamMarksTotal={selectedExamMarksTotal}
          exPassingPct={exPassingPct}
          setExPassingPct={setExPassingPct}
          exDurationMin={exDurationMin}
          setExDurationMin={setExDurationMin}
          exStartDate={exStartDate}
          setExStartDate={setExStartDate}
          exEndDate={exEndDate}
          setExEndDate={setExEndDate}
          exAttempts={exAttempts}
          setExAttempts={setExAttempts}
          exRandQ={exRandQ}
          setExRandQ={setExRandQ}
          exRandA={exRandA}
          setExRandA={setExRandA}
          exShowRes={exShowRes}
          setExShowRes={setExShowRes}
          exShowCorr={exShowCorr}
          setExShowCorr={setExShowCorr}
          setExStatus={setExStatus}
          onCreateExam={handleCreateExam}
        />
      )}

      {(section === 'my-exams' || section === 'draft-exams' || section === 'published-exams') && (
        <TeacherExamsListView
          language={language}
          section={section}
          exams={section === 'draft-exams' ? draftExams : section === 'published-exams' ? publishedExams : exams}
          onSubmitReview={async (id) => {
            await apiFetch(`/api/teacher/content/exam/${id}/submit-review`, { method: 'POST' });
            setNotice('Exam submitted for Admin approval.');
            await loadAll();
          }}
          onPublishExam={async (id) => {
            await apiFetch(`/api/teacher/exams/${id}/status`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: 'published' }),
            });
            await loadAll();
          }}
          onDeleteExam={async (id) => {
            await apiFetch(`/api/teacher/exams/${id}`, { method: 'DELETE' });
            await loadAll();
          }}
          onAssignExam={(id) => {
            setAssignExamId(id);
            setSection('assign-exams');
          }}
        />
      )}

      {section === 'assign-exams' && (
        <TeacherAssignExamView
          language={language}
          exams={exams}
          classes={classes}
          students={students}
          assignExamId={assignExamId}
          setAssignExamId={setAssignExamId}
          assignClassIds={assignClassIds}
          setAssignClassIds={setAssignClassIds}
          assignStudentIds={assignStudentIds}
          setAssignStudentIds={setAssignStudentIds}
          assignPublishNow={assignPublishNow}
          setAssignPublishNow={setAssignPublishNow}
          assignConfirmOpen={assignConfirmOpen}
          setAssignConfirmOpen={setAssignConfirmOpen}
          onConfirmAssign={handleConfirmAssign}
        />
      )}

      {section === 'exam-results' && (
        <TeacherResultsView language={language} results={results} />
      )}

      {section === 'student-performance' && (
        <TeacherStudentPerformanceView
          language={language}
          students={students}
          selectedStudentId={selectedStudentId}
          studentDrilldown={studentDrilldown}
          onLoadStudentDrilldown={loadStudentDrilldown}
        />
      )}

      {section === 'profile' && (
        <TeacherProfileView
          language={language}
          profName={profName}
          setProfName={setProfName}
          profBio={profBio}
          setProfBio={setProfBio}
          curPw={curPw}
          setCurPw={setCurPw}
          newPw={newPw}
          setNewPw={setNewPw}
          confPw={confPw}
          setConfPw={setConfPw}
          onSaveProfile={handleSaveProfile}
          onChangePassword={handleChangePassword}
          onNavigateSection={setSection}
        />
      )}
    </TeacherPortalShell>
  );
};
