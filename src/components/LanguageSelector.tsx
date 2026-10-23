import React, { useState, useRef, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { Globe, Check, ChevronDown } from 'lucide-react';

interface LanguageSelectorProps {
  variant?: 'compact' | 'expanded';
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({ variant = 'compact' }) => {
  const { language, setLanguage, supportedLanguages, currentLanguageOption, t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (variant === 'expanded') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {supportedLanguages.map(lang => {
          const isSelected = language === lang.code;
          return (
            <button
              key={lang.code}
              type="button"
              onClick={() => setLanguage(lang.code)}
              className={`p-3.5 rounded-xl border text-left transition-all flex items-center justify-between ${
                isSelected
                  ? 'border-teal-600 bg-teal-50/70 ring-1 ring-teal-600 text-teal-950 shadow-xs'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 text-slate-700'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-xl" role="img" aria-label={lang.name}>
                  {lang.flag}
                </span>
                <div>
                  <div className="text-xs font-bold leading-none">{lang.nativeName}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{lang.name}</div>
                </div>
              </div>
              {isSelected && (
                <div className="w-5 h-5 rounded-full bg-teal-600 text-white flex items-center justify-center shrink-0">
                  <Check className="w-3 h-3 stroke-[3]" />
                </div>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  // Compact variant for Navbar
  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 text-xs font-bold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 px-2.5 py-1.5 rounded-xl shadow-2xs transition-colors"
        title={t('selectLanguage')}
        aria-label={t('selectLanguage')}
      >
        <Globe className="w-3.5 h-3.5 text-teal-700" />
        <span className="hidden sm:inline font-sans">{currentLanguageOption.nativeName}</span>
        <span className="sm:hidden font-mono uppercase">{currentLanguageOption.code}</span>
        <ChevronDown className="w-3 h-3 text-slate-400 transition-transform" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-2xl shadow-xl border border-slate-200 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-150 divide-y divide-slate-100">
          <div className="px-3 py-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              {t('selectLanguage')}
            </span>
          </div>

          <div className="py-1">
            {supportedLanguages.map(lang => {
              const isSelected = language === lang.code;
              return (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => {
                    setLanguage(lang.code);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-3.5 py-2 flex items-center justify-between text-xs transition-colors ${
                    isSelected
                      ? 'bg-teal-50 text-teal-900 font-bold'
                      : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-base">{lang.flag}</span>
                    <div>
                      <span className="block leading-tight">{lang.nativeName}</span>
                      <span className="text-[10px] text-slate-400 block">{lang.name}</span>
                    </div>
                  </div>
                  {isSelected && <Check className="w-3.5 h-3.5 text-teal-700" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
