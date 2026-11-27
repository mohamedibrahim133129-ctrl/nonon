import type {
  Classroom,
  LocalizedText,
  StoredAgeGroupId,
  TeacherExam,
  TeacherJoinCodeDto,
  TeacherQuestion,
  TeacherStudentSource,
  UserNotification,
} from '../../types/nonoland';

export type TeacherSection =
  | 'overview'
  | 'connections'
  | 'classes'
  | 'students'
  | 'homework'
  | 'question-bank'
  | 'create-exam'
  | 'my-exams'
  | 'draft-exams'
  | 'published-exams'
  | 'assign-exams'
  | 'exam-results'
  | 'student-performance'
  | 'profile';

export interface LessonOption {
  id: string;
  level: 1 | 2;
  subject: string;
  title: LocalizedText;
}

export interface TeacherStudentRow {
  id: string;
  displayName: string;
  ageGroup: StoredAgeGroupId;
  language: string;
  level: number;
  stars: number;
  classes: string[];
  connectionSource: TeacherStudentSource;
  connectionId?: string;
  connectedAt?: string;
  level1MasteredCount: number;
  level2MasteredCount: number;
  completedTeacherExams: number;
  averageExamPercentage: number | null;
}

export interface TeacherDashboardData {
  stats: {
    classesCount: number;
    assignedStudentsCount: number;
    classStudentsCount: number;
    connectedStudentsCount: number;
    pendingConnectionsCount: number;
    pendingHomeworkReviewsCount: number;
    totalQuestions: number;
    totalExams: number;
    publishedExamsCount: number;
    draftExamsCount: number;
    totalAssignedExams: number;
    completedAttemptsCount: number;
    averageScorePercentage: number;
  };
  connectedStudentsPreview: Array<{
    connectionId: string;
    childId: string;
    displayName: string;
    ageGroup: StoredAgeGroupId;
    level: number;
    stars: number;
    parentDisplayName: string;
    approvedAt: string;
  }>;
  scoreTrendSeries: Array<{
    attemptId: string;
    studentName: string;
    examTitle: LocalizedText;
    percentage: number;
    passed: boolean;
    submittedAt: string;
  }>;
  subjectBreakdown: Array<{
    subject: string;
    questionsCount: number;
    examsCount: number;
    attemptsCount: number;
    averageScorePercentage: number | null;
  }>;
  recentResults: Array<{
    attemptId: string;
    examId: string;
    examTitle: LocalizedText;
    studentId: string;
    studentName: string;
    percentage: number;
    passed: boolean;
    submittedAt: string;
  }>;
  recentActivity: Array<{ id: string; summary: string; createdAt: string }>;
}

export interface TeacherConnectionRequestRow {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'expired';
  requestedAt: string;
  reviewedAt?: string;
  rejectionReason?: string;
  cancelledAt?: string;
  expiresAt?: string;
  childId: string;
  childDisplayName: string;
  childAgeGroup: StoredAgeGroupId;
  childLanguage: string;
  childLevel: number;
  parentId: string;
  parentDisplayName: string;
  joinCodeLast4: string;
}

export interface TeacherActiveConnectionRow {
  id: string;
  teacherId: string;
  parentId: string;
  childId: string;
  requestId?: string;
  status: 'active' | 'disconnected';
  approvedAt: string;
  childDisplayName: string;
  childAgeGroup: StoredAgeGroupId;
  childLanguage: string;
  childLevel: number;
  childStars: number;
  parentDisplayName: string;
}

export interface TeacherJoinCodeState {
  activeCode: TeacherJoinCodeDto | null;
  recentHistory: TeacherJoinCodeDto[];
}

export interface TeacherClassRow extends Classroom {
  students: Array<{
    id: string;
    displayName: string;
    ageGroup: StoredAgeGroupId;
    language: string;
    level: number;
    stars: number;
  }>;
}

export interface TeacherExamRow extends TeacherExam {
  assignmentCount?: number;
  completedCount?: number;
}

export interface TeacherResultRow {
  id: string;
  examId: string;
  examTitle: LocalizedText;
  subject?: string;
  studentName: string;
  className?: string;
  score?: number;
  totalMarks?: number;
  percentage?: number;
  passed?: boolean;
  submittedAt?: string;
}

export interface StudentDrilldownData {
  student: {
    id: string;
    displayName: string;
    ageGroup: string;
    language: string;
    level: number;
    stars: number;
  };
  level1Progress: Record<string, { status: string; lastScore?: number; lastTotal?: number }>;
  level2Progress: Record<string, { status: string; lastScore?: number; lastTotal?: number }>;
  examAttempts: Array<{
    attemptId: string;
    examId: string;
    examTitle: LocalizedText;
    score?: number;
    totalMarks?: number;
    percentage?: number;
    passed?: boolean;
    submittedAt?: string;
  }>;
}

export interface TeacherNotificationState {
  notifications: UserNotification[];
  unreadCount: number;
}

export type { TeacherQuestion };
