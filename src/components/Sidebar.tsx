import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import {
  LayoutDashboard,
  Users,
  Calendar,
  FileText,
  IndianRupee,
  Sparkles,
  Settings,
  LogOut,
  Plus,
  ScanEye,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react';

export type NavRoute = 'dashboard' | 'patients' | 'appointments' | 'prescriptions' | 'revenue' | 'image-analyzer' | 'ai-assistant' | 'settings';

interface SidebarProps {
  currentRoute: NavRoute;
  onNavigate: (route: NavRoute) => void;
  onOpenWalkIn: () => void;
  onOpenAIAssistant: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  queueCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentRoute,
  onNavigate,
  onOpenWalkIn,
  onOpenAIAssistant,
  isCollapsed = false,
  onToggleCollapse,
  queueCount = 1
}) => {
  const { doctor, logout } = useAuth();
  const { t } = useLanguage();

  const doctorDisplayName = doctor?.name
    ? doctor.name.replace(/,\s*MD$/i, '')
    : 'Dr. Sarah Chen';

  const doctorInitial = doctorDisplayName
    .replace(/^Dr\.\s*/i, '')
    .trim()
    .charAt(0)
    .toUpperCase() || 'S';

  const doctorSubtitle =
    doctor?.accountType === 'organisational'
      ? 'Hospital · MD'
      : doctor?.clinicName
      ? `${doctor.clinicName.split(' ')[0]} · MD`
      : 'Hospital · MD';

  return (
    <aside
      className={`bg-[#0d3f3b] text-white flex flex-col justify-between h-screen shrink-0 select-none transition-all duration-300 ease-in-out ${
        isCollapsed ? 'w-[76px]' : 'w-64'
      }`}
    >
      {/* Top Branding & Navigation */}
      <div className="space-y-6">
        {/* Brand Header */}
        <div
          className={`pt-6 flex items-center transition-all duration-300 ${
            isCollapsed ? 'px-3 justify-center' : 'px-5 justify-between'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0 overflow-hidden">
            <div className="w-10 h-10 rounded-xl bg-[#198276] text-white flex items-center justify-center shadow-xs shrink-0">
              <Plus className="w-5 h-5 stroke-[2.5]" />
            </div>
            {!isCollapsed && (
              <div className="min-w-0 overflow-hidden">
                <span className="font-extrabold text-[18px] tracking-tight text-white leading-tight block truncate">
                  {t('appName')}
                </span>
                <span className="text-xs font-medium text-[#8abcb5] block truncate">
                  Clinic &amp; EMR
                </span>
              </div>
            )}
          </div>

          {onToggleCollapse && !isCollapsed && (
            <button
              type="button"
              onClick={onToggleCollapse}
              title="Collapse sidebar (Ctrl+B)"
              aria-label="Collapse sidebar"
              className="text-[#8abcb5] hover:text-white hover:bg-white/10 p-1.5 rounded-lg transition-colors shrink-0 opacity-70 hover:opacity-100"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Navigation Sections */}
        <div className={`space-y-6 ${isCollapsed ? 'px-2.5' : 'px-4'}`}>
          {/* Walk-in Action Pill */}
          <div className="relative group">
            <button
              type="button"
              onClick={onOpenWalkIn}
              className={`w-full flex items-center rounded-2xl bg-[#1c4e49] hover:bg-[#235c56] text-white transition-all cursor-pointer ${
                isCollapsed ? 'justify-center py-3 px-0' : 'justify-between px-4 py-3'
              }`}
            >
              {isCollapsed ? (
                <Users className="w-4 h-4 text-[#8abcb5]" />
              ) : (
                <>
                  <span className="text-sm font-medium text-[#e4f2f0]">{t('walkIn')}</span>
                  <span className="text-xs font-extrabold bg-[#f6dcb8] text-[#7c4d15] px-3 py-1 rounded-full">
                    Queue {queueCount}
                  </span>
                </>
              )}
            </button>
          </div>

          {/* WORKSPACE */}
          <div>
            {!isCollapsed ? (
              <span className="px-3 text-[11px] font-bold tracking-[0.12em] uppercase text-[#6da39c] block mb-2">
                {t('workspace')}
              </span>
            ) : (
              <div className="h-px bg-white/10 my-2 mx-1.5" />
            )}

            <div className="space-y-1">
              {/* Dashboard */}
              <button
                type="button"
                onClick={() => onNavigate('dashboard')}
                className={`w-full flex items-center rounded-xl text-sm transition-all cursor-pointer ${
                  isCollapsed ? 'justify-center py-3 px-0' : 'px-4 py-2.5'
                } ${
                  currentRoute === 'dashboard'
                    ? 'bg-[#157a6e] text-white font-bold shadow-2xs'
                    : 'text-[#d0e6e2] hover:bg-white/8 hover:text-white font-medium'
                }`}
              >
                {isCollapsed ? <LayoutDashboard className="w-4 h-4" /> : <span>{t('dashboard')}</span>}
              </button>

              {/* Patients */}
              <button
                type="button"
                onClick={() => onNavigate('patients')}
                className={`w-full flex items-center rounded-xl text-sm transition-all cursor-pointer ${
                  isCollapsed ? 'justify-center py-3 px-0' : 'px-4 py-2.5'
                } ${
                  currentRoute === 'patients'
                    ? 'bg-[#157a6e] text-white font-bold shadow-2xs'
                    : 'text-[#d0e6e2] hover:bg-white/8 hover:text-white font-medium'
                }`}
              >
                {isCollapsed ? <Users className="w-4 h-4" /> : <span>{t('patients')}</span>}
              </button>

              {/* Appointments */}
              <button
                type="button"
                onClick={() => onNavigate('appointments')}
                className={`w-full flex items-center rounded-xl text-sm transition-all cursor-pointer ${
                  isCollapsed ? 'justify-center py-3 px-0' : 'px-4 py-2.5'
                } ${
                  currentRoute === 'appointments'
                    ? 'bg-[#157a6e] text-white font-bold shadow-2xs'
                    : 'text-[#d0e6e2] hover:bg-white/8 hover:text-white font-medium'
                }`}
              >
                {isCollapsed ? <Calendar className="w-4 h-4" /> : <span>{t('appointments')}</span>}
              </button>

              {/* Prescriptions */}
              <button
                type="button"
                onClick={() => onNavigate('prescriptions')}
                className={`w-full flex items-center rounded-xl text-sm transition-all cursor-pointer ${
                  isCollapsed ? 'justify-center py-3 px-0' : 'px-4 py-2.5'
                } ${
                  currentRoute === 'prescriptions'
                    ? 'bg-[#157a6e] text-white font-bold shadow-2xs'
                    : 'text-[#d0e6e2] hover:bg-white/8 hover:text-white font-medium'
                }`}
              >
                {isCollapsed ? <FileText className="w-4 h-4" /> : <span>{t('prescriptions')}</span>}
              </button>

              {/* Revenue */}
              <button
                type="button"
                onClick={() => onNavigate('revenue')}
                className={`w-full flex items-center rounded-xl text-sm transition-all cursor-pointer ${
                  isCollapsed ? 'justify-center py-3 px-0' : 'px-4 py-2.5'
                } ${
                  currentRoute === 'revenue'
                    ? 'bg-[#157a6e] text-white font-bold shadow-2xs'
                    : 'text-[#d0e6e2] hover:bg-white/8 hover:text-white font-medium'
                }`}
              >
                {isCollapsed ? <IndianRupee className="w-4 h-4" /> : <span>Revenue</span>}
              </button>
            </div>
          </div>

          {/* INTELLIGENCE */}
          <div>
            {!isCollapsed ? (
              <span className="px-3 text-[11px] font-bold tracking-[0.12em] uppercase text-[#6da39c] block mb-2">
                {t('intelligence')}
              </span>
            ) : (
              <div className="h-px bg-white/10 my-2 mx-1.5" />
            )}

            <div className="space-y-1">
              {/* AI Image Analyzer */}
              <button
                type="button"
                onClick={() => onNavigate('image-analyzer')}
                className={`w-full flex items-center rounded-xl text-sm transition-all cursor-pointer ${
                  isCollapsed ? 'justify-center py-3 px-0' : 'px-4 py-2.5'
                } ${
                  currentRoute === 'image-analyzer'
                    ? 'bg-[#157a6e] text-white font-bold shadow-2xs'
                    : 'text-[#d0e6e2] hover:bg-white/8 hover:text-white font-medium'
                }`}
              >
                {isCollapsed ? <ScanEye className="w-4 h-4" /> : <span>{t('aiImageAnalyzer')}</span>}
              </button>

              {/* AI Assistant */}
              <button
                type="button"
                onClick={onOpenAIAssistant}
                className={`w-full flex items-center rounded-xl text-sm text-[#d0e6e2] hover:bg-white/8 hover:text-white font-medium transition-all cursor-pointer ${
                  isCollapsed ? 'justify-center py-3 px-0' : 'px-4 py-2.5'
                }`}
              >
                {isCollapsed ? <Sparkles className="w-4 h-4" /> : <span>{t('aiAssistant')}</span>}
              </button>
            </div>
          </div>

          {/* ACCOUNT */}
          <div>
            {!isCollapsed ? (
              <span className="px-3 text-[11px] font-bold tracking-[0.12em] uppercase text-[#6da39c] block mb-2">
                {t('account')}
              </span>
            ) : (
              <div className="h-px bg-white/10 my-2 mx-1.5" />
            )}

            <div className="space-y-1">
              {/* Settings */}
              <button
                type="button"
                onClick={() => onNavigate('settings')}
                className={`w-full flex items-center rounded-xl text-sm transition-all cursor-pointer ${
                  isCollapsed ? 'justify-center py-3 px-0' : 'px-4 py-2.5'
                } ${
                  currentRoute === 'settings'
                    ? 'bg-[#157a6e] text-white font-bold shadow-2xs'
                    : 'text-[#d0e6e2] hover:bg-white/8 hover:text-white font-medium'
                }`}
              >
                {isCollapsed ? <Settings className="w-4 h-4" /> : <span>{t('settings')}</span>}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Doctor Profile Pill */}
      <div className="p-3 space-y-2">
        <div
          className={`rounded-2xl bg-[#184944] p-3.5 flex items-center transition-all ${
            isCollapsed ? 'flex-col gap-2 justify-center' : 'justify-between gap-2.5'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0 overflow-hidden">
            <div className="w-9 h-9 rounded-full bg-[#76d3c3] text-[#0c3c38] text-sm font-extrabold flex items-center justify-center shrink-0">
              {doctorInitial}
            </div>
            {!isCollapsed && (
              <div className="min-w-0 overflow-hidden">
                <p className="text-xs font-bold text-white truncate">
                  {doctorDisplayName}
                </p>
                <p className="text-[11px] text-[#8abcb5] truncate mt-0.5">
                  {doctorSubtitle}
                </p>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => logout()}
            title={t('signOut')}
            className="text-[#8abcb5] hover:text-white hover:bg-white/10 p-1.5 rounded-lg transition-colors shrink-0"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>

        {onToggleCollapse && isCollapsed && (
          <button
            type="button"
            onClick={onToggleCollapse}
            title="Expand sidebar (Ctrl+B)"
            className="w-full py-1.5 rounded-lg text-[#8abcb5] hover:text-white hover:bg-white/10 transition-colors flex items-center justify-center"
          >
            <PanelLeftOpen className="w-4 h-4" />
          </button>
        )}
      </div>
    </aside>
  );
};
