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
  UserPlus,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react';

export type NavRoute =
  | 'dashboard'
  | 'patients'
  | 'appointments'
  | 'prescriptions'
  | 'revenue'
  | 'image-analyzer'
  | 'ai-assistant'
  | 'settings';

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
  isCollapsed = true,
  onToggleCollapse,
  queueCount = 1
}) => {
  const { doctor, logout } = useAuth();
  const { t } = useLanguage();

  const doctorDisplayName = doctor?.name
    ? doctor.name.replace(/,\s*MD$/i, '')
    : 'Dr. Sarah Chen';

  const doctorInitial =
    doctorDisplayName
      .replace(/^Dr\.\s*/i, '')
      .trim()
      .charAt(0)
      .toUpperCase() || 'S';

  const primaryNavItems: {
    id: NavRoute;
    label: string;
    shortLabel: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { id: 'dashboard', label: t('dashboard'), shortLabel: 'Cockpit', icon: LayoutDashboard },
    { id: 'appointments', label: t('appointments'), shortLabel: 'Calendar', icon: Calendar },
    { id: 'patients', label: t('patients'), shortLabel: 'Patients', icon: Users },
    { id: 'prescriptions', label: t('prescriptions'), shortLabel: 'Rx Notes', icon: FileText },
    { id: 'revenue', label: 'Revenue', shortLabel: 'Billing', icon: IndianRupee }
  ];

  const intelligenceNavItems = [
    {
      id: 'image-analyzer' as NavRoute,
      label: t('aiImageAnalyzer'),
      shortLabel: 'AI Vision',
      icon: ScanEye,
      onClick: () => onNavigate('image-analyzer'),
      isActive: currentRoute === 'image-analyzer'
    },
    {
      id: 'ai-assistant' as NavRoute,
      label: t('aiAssistant'),
      shortLabel: 'AI Chat',
      icon: Sparkles,
      onClick: onOpenAIAssistant,
      isActive: false
    }
  ];

  // Compact rail mode (default: 80px wide with icon + label stacked like reference UI)
  // Expanded mode (optional: 188px slim sidebar)
  const isRail = isCollapsed;

  return (
    <aside
      className={`bg-[#0d3f3b] text-white border-r border-white/10 flex flex-col justify-between h-screen shrink-0 select-none transition-all duration-200 ease-in-out ${
        isRail ? 'w-[80px]' : 'w-[188px]'
      }`}
    >
      {/* Top Logo & Main Navigation */}
      <div className="flex flex-col flex-1 min-h-0">
        {/* Compact Brand Header */}
        <div
          className={`h-14 border-b border-white/10 flex items-center shrink-0 ${
            isRail ? 'justify-center px-2' : 'justify-between px-3.5'
          }`}
        >
          <button
            type="button"
            onClick={() => onNavigate('dashboard')}
            title={t('appName')}
            className="flex items-center gap-2.5 min-w-0 cursor-pointer group"
          >
            <div className="w-9 h-9 rounded-xl bg-[#198276] group-hover:bg-[#1f9688] text-white flex items-center justify-center shadow-xs shrink-0 transition-colors">
              <Plus className="w-5 h-5 stroke-[2.5]" />
            </div>
            {!isRail && (
              <div className="min-w-0 text-left">
                <span className="font-bold text-sm tracking-tight text-white block truncate leading-tight">
                  {t('appName')}
                </span>
                <span className="text-[10px] text-[#8abcb5] block truncate">
                  Clinic EMR
                </span>
              </div>
            )}
          </button>

          {!isRail && onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              title="Compact sidebar (Ctrl+B)"
              className="text-[#8abcb5] hover:text-white hover:bg-white/10 p-1 rounded-lg transition-colors shrink-0"
            >
              <PanelLeftClose className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Scrollable Navigation Rail */}
        <div className="flex-1 overflow-y-auto py-2.5 px-2 space-y-2 scrollbar-none">
          {/* Quick Walk-In Button */}
          <div>
            <button
              type="button"
              onClick={onOpenWalkIn}
              title={`${t('walkIn')} (Queue ${queueCount})`}
              className={`w-full rounded-xl bg-[#195650] hover:bg-[#216b63] text-white transition-all cursor-pointer relative ${
                isRail
                  ? 'flex flex-col items-center justify-center py-2 px-1 gap-1'
                  : 'flex items-center justify-between px-3 py-2'
              }`}
            >
              {isRail ? (
                <>
                  <div className="relative">
                    <UserPlus className="w-4 h-4 text-[#9fe5db]" />
                    {queueCount > 0 && (
                      <span className="absolute -top-1.5 -right-2.5 min-w-[14px] h-[14px] px-1 rounded-full bg-[#f6dcb8] text-[#7c4d15] text-[9px] font-extrabold flex items-center justify-center">
                        {queueCount}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] font-semibold text-[#e4f2f0] leading-none truncate max-w-full">
                    Walk-In
                  </span>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 min-w-0">
                    <UserPlus className="w-4 h-4 text-[#9fe5db] shrink-0" />
                    <span className="text-xs font-semibold text-[#e4f2f0] truncate">
                      {t('walkIn')}
                    </span>
                  </div>
                  <span className="text-[10px] font-extrabold bg-[#f6dcb8] text-[#7c4d15] px-1.5 py-0.5 rounded-full shrink-0">
                    {queueCount}
                  </span>
                </>
              )}
            </button>
          </div>

          <div className="h-px bg-white/10 mx-1" />

          {/* Primary Clinical Workspace Items */}
          <div className="space-y-1">
            {primaryNavItems.map(item => {
              const Icon = item.icon;
              const isActive = currentRoute === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  title={item.label}
                  className={`w-full rounded-xl transition-all cursor-pointer ${
                    isRail
                      ? 'flex flex-col items-center justify-center py-2 px-1 gap-1'
                      : 'flex items-center gap-2.5 px-3 py-2 text-xs'
                  } ${
                    isActive
                      ? 'bg-[#157a6e] text-white font-semibold shadow-2xs'
                      : 'text-[#c9e3df] hover:bg-white/8 hover:text-white font-medium'
                  }`}
                >
                  <Icon className="w-[18px] h-[18px] shrink-0" />
                  <span
                    className={
                      isRail
                        ? 'text-[10px] leading-tight text-center truncate max-w-full'
                        : 'truncate'
                    }
                  >
                    {isRail ? item.shortLabel : item.label}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="h-px bg-white/10 mx-1" />

          {/* AI Intelligence Items */}
          <div className="space-y-1">
            {intelligenceNavItems.map(item => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={item.onClick}
                  title={item.label}
                  className={`w-full rounded-xl transition-all cursor-pointer ${
                    isRail
                      ? 'flex flex-col items-center justify-center py-2 px-1 gap-1'
                      : 'flex items-center gap-2.5 px-3 py-2 text-xs'
                  } ${
                    item.isActive
                      ? 'bg-[#157a6e] text-white font-semibold shadow-2xs'
                      : 'text-[#c9e3df] hover:bg-white/8 hover:text-white font-medium'
                  }`}
                >
                  <Icon className="w-[18px] h-[18px] shrink-0" />
                  <span
                    className={
                      isRail
                        ? 'text-[10px] leading-tight text-center truncate max-w-full'
                        : 'truncate'
                    }
                  >
                    {isRail ? item.shortLabel : item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom Settings, Doctor Profile & Collapse Toggle */}
      <div className="border-t border-white/10 p-2 space-y-1.5 shrink-0">
        {/* Settings */}
        <button
          type="button"
          onClick={() => onNavigate('settings')}
          title={t('settings')}
          className={`w-full rounded-xl transition-all cursor-pointer ${
            isRail
              ? 'flex flex-col items-center justify-center py-2 px-1 gap-1'
              : 'flex items-center gap-2.5 px-3 py-2 text-xs'
          } ${
            currentRoute === 'settings'
              ? 'bg-[#157a6e] text-white font-semibold shadow-2xs'
              : 'text-[#c9e3df] hover:bg-white/8 hover:text-white font-medium'
          }`}
        >
          <Settings className="w-[18px] h-[18px] shrink-0" />
          <span className={isRail ? 'text-[10px] leading-tight text-center' : 'truncate'}>
            {t('settings')}
          </span>
        </button>

        {/* Compact Doctor & Sign Out Row */}
        <div
          className={`rounded-xl bg-[#154641] p-2 flex items-center ${
            isRail ? 'flex-col gap-1.5 justify-center' : 'justify-between gap-2'
          }`}
        >
          <div
            className="flex items-center gap-2 min-w-0 overflow-hidden"
            title={doctorDisplayName}
          >
            <div className="w-7 h-7 rounded-full bg-[#76d3c3] text-[#0c3c38] text-xs font-extrabold flex items-center justify-center shrink-0">
              {doctorInitial}
            </div>
            {!isRail && (
              <p className="text-[11px] font-semibold text-white truncate">
                {doctorDisplayName}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() => logout()}
            title={t('signOut')}
            className="text-[#8abcb5] hover:text-white hover:bg-white/10 p-1 rounded-lg transition-colors shrink-0 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>

        {onToggleCollapse && isRail && (
          <button
            type="button"
            onClick={onToggleCollapse}
            title="Expand sidebar (Ctrl+B)"
            className="w-full py-1 rounded-lg text-[#8abcb5] hover:text-white hover:bg-white/10 transition-colors flex items-center justify-center cursor-pointer"
          >
            <PanelLeftOpen className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </aside>
  );
};
