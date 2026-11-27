import React, { useMemo, useState } from 'react';
import {
  LayoutGrid,
  List,
  Search,
  UserMinus,
  Users,
  X,
} from 'lucide-react';
import type { Language, TeacherStudentSource } from '../../types/nonoland';
import { getSafeStageShortLabel } from '../../utils/ageAdaptation';
import type { TeacherSection, TeacherStudentRow } from './teacherTypes';

interface TeacherStudentsSectionProps {
  language: Language;
  students: TeacherStudentRow[];
  search: string;
  onSearchChange: (val: string) => void;
  sourceFilter: 'all' | TeacherStudentSource;
  onSourceFilterChange: (val: 'all' | TeacherStudentSource) => void;
  levelFilter: string;
  onLevelFilterChange: (val: string) => void;
  busyAction: string | null;
  onInspectStudent: (studentId: string) => Promise<void>;
  onDisconnectStudent: (connectionId: string) => Promise<void>;
  onNavigateSection: (section: TeacherSection) => void;
}

export const TeacherStudentsSection: React.FC<TeacherStudentsSectionProps> = ({
  language,
  students,
  search,
  onSearchChange,
  sourceFilter,
  onSourceFilterChange,
  levelFilter,
  onLevelFilterChange,
  busyAction,
  onInspectStudent,
  onDisconnectStudent,
  onNavigateSection,
}) => {
  const isAr = language === 'ar';
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [disconnectTarget, setDisconnectTarget] = useState<TeacherStudentRow | null>(null);

  const counts = useMemo(() => {
    let cls = 0;
    let conn = 0;
    let both = 0;
    for (const s of students) {
      if (s.connectionSource === 'class') cls++;
      else if (s.connectionSource === 'connected') conn++;
      else if (s.connectionSource === 'both') both++;
    }
    return { all: students.length, class: cls, connected: conn, both };
  }, [students]);

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students.filter((s) => {
      if (sourceFilter !== 'all' && s.connectionSource !== sourceFilter) return false;
      if (levelFilter && String(s.level) !== levelFilter) return false;
      if (q) {
        const nameMatch = s.displayName.toLowerCase().includes(q);
        const classMatch = s.classes.some((c) => c.toLowerCase().includes(q));
        if (!nameMatch && !classMatch) return false;
      }
      return true;
    });
  }, [students, sourceFilter, levelFilter, search]);

  const formatSourceText = (src: TeacherStudentSource) => {
    if (src === 'both') return isAr ? 'فصل · مرتبط بالرمز' : 'Class · Connected';
    if (src === 'connected') return isAr ? 'مرتبط برمز الانضمام' : 'Connected';
    return isAr ? 'فصل دراسي' : 'Class';
  };

  const sourceTabs: Array<{ id: 'all' | TeacherStudentSource; ar: string; en: string; count: number }> = [
    { id: 'all', ar: 'الكل', en: 'All', count: counts.all },
    { id: 'class', ar: 'الفصول', en: 'Class', count: counts.class },
    { id: 'connected', ar: 'مرتبط بالرمز', en: 'Connected', count: counts.connected },
    { id: 'both', ar: 'كلاهما', en: 'Both', count: counts.both },
  ];

  return (
    <div className="space-y-5">
      <div className="rounded-2xl p-5 bg-white border border-[#27345C]/12 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-extrabold text-[#27345C]">
              {isAr ? 'طلابي المصرّح بمتابعتهم' : 'My Authorized Students'}
            </h1>
            <p className="text-xs font-semibold text-[#27345C]/65 mt-0.5">
              {isAr
                ? 'قائمة موحّدة بدون تكرار لطلاب الفصول والطلاب المرتبطين برمز المعلم.'
                : 'Deduplicated roster of students in your assigned classes and active parent connections.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onNavigateSection('connections')}
              className="min-h-[40px] px-3.5 rounded-xl bg-[#F4EEFF] text-[#8054D9] text-xs font-extrabold cursor-pointer whitespace-nowrap shrink-0"
            >
              {isAr ? 'إدارة رموز الربط' : 'Manage Join Code'}
            </button>
            <div className="inline-flex rounded-xl border border-[#27345C]/12 bg-[#FFF8E9]/60 p-1">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`h-8 px-2.5 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer ${
                  viewMode === 'table' ? 'bg-white text-[#27345C] shadow-xs' : 'text-[#27345C]/65'
                }`}
                aria-label="Table view"
              >
                <List className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{isAr ? 'جدول' : 'Table'}</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={`h-8 px-2.5 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer ${
                  viewMode === 'cards' ? 'bg-white text-[#27345C] shadow-xs' : 'text-[#27345C]/65'
                }`}
                aria-label="Cards view"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{isAr ? 'بطاقات' : 'Cards'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap gap-1.5">
            {sourceTabs.map((st) => {
              const active = sourceFilter === st.id;
              return (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => onSourceFilterChange(st.id)}
                  className={`min-h-[38px] px-3 rounded-xl text-xs font-extrabold cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-[#27345C] text-white'
                      : 'bg-[#FFF8E9]/70 text-[#27345C]/80 border border-[#27345C]/10 hover:bg-[#FFF8E9]'
                  }`}
                >
                  {isAr ? st.ar : st.en}{' '}
                  <span className="tabular-nums opacity-80">({st.count})</span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2 flex-1 sm:flex-initial justify-end">
            <div className="relative flex-1 sm:w-56">
              <Search className="w-4 h-4 text-[#27345C]/45 absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none" />
              <input
                type="search"
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={isAr ? 'ابحث بالاسم أو الفصل...' : 'Search name or class...'}
                className="w-full h-10 ps-9 pe-3 rounded-xl border border-[#27345C]/15 bg-white text-xs font-semibold focus:outline-none focus:border-[#8054D9]"
              />
            </div>
            <select
              value={levelFilter}
              onChange={(e) => onLevelFilterChange(e.target.value)}
              className="h-10 px-3 rounded-xl border border-[#27345C]/15 text-xs font-bold bg-white"
            >
              <option value="">{isAr ? 'كل المراحل (١–٤)' : 'All Foundations (1–4)'}</option>
              <option value="1">{isAr ? 'التأسيس (١–٤ سنوات)' : 'Foundations (1–4)'}</option>
            </select>
          </div>
        </div>

        {/* Empty State */}
        {filteredStudents.length === 0 ? (
          <div className="p-10 rounded-xl bg-[#FFF8E9]/60 border border-[#27345C]/10 text-center space-y-2">
            <Users className="w-8 h-8 mx-auto text-[#8054D9]/70" />
            <p className="text-sm font-extrabold text-[#27345C]">
              {students.length === 0
                ? isAr
                  ? 'لا يوجد طلاب مرتبطون بك بعد'
                  : 'No authorized students yet'
                : isAr
                  ? 'لا توجد نتائج مطابقة للتصفية'
                  : 'No students match the current filter'}
            </p>
            <p className="text-xs font-semibold text-[#27345C]/65 max-w-md mx-auto">
              {students.length === 0
                ? isAr
                  ? 'شارك رمز الانضمام مع أولياء الأمور أو انتظر إسناد فصول من الإدارة.'
                  : 'Share your Teacher Join Code with parents from Connections & Code, or wait for class assignments.'
                : isAr
                  ? 'جرّب مسح البحث أو تغيير التصفية.'
                  : 'Try clearing your search term or switching the source filter.'}
            </p>
          </div>
        ) : viewMode === 'table' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#27345C]/12 text-[#27345C]/60 font-bold">
                  <th className="py-2.5 px-2 text-start">{isAr ? 'الطالب' : 'Student'}</th>
                  <th className="py-2.5 px-2 text-start">{isAr ? 'المصدر' : 'Source'}</th>
                  <th className="py-2.5 px-2 text-start">{isAr ? 'الفصول' : 'Classes'}</th>
                  <th className="py-2.5 px-2 text-start">{isAr ? 'التأسيس' : 'Foundations'}</th>
                  <th className="py-2.5 px-2 text-start">{isAr ? 'الامتحانات' : 'Exams Avg'}</th>
                  <th className="py-2.5 px-2 text-end">{isAr ? 'إجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#27345C]/8 font-semibold">
                {filteredStudents.map((st) => (
                  <tr key={st.id} className="hover:bg-[#FFF8E9]/45 transition-colors">
                    <td className="py-3 px-2">
                      <p className="font-extrabold text-sm text-[#27345C]">{st.displayName}</p>
                      <p className="text-[11px] text-[#27345C]/60">
                        {getSafeStageShortLabel(st.ageGroup, language)} ·{' '}
                        <span className="tabular-nums">{st.stars}</span> ★
                      </p>
                    </td>
                    <td className="py-3 px-2 text-[#27345C]/80 whitespace-nowrap">
                      {formatSourceText(st.connectionSource)}
                    </td>
                    <td className="py-3 px-2 text-[#27345C]/75">
                      {st.classes.length > 0 ? st.classes.join(', ') : '—'}
                    </td>
                    <td className="py-3 px-2 tabular-nums">
                      {st.level1MasteredCount} / 75
                    </td>
                    <td className="py-3 px-2 tabular-nums">
                      {st.averageExamPercentage !== null ? `${st.averageExamPercentage}%` : '—'}
                      {st.completedTeacherExams > 0 && (
                        <span className="text-[11px] text-[#27345C]/55 ms-1">
                          ({st.completedTeacherExams})
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-2">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => void onInspectStudent(st.id)}
                          className="min-h-[36px] px-3 rounded-lg bg-[#8054D9] text-white text-xs font-extrabold cursor-pointer whitespace-nowrap shrink-0"
                        >
                          {isAr ? 'عرض التقدم' : 'Inspect'}
                        </button>
                        {st.connectionId && (
                          <button
                            type="button"
                            disabled={busyAction === `disconnect-${st.connectionId}`}
                            onClick={() => setDisconnectTarget(st)}
                            className="min-h-[36px] px-2.5 rounded-lg border border-[#FF4D6D]/30 text-[#991B1B] text-xs font-bold hover:bg-[#FF4D6D]/10 cursor-pointer whitespace-nowrap shrink-0 inline-flex items-center gap-1"
                            title={isAr ? 'فصل الربط' : 'Disconnect'}
                          >
                            <UserMinus className="w-3.5 h-3.5" />
                            <span className="hidden xl:inline">{isAr ? 'فصل' : 'Disconnect'}</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
            {filteredStudents.map((st) => (
              <div
                key={st.id}
                className="p-4 rounded-xl border border-[#27345C]/12 bg-[#FFF8E9]/35 flex flex-col justify-between gap-3"
              >
                <div className="space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-extrabold text-[#27345C]">{st.displayName}</h3>
                      <p className="text-[11px] font-semibold text-[#27345C]/65">
                        {getSafeStageShortLabel(st.ageGroup, language)} ·{' '}
                        {formatSourceText(st.connectionSource)}
                      </p>
                    </div>
                    <span className="text-xs font-extrabold text-[#8054D9] tabular-nums">
                      {st.stars} ★
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 text-xs">
                    <div className="p-2 rounded-lg bg-white border border-[#27345C]/8">
                      <p className="text-[11px] text-[#27345C]/60 font-semibold">
                        {isAr ? 'دروس التأسيس' : 'Foundations'}
                      </p>
                      <p className="font-extrabold text-[#27345C] tabular-nums mt-0.5">
                        {st.level1MasteredCount} / 75
                      </p>
                    </div>
                    <div className="p-2 rounded-lg bg-white border border-[#27345C]/8">
                      <p className="text-[11px] text-[#27345C]/60 font-semibold">
                        {isAr ? 'متوسط الامتحانات' : 'Exam Average'}
                      </p>
                      <p className="font-extrabold text-[#27345C] tabular-nums mt-0.5">
                        {st.averageExamPercentage !== null ? `${st.averageExamPercentage}%` : '—'}
                      </p>
                    </div>
                  </div>
                  {st.classes.length > 0 && (
                    <p className="text-[11px] font-semibold text-[#27345C]/70">
                      {isAr ? 'الفصول:' : 'Classes:'} {st.classes.join(', ')}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-[#27345C]/8">
                  <button
                    type="button"
                    onClick={() => void onInspectStudent(st.id)}
                    className="flex-1 min-h-[38px] rounded-lg bg-[#8054D9] text-white text-xs font-extrabold cursor-pointer"
                  >
                    {isAr ? 'عرض التقدم' : 'Inspect Progress'}
                  </button>
                  {st.connectionId && (
                    <button
                      type="button"
                      onClick={() => setDisconnectTarget(st)}
                      className="min-h-[38px] px-3 rounded-lg border border-[#FF4D6D]/30 text-[#991B1B] text-xs font-bold hover:bg-[#FF4D6D]/10 cursor-pointer"
                    >
                      {isAr ? 'فصل' : 'Disconnect'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Disconnect confirmation modal */}
      {disconnectTarget && disconnectTarget.connectionId && (
        <div className="fixed inset-0 z-50 bg-[#27345C]/45 flex items-center justify-center p-4">
          <div className="rounded-2xl p-6 bg-white border border-[#27345C]/12 max-w-sm w-full space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-[#27345C]">
                {isAr ? 'تأكيد فصل ربط الطالب' : 'Disconnect Student Connection'}
              </h3>
              <button
                type="button"
                onClick={() => setDisconnectTarget(null)}
                className="p-1 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs font-semibold text-[#27345C]/75 leading-relaxed">
              {isAr
                ? `هل تريد فصل ربط "${disconnectTarget.displayName}"؟ سيتوقف وصولك لبياناته عبر رمز المعلم فوراً.`
                : `Disconnect "${disconnectTarget.displayName}"? Join-code access to this child will be revoked immediately.`}
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
                disabled={busyAction === `disconnect-${disconnectTarget.connectionId}`}
                onClick={async () => {
                  const id = disconnectTarget.connectionId!;
                  setDisconnectTarget(null);
                  await onDisconnectStudent(id);
                }}
                className="flex-1 min-h-[42px] rounded-xl bg-[#DC2626] text-white text-xs font-extrabold cursor-pointer"
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
