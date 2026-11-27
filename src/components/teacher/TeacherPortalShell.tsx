import React, { useState } from 'react';
import {
  Bell,
  BookOpen,
  CheckCheck,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Globe,
  GraduationCap,
  Layers,
  LayoutDashboard,
  Link2,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Send,
  Settings,
  Users,
  X,
} from 'lucide-react';
import { NonoLandLogo } from '../NonoLandLogo';
import type { Language, UserNotification } from '../../types/nonoland';
import type { TeacherSection } from './teacherTypes';

interface NavGroup {
  labelAr: string;
  labelEn: string;
  items: Array<{
    id: TeacherSection;
    ar: string;
    en: string;
    icon: React.ReactNode;
    badgeCount?: number;
  }>;
}

interface TeacherPortalShellProps {
  language: Language;
  onToggleLanguage: () => void;
  teacherName: string;
  teacherEmail: string;
  section: TeacherSection;
  onSelectSection: (section: TeacherSection) => void;
  pendingRequestsCount: number;
  notifications: UserNotification[];
  unreadNotificationsCount: number;
  onMarkNotificationRead: (id: string) => Promise<void>;
  onMarkAllNotificationsRead: () => Promise<void>;
  globalSearch: string;
  onGlobalSearchChange: (val: string) => void;
  onLogout: () => Promise<void>;
  notice: string;
  errorMsg: string;
  onDismissNotice: () => void;
  onDismissError: () => void;
  children: React.ReactNode;
}

export const TeacherPortalShell: React.FC<TeacherPortalShellProps> = ({
  language,
  onToggleLanguage,
  teacherName,
  teacherEmail,
  section,
  onSelectSection,
  pendingRequestsCount,
  notifications,
  unreadNotificationsCount,
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
  globalSearch,
  onGlobalSearchChange,
  onLogout,
  notice,
  errorMsg,
  onDismissNotice,
  onDismissError,
  children,
}) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);

  const isAr = language === 'ar';

  const navGroups: NavGroup[] = [
    {
      labelAr: 'مساحة العمل',
      labelEn: 'Workspace',
      items: [
        { id: 'overview', ar: 'نظرة عامة', en: 'Overview', icon: <LayoutDashboard className="w-4 h-4 shrink-0" /> },
        {
          id: 'connections',
          ar: 'رموز الانضمام والربط',
          en: 'Connections & Code',
          icon: <Link2 className="w-4 h-4 shrink-0" />,
          badgeCount: pendingRequestsCount,
        },
        { id: 'classes', ar: 'فصولي', en: 'My Classes', icon: <Layers className="w-4 h-4 shrink-0" /> },
        { id: 'students', ar: 'طلابي', en: 'My Students', icon: <Users className="w-4 h-4 shrink-0" /> },
        { id: 'homework', ar: 'الواجبات والمهام', en: 'Homework', icon: <FileText className="w-4 h-4 shrink-0" /> },
      ],
    },
    {
      labelAr: 'استوديو التقييم',
      labelEn: 'Assessment Studio',
      items: [
        { id: 'question-bank', ar: 'بنك الأسئلة', en: 'Question Bank', icon: <BookOpen className="w-4 h-4 shrink-0" /> },
        { id: 'create-exam', ar: 'إنشاء امتحان', en: 'Create Exam', icon: <Plus className="w-4 h-4 shrink-0" /> },
        { id: 'my-exams', ar: 'كل امتحاناتي', en: 'My Exams', icon: <ClipboardCheck className="w-4 h-4 shrink-0" /> },
        { id: 'draft-exams', ar: 'المسودات', en: 'Draft Exams', icon: <FileText className="w-4 h-4 shrink-0" /> },
        { id: 'published-exams', ar: 'المنشورة', en: 'Published Exams', icon: <CheckCircle2 className="w-4 h-4 shrink-0" /> },
        { id: 'assign-exams', ar: 'تعيين للطلاب', en: 'Assign Exams', icon: <Send className="w-4 h-4 shrink-0" /> },
        { id: 'exam-results', ar: 'نتائج الامتحانات', en: 'Exam Results', icon: <GraduationCap className="w-4 h-4 shrink-0" /> },
        { id: 'student-performance', ar: 'أداء الطالب', en: 'Student Progress', icon: <Search className="w-4 h-4 shrink-0" /> },
      ],
    },
    {
      labelAr: 'الحساب',
      labelEn: 'Account',
      items: [
        { id: 'profile', ar: 'إعدادات الحساب', en: 'Profile Settings', icon: <Settings className="w-4 h-4 shrink-0" /> },
      ],
    },
  ];

  const allItems = navGroups.flatMap((g) => g.items);
  const activeItem = allItems.find((i) => i.id === section) || allItems[0];

  const renderSidebarNav = (collapsed: boolean, onPicked?: () => void) => (
    <div className="flex flex-col h-full">
      <div className="h-16 px-4 border-b border-[#27345C]/10 flex items-center justify-between gap-2 shrink-0">
        {!collapsed ? (
          <NonoLandLogo variant="compact" size="xs" language={language} />
        ) : (
          <NonoLandLogo variant="compact" size="xs" showWordmark={false} language={language} />
        )}
        <button
          type="button"
          onClick={() => setSidebarCollapsed((c) => !c)}
          className="hidden lg:inline-flex items-center justify-center w-8 h-8 rounded-lg text-[#27345C]/70 hover:bg-[#FFF8E9] hover:text-[#27345C] transition-colors cursor-pointer"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {navGroups.map((group) => (
          <div key={group.labelEn} className="space-y-1">
            {!collapsed && (
              <p className="px-3 text-[11px] font-bold text-[#27345C]/50">
                {isAr ? group.labelAr : group.labelEn}
              </p>
            )}
            {group.items.map((item) => {
              const isActive = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onSelectSection(item.id);
                    onPicked?.();
                  }}
                  title={collapsed ? (isAr ? item.ar : item.en) : undefined}
                  className={`w-full min-h-[40px] px-3 rounded-xl text-xs font-bold flex items-center gap-2.5 transition-colors cursor-pointer whitespace-nowrap ${
                    isActive
                      ? 'bg-[#8054D9] text-white'
                      : 'text-[#27345C]/80 hover:bg-[#FFF8E9] hover:text-[#27345C]'
                  } ${collapsed ? 'justify-center px-2' : 'justify-between'}`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    {item.icon}
                    {!collapsed && <span className="truncate">{isAr ? item.ar : item.en}</span>}
                  </span>
                  {!collapsed && typeof item.badgeCount === 'number' && item.badgeCount > 0 && (
                    <span
                      className={`px-1.5 py-0.5 rounded-md text-[11px] font-extrabold tabular-nums shrink-0 ${
                        isActive ? 'bg-white text-[#8054D9]' : 'bg-[#FFD84D] text-[#27345C]'
                      }`}
                    >
                      {item.badgeCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="p-3 border-t border-[#27345C]/10 shrink-0">
        <button
          type="button"
          onClick={() => setLogoutModalOpen(true)}
          className={`w-full min-h-[40px] px-3 rounded-xl text-xs font-bold text-[#991B1B] hover:bg-[#FF4D6D]/10 flex items-center gap-2.5 transition-colors cursor-pointer whitespace-nowrap ${
            collapsed ? 'justify-center px-2' : ''
          }`}
          title={collapsed ? (isAr ? 'تسجيل الخروج' : 'Sign Out') : undefined}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {!collapsed && <span>{isAr ? 'تسجيل الخروج' : 'Sign Out'}</span>}
        </button>
      </div>
    </div>
  );

  return (
    <div dir={isAr ? 'rtl' : 'ltr'} className="min-h-screen bg-[#FFF8E9] text-[#27345C] flex">
      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:block shrink-0 bg-white border-e border-[#27345C]/10 sticky top-0 h-screen transition-[width] duration-200 ${
          sidebarCollapsed ? 'w-[72px]' : 'w-[256px]'
        }`}
      >
        {renderSidebarNav(sidebarCollapsed)}
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-[#27345C]/40"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative z-10 w-[264px] max-w-[85vw] bg-white h-full border-e border-[#27345C]/10 flex flex-col">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="absolute top-3 end-3 w-9 h-9 rounded-lg flex items-center justify-center text-[#27345C]/70 hover:bg-[#FFF8E9] cursor-pointer"
              aria-label="Close navigation"
            >
              <X className="w-4 h-4" />
            </button>
            {renderSidebarNav(false, () => setMobileMenuOpen(false))}
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* 3-Zone Top Header Bar */}
        <header className="sticky top-0 z-30 h-16 bg-white/95 backdrop-blur-sm border-b border-[#27345C]/10 px-4 sm:px-6 flex items-center justify-between gap-4">
          {/* Zone 1: Page Context */}
          <div className="flex items-center gap-3 min-w-0 shrink-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden inline-flex items-center justify-center w-10 h-10 rounded-xl border border-[#27345C]/15 text-[#27345C] hover:bg-[#FFF8E9] cursor-pointer"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs text-[#27345C]/60 whitespace-nowrap">
                <span>{isAr ? 'بوابة المعلم' : 'Teacher Portal'}</span>
                <span aria-hidden="true">/</span>
                <span className="font-bold text-[#27345C] truncate">
                  {isAr ? activeItem.ar : activeItem.en}
                </span>
              </div>
            </div>
          </div>

          {/* Zone 2: Quick Search */}
          <div className="hidden md:flex flex-1 max-w-md mx-2">
            <div className="relative w-full">
              <Search className="w-4 h-4 text-[#27345C]/45 absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none" />
              <input
                type="search"
                value={globalSearch}
                onChange={(e) => {
                  onGlobalSearchChange(e.target.value);
                  if (section !== 'students' && section !== 'question-bank') {
                    onSelectSection('students');
                  }
                }}
                placeholder={isAr ? 'ابحث عن طالب أو سؤال...' : 'Search students or questions...'}
                className="w-full h-10 ps-9 pe-3 rounded-xl bg-[#FFF8E9]/70 border border-[#27345C]/12 text-xs font-semibold focus:outline-none focus:border-[#8054D9] focus:bg-white transition-colors"
              />
            </div>
          </div>

          {/* Zone 3: Language, Notifications, Profile */}
          <div className="flex items-center gap-2 shrink-0 relative">
            <button
              type="button"
              onClick={onToggleLanguage}
              className="h-10 px-3 rounded-xl border border-[#27345C]/12 bg-white hover:bg-[#FFF8E9] text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              aria-label="Switch language"
            >
              <Globe className="w-3.5 h-3.5 text-[#8054D9]" />
              <span>{isAr ? 'EN' : 'عربي'}</span>
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setNotifOpen((o) => !o)}
                className="relative h-10 w-10 rounded-xl border border-[#27345C]/12 bg-white hover:bg-[#FFF8E9] flex items-center justify-center cursor-pointer"
                aria-label={isAr ? 'الإشعارات' : 'Notifications'}
              >
                <Bell className="w-4 h-4 text-[#27345C]" />
                {unreadNotificationsCount > 0 && (
                  <span className="absolute -top-1 -end-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#8054D9] text-white text-[10px] font-extrabold tabular-nums flex items-center justify-center">
                    {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setNotifOpen(false)}
                  />
                  <div className="absolute end-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl border border-[#27345C]/12 shadow-xl z-50 overflow-hidden">
                    <div className="px-4 py-3 border-b border-[#27345C]/10 flex items-center justify-between gap-2">
                      <span className="text-xs font-extrabold text-[#27345C]">
                        {isAr ? 'الإشعارات' : 'Notifications'}
                        {unreadNotificationsCount > 0 ? ` (${unreadNotificationsCount})` : ''}
                      </span>
                      {unreadNotificationsCount > 0 && (
                        <button
                          type="button"
                          onClick={() => void onMarkAllNotificationsRead()}
                          className="text-[11px] font-bold text-[#8054D9] hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <CheckCheck className="w-3.5 h-3.5" />
                          <span>{isAr ? 'تحديد الكل كمقروء' : 'Mark all read'}</span>
                        </button>
                      )}
                    </div>
                    <div className="max-h-80 overflow-y-auto divide-y divide-[#27345C]/8">
                      {notifications.length === 0 ? (
                        <div className="p-6 text-center text-xs font-semibold text-[#27345C]/60">
                          {isAr ? 'لا توجد إشعارات حالياً.' : 'No notifications yet.'}
                        </div>
                      ) : (
                        notifications.slice(0, 12).map((n) => (
                          <button
                            key={n.id}
                            type="button"
                            onClick={() => {
                              if (!n.readAt) void onMarkNotificationRead(n.id);
                              if (n.type.startsWith('teacher_connection')) {
                                onSelectSection('connections');
                                setNotifOpen(false);
                              }
                            }}
                            className={`w-full text-start p-3.5 transition-colors cursor-pointer ${
                              n.readAt ? 'bg-white hover:bg-[#FFF8E9]/50' : 'bg-[#F4EEFF]/50 hover:bg-[#F4EEFF]/80'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-xs font-extrabold text-[#27345C]">
                                {isAr ? n.title.ar : n.title.en}
                              </p>
                              {!n.readAt && (
                                <span className="text-[10px] font-bold text-[#8054D9] shrink-0">
                                  {isAr ? 'جديد' : 'New'}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-[#27345C]/75 mt-0.5 leading-relaxed">
                              {isAr ? n.message.ar : n.message.en}
                            </p>
                            <p className="text-[10px] text-[#27345C]/50 mt-1 tabular-nums">
                              {new Date(n.createdAt).toLocaleString()}
                            </p>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={() => onSelectSection('profile')}
              className="h-10 px-3 rounded-xl border border-[#27345C]/12 bg-white hover:bg-[#FFF8E9] flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
              title={teacherEmail}
            >
              <span className="w-6 h-6 rounded-lg bg-[#27345C] text-[#FFD84D] text-xs font-extrabold flex items-center justify-center shrink-0">
                {(teacherName || 'T').trim().charAt(0).toUpperCase()}
              </span>
              <span className="hidden sm:inline text-xs font-bold text-[#27345C] max-w-[130px] truncate">
                {teacherName}
              </span>
            </button>
          </div>
        </header>

        {/* Main Workspace Viewport */}
        <main className="flex-1 p-4 sm:p-6 max-w-[1360px] w-full mx-auto space-y-5">
          {notice && (
            <div className="p-3.5 rounded-xl bg-[#55D98B]/15 border border-[#55D98B]/50 text-[#14532D] text-xs sm:text-sm font-bold flex items-center justify-between gap-3">
              <span>{notice}</span>
              <button
                type="button"
                onClick={onDismissNotice}
                className="p-1 rounded-lg hover:bg-black/5 cursor-pointer"
                aria-label="Dismiss notice"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-[#FF4D6D]/10 border border-[#FF4D6D]/40 text-[#991B1B] text-xs sm:text-sm font-bold flex items-center justify-between gap-3">
              <span>{errorMsg}</span>
              <button
                type="button"
                onClick={onDismissError}
                className="p-1 rounded-lg hover:bg-black/5 cursor-pointer"
                aria-label="Dismiss error"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {children}
        </main>
      </div>

      {/* Logout Confirmation Modal */}
      {logoutModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#27345C]/45 flex items-center justify-center p-4">
          <div className="rounded-2xl p-6 bg-white border border-[#27345C]/12 max-w-sm w-full space-y-4 text-center shadow-xl">
            <h2 className="text-lg font-extrabold text-[#27345C]">
              {isAr ? 'تأكيد تسجيل الخروج' : 'Confirm Sign Out'}
            </h2>
            <p className="text-xs font-semibold text-[#27345C]/75 leading-relaxed">
              {isAr
                ? 'هل تريد تسجيل الخروج من بوابة المعلم؟ سيتم إغلاق الجلسة الحالية بأمان.'
                : 'Are you sure you want to sign out of your Teacher Portal?'}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setLogoutModalOpen(false)}
                className="flex-1 min-h-[44px] rounded-xl bg-[#FFF8E9] border border-[#27345C]/15 text-[#27345C] font-bold text-xs cursor-pointer"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={async () => {
                  setLogoutModalOpen(false);
                  await onLogout();
                }}
                className="flex-1 min-h-[44px] rounded-xl bg-[#DC2626] text-white font-bold text-xs cursor-pointer"
              >
                {isAr ? 'نعم، تسجيل الخروج' : 'Yes, Sign Out'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
