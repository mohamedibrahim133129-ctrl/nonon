import React from 'react';
import {
  Copy,
  Download,
  FileSpreadsheet,
  Layers,
  Trash2,
  Upload,
} from 'lucide-react';
import { t } from '../../i18n/translations';
import type {
  AgeGroupId,
  ExamStatus,
  Language,
  TeacherExam,
  TeacherQuestion,
  TeacherQuestionDifficulty,
  TeacherQuestionType,
  TeacherSubject,
} from '../../types/nonoland';
import { getSafeStageShortLabel } from '../../utils/ageAdaptation';
import { ALLOWED_TEACHER_QUESTION_TYPES, ALLOWED_TEACHER_SUBJECTS } from '../../utils/validation';
import type {
  LessonOption,
  StudentDrilldownData,
  TeacherClassRow,
  TeacherExamRow,
  TeacherResultRow,
  TeacherSection,
  TeacherStudentRow,
} from './teacherTypes';

/* 1. MY CLASSES */
export const TeacherClassesView: React.FC<{
  language: Language;
  classes: TeacherClassRow[];
  onInspectStudent: (studentId: string) => Promise<void>;
}> = ({ language, classes, onInspectStudent }) => {
  const isAr = language === 'ar';
  return (
    <div className="rounded-2xl p-5 bg-white border border-[#27345C]/12 space-y-4">
      <div>
        <h1 className="text-xl font-extrabold text-[#27345C]">
          {isAr ? 'فصولي الدراسية المسندة من الإدارة' : 'My Assigned Classes'}
        </h1>
        <p className="text-xs font-semibold text-[#27345C]/65 mt-0.5">
          {isAr
            ? 'الفصول المسندة لك والطلاب المسجلون داخل كل فصل.'
            : 'Classes assigned to your account and enrolled students.'}
        </p>
      </div>

      {classes.length === 0 ? (
        <div className="p-8 rounded-xl bg-[#FFF8E9]/60 border border-[#27345C]/10 text-center space-y-2">
          <Layers className="w-8 h-8 mx-auto text-[#8054D9]/70" />
          <p className="text-sm font-extrabold text-[#27345C]">
            {isAr ? 'لم تسند الإدارة فصولاً بعد.' : 'No classes assigned to you by Admin yet.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {classes.map((cls) => (
            <div
              key={cls.id}
              className="p-4 rounded-xl border border-[#27345C]/12 bg-[#FFF8E9]/45 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-extrabold text-base text-[#27345C]">{cls.name}</h2>
                  <p className="text-xs font-semibold text-[#27345C]/65 mt-0.5">
                    {cls.subject} · {isAr ? 'التأسيس (١–٤)' : 'Foundations (1–4)'}
                  </p>
                </div>
                <span className="text-xs font-extrabold text-[#8054D9] tabular-nums shrink-0">
                  {cls.students.length} {isAr ? 'طالب' : 'student(s)'}
                </span>
              </div>

              {cls.students.length === 0 ? (
                <p className="text-xs font-semibold text-[#27345C]/55">
                  {isAr ? 'لا يوجد طلاب في هذا الفصل بعد.' : 'No students enrolled in this class yet.'}
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {cls.students.map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => void onInspectStudent(st.id)}
                      className="min-h-[34px] px-2.5 py-1 rounded-lg bg-white border border-[#27345C]/15 text-xs font-bold hover:border-[#8054D9] cursor-pointer"
                    >
                      {st.displayName} ({getSafeStageShortLabel(st.ageGroup, language)})
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/* 2. QUESTION BANK & BULK IMPORT */
export interface TeacherQuestionBankViewProps {
  language: Language;
  lessonsForLevel: LessonOption[];
  filteredQuestions: TeacherQuestion[];
  qFilterSubject: string;
  setQFilterSubject: (v: string) => void;
  qFilterLevel: string;
  setQFilterLevel: (v: string) => void;
  qFilterType: string;
  setQFilterType: (v: string) => void;
  qSearch: string;
  setQSearch: (v: string) => void;
  previewQuestion: TeacherQuestion | null;
  setPreviewQuestion: (q: TeacherQuestion | null) => void;
  editingQuestionId: string | null;
  setEditingQuestionId: (v: string | null) => void;
  qSubject: TeacherSubject;
  setQSubject: (v: TeacherSubject) => void;
  qLevel: 1 | 2;
  setQLevel: (v: 1 | 2) => void;
  qLessonId: string;
  setQLessonId: (v: string) => void;
  qType: TeacherQuestionType;
  setQType: (v: TeacherQuestionType) => void;
  qPromptAr: string;
  setQPromptAr: (v: string) => void;
  qPromptEn: string;
  setQPromptEn: (v: string) => void;
  qAudioText: string;
  setQAudioText: (v: string) => void;
  qImageUrl: string;
  setQImageUrl: (v: string) => void;
  qOptAAr: string;
  setQOptAAr: (v: string) => void;
  qOptAEn: string;
  setQOptAEn: (v: string) => void;
  qOptBAr: string;
  setQOptBAr: (v: string) => void;
  qOptBEn: string;
  setQOptBEn: (v: string) => void;
  qOptCAr: string;
  setQOptCAr: (v: string) => void;
  qOptCEn: string;
  setQOptCEn: (v: string) => void;
  qCorrectId: string;
  setQCorrectId: (v: string) => void;
  qAcceptedAnswers: string;
  setQAcceptedAnswers: (v: string) => void;
  qMatchingRaw: string;
  setQMatchingRaw: (v: string) => void;
  qOrderRaw: string;
  setQOrderRaw: (v: string) => void;
  qMarks: number;
  setQMarks: (v: number) => void;
  qDiff: TeacherQuestionDifficulty;
  setQDiff: (v: TeacherQuestionDifficulty) => void;
  qExplainAr: string;
  setQExplainAr: (v: string) => void;
  qExplainEn: string;
  setQExplainEn: (v: string) => void;
  importPreview: {
    importBatchId: string;
    totalRows: number;
    validCount: number;
    invalidCount: number;
    validRows: Array<{ rowNumber: number; question: { lessonId: string; promptAr: string; promptEn: string; questionType: string } }>;
    invalidRows: Array<{ rowNumber: number; errors: string[] }>;
  } | null;
  setImportPreview: (v: TeacherQuestionBankViewProps['importPreview']) => void;
  importing: boolean;
  onSaveQuestion: (e: React.FormEvent) => Promise<void>;
  onBulkFile: (file: File) => Promise<void>;
  onCommitBulkImport: () => Promise<void>;
  onSubmitQuestionReview: (id: string) => Promise<void>;
  onDuplicateQuestion: (id: string) => Promise<void>;
  onDeleteQuestion: (id: string) => Promise<void>;
}

export const TeacherQuestionBankView: React.FC<TeacherQuestionBankViewProps> = (props) => {
  const {
    language,
    lessonsForLevel,
    filteredQuestions,
    qFilterSubject,
    setQFilterSubject,
    qFilterLevel,
    setQFilterLevel,
    qFilterType,
    setQFilterType,
    qSearch,
    setQSearch,
    previewQuestion,
    setPreviewQuestion,
    editingQuestionId,
    setEditingQuestionId,
    qSubject,
    setQSubject,
    qLevel,
    setQLevel,
    qLessonId,
    setQLessonId,
    qType,
    setQType,
    qPromptAr,
    setQPromptAr,
    qPromptEn,
    setQPromptEn,
    qAudioText,
    setQAudioText,
    qImageUrl,
    setQImageUrl,
    qOptAAr,
    setQOptAAr,
    qOptAEn,
    setQOptAEn,
    qOptBAr,
    setQOptBAr,
    qOptBEn,
    setQOptBEn,
    qOptCAr,
    setQOptCAr,
    qOptCEn,
    setQOptCEn,
    qCorrectId,
    setQCorrectId,
    qAcceptedAnswers,
    setQAcceptedAnswers,
    qMatchingRaw,
    setQMatchingRaw,
    qOrderRaw,
    setQOrderRaw,
    qMarks,
    setQMarks,
    qDiff,
    setQDiff,
    qExplainAr,
    setQExplainAr,
    qExplainEn,
    setQExplainEn,
    importPreview,
    setImportPreview,
    importing,
    onSaveQuestion,
    onBulkFile,
    onCommitBulkImport,
    onSubmitQuestionReview,
    onDuplicateQuestion,
    onDeleteQuestion,
  } = props;
  const isAr = language === 'ar';

  return (
    <div className="space-y-5">
      {/* Bulk CSV / Excel Import Panel */}
      <div className="rounded-2xl p-5 bg-white border border-[#27345C]/12 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-extrabold text-base text-[#27345C] flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-[#39BDF2]" />
              <span>{isAr ? 'استيراد جماعي من Excel / CSV' : 'Bulk Import Questions (CSV / Excel .xlsx)'}</span>
            </h2>
            <p className="text-xs font-semibold text-[#27345C]/65 mt-0.5">
              {isAr
                ? 'حمّل القالب الرسمي، ارفع الملف للمعاينة، راجع الأخطاء إن وجدت ثم اعتمد الاستيراد.'
                : 'Download official template, upload for row-by-row validation preview, then commit safely.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href="/api/teacher/questions/import/template?format=csv"
              download
              className="min-h-[38px] px-3 rounded-xl bg-white border border-[#27345C]/20 text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" /> CSV Template
            </a>
            <a
              href="/api/teacher/questions/import/template?format=xlsx"
              download
              className="min-h-[38px] px-3 rounded-xl bg-[#55D98B] text-[#27345C] text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" /> Excel (.xlsx) Template
            </a>
          </div>
        </div>

        <label className="flex items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed border-[#39BDF2] bg-[#E5F6FF]/25 cursor-pointer hover:bg-[#E5F6FF]/45 text-xs font-extrabold">
          <Upload className="w-4 h-4 text-[#8054D9]" />
          <span>
            {importing
              ? isAr
                ? 'جاري فحص الملف...'
                : 'Validating uploaded file...'
              : isAr
                ? 'اختر ملف CSV أو XLSX للمعاينة والتحقق'
                : 'Choose .csv or .xlsx file to validate & preview'}
          </span>
          <input
            type="file"
            accept=".csv,.xlsx"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onBulkFile(f);
              e.target.value = '';
            }}
          />
        </label>

        {importPreview && (
          <div className="p-4 rounded-xl bg-[#FFF8E9]/70 border border-[#27345C]/15 space-y-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-extrabold tabular-nums">
                Valid: <span className="text-[#166534]">{importPreview.validCount}</span> · Invalid:{' '}
                <span className="text-[#991B1B]">{importPreview.invalidCount}</span> / Total {importPreview.totalRows}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setImportPreview(null)}
                  className="min-h-[36px] px-3 rounded-lg bg-white border border-[#27345C]/15 font-bold cursor-pointer"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                {importPreview.validCount > 0 && (
                  <button
                    type="button"
                    onClick={() => void onCommitBulkImport()}
                    className="min-h-[36px] px-4 rounded-lg bg-[#8054D9] text-white font-extrabold cursor-pointer"
                  >
                    {isAr
                      ? `تأكيد استيراد ${importPreview.validCount} سؤال`
                      : `Confirm & Import ${importPreview.validCount} Question(s)`}
                  </button>
                )}
              </div>
            </div>
            {importPreview.invalidRows.length > 0 && (
              <div className="max-h-36 overflow-y-auto space-y-1 bg-[#FF6B6B]/10 p-2.5 rounded-xl">
                {importPreview.invalidRows.map((errRow) => (
                  <p key={errRow.rowNumber} className="font-bold text-[#991B1B]">
                    Row {errRow.rowNumber}: {errRow.errors.join('; ')}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add / Edit Question Form */}
      <form onSubmit={(e) => void onSaveQuestion(e)} className="rounded-2xl p-5 bg-white border border-[#27345C]/12 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-extrabold text-base text-[#27345C]">
            {editingQuestionId
              ? isAr
                ? 'تعديل سؤال'
                : 'Edit Question'
              : isAr
                ? 'إضافة سؤال جديد إلى البنك'
                : 'Add New Question to Bank'}
          </h3>
          {editingQuestionId && (
            <button
              type="button"
              onClick={() => setEditingQuestionId(null)}
              className="text-xs font-bold text-[#8054D9] underline cursor-pointer"
            >
              {isAr ? 'إلغاء التعديل' : 'Cancel Edit'}
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-bold">
          <div>
            <label className="block mb-1">{isAr ? 'المستوى' : 'Level'}</label>
            <select
              value={qLevel}
              onChange={() => setQLevel(1)}
              className="w-full h-10 px-3 rounded-xl border border-[#27345C]/20 bg-white"
            >
              <option value={1}>Track 1 · Foundations (Ages 1–4)</option>
            </select>
          </div>
          <div>
            <label className="block mb-1">{isAr ? 'المادة' : 'Subject'}</label>
            <select
              value={qSubject}
              onChange={(e) => setQSubject(e.target.value as TeacherSubject)}
              className="w-full h-10 px-3 rounded-xl border border-[#27345C]/20 bg-white"
            >
              {ALLOWED_TEACHER_SUBJECTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block mb-1">{isAr ? 'الدرس' : 'Lesson'}</label>
            <select
              value={qLessonId}
              onChange={(e) => setQLessonId(e.target.value)}
              className="w-full h-10 px-3 rounded-xl border border-[#27345C]/20 bg-white"
            >
              {lessonsForLevel.map((ls) => (
                <option key={ls.id} value={ls.id}>
                  {ls.id} — {t(ls.title, language)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-bold">
          <div>
            <label className="block mb-1">{isAr ? 'نوع السؤال' : 'Question Type'}</label>
            <select
              value={qType}
              onChange={(e) => setQType(e.target.value as TeacherQuestionType)}
              className="w-full h-10 px-3 rounded-xl border border-[#27345C]/20 bg-white"
            >
              {ALLOWED_TEACHER_QUESTION_TYPES.map((qt) => (
                <option key={qt} value={qt}>
                  {qt}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block mb-1">{isAr ? 'الصعوبة' : 'Difficulty'}</label>
            <select
              value={qDiff}
              onChange={(e) => setQDiff(e.target.value as TeacherQuestionDifficulty)}
              className="w-full h-10 px-3 rounded-xl border border-[#27345C]/20 bg-white"
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>
          <div>
            <label className="block mb-1">{isAr ? 'الدرجة' : 'Marks'}</label>
            <input
              type="number"
              min={0.5}
              max={20}
              step={0.5}
              value={qMarks}
              onChange={(e) => setQMarks(Number(e.target.value))}
              className="w-full h-10 px-3 rounded-xl border border-[#27345C]/20 tabular-nums"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-bold">
          <div>
            <label className="block mb-1">{isAr ? 'نص السؤال (عربي)' : 'Prompt (Arabic)'}</label>
            <input
              type="text"
              value={qPromptAr}
              onChange={(e) => setQPromptAr(e.target.value)}
              placeholder="اكتب نص السؤال بالعربية..."
              className="w-full h-10 px-3 rounded-xl border border-[#27345C]/20"
            />
          </div>
          <div>
            <label className="block mb-1">{isAr ? 'نص السؤال (إنجليزي)' : 'Prompt (English)'}</label>
            <input
              type="text"
              value={qPromptEn}
              onChange={(e) => setQPromptEn(e.target.value)}
              placeholder="Question text in English..."
              className="w-full h-10 px-3 rounded-xl border border-[#27345C]/20"
            />
          </div>
        </div>

        {(qType === 'audio-id' || qType === 'picture-id') && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-bold">
            <input
              type="text"
              value={qAudioText}
              onChange={(e) => setQAudioText(e.target.value)}
              placeholder="Audio Speech Text (required for audio-id)"
              className="h-10 px-3 rounded-xl border border-[#27345C]/20"
            />
            <input
              type="text"
              value={qImageUrl}
              onChange={(e) => setQImageUrl(e.target.value)}
              placeholder="Optional safe image URL (/assets/... or https://...)"
              className="h-10 px-3 rounded-xl border border-[#27345C]/20"
            />
          </div>
        )}

        {(qType === 'multiple-choice' || qType === 'picture-id' || qType === 'audio-id') && (
          <div className="space-y-2 text-xs font-bold">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input type="text" placeholder="Option A (Arabic)" value={qOptAAr} onChange={(e) => setQOptAAr(e.target.value)} className="h-9 px-3 rounded-xl border border-[#27345C]/20" />
              <input type="text" placeholder="Option A (English)" value={qOptAEn} onChange={(e) => setQOptAEn(e.target.value)} className="h-9 px-3 rounded-xl border border-[#27345C]/20" />
              <input type="text" placeholder="Option B (Arabic)" value={qOptBAr} onChange={(e) => setQOptBAr(e.target.value)} className="h-9 px-3 rounded-xl border border-[#27345C]/20" />
              <input type="text" placeholder="Option B (English)" value={qOptBEn} onChange={(e) => setQOptBEn(e.target.value)} className="h-9 px-3 rounded-xl border border-[#27345C]/20" />
              <input type="text" placeholder="Option C (Arabic - optional)" value={qOptCAr} onChange={(e) => setQOptCAr(e.target.value)} className="h-9 px-3 rounded-xl border border-[#27345C]/20" />
              <input type="text" placeholder="Option C (English - optional)" value={qOptCEn} onChange={(e) => setQOptCEn(e.target.value)} className="h-9 px-3 rounded-xl border border-[#27345C]/20" />
            </div>
            <select value={qCorrectId} onChange={(e) => setQCorrectId(e.target.value)} className="h-9 px-3 rounded-xl border border-[#27345C]/20 bg-white">
              <option value="a">Correct Option: A</option>
              <option value="b">Correct Option: B</option>
              {(qOptCAr || qOptCEn) && <option value="c">Correct Option: C</option>}
            </select>
          </div>
        )}

        {qType === 'true-false' && (
          <select value={qCorrectId} onChange={(e) => setQCorrectId(e.target.value)} className="h-9 px-3 rounded-xl border border-[#27345C]/20 bg-white text-xs font-bold">
            <option value="a">Correct Answer: True / صح</option>
            <option value="b">Correct Answer: False / خطأ</option>
          </select>
        )}

        {(qType === 'fill-blank' || qType === 'short-answer') && (
          <input
            type="text"
            value={qAcceptedAnswers}
            onChange={(e) => setQAcceptedAnswers(e.target.value)}
            placeholder="Accepted answers separated by | (e.g. cat|CAT|قطة)"
            className="w-full h-10 px-3 rounded-xl border border-[#27345C]/20 text-xs font-bold"
          />
        )}

        {qType === 'matching' && (
          <textarea
            rows={3}
            value={qMatchingRaw}
            onChange={(e) => setQMatchingRaw(e.target.value)}
            placeholder="One pair per line: Left => Right"
            className="w-full p-3 rounded-xl border border-[#27345C]/20 text-xs font-bold"
          />
        )}

        {qType === 'ordering' && (
          <textarea
            rows={3}
            value={qOrderRaw}
            onChange={(e) => setQOrderRaw(e.target.value)}
            placeholder="One step per line in exact correct sequence"
            className="w-full p-3 rounded-xl border border-[#27345C]/20 text-xs font-bold"
          />
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-bold">
          <input type="text" placeholder="Explanation AR (optional)" value={qExplainAr} onChange={(e) => setQExplainAr(e.target.value)} className="h-9 px-3 rounded-xl border border-[#27345C]/20" />
          <input type="text" placeholder="Explanation EN (optional)" value={qExplainEn} onChange={(e) => setQExplainEn(e.target.value)} className="h-9 px-3 rounded-xl border border-[#27345C]/20" />
        </div>

        <button type="submit" className="min-h-[42px] px-6 rounded-xl bg-[#8054D9] text-white font-extrabold text-xs cursor-pointer">
          {editingQuestionId
            ? isAr
              ? 'حفظ التعديلات'
              : 'Save Updates'
            : isAr
              ? 'إضافة لبنك الأسئلة'
              : 'Save to Question Bank'}
        </button>
      </form>

      {/* Question Bank List */}
      <div className="rounded-2xl p-5 bg-white border border-[#27345C]/12 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-extrabold text-base text-[#27345C] tabular-nums">
            {isAr ? `بنك أسئلتي (${filteredQuestions.length})` : `My Question Bank (${filteredQuestions.length})`}
          </h3>
          <div className="flex flex-wrap gap-2 text-xs font-bold">
            <input
              type="text"
              placeholder={isAr ? 'بحث...' : 'Search...'}
              value={qSearch}
              onChange={(e) => setQSearch(e.target.value)}
              className="h-9 px-3 rounded-xl border border-[#27345C]/20"
            />
            <select value={qFilterLevel} onChange={(e) => setQFilterLevel(e.target.value)} className="h-9 px-2.5 rounded-xl border border-[#27345C]/20 bg-white">
              <option value="">All Tracks</option>
              <option value="1">Foundations (1–4)</option>
            </select>
            <select value={qFilterSubject} onChange={(e) => setQFilterSubject(e.target.value)} className="h-9 px-2.5 rounded-xl border border-[#27345C]/20 bg-white">
              <option value="">All Subjects</option>
              {ALLOWED_TEACHER_SUBJECTS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select value={qFilterType} onChange={(e) => setQFilterType(e.target.value)} className="h-9 px-2.5 rounded-xl border border-[#27345C]/20 bg-white">
              <option value="">All Types</option>
              {ALLOWED_TEACHER_QUESTION_TYPES.map((qt) => (
                <option key={qt} value={qt}>{qt}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-2.5">
          {filteredQuestions.map((q) => (
            <div key={q.id} className="p-3.5 rounded-xl border border-[#27345C]/12 flex flex-wrap items-center justify-between gap-3 bg-[#FFF8E9]/40">
              <div className="space-y-1 min-w-0 flex-1">
                <p className="text-[11px] font-bold text-[#27345C]/65 tabular-nums">
                  {q.lessonId} · {q.questionType} · {q.marks} pts · {q.difficulty} · {q.approvalStatus || 'published'} · v{q.version || 1}
                </p>
                <p className="font-extrabold text-sm text-[#27345C]">{q.promptAr || q.promptEn}</p>
                {q.promptAr && q.promptEn && <p className="text-xs font-semibold text-[#27345C]/65">{q.promptEn}</p>}
                {(q.qualityFlags || []).length > 0 && (
                  <p className="text-[11px] font-bold text-[#991B1B]">
                    {(q.qualityFlags || []).map((fl) => `⚠ ${fl.code}`).join(' · ')}
                  </p>
                )}
                {q.adminFeedback && (
                  <p className="text-xs font-bold text-[#9A3412]">Admin note: {q.adminFeedback}</p>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-xs font-bold shrink-0">
                {(q.approvalStatus === 'draft' || q.approvalStatus === 'rejected') && (
                  <button
                    type="button"
                    onClick={() => void onSubmitQuestionReview(q.id)}
                    className="min-h-[34px] px-2.5 rounded-lg bg-[#FFD84D] text-[#27345C] font-extrabold cursor-pointer whitespace-nowrap"
                  >
                    Submit Review
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setPreviewQuestion(previewQuestion?.id === q.id ? null : q)}
                  className="min-h-[34px] px-2.5 rounded-lg bg-white border border-[#27345C]/15 cursor-pointer whitespace-nowrap"
                >
                  Preview
                </button>
                <button
                  type="button"
                  onClick={() => void onDuplicateQuestion(q.id)}
                  className="min-h-[34px] px-2.5 rounded-lg bg-white border border-[#27345C]/15 cursor-pointer"
                  title="Duplicate"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => void onDeleteQuestion(q.id)}
                  className="min-h-[34px] px-2.5 rounded-lg bg-[#FF6B6B]/15 text-[#991B1B] cursor-pointer"
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {previewQuestion && (
          <div className="p-4 rounded-xl bg-[#E5F6FF] border border-[#39BDF2] space-y-2 text-xs">
            <p className="font-extrabold text-[#27345C]">
              Preview ({previewQuestion.questionType}): {previewQuestion.promptAr} / {previewQuestion.promptEn}
            </p>
            <div className="flex flex-wrap gap-2">
              {previewQuestion.options.map((o) => (
                <span key={o.id} className={`px-3 py-1 rounded-xl border ${o.id === previewQuestion.correctOptionId ? 'bg-[#55D98B] font-extrabold' : 'bg-white'}`}>
                  {o.textAr} / {o.textEn}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/* 3. CREATE EXAM */
export interface TeacherCreateExamViewProps {
  language: Language;
  questions: TeacherQuestion[];
  exTitleAr: string;
  setExTitleAr: (v: string) => void;
  exTitleEn: string;
  setExTitleEn: (v: string) => void;
  exDescAr: string;
  setExDescAr: (v: string) => void;
  exDescEn: string;
  setExDescEn: (v: string) => void;
  exSubject: TeacherExam['subject'];
  setExSubject: (v: TeacherExam['subject']) => void;
  exLevel: 1 | 2;
  setExLevel: (v: 1 | 2) => void;
  exAgeGroup: AgeGroupId;
  setExAgeGroup: (v: AgeGroupId) => void;
  exQuestionIds: string[];
  setExQuestionIds: React.Dispatch<React.SetStateAction<string[]>>;
  selectedExamMarksTotal: number;
  exPassingPct: number;
  setExPassingPct: (v: number) => void;
  exDurationMin: number;
  setExDurationMin: (v: number) => void;
  exStartDate: string;
  setExStartDate: (v: string) => void;
  exEndDate: string;
  setExEndDate: (v: string) => void;
  exAttempts: number;
  setExAttempts: (v: number) => void;
  exRandQ: boolean;
  setExRandQ: (v: boolean) => void;
  exRandA: boolean;
  setExRandA: (v: boolean) => void;
  exShowRes: boolean;
  setExShowRes: (v: boolean) => void;
  exShowCorr: boolean;
  setExShowCorr: (v: boolean) => void;
  setExStatus: (v: ExamStatus) => void;
  onCreateExam: (e: React.FormEvent, desiredStatus?: ExamStatus) => Promise<void>;
}

export const TeacherCreateExamView: React.FC<TeacherCreateExamViewProps> = (props) => {
  const {
    language,
    questions,
    exTitleAr,
    setExTitleAr,
    exTitleEn,
    setExTitleEn,
    exDescAr,
    setExDescAr,
    exDescEn,
    setExDescEn,
    exSubject,
    setExSubject,
    exLevel,
    setExLevel,
    exAgeGroup,
    setExAgeGroup,
    exQuestionIds,
    setExQuestionIds,
    selectedExamMarksTotal,
    exPassingPct,
    setExPassingPct,
    exDurationMin,
    setExDurationMin,
    exStartDate,
    setExStartDate,
    exEndDate,
    setExEndDate,
    exAttempts,
    setExAttempts,
    exRandQ,
    setExRandQ,
    exRandA,
    setExRandA,
    exShowRes,
    setExShowRes,
    exShowCorr,
    setExShowCorr,
    setExStatus,
    onCreateExam,
  } = props;
  const isAr = language === 'ar';

  return (
    <form onSubmit={(e) => void onCreateExam(e)} className="rounded-2xl p-5 bg-white border border-[#27345C]/12 space-y-4">
      <h1 className="text-xl font-extrabold text-[#27345C]">
        {isAr ? 'إنشاء امتحان جديد وتحديد إعداداته' : 'Create & Configure Exam'}
      </h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-bold">
        <input required placeholder="Exam Title (Arabic)" value={exTitleAr} onChange={(e) => setExTitleAr(e.target.value)} className="h-10 px-3 rounded-xl border border-[#27345C]/20" />
        <input required placeholder="Exam Title (English)" value={exTitleEn} onChange={(e) => setExTitleEn(e.target.value)} className="h-10 px-3 rounded-xl border border-[#27345C]/20" />
        <input placeholder="Description (Arabic)" value={exDescAr} onChange={(e) => setExDescAr(e.target.value)} className="h-10 px-3 rounded-xl border border-[#27345C]/20" />
        <input placeholder="Description (English)" value={exDescEn} onChange={(e) => setExDescEn(e.target.value)} className="h-10 px-3 rounded-xl border border-[#27345C]/20" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-bold">
        <div>
          <label className="block mb-1">Subject</label>
          <select value={exSubject} onChange={(e) => setExSubject(e.target.value as TeacherExam['subject'])} className="w-full h-10 px-2.5 rounded-xl border border-[#27345C]/20 bg-white">
            <option value="comprehensive">comprehensive</option>
            {ALLOWED_TEACHER_SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="block mb-1">Level</label>
          <select value={exLevel} onChange={() => setExLevel(1)} className="w-full h-10 px-2.5 rounded-xl border border-[#27345C]/20 bg-white">
            <option value={1}>Foundations (Ages 1–4)</option>
          </select>
        </div>
        <div>
          <label className="block mb-1">Stage</label>
          <select value={exAgeGroup} onChange={(e) => setExAgeGroup(e.target.value as AgeGroupId)} className="w-full h-10 px-2.5 rounded-xl border border-[#27345C]/20 bg-white">
            <option value="1-4">Little Explorers (1–4 Years)</option>
          </select>
        </div>
        <div>
          <label className="block mb-1">Passing %</label>
          <input type="number" min={1} max={100} value={exPassingPct} onChange={(e) => setExPassingPct(Number(e.target.value))} className="w-full h-10 px-3 rounded-xl border border-[#27345C]/20 tabular-nums" />
        </div>
        <div>
          <label className="block mb-1">Duration (min)</label>
          <input type="number" min={1} max={180} value={exDurationMin} onChange={(e) => setExDurationMin(Number(e.target.value))} className="w-full h-10 px-3 rounded-xl border border-[#27345C]/20 tabular-nums" />
        </div>
        <div>
          <label className="block mb-1">Allowed Attempts</label>
          <input type="number" min={1} max={20} value={exAttempts} onChange={(e) => setExAttempts(Number(e.target.value))} className="w-full h-10 px-3 rounded-xl border border-[#27345C]/20 tabular-nums" />
        </div>
        <div>
          <label className="block mb-1">Start Date</label>
          <input type="datetime-local" value={exStartDate} onChange={(e) => setExStartDate(e.target.value)} className="w-full h-10 px-2 rounded-xl border border-[#27345C]/20" />
        </div>
        <div>
          <label className="block mb-1">End Date / Deadline</label>
          <input type="datetime-local" value={exEndDate} onChange={(e) => setExEndDate(e.target.value)} className="w-full h-10 px-2 rounded-xl border border-[#27345C]/20" />
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-xs font-bold">
        <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={exRandQ} onChange={(e) => setExRandQ(e.target.checked)} /> Randomize Questions</label>
        <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={exRandA} onChange={(e) => setExRandA(e.target.checked)} /> Randomize Answers</label>
        <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={exShowRes} onChange={(e) => setExShowRes(e.target.checked)} /> Show Results Immediately</label>
        <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={exShowCorr} onChange={(e) => setExShowCorr(e.target.checked)} /> Show Correct Answers in Review</label>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-extrabold text-[#27345C] tabular-nums">
          Select Questions from Question Bank ({exQuestionIds.length} selected · Total Marks: {selectedExamMarksTotal})
        </p>
        <div className="max-h-56 overflow-y-auto space-y-1.5 border border-[#27345C]/12 rounded-xl p-3">
          {questions.map((q) => {
            const checked = exQuestionIds.includes(q.id);
            return (
              <label key={q.id} className={`flex items-center justify-between p-2 rounded-xl cursor-pointer text-xs font-bold ${checked ? 'bg-[#F4EEFF] border border-[#8054D9]' : 'bg-[#FFF8E9]/40'}`}>
                <span className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) =>
                      setExQuestionIds((prev) =>
                        e.target.checked ? [...prev, q.id] : prev.filter((id) => id !== q.id),
                      )
                    }
                  />
                  <span>[{q.lessonId} · {q.questionType}] {q.promptAr || q.promptEn}</span>
                </span>
                <span className="tabular-nums">{q.marks} pts</span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          onClick={() => setExStatus('draft')}
          className="min-h-[42px] px-5 rounded-xl bg-[#27345C]/12 font-extrabold text-xs cursor-pointer"
        >
          {isAr ? 'حفظ كمسودة' : 'Save as Draft'}
        </button>
        <button
          type="button"
          onClick={(e) => void onCreateExam(e, 'published')}
          className="min-h-[42px] px-6 rounded-xl bg-[#8054D9] text-white font-extrabold text-xs cursor-pointer"
        >
          {isAr ? 'حفظ ونشر الامتحان' : 'Save & Publish Exam'}
        </button>
      </div>
    </form>
  );
};

/* 4. EXAMS LIST */
export const TeacherExamsListView: React.FC<{
  language: Language;
  section: 'my-exams' | 'draft-exams' | 'published-exams';
  exams: TeacherExamRow[];
  onSubmitReview: (examId: string) => Promise<void>;
  onPublishExam: (examId: string) => Promise<void>;
  onDeleteExam: (examId: string) => Promise<void>;
  onAssignExam: (examId: string) => void;
}> = ({ language, section, exams, onSubmitReview, onPublishExam, onDeleteExam, onAssignExam }) => {
  const isAr = language === 'ar';
  const heading =
    section === 'draft-exams'
      ? isAr ? 'مسودات الامتحانات' : 'Draft Exams'
      : section === 'published-exams'
        ? isAr ? 'الامتحانات المنشورة' : 'Published Exams'
        : isAr ? 'كل امتحاناتي' : 'All My Exams';

  return (
    <div className="rounded-2xl p-5 bg-white border border-[#27345C]/12 space-y-4">
      <h1 className="text-xl font-extrabold text-[#27345C]">{heading}</h1>
      {exams.length === 0 ? (
        <p className="text-xs font-semibold text-[#27345C]/65">
          {isAr ? 'لا توجد امتحانات في هذه القائمة حالياً.' : 'No exams in this list yet.'}
        </p>
      ) : (
        <div className="space-y-3">
          {exams.map((ex) => (
            <div key={ex.id} className="p-4 rounded-xl border border-[#27345C]/12 bg-[#FFF8E9]/45 flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1 min-w-0 flex-1">
                <p className="text-[11px] font-bold text-[#27345C]/65 tabular-nums">
                  {ex.status.toUpperCase()} · v{ex.version || 1} · {isAr ? 'التأسيس (١–٤)' : 'Foundations'} · {ex.subject} · {ex.totalQuestions} Qs · {ex.totalMarks} pts
                </p>
                <h3 className="font-extrabold text-base text-[#27345C]">{t(ex.title, language)}</h3>
                <p className="text-xs font-semibold text-[#27345C]/65 tabular-nums">
                  Assignments: {ex.assignmentCount ?? 0} · Completed: {ex.completedCount ?? 0}
                </p>
                {ex.adminReviewNote && (
                  <p className="text-xs font-bold text-[#9A3412]">Admin feedback: {ex.adminReviewNote}</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2 text-xs font-bold shrink-0">
                {(ex.status === 'draft' || ex.status === 'rejected') && (
                  <button
                    type="button"
                    onClick={() => void onSubmitReview(ex.id)}
                    className="min-h-[36px] px-3 rounded-lg bg-[#FFD84D] text-[#27345C] font-extrabold cursor-pointer whitespace-nowrap"
                  >
                    Submit for Review
                  </button>
                )}
                {ex.status === 'draft' && (
                  <button
                    type="button"
                    onClick={() => void onPublishExam(ex.id)}
                    className="min-h-[36px] px-3 rounded-lg bg-[#55D98B] text-[#27345C] font-extrabold cursor-pointer whitespace-nowrap"
                  >
                    Publish Now
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onAssignExam(ex.id)}
                  className="min-h-[36px] px-3 rounded-lg bg-[#8054D9] text-white font-extrabold cursor-pointer whitespace-nowrap"
                >
                  Assign to Students
                </button>
                <button
                  type="button"
                  onClick={() => void onDeleteExam(ex.id)}
                  className="min-h-[36px] px-3 rounded-lg bg-[#FF6B6B]/15 text-[#991B1B] cursor-pointer whitespace-nowrap"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/* 5. ASSIGN EXAMS */
export const TeacherAssignExamView: React.FC<{
  language: Language;
  exams: TeacherExamRow[];
  classes: TeacherClassRow[];
  students: TeacherStudentRow[];
  assignExamId: string;
  setAssignExamId: (v: string) => void;
  assignClassIds: string[];
  setAssignClassIds: React.Dispatch<React.SetStateAction<string[]>>;
  assignStudentIds: string[];
  setAssignStudentIds: React.Dispatch<React.SetStateAction<string[]>>;
  assignPublishNow: boolean;
  setAssignPublishNow: (v: boolean) => void;
  assignConfirmOpen: boolean;
  setAssignConfirmOpen: (v: boolean) => void;
  onConfirmAssign: () => Promise<void>;
}> = ({
  language,
  exams,
  classes,
  students,
  assignExamId,
  setAssignExamId,
  assignClassIds,
  setAssignClassIds,
  assignStudentIds,
  setAssignStudentIds,
  assignPublishNow,
  setAssignPublishNow,
  assignConfirmOpen,
  setAssignConfirmOpen,
  onConfirmAssign,
}) => {
  const isAr = language === 'ar';
  return (
    <div className="rounded-2xl p-5 bg-white border border-[#27345C]/12 space-y-4">
      <h1 className="text-xl font-extrabold text-[#27345C]">
        {isAr ? 'تعيين امتحان لفصول أو طلاب محددين' : 'Assign Exam to Classes & Students'}
      </h1>
      <div className="space-y-4 text-xs font-bold">
        <div>
          <label className="block mb-1">{isAr ? 'اختر الامتحان' : 'Select Exam'}</label>
          <select value={assignExamId} onChange={(e) => setAssignExamId(e.target.value)} className="w-full h-10 px-3 rounded-xl border border-[#27345C]/20 bg-white">
            <option value="">-- Choose an exam --</option>
            {exams.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {t(ex.title, language)} ({ex.status} · {ex.totalQuestions} Qs)
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block mb-1.5">{isAr ? 'تعيين لفصول كاملة (اختياري)' : 'Assign to Whole Classes (optional)'}</label>
          <div className="flex flex-wrap gap-2">
            {classes.map((cls) => {
              const picked = assignClassIds.includes(cls.id);
              return (
                <button
                  key={cls.id}
                  type="button"
                  onClick={() =>
                    setAssignClassIds((prev) =>
                      picked ? prev.filter((x) => x !== cls.id) : [...prev, cls.id],
                    )
                  }
                  className={`min-h-[38px] px-3 rounded-xl border cursor-pointer ${picked ? 'bg-[#8054D9] text-white border-[#8054D9]' : 'bg-[#FFF8E9]'}`}
                >
                  {cls.name} ({cls.students.length})
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="block mb-1.5">
            {isAr ? 'أو اختر طلاباً محددين (طلاب الفصول والمرتبطين بالرمز)' : 'Or Select Individual Authorized Students (Class & Connected)'}
          </label>
          <div className="flex flex-wrap gap-2">
            {students.map((st) => {
              const picked = assignStudentIds.includes(st.id);
              const tag =
                st.connectionSource === 'connected'
                  ? isAr ? 'مرتبط' : 'Connected'
                  : st.connectionSource === 'both'
                    ? isAr ? 'فصل ومرتبط' : 'Both'
                    : isAr ? 'فصل' : 'Class';
              return (
                <button
                  key={st.id}
                  type="button"
                  onClick={() =>
                    setAssignStudentIds((prev) =>
                      picked ? prev.filter((x) => x !== st.id) : [...prev, st.id],
                    )
                  }
                  className={`min-h-[38px] px-3 rounded-xl border cursor-pointer ${picked ? 'bg-[#39BDF2] text-white border-[#39BDF2]' : 'bg-white border-[#27345C]/15'}`}
                >
                  {st.displayName} <span className="opacity-75">({tag})</span>
                </button>
              );
            })}
          </div>
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={assignPublishNow} onChange={(e) => setAssignPublishNow(e.target.checked)} />
          <span>{isAr ? 'نشر الامتحان تلقائياً إذا كان مسودة' : 'Automatically publish exam if currently draft'}</span>
        </label>

        <button
          type="button"
          disabled={!assignExamId || (assignClassIds.length === 0 && assignStudentIds.length === 0)}
          onClick={() => setAssignConfirmOpen(true)}
          className="min-h-[42px] px-6 rounded-xl bg-[#55D98B] text-[#27345C] font-extrabold cursor-pointer disabled:opacity-40"
        >
          {isAr ? 'مراجعة وتأكيد الإسناد' : 'Review & Confirm Assignment'}
        </button>
      </div>

      {assignConfirmOpen && (
        <div className="p-4 rounded-xl bg-[#FFF8E9] border border-[#FFD84D] space-y-2 text-xs">
          <p className="font-extrabold text-sm text-[#27345C]">Confirm Assignment</p>
          <p className="font-bold tabular-nums">
            Classes selected: {assignClassIds.length} · Individual students selected: {assignStudentIds.length}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setAssignConfirmOpen(false)} className="min-h-[38px] px-4 rounded-lg bg-white border font-bold cursor-pointer">Back</button>
            <button type="button" onClick={() => void onConfirmAssign()} className="min-h-[38px] px-5 rounded-lg bg-[#8054D9] text-white font-extrabold cursor-pointer">Confirm & Send to Students</button>
          </div>
        </div>
      )}
    </div>
  );
};

/* 6. EXAM RESULTS */
export const TeacherResultsView: React.FC<{
  language: Language;
  results: TeacherResultRow[];
}> = ({ language, results }) => {
  const isAr = language === 'ar';
  return (
    <div className="rounded-2xl p-5 bg-white border border-[#27345C]/12 space-y-3">
      <h1 className="text-xl font-extrabold text-[#27345C]">
        {isAr ? 'نتائج امتحانات الطلاب' : 'Student Exam Results'}
      </h1>
      {results.length === 0 ? (
        <p className="text-xs font-semibold text-[#27345C]/65">
          {isAr ? 'لا توجد محاولات مكتملة بعد.' : 'No submitted attempts yet.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#27345C]/12 text-[#27345C]/60 font-bold">
                <th className="py-2.5 px-2 text-start">{isAr ? 'الطالب' : 'Student'}</th>
                <th className="py-2.5 px-2 text-start">{isAr ? 'الامتحان' : 'Exam'}</th>
                <th className="py-2.5 px-2 text-start">{isAr ? 'الدرجة' : 'Score'}</th>
                <th className="py-2.5 px-2 text-start">{isAr ? 'الحالة' : 'Status'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#27345C]/8 font-semibold">
              {results.map((r) => (
                <tr key={r.id}>
                  <td className="py-3 px-2 font-extrabold text-[#27345C]">
                    {r.studentName}
                    {r.className ? <span className="text-[#27345C]/55 ms-1">· {r.className}</span> : null}
                  </td>
                  <td className="py-3 px-2">{t(r.examTitle, language)}</td>
                  <td className="py-3 px-2 tabular-nums font-bold">
                    {r.score}/{r.totalMarks} ({r.percentage}%)
                  </td>
                  <td className="py-3 px-2">
                    <span className={`font-extrabold ${r.passed ? 'text-[#14532D]' : 'text-[#9A3412]'}`}>
                      {r.passed ? (isAr ? 'ناجح' : 'Passed') : (isAr ? 'يحتاج مراجعة' : 'Needs Review')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

/* 7. STUDENT PERFORMANCE DRILLDOWN */
export const TeacherStudentPerformanceView: React.FC<{
  language: Language;
  students: TeacherStudentRow[];
  selectedStudentId: string;
  studentDrilldown: StudentDrilldownData | null;
  onLoadStudentDrilldown: (studentId: string) => Promise<void>;
}> = ({ language, students, selectedStudentId, studentDrilldown, onLoadStudentDrilldown }) => {
  const isAr = language === 'ar';
  return (
    <div className="rounded-2xl p-5 bg-white border border-[#27345C]/12 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-extrabold text-[#27345C]">
          {isAr ? 'تفاصيل أداء الطالب' : 'Student Performance Breakdown'}
        </h1>
        <select
          value={selectedStudentId}
          onChange={(e) => {
            if (e.target.value) void onLoadStudentDrilldown(e.target.value);
          }}
          className="h-10 px-3 rounded-xl border border-[#27345C]/20 text-xs font-bold bg-white"
        >
          <option value="">{isAr ? '-- اختر طالباً --' : '-- Pick Authorized Student --'}</option>
          {students.map((st) => (
            <option key={st.id} value={st.id}>{st.displayName}</option>
          ))}
        </select>
      </div>

      {!studentDrilldown ? (
        <p className="text-xs font-semibold text-[#27345C]/65">
          {isAr ? 'اختر طالباً من القائمة لعرض تفاصيل التقدم والامتحانات.' : 'Select a student above to inspect Foundations progress and exam attempts.'}
        </p>
      ) : (
        <div className="space-y-4 text-xs font-bold">
          <div className="p-4 rounded-xl bg-[#F4EEFF]/60 border border-[#8054D9]/20 flex flex-wrap justify-between items-center gap-3">
            <div>
              <p className="text-lg font-extrabold text-[#27345C]">{studentDrilldown.student.displayName}</p>
              <p className="text-[#27345C]/70 tabular-nums">
                {getSafeStageShortLabel(studentDrilldown.student.ageGroup, language)} · Stars {studentDrilldown.student.stars} ★
              </p>
            </div>
            <div className="text-end tabular-nums">
              <p>{isAr ? 'دروس التأسيس المسجلة:' : 'Foundations Tracked:'} {Object.keys(studentDrilldown.level1Progress).length}</p>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="font-extrabold text-sm text-[#27345C]">
              {isAr ? 'محاولات الامتحانات المسندة:' : 'Assigned Teacher Exams Taken:'}
            </h4>
            {studentDrilldown.examAttempts.length === 0 ? (
              <p className="text-[#27345C]/65">{isAr ? 'لا توجد محاولات مكتملة بعد.' : 'No completed attempts yet.'}</p>
            ) : (
              <div className="divide-y divide-[#27345C]/8 border border-[#27345C]/10 rounded-xl overflow-hidden">
                {studentDrilldown.examAttempts.map((a) => (
                  <div key={a.attemptId} className="p-3 bg-white flex justify-between items-center">
                    <span>{t(a.examTitle, language)}</span>
                    <span className="tabular-nums font-extrabold">
                      {a.score}/{a.totalMarks} ({a.percentage}%)
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/* 8. PROFILE & PASSWORD SETTINGS */
export const TeacherProfileView: React.FC<{
  language: Language;
  profName: string;
  setProfName: (v: string) => void;
  profBio: string;
  setProfBio: (v: string) => void;
  curPw: string;
  setCurPw: (v: string) => void;
  newPw: string;
  setNewPw: (v: string) => void;
  confPw: string;
  setConfPw: (v: string) => void;
  onSaveProfile: (e: React.FormEvent) => Promise<void>;
  onChangePassword: (e: React.FormEvent) => Promise<void>;
  onNavigateSection: (s: TeacherSection) => void;
}> = ({
  language,
  profName,
  setProfName,
  profBio,
  setProfBio,
  curPw,
  setCurPw,
  newPw,
  setNewPw,
  confPw,
  setConfPw,
  onSaveProfile,
  onChangePassword,
}) => {
  const isAr = language === 'ar';
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <form onSubmit={(e) => void onSaveProfile(e)} className="rounded-2xl p-5 bg-white border border-[#27345C]/12 space-y-3 text-xs font-bold">
        <h2 className="text-base font-extrabold text-[#27345C]">
          {isAr ? 'تحديث الملف الشخصي' : 'Profile Settings'}
        </h2>
        <input required value={profName} onChange={(e) => setProfName(e.target.value)} placeholder="Display Name" className="w-full h-10 px-3 rounded-xl border border-[#27345C]/20" />
        <textarea rows={3} value={profBio} onChange={(e) => setProfBio(e.target.value)} placeholder="Short Teaching Bio" className="w-full p-3 rounded-xl border border-[#27345C]/20" />
        <button type="submit" className="min-h-[40px] px-5 rounded-xl bg-[#8054D9] text-white font-extrabold cursor-pointer">
          {isAr ? 'حفظ البيانات' : 'Save Profile'}
        </button>
      </form>

      <form onSubmit={(e) => void onChangePassword(e)} className="rounded-2xl p-5 bg-white border border-[#27345C]/12 space-y-3 text-xs font-bold">
        <h2 className="text-base font-extrabold text-[#27345C]">
          {isAr ? 'تغيير كلمة المرور' : 'Change Password'}
        </h2>
        <input type="password" required value={curPw} onChange={(e) => setCurPw(e.target.value)} placeholder="Current Password" className="w-full h-10 px-3 rounded-xl border border-[#27345C]/20" />
        <input type="password" required value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="New Password (min 12 chars)" className="w-full h-10 px-3 rounded-xl border border-[#27345C]/20" />
        <input type="password" required value={confPw} onChange={(e) => setConfPw(e.target.value)} placeholder="Confirm New Password" className="w-full h-10 px-3 rounded-xl border border-[#27345C]/20" />
        <button type="submit" className="min-h-[40px] px-5 rounded-xl bg-[#27345C] text-white font-extrabold cursor-pointer">
          {isAr ? 'تحديث كلمة المرور' : 'Update Password'}
        </button>
      </form>
    </div>
  );
};
