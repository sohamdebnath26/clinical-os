import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import {
  LayoutDashboard,
  Users,
  UserPlus,
  Calendar,
  FileText,
  Sparkles,
  Settings,
  LogOut,
  Stethoscope,
  Eye,
  ScanEye
} from 'lucide-react';

export type NavRoute = 'dashboard' | 'patients' | 'appointments' | 'prescriptions' | 'image-analyzer' | 'ai-assistant' | 'settings';

interface SidebarProps {
  currentRoute: NavRoute;
  onNavigate: (route: NavRoute) => void;
  onOpenWalkIn: () => void;
  onOpenAIAssistant: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentRoute,
  onNavigate,
  onOpenWalkIn,
  onOpenAIAssistant
}) => {
  const { doctor, logout } = useAuth();
  const { t } = useLanguage();

  return (
    <aside className="w-64 bg-white border-r border-slate-200/90 flex flex-col justify-between h-screen shrink-0 select-none shadow-[1px_0_3px_0_rgba(15,23,42,0.02)]">
      {/* Top Branding */}
      <div>
        <div className="h-16 px-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-teal-700 to-teal-900 text-white flex items-center justify-center shadow-xs">
              <Stethoscope className="w-4 h-4 text-teal-100" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-base tracking-tight text-slate-900 font-sans">
                  Clinical OS
                </span>
              </div>
              <span className="text-[10px] font-semibold text-teal-800 tracking-wide block -mt-0.5">
                Clinic & EMR Workspace
              </span>
            </div>
          </div>
        </div>

        {/* Navigation Sections */}
        <div className="p-3.5 space-y-5">
          {/* Section: Clinical Queue Action */}
          <div>
            <div className="space-y-1">
              <button
                type="button"
                onClick={onOpenWalkIn}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-slate-800 bg-slate-50 hover:bg-teal-50/80 hover:text-teal-950 border border-slate-200/80 hover:border-teal-200 transition-all shadow-2xs group"
              >
                <div className="flex items-center gap-2.5">
                  <Users className="w-4 h-4 text-teal-700 group-hover:scale-105 transition-transform" />
                  <span>{t('walkIn')}</span>
                </div>
                <span className="text-[10px] bg-white text-slate-600 px-1.5 py-0.5 rounded border border-slate-200 font-mono font-medium">Queue</span>
              </button>
            </div>
          </div>

          {/* Section: Core Workspace */}
          <div>
            <span className="px-3 text-[10px] font-bold tracking-wider uppercase text-slate-400 block mb-1.5">
              {t('workspace')}
            </span>
            <div className="space-y-0.5">
              <button
                type="button"
                onClick={() => onNavigate('dashboard')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                  currentRoute === 'dashboard'
                    ? 'bg-teal-50 text-teal-900 font-bold border-l-2 border-teal-700 shadow-2xs'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <LayoutDashboard className={`w-4 h-4 ${currentRoute === 'dashboard' ? 'text-teal-700' : 'text-slate-400'}`} />
                <span>{t('dashboard')}</span>
              </button>

              <button
                type="button"
                onClick={() => onNavigate('patients')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                  currentRoute === 'patients'
                    ? 'bg-teal-50 text-teal-900 font-bold border-l-2 border-teal-700 shadow-2xs'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Users className={`w-4 h-4 ${currentRoute === 'patients' ? 'text-teal-700' : 'text-slate-400'}`} />
                <span>{t('patients')}</span>
              </button>

              <button
                type="button"
                onClick={() => onNavigate('appointments')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                  currentRoute === 'appointments'
                    ? 'bg-teal-50 text-teal-900 font-bold border-l-2 border-teal-700 shadow-2xs'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Calendar className={`w-4 h-4 ${currentRoute === 'appointments' ? 'text-teal-700' : 'text-slate-400'}`} />
                <span>{t('appointments')}</span>
              </button>

              <button
                type="button"
                onClick={() => onNavigate('prescriptions')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                  currentRoute === 'prescriptions'
                    ? 'bg-teal-50 text-teal-900 font-bold border-l-2 border-teal-700 shadow-2xs'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <FileText className={`w-4 h-4 ${currentRoute === 'prescriptions' ? 'text-teal-700' : 'text-slate-400'}`} />
                <span>{t('prescriptions')}</span>
              </button>
            </div>
          </div>

          {/* Section: Clinical Intelligence */}
          <div>
            <span className="px-3 text-[10px] font-bold tracking-wider uppercase text-slate-400 block mb-1.5">
              {t('intelligence')}
            </span>
            <div className="space-y-0.5">
              <button
                type="button"
                onClick={() => onNavigate('image-analyzer')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                  currentRoute === 'image-analyzer'
                    ? 'bg-teal-50 text-teal-900 font-bold border-l-2 border-teal-700 shadow-2xs'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <ScanEye className={`w-4 h-4 ${currentRoute === 'image-analyzer' ? 'text-teal-700' : 'text-slate-400'}`} />
                  <span>{t('aiImageAnalyzer')}</span>
                </div>
                <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-bold bg-teal-100 text-teal-800">
                  Vision
                </span>
              </button>

              <button
                type="button"
                onClick={onOpenAIAssistant}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-teal-50/70 hover:text-teal-950 transition-all group"
              >
                <div className="flex items-center gap-2.5">
                  <Sparkles className="w-4 h-4 text-teal-700 group-hover:scale-110 transition-transform" />
                  <span>{t('aiAssistant')}</span>
                </div>
                <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                  Copilot
                </span>
              </button>
            </div>
          </div>

          {/* Section: Administration */}
          <div>
            <span className="px-3 text-[10px] font-bold tracking-wider uppercase text-slate-400 block mb-1.5">
              {t('account')}
            </span>
            <div className="space-y-0.5">
              <button
                type="button"
                onClick={() => onNavigate('settings')}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                  currentRoute === 'settings'
                    ? 'bg-teal-50 text-teal-900 font-bold border-l-2 border-teal-700 shadow-2xs'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Settings className={`w-4 h-4 ${currentRoute === 'settings' ? 'text-teal-700' : 'text-slate-400'}`} />
                <span>{t('settings')}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Profile Footer */}
      <div className="p-3.5 border-t border-slate-100 flex items-center justify-between bg-slate-50/60">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="w-8 h-8 rounded-full bg-teal-800 text-white text-xs font-bold flex items-center justify-center shrink-0 shadow-2xs">
            {doctor?.name ? doctor.name.replace(/^Dr\.\s*/i, '').charAt(0).toUpperCase() : 'D'}
          </div>
          <div className="overflow-hidden min-w-0">
            <p className="text-xs font-bold text-slate-900 truncate">
              {doctor?.name || 'Dr. Demo'}
            </p>
            <p className="text-[10px] text-slate-500 truncate">
              {doctor?.speciality || 'General Practitioner'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => logout()}
          title={t('signOut')}
          className="text-slate-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition-colors shrink-0"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
};
