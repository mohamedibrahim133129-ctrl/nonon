import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  GraduationCap,
  KeyRound,
  Link2,
  Send,
  ShieldCheck,
  UserMinus,
  X,
  XCircle,
} from 'lucide-react';
import { useNonoLand } from '../../context/NonoLandContext';
import type { TeacherJoinCodePublicPreview } from '../../types/nonoland';
import { familyApi } from './shared';

interface ParentRequestRow {
  id: string;
  teacherId: string;
  teacherDisplayName: string;
  teacherSubjects: string[];
  childId: string;
  childDisplayName: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'expired';
  joinCodeLast4: string;
  requestedAt: string;
  reviewedAt?: string;
  rejectionReason?: string;
  cancelledAt?: string;
  expiresAt?: string;
}

interface ParentActiveConnectionRow {
  id: string;
  teacherId: string;
  teacherDisplayName: string;
  teacherSubjects: string[];
  teacherBio?: string;
  childId: string;
  childDisplayName: string;
  status: 'active' | 'disconnected';
  approvedAt: string;
}

export const ConnectTeacherPanel: React.FC = () => {
  const { language, authSession, childrenList, activeChild } = useNonoLand();
  const isAr = language === 'ar';

  const [codeInput, setCodeInput] = useState('');
  const [selectedChildId, setSelectedChildId] = useState<string>(activeChild?.id || childrenList[0]?.id || '');
  const [validating, setValidating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [preview, setPreview] = useState<TeacherJoinCodePublicPreview | null>(null);
  const [requests, setRequests] = useState<ParentRequestRow[]>([]);
  const [connections, setConnections] = useState<ParentActiveConnectionRow[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [noticeMsg, setNoticeMsg] = useState('');
  const [disconnectTarget, setDisconnectTarget] = useState<ParentActiveConnectionRow | null>(null);

  useEffect(() => {
    if (!selectedChildId && (activeChild?.id || childrenList[0]?.id)) {
      setSelectedChildId(activeChild?.id || childrenList[0]?.id || '');
    }
  }, [activeChild?.id, childrenList, selectedChildId]);

  const loadConnections = useCallback(async () => {
    if (!authSession.authenticated) {
      setLoadingList(false);
      return;
    }
    setLoadingList(true);
    const res = await familyApi<{
      connections?: ParentActiveConnectionRow[];
      requests?: ParentRequestRow[];
    }>('/api/parent/teacher-connections', authSession.csrfToken);
    if (res.ok && res.data) {
      setConnections(res.data.connections || []);
      setRequests(res.data.requests || []);
    }
    setLoadingList(false);
  }, [authSession.authenticated, authSession.csrfToken]);

  useEffect(() => {
    void loadConnections();
  }, [loadConnections]);

  const handleValidateCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setNoticeMsg('');
    setPreview(null);
    if (!codeInput.trim()) {
      setErrorMsg(isAr ? 'يرجى إدخال رمز المعلم أولاً.' : 'Please enter a teacher join code first.');
      return;
    }
    setValidating(true);
    const res = await familyApi<{ valid: boolean; teacher?: TeacherJoinCodePublicPreview }>(
      '/api/parent/teacher-connections/validate-code',
      authSession.csrfToken,
      {
        method: 'POST',
        body: JSON.stringify({ code: codeInput }),
      },
    );
    setValidating(false);
    if (!res.ok || !res.data?.teacher) {
      setErrorMsg(res.error || (isAr ? 'الرمز غير صالح أو منتهي الصلاحية.' : 'Invalid or expired teacher join code.'));
      return;
    }
    setPreview(res.data.teacher);
  };

  const handleSubmitRequest = async () => {
    if (!preview || !selectedChildId) return;
    setErrorMsg('');
    setNoticeMsg('');
    setSubmitting(true);
    const res = await familyApi<{ request?: ParentRequestRow }>(
      '/api/parent/teacher-connections/requests',
      authSession.csrfToken,
      {
        method: 'POST',
        body: JSON.stringify({ code: preview.normalizedCode, childId: selectedChildId }),
      },
    );
    setSubmitting(false);
    if (!res.ok) {
      setErrorMsg(res.error || (isAr ? 'تعذر إرسال طلب الربط.' : 'Could not send connection request.'));
      return;
    }
    setPreview(null);
    setCodeInput('');
    setNoticeMsg(
      isAr
        ? 'تم إرسال طلب الربط إلى المعلم بنجاح! سيظهر الطفل لديه فور موافقته.'
        : 'Connection request sent! The teacher will review and approve it.',
    );
    await loadConnections();
  };

  const handleCancelRequest = async (requestId: string) => {
    setErrorMsg('');
    setNoticeMsg('');
    const res = await familyApi(
      `/api/parent/teacher-connections/requests/${encodeURIComponent(requestId)}/cancel`,
      authSession.csrfToken,
      { method: 'POST' },
    );
    if (!res.ok) {
      setErrorMsg(res.error || 'Could not cancel request');
      return;
    }
    setNoticeMsg(isAr ? 'تم إلغاء الطلب.' : 'Request cancelled.');
    await loadConnections();
  };

  const handleDisconnect = async (connectionId: string) => {
    setErrorMsg('');
    setNoticeMsg('');
    const res = await familyApi(
      `/api/parent/teacher-connections/${encodeURIComponent(connectionId)}`,
      authSession.csrfToken,
      { method: 'DELETE' },
    );
    if (!res.ok) {
      setErrorMsg(res.error || 'Could not disconnect teacher');
      return;
    }
    setNoticeMsg(
      isAr
        ? 'تم فصل المعلم وسحب صلاحية الوصول إلى بيانات الطفل فوراً.'
        : 'Teacher disconnected and access revoked immediately.',
    );
    await loadConnections();
  };

  const pendingRequests = requests.filter((r) => r.status === 'pending');
  const historyRequests = requests.filter((r) => r.status !== 'pending');

  return (
    <div className="space-y-5">
      {noticeMsg && (
        <div className="p-3.5 rounded-2xl bg-[#55D98B]/15 border border-[#55D98B]/50 text-[#14532D] text-xs sm:text-sm font-bold flex items-center justify-between gap-3">
          <span>{noticeMsg}</span>
          <button type="button" onClick={() => setNoticeMsg('')} className="p-1 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {errorMsg && (
        <div className="p-3.5 rounded-2xl bg-[#FF4D6D]/10 border border-[#FF4D6D]/40 text-[#991B1B] text-xs sm:text-sm font-bold flex items-center justify-between gap-3">
          <span>{errorMsg}</span>
          <button type="button" onClick={() => setErrorMsg('')} className="p-1 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Connect Form */}
      <div className="nono-card rounded-3xl p-6 bg-white space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-xl font-extrabold text-[#27345C] flex items-center gap-2">
              <GraduationCap className="w-5 h-5 text-[#8054D9]" />
              <span>{isAr ? 'ربط الطفل بمعلم عبر رمز الانضمام' : 'Connect Child to a Teacher'}</span>
            </h2>
            <p className="text-xs font-semibold text-[#27345C]/70 max-w-2xl">
              {isAr
                ? 'أدخل رمز المعلم المكوّن من ٦ خانات (TEA-XXXXXX) للمعاينة ثم أرسل طلب ربط لطفل محدد. لن يطلع المعلم على بيانات الطفل قبل موافقتك وموافقته.'
                : 'Enter the 6-character teacher code (TEA-XXXXXX) to verify the teacher first, then submit a connection request for a specific child.'}
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#14532D] bg-[#E2F9EC] px-3 py-1.5 rounded-xl">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>{isAr ? 'ربط آمن لكل طفل على حدة' : 'Per-child consent & isolation'}</span>
          </span>
        </div>

        {!authSession.authenticated ? (
          <p className="text-xs font-bold text-[#9A3412] bg-[#FFF3D1] p-3.5 rounded-2xl">
            {isAr
              ? 'يرجى تسجيل الدخول بحساب ولي الأمر لتفعيل ربط المعلمين.'
              : 'Please sign in with your verified Parent account to connect with a teacher.'}
          </p>
        ) : childrenList.length === 0 ? (
          <p className="text-xs font-bold text-[#27345C]/70 bg-[#FFF8E9] p-4 rounded-2xl">
            {isAr
              ? 'أضف ملف طفل أولاً حتى تتمكن من إرسال طلب ربط للمعلم.'
              : 'Add a child profile first before requesting a teacher connection.'}
          </p>
        ) : (
          <form onSubmit={(e) => void handleValidateCode(e)} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-5">
              <label className="block text-xs font-extrabold text-[#27345C] mb-1">
                {isAr ? 'رمز المعلم (TEA-XXXXXX)' : 'Teacher Join Code'}
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-[#8054D9] absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none" />
                <input
                  type="text"
                  value={codeInput}
                  onChange={(e) => {
                    setCodeInput(e.target.value.toUpperCase());
                    if (preview) setPreview(null);
                  }}
                  placeholder="TEA-7K4M9P"
                  maxLength={12}
                  dir="ltr"
                  className="w-full h-11 ps-9 pe-3 rounded-xl border border-[#27345C]/20 font-mono-num text-sm font-extrabold tracking-wider uppercase focus:outline-none focus:border-[#8054D9]"
                />
              </div>
            </div>

            <div className="md:col-span-4">
              <label className="block text-xs font-extrabold text-[#27345C] mb-1">
                {isAr ? 'اختر الطفل' : 'Select Child'}
              </label>
              <select
                value={selectedChildId}
                onChange={(e) => setSelectedChildId(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-[#27345C]/20 bg-white text-xs font-bold"
              >
                {childrenList.map((ch) => (
                  <option key={ch.id} value={ch.id}>
                    {ch.displayName}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-3">
              <button
                type="submit"
                disabled={validating || !codeInput.trim()}
                className="w-full h-11 rounded-xl bg-[#27345C] text-white text-xs font-extrabold cursor-pointer disabled:opacity-45"
              >
                {validating
                  ? isAr ? 'جاري التحقق...' : 'Verifying...'
                  : isAr ? 'تحقق من الرمز' : 'Verify Code'}
              </button>
            </div>
          </form>
        )}

        {/* Teacher Public Preview Card */}
        {preview && (
          <div className="p-4 rounded-2xl bg-[#F4EEFF]/60 border border-[#8054D9]/30 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-[11px] font-extrabold text-[#8054D9]">
                {isAr ? 'تم التحقق من المعلم' : 'Verified Teacher Preview'} ·{' '}
                <span className="font-mono-num">{preview.normalizedCode}</span>
              </p>
              <h3 className="text-base font-extrabold text-[#27345C]">{preview.teacherDisplayName}</h3>
              <p className="text-xs font-semibold text-[#27345C]/75">
                {preview.subjects.length > 0
                  ? `${isAr ? 'المواد:' : 'Subjects:'} ${preview.subjects.join(' · ')}`
                  : isAr ? 'معلم معتمد في نونو لاند' : 'Verified NonoLand Educator'}
              </p>
              {preview.bio && (
                <p className="text-xs text-[#27345C]/70 max-w-xl">{preview.bio}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="min-h-[40px] px-3.5 rounded-xl bg-white border border-[#27345C]/15 text-xs font-bold cursor-pointer"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                disabled={submitting || !selectedChildId}
                onClick={() => void handleSubmitRequest()}
                className="min-h-[40px] px-4 rounded-xl bg-[#8054D9] text-white text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>
                  {submitting
                    ? isAr ? 'جاري الإرسال...' : 'Sending...'
                    : isAr ? 'إرسال طلب الربط' : 'Send Connection Request'}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Active Connected Teachers + Pending Requests */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="nono-card rounded-3xl p-5 bg-white space-y-3">
          <h3 className="text-base font-extrabold text-[#27345C] flex items-center gap-2">
            <Link2 className="w-4 h-4 text-[#55D98B]" />
            <span>
              {isAr ? 'المعلمون المرتبطون حالياً' : 'Active Connected Teachers'}{' '}
              <span className="tabular-nums text-[#27345C]/60">({connections.length})</span>
            </span>
          </h3>
          {loadingList ? (
            <p className="text-xs font-semibold text-[#27345C]/60">
              {isAr ? 'جاري التحميل...' : 'Loading connections...'}
            </p>
          ) : connections.length === 0 ? (
            <p className="text-xs font-semibold text-[#27345C]/65 p-4 rounded-2xl bg-[#FFF8E9]/60">
              {isAr
                ? 'لا يوجد معلمون مرتبطون بعد. أدخل رمز المعلم أعلاه للبدء.'
                : 'No active teacher connections yet. Enter a teacher join code above to connect.'}
            </p>
          ) : (
            <div className="space-y-2.5">
              {connections.map((conn) => (
                <div
                  key={conn.id}
                  className="p-3.5 rounded-2xl bg-[#FFF8E9]/60 border border-[#27345C]/10 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-extrabold text-[#27345C]">{conn.teacherDisplayName}</p>
                    <p className="text-xs font-semibold text-[#27345C]/70">
                      {isAr ? 'الطالب:' : 'Child:'} {conn.childDisplayName}
                      {conn.teacherSubjects.length > 0 ? ` · ${conn.teacherSubjects.join(', ')}` : ''}
                    </p>
                    <p className="text-[11px] text-[#27345C]/55 tabular-nums mt-0.5">
                      {isAr ? 'تاريخ الربط:' : 'Connected:'} {new Date(conn.approvedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDisconnectTarget(conn)}
                    className="min-h-[36px] px-3 rounded-xl border border-[#FF4D6D]/30 text-[#991B1B] text-xs font-bold hover:bg-[#FF4D6D]/10 inline-flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    <UserMinus className="w-3.5 h-3.5" />
                    <span>{isAr ? 'فصل' : 'Disconnect'}</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="nono-card rounded-3xl p-5 bg-white space-y-3">
          <h3 className="text-base font-extrabold text-[#27345C] flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#8054D9]" />
            <span>
              {isAr ? 'الطلبات المعلّقة' : 'Pending Requests'}{' '}
              <span className="tabular-nums text-[#27345C]/60">({pendingRequests.length})</span>
            </span>
          </h3>
          {pendingRequests.length === 0 ? (
            <p className="text-xs font-semibold text-[#27345C]/65 p-4 rounded-2xl bg-[#FFF8E9]/60">
              {isAr ? 'لا توجد طلبات ربط معلّقة حالياً.' : 'No pending connection requests right now.'}
            </p>
          ) : (
            <div className="space-y-2.5">
              {pendingRequests.map((req) => (
                <div
                  key={req.id}
                  className="p-3.5 rounded-2xl bg-[#F4EEFF]/50 border border-[#8054D9]/20 flex items-center justify-between gap-3"
                >
                  <div>
                    <p className="text-sm font-extrabold text-[#27345C]">{req.teacherDisplayName}</p>
                    <p className="text-xs font-semibold text-[#27345C]/70">
                      {req.childDisplayName} · Code ending{' '}
                      <span className="font-mono-num">{req.joinCodeLast4}</span>
                    </p>
                    <p className="text-[11px] text-[#27345C]/55 tabular-nums mt-0.5">
                      {new Date(req.requestedAt).toLocaleString()}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleCancelRequest(req.id)}
                    className="min-h-[36px] px-3 rounded-xl bg-white border border-[#27345C]/15 text-xs font-bold text-[#991B1B] hover:bg-[#FF4D6D]/10 cursor-pointer shrink-0"
                  >
                    {isAr ? 'إلغاء الطلب' : 'Cancel'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Request History */}
      {historyRequests.length > 0 && (
        <div className="nono-card rounded-3xl p-5 bg-white space-y-3">
          <h3 className="text-base font-extrabold text-[#27345C]">
            {isAr ? 'سجل طلبات الربط السابقة' : 'Connection Request History'}
          </h3>
          <div className="divide-y divide-[#27345C]/8">
            {historyRequests.slice(0, 12).map((req) => (
              <div key={req.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div>
                  <p className="font-extrabold text-[#27345C]">
                    {req.teacherDisplayName} · {req.childDisplayName}
                  </p>
                  {req.rejectionReason && (
                    <p className="text-[#991B1B] font-semibold mt-0.5">
                      {isAr ? 'سبب الرفض:' : 'Reason:'} {req.rejectionReason}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 font-extrabold ${
                      req.status === 'approved'
                        ? 'text-[#14532D]'
                        : req.status === 'rejected'
                          ? 'text-[#991B1B]'
                          : 'text-[#27345C]/65'
                    }`}
                  >
                    {req.status === 'approved' ? (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    ) : req.status === 'rejected' ? (
                      <XCircle className="w-3.5 h-3.5" />
                    ) : null}
                    <span>{req.status}</span>
                  </span>
                  <span className="text-[11px] text-[#27345C]/55 tabular-nums">
                    {new Date(req.reviewedAt || req.cancelledAt || req.requestedAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Disconnect Confirmation Modal */}
      {disconnectTarget && (
        <div className="fixed inset-0 z-50 bg-[#27345C]/45 flex items-center justify-center p-4">
          <div className="nono-card rounded-3xl p-6 bg-white max-w-sm w-full space-y-4">
            <h3 className="text-lg font-extrabold text-[#27345C]">
              {isAr ? 'تأكيد فصل المعلم' : 'Disconnect Teacher'}
            </h3>
            <p className="text-xs font-semibold text-[#27345C]/75 leading-relaxed">
              {isAr
                ? `هل تريد فصل "${disconnectTarget.teacherDisplayName}" عن "${disconnectTarget.childDisplayName}"؟ سيفقد المعلم إمكانية متابعة التقدم وإسناد الواجبات أو الامتحانات فوراً.`
                : `Disconnect "${disconnectTarget.teacherDisplayName}" from "${disconnectTarget.childDisplayName}"? Teacher access to progress, exams, and homework will end immediately.`}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDisconnectTarget(null)}
                className="flex-1 min-h-[42px] rounded-xl bg-slate-100 text-[#27345C] font-extrabold text-xs cursor-pointer"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={async () => {
                  const id = disconnectTarget.id;
                  setDisconnectTarget(null);
                  await handleDisconnect(id);
                }}
                className="flex-1 min-h-[42px] rounded-xl bg-[#DC2626] text-white font-extrabold text-xs cursor-pointer"
              >
                {isAr ? 'نعم، فصل المعلم' : 'Yes, Disconnect'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
