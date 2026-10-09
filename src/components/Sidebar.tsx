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
  Stethoscope
} from 'lucide-react';

export type NavRoute = 'dashboard' | 'patients' | 'appointments' | 'prescriptions' | 'ai-assistant' | 'settings';

interface SidebarProps {
  currentRoute: NavRoute;
  onNavigate: (route: NavRoute) => void;
  onOpenWalkIn: () => void;
  onOpenBookAppointment: () => void;
  onOpenAIAssistant: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentRoute,
  onNavigate,
  onOpenWalkIn,
  onOpenBookAppointment,
  onOpenAIAssistant
}) => {
  const { doctor, logout } = useAuth();
  const { t } = useLanguage();

  return (
    <aside className="w-64 bg-white border-r border-slate-200 flex flex-col justify-between h-screen shrink-0 select-none">
      {/* Top Branding */}
      <div>
        <div className="h-16 px-6 border-b border-slate-100 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-teal-800 text-white flex items-center justify-center shadow-xs">
            <Stethoscope className="w-4 h-4" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="font-extrabold text-lg tracking-tight text-slate-900 font-sans">
              Cliniq
            </span>
            <span className="h-3 w-px bg-slate-300" />
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500">
              {t('appName')}
            </span>
          </div>
        </div>

        {/* Navigation Sections */}
        <div className="p-4 space-y-6">
          {/* Section: Quick Actions */}
          <div>
            <span className="px-3 text-[10px] font-extrabold tracking-wider uppercase text-slate-400 block mb-2">
              CLINICAL ACTIONS
            </span>
            <div className="space-y-1">
              <button
                type="button"
                onClick={onOpenWalkIn}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-teal-50 hover:text-teal-900 border border-slate-200/80 transition-all"
              >
                <div className="flex items-center gap-2.5">
                  <Users className="w-4 h-4 text-teal-700" />
                  <span>{t('walkIn')}</span>
                </div>
                <span className="text-[10px] bg-white text-slate-600 px-1.5 py-0.5 rounded border border-slate-200 font-medium">Queue</span>
              </button>

              <button
                type="button"
                onClick={onOpenBookAppointment}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-teal-50 hover:text-teal-900 border border-slate-200/80 transition-all"
              >
                <div className="flex items-center gap-2.5">
                  <Calendar className="w-4 h-4 text-teal-700" />
                  <span>{t('bookAppointment')}</span>
                </div>
                <span className="text-[10px] bg-white text-slate-600 px-1.5 py-0.5 rounded border border-slate-200 font-medium">Book</span>
              </button>
            </div>
          </div>

          {/* Section: Workspace */}
          <div>
            <span className="px-3 text-[10px] font-extrabold tracking-wider uppercase text-slate-400 block mb-2">
              {t('workspace')}
            </span>
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => onNavigate('dashboard')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                  currentRoute === 'dashboard'
                    ? 'bg-teal-50 text-teal-900 font-bold'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <LayoutDashboard className={`w-4 h-4 ${currentRoute === 'dashboard' ? 'text-teal-700' : 'text-slate-400'}`} />
                <span>{t('dashboard')}</span>
              </button>

              <button
                type="button"
                onClick={() => onNavigate('patients')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                  currentRoute === 'patients'
                    ? 'bg-teal-50 text-teal-900 font-bold'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Users className={`w-4 h-4 ${currentRoute === 'patients' ? 'text-teal-700' : 'text-slate-400'}`} />
                <span>{t('patients')}</span>
              </button>

              <button
                type="button"
                onClick={() => onNavigate('appointments')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                  currentRoute === 'appointments'
                    ? 'bg-teal-50 text-teal-900 font-bold'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Calendar className={`w-4 h-4 ${currentRoute === 'appointments' ? 'text-teal-700' : 'text-slate-400'}`} />
                <span>{t('appointments')}</span>
              </button>

              <button
                type="button"
                onClick={() => onNavigate('prescriptions')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                  currentRoute === 'prescriptions'
                    ? 'bg-teal-50 text-teal-900 font-bold'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <FileText className={`w-4 h-4 ${currentRoute === 'prescriptions' ? 'text-teal-700' : 'text-slate-400'}`} />
                <span>{t('prescriptions')}</span>
              </button>
            </div>
          </div>

          {/* Section: Intelligence */}
          <div>
            <span className="px-3 text-[10px] font-extrabold tracking-wider uppercase text-slate-400 block mb-2">
              {t('intelligence')}
            </span>
            <div className="space-y-1">
              <button
                type="button"
                onClick={onOpenAIAssistant}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-teal-50/60 hover:text-teal-900 transition-all group"
              >
                <div className="flex items-center gap-3">
                  <Sparkles className="w-4 h-4 text-teal-600 group-hover:scale-110 transition-transform" />
                  <span>{t('aiAssistant')}</span>
                </div>
                <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
              </button>
            </div>
          </div>

          {/* Section: Account */}
          <div>
            <span className="px-3 text-[10px] font-extrabold tracking-wider uppercase text-slate-400 block mb-2">
              {t('account')}
            </span>
            <div className="space-y-1">
              <button
                type="button"
                onClick={() => onNavigate('settings')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                  currentRoute === 'settings'
                    ? 'bg-teal-50 text-teal-900 font-bold'
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
      <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="relative">
            <div className="w-9 h-9 rounded-full bg-teal-700 text-white text-xs font-bold flex items-center justify-center shrink-0 shadow-xs">
              {doctor?.name ? doctor.name.replace(/^Dr\.\s*/i, '').charAt(0).toUpperCase() : 'D'}
            </div>
            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
          </div>
          <div className="overflow-hidden">
            <p className="text-xs font-bold text-slate-900 truncate">
              {doctor?.name || 'Dr. Demo'}
            </p>
            <p className="text-[11px] text-slate-400 truncate">
              {doctor?.speciality || 'General Practitioner'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => logout()}
          title={t('signOut')}
          className="text-slate-400 hover:text-red-600 p-1.5 rounded-lg transition-colors"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
};
