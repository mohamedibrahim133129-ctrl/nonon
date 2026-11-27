import React from 'react';
import {
  ArrowRight,
  BookOpen,
  Check,
  ClipboardCheck,
  GraduationCap,
  KeyRound,
  Layers,
  Link2,
  Plus,
  UserCheck,
  Users,
} from 'lucide-react';
import { t } from '../../i18n/translations';
import type { Language } from '../../types/nonoland';
import { getSafeStageShortLabel } from '../../utils/ageAdaptation';
import type {
  TeacherConnectionRequestRow,
  TeacherDashboardData,
  TeacherJoinCodeState,
  TeacherSection,
} from './teacherTypes';

interface TeacherOverviewSectionProps {
  language: Language;
  teacherName: string;
  teacherSubjects: string[];
  dashboard: TeacherDashboardData | null;
  loading: boolean;
  joinCodeState: TeacherJoinCodeState;
  pendingRequests: TeacherConnectionRequestRow[];
  onNavigateSection: (section: TeacherSection) => void;
  onApproveRequest: (requestId: string) => Promise<void>;
  onInspectStudent: (studentId: string) => Promise<void>;
}

export const TeacherOverviewSection: React.FC<TeacherOverviewSectionProps> = ({
  language,
  teacherName,
  teacherSubjects,
  dashboard,
  loading,
  joinCodeState,
  pendingRequests,
  onNavigateSection,
  onApproveRequest,
  onInspectStudent,
}) => {
  const isAr = language === 'ar';

  if (loading && !dashboard) {
    return (
      <div className="space-y-5">
        <div className="h-28 rounded-2xl bg-white border border-[#27345C]/10 animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-24 rounded-2xl bg-white border border-[#27345C]/10 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const stats = dashboard?.stats;
  const kpis = [
    {
      label: isAr ? 'إجمالي الطلاب المصرح بهم' : 'Total Authorized Students',
      value: stats?.assignedStudentsCount ?? 0,
      meta: isAr
        ? `${stats?.classStudentsCount ?? 0} بالفصول · ${stats?.connectedStudentsCount ?? 0} مرتبطون`
        : `${stats?.classStudentsCount ?? 0} in classes · ${stats?.connectedStudentsCount ?? 0} connected`,
      icon: <Users className="w-4 h-4 text-[#8054D9]" />,
      onClick: () => onNavigateSection('students'),
    },
    {
      label: isAr ? 'طلبات ربط بانتظار المراجعة' : 'Pending Connection Requests',
      value: stats?.pendingConnectionsCount ?? pendingRequests.length,
      meta: isAr ? 'من أولياء الأمور' : 'From parents via join code',
      icon: <UserCheck className="w-4 h-4 text-[#D97706]" />,
      onClick: () => onNavigateSection('connections'),
    },
    {
      label: isAr ? 'الفصول المسندة' : 'Assigned Classes',
      value: stats?.classesCount ?? 0,
      meta: isAr ? 'الفصول النشطة' : 'Active classrooms',
      icon: <Layers className="w-4 h-4 text-[#39BDF2]" />,
      onClick: () => onNavigateSection('classes'),
    },
    {
      label: isAr ? 'واجبات بانتظار التقييم' : 'Pending Homework Reviews',
      value: stats?.pendingHomeworkReviewsCount ?? 0,
      meta: isAr ? 'تسليمات الطلاب' : 'Submitted by students',
      icon: <ClipboardCheck className="w-4 h-4 text-[#8054D9]" />,
      onClick: () => onNavigateSection('homework'),
    },
    {
      label: isAr ? 'بنك الأسئلة' : 'Question Bank',
      value: stats?.totalQuestions ?? 0,
      meta: isAr ? 'أسئلة نشطة' : 'Active questions',
      icon: <BookOpen className="w-4 h-4 text-[#16A34A]" />,
      onClick: () => onNavigateSection('question-bank'),
    },
    {
      label: isAr ? 'الامتحانات المنشورة والمسودات' : 'Published / Draft Exams',
      value: `${stats?.publishedExamsCount ?? 0} / ${stats?.draftExamsCount ?? 0}`,
      meta: isAr ? `${stats?.totalExams ?? 0} إجمالي الامتحانات` : `${stats?.totalExams ?? 0} total exams`,
      icon: <GraduationCap className="w-4 h-4 text-[#8054D9]" />,
      onClick: () => onNavigateSection('my-exams'),
    },
    {
      label: isAr ? 'الاختبارات المكتملة' : 'Completed Submissions',
      value: stats?.completedAttemptsCount ?? 0,
      meta: isAr ? `${stats?.totalAssignedExams ?? 0} مهام مسندة` : `${stats?.totalAssignedExams ?? 0} assigned`,
      icon: <Check className="w-4 h-4 text-[#16A34A]" />,
      onClick: () => onNavigateSection('exam-results'),
    },
    {
      label: isAr ? 'متوسط درجات الطلاب' : 'Average Exam Score',
      value: `${stats?.averageScorePercentage ?? 0}%`,
      meta: isAr ? 'عبر المحاولات المسلمة' : 'Across submitted attempts',
      icon: <GraduationCap className="w-4 h-4 text-[#27345C]" />,
      onClick: () => onNavigateSection('exam-results'),
    },
  ];

  const trendSeries = dashboard?.scoreTrendSeries || [];
  const subjectBreakdown = dashboard?.subjectBreakdown || [];

  return (
    <div className="space-y-6">
      {/* Header Welcome & Quick Actions */}
      <div className="rounded-2xl bg-white border border-[#27345C]/12 p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs font-semibold text-[#27345C]/60">
            {isAr ? 'لوحة قيادة المعلم' : 'Teacher Workspace'}
            {teacherSubjects.length > 0 ? ` · ${teacherSubjects.join(' · ')}` : ''}
          </p>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#27345C]" style={{ textWrap: 'balance' }}>
            {isAr ? `مرحباً، ${teacherName}` : `Welcome back, ${teacherName}`}
          </h1>
          <p className="text-xs text-[#27345C]/70">
            {joinCodeState.activeCode
              ? isAr
                ? `رمز الانضمام النشط للمشاركة مع أولياء الأمور: ${joinCodeState.activeCode.code}`
                : `Active Teacher Join Code for parents: ${joinCodeState.activeCode.code}`
              : isAr
                ? 'أنشئ رمز انضمام لمشاركته مع أولياء الأمور وربط طلابك.'
                : 'Generate a Teacher Join Code to let parents connect their children.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => onNavigateSection('connections')}
            className="min-h-[42px] px-4 py-2 rounded-xl border border-[#27345C]/15 bg-[#FFF8E9] hover:bg-[#FFD84D]/30 text-[#27345C] text-xs font-bold flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
          >
            <KeyRound className="w-4 h-4 text-[#8054D9]" />
            <span>{isAr ? 'رمز الانضمام والطلبات' : 'Join Code & Requests'}</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigateSection('create-exam')}
            className="min-h-[42px] px-4 py-2 rounded-xl bg-[#8054D9] hover:bg-[#6236B8] text-white text-xs font-bold flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>{isAr ? 'إنشاء امتحان جديد' : 'Create Exam'}</span>
          </button>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <button
            key={kpi.label}
            type="button"
            onClick={kpi.onClick}
            className="text-start rounded-2xl bg-white border border-[#27345C]/10 hover:border-[#8054D9]/40 p-4 transition-colors cursor-pointer space-y-2"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[#27345C]/70 truncate">{kpi.label}</span>
              {kpi.icon}
            </div>
            <p className="text-2xl font-extrabold text-[#27345C] tabular-nums">{kpi.value}</p>
            <p className="text-[11px] font-medium text-[#27345C]/55 truncate">{kpi.meta}</p>
          </button>
        ))}
      </div>

      {/* Analytics Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Score Trend SVG Chart */}
        <div className="lg:col-span-7 rounded-2xl bg-white border border-[#27345C]/10 p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-extrabold text-[#27345C]">
                {isAr ? 'اتجاه نتائج الاختبارات الأخيرة' : 'Recent Exam Score Trend'}
              </h2>
              <p className="text-xs text-[#27345C]/60">
                {isAr ? 'آخر ١٠ محاولات مكتملة لطلابك' : 'Last 10 submitted student attempts'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateSection('exam-results')}
              className="text-xs font-bold text-[#8054D9] hover:underline flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
            >
              <span>{isAr ? 'كل النتائج' : 'All Results'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {trendSeries.length === 0 ? (
            <div className="h-48 rounded-xl bg-[#FFF8E9]/60 border border-[#27345C]/8 flex flex-col items-center justify-center text-center p-4 space-y-2">
              <p className="text-xs font-semibold text-[#27345C]/65">
                {isAr
                  ? 'ستظهر رسوم الدرجات هنا بمجرد إكمال الطلاب للاختبارات المسندة.'
                  : 'Score trends will appear once students complete assigned exams.'}
              </p>
              <button
                type="button"
                onClick={() => onNavigateSection('assign-exams')}
                className="px-3.5 py-1.5 rounded-lg bg-[#8054D9] text-white text-xs font-bold cursor-pointer"
              >
                {isAr ? 'تعيين امتحان' : 'Assign an Exam'}
              </button>
            </div>
          ) : (
            <svg viewBox="0 0 520 190" className="w-full h-48 bg-[#FFFDF8] rounded-xl border border-[#27345C]/8">
              {[0, 25, 50, 75, 100].map((tick) => {
                const y = 152 - (tick / 100) * 120;
                return (
                  <g key={tick}>
                    <line x1="38" y1={y} x2="504" y2={y} stroke="#E2E8F0" strokeDasharray="3 3" />
                    <text x="8" y={y + 4} fontSize="10" fill="#64748B" fontWeight="600">
                      {tick}%
                    </text>
                  </g>
                );
              })}
              {trendSeries.map((pt, idx) => {
                const slotW = (504 - 46) / Math.max(trendSeries.length, 1);
                const barW = Math.min(32, Math.max(16, slotW - 10));
                const x = 46 + idx * slotW + (slotW - barW) / 2;
                const barH = Math.max(4, (pt.percentage / 100) * 120);
                const y = 152 - barH;
                return (
                  <g key={pt.attemptId}>
                    <rect
                      x={x}
                      y={y}
                      width={barW}
                      height={barH}
                      rx="5"
                      fill={pt.passed ? '#55D98B' : '#FF9360'}
                    />
                    <text
                      x={x + barW / 2}
                      y={Math.max(14, y - 5)}
                      textAnchor="middle"
                      fontSize="10"
                      fontWeight="700"
                      fill="#27345C"
                    >
                      {pt.percentage}%
                    </text>
                    <text
                      x={x + barW / 2}
                      y="174"
                      textAnchor="middle"
                      fontSize="9.5"
                      fontWeight="600"
                      fill="#475569"
                    >
                      {pt.studentName.slice(0, 7)}
                    </text>
                  </g>
                );
              })}
            </svg>
          )}
        </div>

        {/* Subject Breakdown */}
        <div className="lg:col-span-5 rounded-2xl bg-white border border-[#27345C]/10 p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-extrabold text-[#27345C]">
                {isAr ? 'توزيع المواد والمحتوى' : 'Subject Coverage & Mastery'}
              </h2>
              <p className="text-xs text-[#27345C]/60">
                {isAr ? 'الأسئلة والامتحانات ومتوسط الدرجات' : 'Questions, exams, and average accuracy'}
              </p>
            </div>
          </div>

          {subjectBreakdown.length === 0 ? (
            <div className="h-48 rounded-xl bg-[#FFF8E9]/60 border border-[#27345C]/8 flex flex-col items-center justify-center text-center p-4 space-y-2">
              <p className="text-xs font-semibold text-[#27345C]/65">
                {isAr ? 'أضف أسئلة أو امتحانات لرؤية إحصائيات المواد.' : 'Create questions or exams to view subject analytics.'}
              </p>
              <button
                type="button"
                onClick={() => onNavigateSection('question-bank')}
                className="px-3.5 py-1.5 rounded-lg bg-[#8054D9] text-white text-xs font-bold cursor-pointer"
              >
                {isAr ? 'فتح بنك الأسئلة' : 'Open Question Bank'}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {subjectBreakdown.map((item) => {
                const pct = item.averageScorePercentage ?? 0;
                return (
                  <div key={item.subject} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-[#27345C] capitalize">{item.subject}</span>
                      <span className="text-[#27345C]/70 tabular-nums">
                        {item.questionsCount} {isAr ? 'سؤال' : 'Qs'} · {item.examsCount}{' '}
                        {isAr ? 'امتحان' : 'exams'} ·{' '}
                        <strong className="text-[#27345C]">
                          {item.averageScorePercentage !== null ? `${pct}%` : '—'}
                        </strong>
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-[#27345C]/8 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#8054D9] transition-all"
                        style={{ width: `${item.averageScorePercentage !== null ? Math.max(6, pct) : 12}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Pending Connections + Recent Results */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Pending Connection Requests Preview */}
        <div className="lg:col-span-6 rounded-2xl bg-white border border-[#27345C]/10 p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-extrabold text-[#27345C] flex items-center gap-2">
              <Link2 className="w-4 h-4 text-[#8054D9]" />
              <span>{isAr ? 'طلبات ربط أولياء الأمور' : 'Pending Parent Requests'}</span>
            </h2>
            <button
              type="button"
              onClick={() => onNavigateSection('connections')}
              className="text-xs font-bold text-[#8054D9] hover:underline cursor-pointer whitespace-nowrap shrink-0"
            >
              {isAr ? 'إدارة الطلبات' : 'Manage All'}
            </button>
          </div>

          {pendingRequests.length === 0 ? (
            <div className="p-5 rounded-xl bg-[#FFF8E9]/60 border border-[#27345C]/8 text-center space-y-2">
              <p className="text-xs font-semibold text-[#27345C]/70">
                {isAr
                  ? 'لا توجد طلبات ربط معلقة حالياً. شارك رمز الانضمام TEA مع أولياء الأمور.'
                  : 'No pending requests right now. Share your TEA join code with parents to receive requests.'}
              </p>
              <button
                type="button"
                onClick={() => onNavigateSection('connections')}
                className="px-3.5 py-1.5 rounded-lg bg-white border border-[#27345C]/15 text-xs font-bold text-[#27345C] hover:bg-[#FFF8E9] cursor-pointer"
              >
                {isAr ? 'عرض رمز الانضمام' : 'View Join Code'}
              </button>
            </div>
          ) : (
            <div className="divide-y divide-[#27345C]/10">
              {pendingRequests.slice(0, 4).map((req) => (
                <div key={req.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-extrabold text-[#27345C] truncate">
                      {req.childDisplayName}
                    </p>
                    <p className="text-xs text-[#27345C]/65 truncate">
                      {isAr ? 'ولي الأمر:' : 'Parent:'} {req.parentDisplayName} ·{' '}
                      {getSafeStageShortLabel(req.childAgeGroup, language)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => void onApproveRequest(req.id)}
                      className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#16A34A] text-white text-xs font-bold cursor-pointer whitespace-nowrap"
                    >
                      {isAr ? 'موافقة' : 'Approve'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigateSection('connections')}
                      className="min-h-[36px] px-3 py-1.5 rounded-lg bg-[#FFF8E9] border border-[#27345C]/15 text-[#27345C] text-xs font-bold cursor-pointer whitespace-nowrap"
                    >
                      {isAr ? 'مراجعة' : 'Review'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Connected Students Quick Strip */}
          {(dashboard?.connectedStudentsPreview?.length || 0) > 0 && (
            <div className="pt-3 border-t border-[#27345C]/10 space-y-2">
              <p className="text-xs font-bold text-[#27345C]/65">
                {isAr ? 'طلاب مرتبطون حديثاً' : 'Recently Connected Students'}
              </p>
              <div className="flex flex-wrap gap-2">
                {dashboard!.connectedStudentsPreview.map((st) => (
                  <button
                    key={st.connectionId}
                    type="button"
                    onClick={() => void onInspectStudent(st.childId)}
                    className="px-3 py-1.5 rounded-lg bg-[#F4EEFF] hover:bg-[#8054D9] hover:text-white text-[#27345C] text-xs font-bold transition-colors cursor-pointer"
                  >
                    {st.displayName}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Recent Results & Audit Activity */}
        <div className="lg:col-span-6 rounded-2xl bg-white border border-[#27345C]/10 p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-extrabold text-[#27345C]">
              {isAr ? 'أحدث نتائج الطلاب والنشاط' : 'Recent Results & Activity'}
            </h2>
          </div>

          {(!dashboard?.recentResults || dashboard.recentResults.length === 0) ? (
            <p className="text-xs font-semibold text-[#27345C]/60 py-4 text-center">
              {isAr ? 'لا توجد محاولات اختبارات مسلمة بعد.' : 'No completed exam attempts yet.'}
            </p>
          ) : (
            <div className="divide-y divide-[#27345C]/10">
              {dashboard.recentResults.slice(0, 5).map((r) => (
                <div key={r.attemptId} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <p className="font-extrabold text-[#27345C] truncate">{r.studentName}</p>
                    <p className="text-[#27345C]/65 truncate">{t(r.examTitle, language)}</p>
                  </div>
                  <div className="text-end shrink-0 tabular-nums">
                    <span className={`font-extrabold ${r.passed ? 'text-[#16A34A]' : 'text-[#D97706]'}`}>
                      {r.percentage}% · {r.passed ? (isAr ? 'ناجح' : 'Passed') : (isAr ? 'مراجعة' : 'Review')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {dashboard?.recentActivity && dashboard.recentActivity.length > 0 && (
            <div className="pt-3 border-t border-[#27345C]/10 space-y-2">
              <p className="text-xs font-bold text-[#27345C]/65">
                {isAr ? 'أحدث الأحداث' : 'Recent Activity'}
              </p>
              <div className="space-y-1.5">
                {dashboard.recentActivity.slice(0, 4).map((act) => (
                  <div key={act.id} className="text-xs flex items-center justify-between gap-2 text-[#27345C]/80">
                    <span className="truncate">{act.summary}</span>
                    <span className="text-[11px] text-[#27345C]/50 tabular-nums shrink-0">
                      {new Date(act.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
