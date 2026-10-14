import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import {
  LayoutDashboard,
  Users,
  Calendar,
  FileText,
  Sparkles,
  Settings,
  LogOut,
  Stethoscope,
  ScanEye,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

export type NavRoute = 'dashboard' | 'patients' | 'appointments' | 'prescriptions' | 'image-analyzer' | 'ai-assistant' | 'settings';

interface SidebarProps {
  currentRoute: NavRoute;
  onNavigate: (route: NavRoute) => void;
  onOpenWalkIn: () => void;
  onOpenAIAssistant: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentRoute,
  onNavigate,
  onOpenWalkIn,
  onOpenAIAssistant,
  isCollapsed = false,
  onToggleCollapse
}) => {
  const { doctor, logout } = useAuth();
  const { t } = useLanguage();

  return (
    <aside
      className={`bg-white border-r border-slate-200/90 flex flex-col justify-between h-screen shrink-0 select-none shadow-[1px_0_3px_0_rgba(15,23,42,0.02)] transition-all duration-300 ease-in-out ${
        isCollapsed ? 'w-[72px]' : 'w-64'
      }`}
    >
      {/* Top Branding & Collapse Button */}
      <div>
        <div className={`h-16 border-b border-slate-100 flex items-center transition-all duration-300 ${
          isCollapsed ? 'px-3 justify-center relative' : 'px-4 justify-between'
        }`}>
          {/* Logo & Brand title */}
          <div className="flex items-center gap-2.5 min-w-0 overflow-hidden">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-700 to-teal-900 text-white flex items-center justify-center shadow-xs shrink-0">
              <Stethoscope className="w-4 h-4 text-teal-100" />
            </div>
            {!isCollapsed && (
              <div className="min-w-0 overflow-hidden transition-opacity duration-200">
                <span className="font-extrabold text-base tracking-tight text-slate-900 font-sans block truncate">
                  Clinical OS
                </span>
                <span className="text-[10px] font-semibold text-teal-800 tracking-wide block -mt-0.5 truncate">
                  Clinic & EMR Workspace
                </span>
              </div>
            )}
          </div>

          {/* Collapse/Expand Toggle Button in Header */}
          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              title={isCollapsed ? 'Expand sidebar (Ctrl+B)' : 'Collapse sidebar (Ctrl+B)'}
              aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className={`text-slate-400 hover:text-slate-700 hover:bg-slate-100 p-1.5 rounded-lg transition-colors shrink-0 ${
                isCollapsed ? 'hidden' : 'block'
              }`}
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Navigation Sections */}
        <div className={`space-y-4 transition-all duration-300 ${isCollapsed ? 'p-2' : 'p-3'}`}>
          {/* Section: Clinical Queue Action (Walk-in) */}
          <div>
            <div className="relative group">
              <button
                type="button"
                onClick={onOpenWalkIn}
                className={`w-full flex items-center rounded-xl text-xs font-semibold text-slate-800 bg-slate-50 hover:bg-teal-50/80 hover:text-teal-950 border border-slate-200/80 hover:border-teal-200 transition-all shadow-2xs group ${
                  isCollapsed
                    ? 'justify-center py-2.5 px-0'
                    : 'justify-between px-3 py-2'
                }`}
              >
                <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-2.5'}`}>
                  <Users className="w-4 h-4 text-teal-700 group-hover:scale-105 transition-transform shrink-0" />
                  {!isCollapsed && <span>{t('walkIn')}</span>}
                </div>
                {!isCollapsed && (
                  <span className="text-[10px] bg-white text-slate-600 px-1.5 py-0.5 rounded border border-slate-200 font-mono font-medium">
                    Queue
                  </span>
                )}
              </button>

              {/* Floating Tooltip when collapsed */}
              {isCollapsed && (
                <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2.5 px-2.5 py-1.5 bg-slate-900 text-white text-xs font-medium rounded-lg shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 whitespace-nowrap z-50 flex items-center gap-1.5">
                  <span>{t('walkIn')}</span>
                  <span className="text-[9px] bg-slate-800 text-teal-300 px-1 py-0.2 rounded font-mono">Queue</span>
                </div>
              )}
            </div>
          </div>

          {/* Section: Core Workspace */}
          <div>
            {!isCollapsed ? (
              <span className="px-3 text-[10px] font-bold tracking-wider uppercase text-slate-400 block mb-1">
                {t('workspace')}
              </span>
            ) : (
              <div className="h-px bg-slate-200/80 my-2 mx-1.5" />
            )}

            <div className="space-y-0.5">
              {/* Dashboard */}
              <div className="relative group">
                <button
                  type="button"
                  onClick={() => onNavigate('dashboard')}
                  className={`w-full flex items-center rounded-xl text-xs font-semibold transition-all ${
                    isCollapsed ? 'justify-center py-2.5 px-0' : 'gap-2.5 px-3 py-2'
                  } ${
                    currentRoute === 'dashboard'
                      ? 'bg-teal-50 text-teal-900 font-bold border-l-2 border-teal-700 shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <LayoutDashboard className={`w-4 h-4 shrink-0 ${currentRoute === 'dashboard' ? 'text-teal-700' : 'text-slate-400'}`} />
                  {!isCollapsed && <span>{t('dashboard')}</span>}
                </button>

                {isCollapsed && (
                  <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2.5 px-2.5 py-1.5 bg-slate-900 text-white text-xs font-medium rounded-lg shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 whitespace-nowrap z-50">
                    {t('dashboard')}
                  </div>
                )}
              </div>

              {/* Patients */}
              <div className="relative group">
                <button
                  type="button"
                  onClick={() => onNavigate('patients')}
                  className={`w-full flex items-center rounded-xl text-xs font-semibold transition-all ${
                    isCollapsed ? 'justify-center py-2.5 px-0' : 'gap-2.5 px-3 py-2'
                  } ${
                    currentRoute === 'patients'
                      ? 'bg-teal-50 text-teal-900 font-bold border-l-2 border-teal-700 shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <Users className={`w-4 h-4 shrink-0 ${currentRoute === 'patients' ? 'text-teal-700' : 'text-slate-400'}`} />
                  {!isCollapsed && <span>{t('patients')}</span>}
                </button>

                {isCollapsed && (
                  <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2.5 px-2.5 py-1.5 bg-slate-900 text-white text-xs font-medium rounded-lg shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 whitespace-nowrap z-50">
                    {t('patients')}
                  </div>
                )}
              </div>

              {/* Appointments */}
              <div className="relative group">
                <button
                  type="button"
                  onClick={() => onNavigate('appointments')}
                  className={`w-full flex items-center rounded-xl text-xs font-semibold transition-all ${
                    isCollapsed ? 'justify-center py-2.5 px-0' : 'gap-2.5 px-3 py-2'
                  } ${
                    currentRoute === 'appointments'
                      ? 'bg-teal-50 text-teal-900 font-bold border-l-2 border-teal-700 shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <Calendar className={`w-4 h-4 shrink-0 ${currentRoute === 'appointments' ? 'text-teal-700' : 'text-slate-400'}`} />
                  {!isCollapsed && <span>{t('appointments')}</span>}
                </button>

                {isCollapsed && (
                  <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2.5 px-2.5 py-1.5 bg-slate-900 text-white text-xs font-medium rounded-lg shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 whitespace-nowrap z-50">
                    {t('appointments')}
                  </div>
                )}
              </div>

              {/* Prescriptions */}
              <div className="relative group">
                <button
                  type="button"
                  onClick={() => onNavigate('prescriptions')}
                  className={`w-full flex items-center rounded-xl text-xs font-semibold transition-all ${
                    isCollapsed ? 'justify-center py-2.5 px-0' : 'gap-2.5 px-3 py-2'
                  } ${
                    currentRoute === 'prescriptions'
                      ? 'bg-teal-50 text-teal-900 font-bold border-l-2 border-teal-700 shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <FileText className={`w-4 h-4 shrink-0 ${currentRoute === 'prescriptions' ? 'text-teal-700' : 'text-slate-400'}`} />
                  {!isCollapsed && <span>{t('prescriptions')}</span>}
                </button>

                {isCollapsed && (
                  <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2.5 px-2.5 py-1.5 bg-slate-900 text-white text-xs font-medium rounded-lg shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 whitespace-nowrap z-50">
                    {t('prescriptions')}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Section: Clinical Intelligence */}
          <div>
            {!isCollapsed ? (
              <span className="px-3 text-[10px] font-bold tracking-wider uppercase text-slate-400 block mb-1">
                {t('intelligence')}
              </span>
            ) : (
              <div className="h-px bg-slate-200/80 my-2 mx-1.5" />
            )}

            <div className="space-y-0.5">
              {/* AI Image Analyzer */}
              <div className="relative group">
                <button
                  type="button"
                  onClick={() => onNavigate('image-analyzer')}
                  className={`w-full flex items-center rounded-xl text-xs font-semibold transition-all ${
                    isCollapsed
                      ? 'justify-center py-2.5 px-0'
                      : 'justify-between px-3 py-2'
                  } ${
                    currentRoute === 'image-analyzer'
                      ? 'bg-teal-50 text-teal-900 font-bold border-l-2 border-teal-700 shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-2.5'}`}>
                    <ScanEye className={`w-4 h-4 shrink-0 ${currentRoute === 'image-analyzer' ? 'text-teal-700' : 'text-slate-400'}`} />
                    {!isCollapsed && <span>{t('aiImageAnalyzer')}</span>}
                  </div>
                  {!isCollapsed && (
                    <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-bold bg-teal-100 text-teal-800">
                      Vision
                    </span>
                  )}
                </button>

                {isCollapsed && (
                  <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2.5 px-2.5 py-1.5 bg-slate-900 text-white text-xs font-medium rounded-lg shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 whitespace-nowrap z-50 flex items-center gap-1.5">
                    <span>{t('aiImageAnalyzer')}</span>
                    <span className="text-[9px] uppercase tracking-wider px-1 py-0.2 rounded font-bold bg-teal-800 text-teal-200">Vision</span>
                  </div>
                )}
              </div>

              {/* AI Assistant */}
              <div className="relative group">
                <button
                  type="button"
                  onClick={onOpenAIAssistant}
                  className={`w-full flex items-center rounded-xl text-xs font-semibold text-slate-600 hover:bg-teal-50/70 hover:text-teal-950 transition-all group ${
                    isCollapsed
                      ? 'justify-center py-2.5 px-0'
                      : 'justify-between px-3 py-2'
                  }`}
                >
                  <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-2.5'}`}>
                    <Sparkles className="w-4 h-4 text-teal-700 group-hover:scale-110 transition-transform shrink-0" />
                    {!isCollapsed && <span>{t('aiAssistant')}</span>}
                  </div>
                  {!isCollapsed && (
                    <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                      Copilot
                    </span>
                  )}
                </button>

                {isCollapsed && (
                  <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2.5 px-2.5 py-1.5 bg-slate-900 text-white text-xs font-medium rounded-lg shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 whitespace-nowrap z-50 flex items-center gap-1.5">
                    <span>{t('aiAssistant')}</span>
                    <span className="text-[9px] bg-slate-800 text-slate-300 px-1 py-0.2 rounded font-mono">Copilot</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Section: Administration */}
          <div>
            {!isCollapsed ? (
              <span className="px-3 text-[10px] font-bold tracking-wider uppercase text-slate-400 block mb-1">
                {t('account')}
              </span>
            ) : (
              <div className="h-px bg-slate-200/80 my-2 mx-1.5" />
            )}

            <div className="space-y-0.5">
              {/* Settings */}
              <div className="relative group">
                <button
                  type="button"
                  onClick={() => onNavigate('settings')}
                  className={`w-full flex items-center rounded-xl text-xs font-semibold transition-all ${
                    isCollapsed ? 'justify-center py-2.5 px-0' : 'gap-2.5 px-3 py-2'
                  } ${
                    currentRoute === 'settings'
                      ? 'bg-teal-50 text-teal-900 font-bold border-l-2 border-teal-700 shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <Settings className={`w-4 h-4 shrink-0 ${currentRoute === 'settings' ? 'text-teal-700' : 'text-slate-400'}`} />
                  {!isCollapsed && <span>{t('settings')}</span>}
                </button>

                {isCollapsed && (
                  <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2.5 px-2.5 py-1.5 bg-slate-900 text-white text-xs font-medium rounded-lg shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 whitespace-nowrap z-50">
                    {t('settings')}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Profile Footer & Collapse Toggle Button */}
      <div className="border-t border-slate-100 bg-slate-50/60">
        {/* Doctor Info Row */}
        <div className={`p-3 flex items-center transition-all duration-300 ${
          isCollapsed ? 'flex-col gap-2 justify-center' : 'justify-between'
        }`}>
          <div className="relative group flex items-center gap-2.5 overflow-hidden">
            <div className="w-8 h-8 rounded-full bg-teal-800 text-white text-xs font-bold flex items-center justify-center shrink-0 shadow-2xs">
              {doctor?.name ? doctor.name.replace(/^Dr\.\s*/i, '').charAt(0).toUpperCase() : 'D'}
            </div>

            {!isCollapsed ? (
              <div className="overflow-hidden min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-bold text-slate-900 truncate">
                    {doctor?.name || 'Dr. Demo'}
                  </p>
                  {doctor?.accountType === 'organisational' && (
                    <span className="text-[8px] uppercase tracking-wider font-extrabold px-1 py-0.2 rounded bg-indigo-100 text-indigo-700 shrink-0">
                      Hospital
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-slate-500 truncate">
                  {doctor?.organizationName || doctor?.clinicName || doctor?.speciality || 'General Practitioner'}
                </p>
              </div>
            ) : (
              /* Floating Tooltip for Doctor profile when collapsed */
              <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2.5 px-2.5 py-1.5 bg-slate-900 text-white text-xs rounded-lg shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 whitespace-nowrap z-50">
                <p className="font-bold">{doctor?.name || 'Dr. Demo'}</p>
                <p className="text-[10px] text-slate-400">
                  {doctor?.accountType === 'organisational' ? 'Hospital SSO • ' : ''}
                  {doctor?.organizationName || doctor?.clinicName || doctor?.speciality}
                </p>
              </div>
            )}
          </div>

          {/* Sign Out Button */}
          <div className="relative group">
            <button
              type="button"
              onClick={() => logout()}
              title={t('signOut')}
              className="text-slate-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition-colors shrink-0"
            >
              <LogOut className="w-4 h-4" />
            </button>
            {isCollapsed && (
              <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2.5 px-2.5 py-1 bg-red-600 text-white text-xs font-medium rounded-md shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 whitespace-nowrap z-50">
                {t('signOut')}
              </div>
            )}
          </div>
        </div>

        {/* Dedicated Bottom Collapse / Expand Bar */}
        {onToggleCollapse && (
          <div className="px-2 pb-2">
            <button
              type="button"
              onClick={onToggleCollapse}
              title={isCollapsed ? 'Expand sidebar (Ctrl+B)' : 'Collapse sidebar (Ctrl+B)'}
              className={`w-full py-1.5 px-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors flex items-center justify-center gap-2 text-[11px] font-medium border border-transparent hover:border-slate-300/60`}
            >
              {isCollapsed ? (
                <>
                  <PanelLeftOpen className="w-4 h-4 text-slate-500" />
                </>
              ) : (
                <>
                  <PanelLeftClose className="w-4 h-4 text-slate-500" />
                  <span className="text-slate-600">Collapse sidebar</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </aside>
  );
};
