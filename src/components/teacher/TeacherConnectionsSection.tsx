import React, { useState } from 'react';
import {
  Ban,
  Check,
  Copy,
  KeyRound,
  RefreshCw,
  Share2,
  ShieldAlert,
  UserCheck,
  UserMinus,
  X,
} from 'lucide-react';
import type { Language } from '../../types/nonoland';
import { getSafeStageShortLabel } from '../../utils/ageAdaptation';
import type {
  TeacherActiveConnectionRow,
  TeacherConnectionRequestRow,
  TeacherJoinCodeState,
} from './teacherTypes';

interface TeacherConnectionsSectionProps {
  language: Language;
  teacherName: string;
  joinCodeState: TeacherJoinCodeState;
  requests: TeacherConnectionRequestRow[];
  activeConnections: TeacherActiveConnectionRow[];
  busyAction: string | null;
  onGenerateCode: () => Promise<void>;
  onRegenerateCode: () => Promise<void>;
  onDeactivateCode: () => Promise<void>;
  onApproveRequest: (requestId: string) => Promise<void>;
  onRejectRequest: (requestId: string, reason?: string) => Promise<void>;
  onDisconnectStudent: (connectionId: string) => Promise<void>;
  onInspectStudent: (studentId: string) => Promise<void>;
}

export const TeacherConnectionsSection: React.FC<TeacherConnectionsSectionProps> = ({
  language,
  teacherName,
  joinCodeState,
  requests,
  activeConnections,
  busyAction,
  onGenerateCode,
  onRegenerateCode,
  onDeactivateCode,
  onApproveRequest,
  onRejectRequest,
  onDisconnectStudent,
  onInspectStudent,
}) => {
  const isAr = language === 'ar';
  const [copiedType, setCopiedType] = useState<'code' | 'invite' | null>(null);
  const [confirmRegenerateOpen, setConfirmRegenerateOpen] = useState(false);
  const [confirmDeactivateOpen, setConfirmDeactivateOpen] = useState(false);
  const [rejectModalTarget, setRejectModalTarget] = useState<TeacherConnectionRequestRow | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [disconnectTarget, setDisconnectTarget] = useState<TeacherActiveConnectionRow | null>(null);

  const activeCode = joinCodeState.activeCode;
  const pendingRequests = requests.filter((r) => r.status === 'pending');
  const pastRequests = requests.filter((r) => r.status !== 'pending');

  const handleCopy = async (text: string, type: 'code' | 'invite') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedType(type);
      setTimeout(() => setCopiedType((cur) => (cur === type ? null : cur)), 2000);
    } catch {
      // ignore clipboard restrictions
    }
  };

  const inviteText = activeCode
    ? isAr
      ? `مرحباً! أنا المعلم ${teacherName} على منصة نونو لاند. لربط طفلك بمتابعتي التعليمية، افتح لوحة ولي الأمر -> "ربط المعلم" وأدخل الرمز: ${activeCode.code}`
      : `Hello! I am Teacher ${teacherName} on NonoLand. To connect your child's learning profile, open Parent Dashboard -> "Connect a Teacher" and enter code: ${activeCode.code}`
    : '';

  return (
    <div className="space-y-6">
      {/* 1. Teacher Join Code Workspace */}
      <section className="rounded-2xl bg-white border border-[#27345C]/12 p-5 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-xl font-extrabold text-[#27345C] flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-[#8054D9]" />
              <span>{isAr ? 'رمز انضمام المعلم (مشاركة مع أولياء الأمور)' : 'Teacher Join Code'}</span>
            </h1>
            <p className="text-xs text-[#27345C]/70 max-w-2xl">
              {isAr
                ? 'شارك هذا الرمز الفريد مع أولياء الأمور. عندما يرسل ولي الأمر طلب ربط، يجب عليك الموافقة قبل ظهور الطالب في قائمتك.'
                : 'Share this unique code with parents. After a parent submits a request, you must approve it before the student appears in your portal.'}
            </p>
          </div>
          {!activeCode && (
            <button
              type="button"
              disabled={busyAction === 'generate'}
              onClick={() => void onGenerateCode()}
              className="min-h-[44px] px-5 py-2 rounded-xl bg-[#8054D9] hover:bg-[#6236B8] text-white text-xs font-bold flex items-center gap-2 cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <KeyRound className="w-4 h-4" />
              <span>
                {busyAction === 'generate'
                  ? isAr ? 'جاري الإنشاء...' : 'Generating...'
                  : isAr ? 'إنشاء رمز انضمام' : 'Generate Join Code'}
              </span>
            </button>
          )}
        </div>

        {activeCode ? (
          <div className="rounded-xl bg-[#FFF8E9] border border-[#27345C]/12 p-5 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-[#16A34A]">
                {isAr ? 'نشط وجاهز للمشاركة' : 'Active · Ready for parent requests'}
              </p>
              <p className="text-3xl sm:text-4xl font-extrabold tracking-wider text-[#27345C] font-mono-num select-all">
                {activeCode.code}
              </p>
              <p className="text-xs text-[#27345C]/65 tabular-nums">
                {isAr ? 'تاريخ الإنشاء:' : 'Created:'} {new Date(activeCode.createdAt).toLocaleDateString()} ·{' '}
                {isAr ? 'ينتهي في:' : 'Expires:'} {new Date(activeCode.expiresAt).toLocaleDateString()}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void handleCopy(activeCode.code, 'code')}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-white border border-[#27345C]/15 hover:bg-slate-50 text-xs font-bold text-[#27345C] flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                {copiedType === 'code' ? <Check className="w-4 h-4 text-[#16A34A]" /> : <Copy className="w-4 h-4" />}
                <span>{copiedType === 'code' ? (isAr ? 'تم النسخ' : 'Copied') : (isAr ? 'نسخ الرمز' : 'Copy Code')}</span>
              </button>

              <button
                type="button"
                onClick={() => void handleCopy(inviteText, 'invite')}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-[#8054D9] hover:bg-[#6236B8] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                {copiedType === 'invite' ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
                <span>
                  {copiedType === 'invite'
                    ? isAr ? 'تم نسخ الدعوة' : 'Invite Copied'
                    : isAr ? 'نسخ رسالة الدعوة' : 'Copy Invite Text'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setConfirmRegenerateOpen(true)}
                className="min-h-[42px] px-3.5 py-2 rounded-xl bg-white border border-[#27345C]/15 hover:bg-slate-50 text-xs font-bold text-[#27345C] flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <RefreshCw className="w-4 h-4 text-[#D97706]" />
                <span>{isAr ? 'تجديد الرمز' : 'Regenerate'}</span>
              </button>

              <button
                type="button"
                onClick={() => setConfirmDeactivateOpen(true)}
                className="min-h-[42px] px-3.5 py-2 rounded-xl bg-white border border-[#DC2626]/25 hover:bg-[#DC2626]/10 text-xs font-bold text-[#DC2626] flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Ban className="w-4 h-4" />
                <span>{isAr ? 'تعطيل' : 'Deactivate'}</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-xl bg-[#FFF8E9]/60 border border-[#27345C]/10 p-5 text-xs text-[#27345C]/70">
            {isAr
              ? 'لا يوجد رمز انضمام نشط حالياً. اضغط على "إنشاء رمز انضمام" لإصدار رمز آمن جديد.'
              : 'No active join code right now. Click "Generate Join Code" to issue a secure code.'}
          </div>
        )}

        {joinCodeState.recentHistory.length > 0 && (
          <div className="pt-2 space-y-2">
            <p className="text-xs font-bold text-[#27345C]/65">
              {isAr ? 'سجل الرموز السابقة' : 'Previous Code History'}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#27345C]/10 text-[#27345C]/60">
                    <th className="py-2 text-start font-semibold">{isAr ? 'الرمز' : 'Code'}</th>
                    <th className="py-2 text-start font-semibold">{isAr ? 'الحالة' : 'Status'}</th>
                    <th className="py-2 text-start font-semibold">{isAr ? 'تاريخ الإنشاء' : 'Created'}</th>
                    <th className="py-2 text-start font-semibold">{isAr ? 'تاريخ التعطيل/الانتهاء' : 'Revoked / Expired'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#27345C]/8 tabular-nums">
                  {joinCodeState.recentHistory.map((h) => (
                    <tr key={h.id}>
                      <td className="py-2 font-mono-num font-bold">{h.maskedCode}</td>
                      <td className="py-2 capitalize">{h.status}</td>
                      <td className="py-2 text-[#27345C]/70">{new Date(h.createdAt).toLocaleDateString()}</td>
                      <td className="py-2 text-[#27345C]/70">
                        {new Date(h.revokedAt || h.expiresAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* 2. Pending Parent Connection Requests */}
      <section className="rounded-2xl bg-white border border-[#27345C]/12 p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-extrabold text-[#27345C] flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-[#D97706]" />
            <span>
              {isAr ? `طلبات الربط المعلقة (${pendingRequests.length})` : `Pending Connection Requests (${pendingRequests.length})`}
            </span>
          </h2>
        </div>

        {pendingRequests.length === 0 ? (
          <p className="text-xs font-semibold text-[#27345C]/65 py-4 text-center bg-[#FFF8E9]/50 rounded-xl">
            {isAr
              ? 'لا توجد طلبات ربط جديدة بانتظار موافقتك حالياً.'
              : 'No pending parent connection requests at the moment.'}
          </p>
        ) : (
          <div className="divide-y divide-[#27345C]/10">
            {pendingRequests.map((req) => (
              <div key={req.id} className="py-4 flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1 min-w-0">
                  <p className="text-sm font-extrabold text-[#27345C]">{req.childDisplayName}</p>
                  <p className="text-xs text-[#27345C]/70">
                    {isAr ? 'ولي الأمر:' : 'Parent:'} <strong>{req.parentDisplayName}</strong> ·{' '}
                    {getSafeStageShortLabel(req.childAgeGroup, language)} ·{' '}
                    {isAr ? 'أُرسل في' : 'Requested'} {new Date(req.requestedAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={busyAction === req.id}
                    onClick={() => void onApproveRequest(req.id)}
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-[#16A34A] hover:bg-[#15803D] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                  >
                    <Check className="w-4 h-4" />
                    <span>{isAr ? 'موافقة وربط' : 'Approve'}</span>
                  </button>
                  <button
                    type="button"
                    disabled={busyAction === req.id}
                    onClick={() => {
                      setRejectModalTarget(req);
                      setRejectReason('');
                    }}
                    className="min-h-[40px] px-4 py-2 rounded-xl border border-[#DC2626]/30 text-[#DC2626] hover:bg-[#DC2626]/10 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                  >
                    <X className="w-4 h-4" />
                    <span>{isAr ? 'رفض' : 'Reject'}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 3. Active Connected Students */}
      <section className="rounded-2xl bg-white border border-[#27345C]/12 p-5 sm:p-6 space-y-4">
        <h2 className="text-lg font-extrabold text-[#27345C]">
          {isAr
            ? `الطلاب المرتبطون عبر أولياء الأمور (${activeConnections.length})`
            : `Active Parent-Connected Students (${activeConnections.length})`}
        </h2>

        {activeConnections.length === 0 ? (
          <p className="text-xs font-semibold text-[#27345C]/65 py-4 text-center bg-[#FFF8E9]/50 rounded-xl">
            {isAr
              ? 'لم يتم ربط طلاب بعد عبر رمز المعلم.'
              : 'No students connected via join code yet.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#27345C]/12 text-[#27345C]/60">
                  <th className="py-2.5 text-start font-semibold">{isAr ? 'الطالب' : 'Student'}</th>
                  <th className="py-2.5 text-start font-semibold">{isAr ? 'ولي الأمر' : 'Parent'}</th>
                  <th className="py-2.5 text-start font-semibold">{isAr ? 'المرحلة' : 'Stage'}</th>
                  <th className="py-2.5 text-start font-semibold">{isAr ? 'النجوم' : 'Stars'}</th>
                  <th className="py-2.5 text-start font-semibold">{isAr ? 'تاريخ الموافقة' : 'Connected On'}</th>
                  <th className="py-2.5 text-end font-semibold">{isAr ? 'إجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#27345C]/8">
                {activeConnections.map((conn) => (
                  <tr key={conn.id} className="hover:bg-[#FFF8E9]/40">
                    <td className="py-3 font-extrabold text-[#27345C]">{conn.childDisplayName}</td>
                    <td className="py-3 text-[#27345C]/75">{conn.parentDisplayName}</td>
                    <td className="py-3 text-[#27345C]/75">{getSafeStageShortLabel(conn.childAgeGroup, language)}</td>
                    <td className="py-3 tabular-nums font-bold">{conn.childStars}</td>
                    <td className="py-3 tabular-nums text-[#27345C]/70">
                      {new Date(conn.approvedAt).toLocaleDateString()}
                    </td>
                    <td className="py-3 text-end">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void onInspectStudent(conn.childId)}
                          className="px-3 py-1.5 rounded-lg bg-[#8054D9] text-white font-bold cursor-pointer whitespace-nowrap"
                        >
                          {isAr ? 'التفاصيل' : 'Inspect'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDisconnectTarget(conn)}
                          className="px-3 py-1.5 rounded-lg border border-[#DC2626]/30 text-[#DC2626] hover:bg-[#DC2626]/10 font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap"
                        >
                          <UserMinus className="w-3.5 h-3.5" />
                          <span>{isAr ? 'فصل' : 'Disconnect'}</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pastRequests.length > 0 && (
          <div className="pt-4 border-t border-[#27345C]/10 space-y-2">
            <p className="text-xs font-bold text-[#27345C]/65">
              {isAr ? 'سجل الطلبات السابقة' : 'Recent Request History'}
            </p>
            <div className="space-y-1.5">
              {pastRequests.slice(0, 6).map((r) => (
                <div key={r.id} className="text-xs flex flex-wrap items-center justify-between gap-2 text-[#27345C]/75 py-1">
                  <span>
                    <strong>{r.childDisplayName}</strong> ({r.parentDisplayName}) ·{' '}
                    <span className="capitalize font-semibold">{r.status}</span>
                    {r.rejectionReason ? ` — ${r.rejectionReason}` : ''}
                  </span>
                  <span className="text-[11px] tabular-nums text-[#27345C]/55">
                    {new Date(r.reviewedAt || r.cancelledAt || r.requestedAt).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Modals */}
      {confirmRegenerateOpen && (
        <div className="fixed inset-0 z-50 bg-[#27345C]/45 flex items-center justify-center p-4">
          <div className="rounded-2xl p-6 bg-white border border-[#27345C]/12 max-w-sm w-full space-y-4 shadow-xl">
            <div className="flex items-center gap-2 text-[#D97706]">
              <ShieldAlert className="w-5 h-5" />
              <h3 className="text-base font-extrabold text-[#27345C]">
                {isAr ? 'تأكيد تجديد رمز الانضمام' : 'Regenerate Join Code?'}
              </h3>
            </div>
            <p className="text-xs text-[#27345C]/75 leading-relaxed">
              {isAr
                ? 'سيتم تعطيل الرمز الحالي فوراً ولن يتمكن أولياء الأمور من استخدامه لاحقاً. الطلاب المرتبطون حالياً لن يتأثروا.'
                : 'Your current code will be revoked immediately and stop working for new requests. Existing connected students remain connected.'}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmRegenerateOpen(false)}
                className="flex-1 min-h-[42px] rounded-xl bg-[#FFF8E9] border border-[#27345C]/15 text-xs font-bold cursor-pointer"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={async () => {
                  setConfirmRegenerateOpen(false);
                  await onRegenerateCode();
                }}
                className="flex-1 min-h-[42px] rounded-xl bg-[#8054D9] text-white text-xs font-bold cursor-pointer"
              >
                {isAr ? 'تأكيد التجديد' : 'Regenerate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDeactivateOpen && (
        <div className="fixed inset-0 z-50 bg-[#27345C]/45 flex items-center justify-center p-4">
          <div className="rounded-2xl p-6 bg-white border border-[#27345C]/12 max-w-sm w-full space-y-4 shadow-xl">
            <h3 className="text-base font-extrabold text-[#27345C]">
              {isAr ? 'تعطيل رمز الانضمام؟' : 'Deactivate Join Code?'}
            </h3>
            <p className="text-xs text-[#27345C]/75 leading-relaxed">
              {isAr
                ? 'لن يتمكن أولياء الأمور من إرسال طلبات ربط جديدة حتى تقوم بإنشاء رمز جديد.'
                : 'Parents will no longer be able to send new connection requests until you generate a new code.'}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeactivateOpen(false)}
                className="flex-1 min-h-[42px] rounded-xl bg-[#FFF8E9] border border-[#27345C]/15 text-xs font-bold cursor-pointer"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={async () => {
                  setConfirmDeactivateOpen(false);
                  await onDeactivateCode();
                }}
                className="flex-1 min-h-[42px] rounded-xl bg-[#DC2626] text-white text-xs font-bold cursor-pointer"
              >
                {isAr ? 'تعطيل الرمز' : 'Deactivate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {rejectModalTarget && (
        <div className="fixed inset-0 z-50 bg-[#27345C]/45 flex items-center justify-center p-4">
          <div className="rounded-2xl p-6 bg-white border border-[#27345C]/12 max-w-md w-full space-y-4 shadow-xl">
            <h3 className="text-base font-extrabold text-[#27345C]">
              {isAr ? `رفض طلب ربط ${rejectModalTarget.childDisplayName}` : `Decline request for ${rejectModalTarget.childDisplayName}`}
            </h3>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#27345C]">
                {isAr ? 'سبب الرفض (اختياري لولي الأمر)' : 'Reason (optional, shared with parent)'}
              </label>
              <textarea
                rows={3}
                maxLength={240}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder={isAr ? 'مثال: المجموعة مكتملة حالياً...' : 'e.g. Current group is at capacity...'}
                className="w-full p-3 rounded-xl border border-[#27345C]/15 text-xs"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setRejectModalTarget(null)}
                className="flex-1 min-h-[42px] rounded-xl bg-[#FFF8E9] border border-[#27345C]/15 text-xs font-bold cursor-pointer"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={async () => {
                  const id = rejectModalTarget.id;
                  const reason = rejectReason.trim() || undefined;
                  setRejectModalTarget(null);
                  await onRejectRequest(id, reason);
                }}
                className="flex-1 min-h-[42px] rounded-xl bg-[#DC2626] text-white text-xs font-bold cursor-pointer"
              >
                {isAr ? 'تأكيد الرفض' : 'Decline Request'}
              </button>
            </div>
          </div>
        </div>
      )}

      {disconnectTarget && (
        <div className="fixed inset-0 z-50 bg-[#27345C]/45 flex items-center justify-center p-4">
          <div className="rounded-2xl p-6 bg-white border border-[#27345C]/12 max-w-sm w-full space-y-4 shadow-xl">
            <h3 className="text-base font-extrabold text-[#27345C]">
              {isAr ? 'تأكيد فصل ارتباط الطالب' : 'Disconnect Student?'}
            </h3>
            <p className="text-xs text-[#27345C]/75 leading-relaxed">
              {isAr
                ? `هل تريد إنهاء الربط التعليمي مع ${disconnectTarget.childDisplayName}؟ لن تتمكن من عرض تقدمه أو إسناد مهام جديدة ما لم يكن مسجلاً في أحد فصولك.`
                : `Disconnect ${disconnectTarget.childDisplayName}? You will immediately lose access to their progress unless they are also in one of your assigned classes.`}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDisconnectTarget(null)}
                className="flex-1 min-h-[42px] rounded-xl bg-[#FFF8E9] border border-[#27345C]/15 text-xs font-bold cursor-pointer"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={async () => {
                  const id = disconnectTarget.id;
                  setDisconnectTarget(null);
                  await onDisconnectStudent(id);
                }}
                className="flex-1 min-h-[42px] rounded-xl bg-[#DC2626] text-white text-xs font-bold cursor-pointer"
              >
                {isAr ? 'تأكيد الفصل' : 'Disconnect'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
