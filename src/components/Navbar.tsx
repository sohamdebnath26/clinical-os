import React, { useState, useEffect, useRef } from 'react';
import { Search, Users, Sparkles, X, ArrowRight, Menu } from 'lucide-react';
import { Patient } from '../types';
import { api } from '../lib/api';
import { PREDEFINED_DIAGNOSES } from '../data/clinicalCatalogues';
import { useLanguage } from '../context/LanguageContext';
import { LanguageSelector } from './LanguageSelector';

interface NavbarProps {
  onOpenWalkIn: () => void;
  onOpenAIAssistant: () => void;
  onSelectPatient: (patientId: string) => void;
  onToggleMobileMenu?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenWalkIn,
  onOpenAIAssistant,
  onSelectPatient,
  onToggleMobileMenu
}) => {
  const { t } = useLanguage();
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [matchingDiagnoses, setMatchingDiagnoses] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!query.trim()) {
      setPatients([]);
      setMatchingDiagnoses([]);
      setIsOpen(false);
      return;
    }

    setIsOpen(true);
    // Find matching diagnoses
    const diags = PREDEFINED_DIAGNOSES.filter(d =>
      d.toLowerCase().includes(query.toLowerCase().trim())
    ).slice(0, 5);
    setMatchingDiagnoses(diags);

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await api.patients.list(query.trim());
        setPatients(res.patients.slice(0, 6));
      } catch {
        // ignore
      } finally {
        setIsSearching(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

  // Click outside listener to close search dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-8 flex items-center justify-between gap-4 sticky top-0 z-30">
      <div className="flex items-center gap-3">
        {onToggleMobileMenu && (
          <button
            type="button"
            onClick={onToggleMobileMenu}
            className="md:hidden text-slate-500 hover:text-slate-800 p-1.5"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}

        {/* Global Search Bar */}
        <div ref={searchRef} className="relative w-72 sm:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder={t('searchPlaceholder')}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => query.trim() && setIsOpen(true)}
            className="w-full text-xs pl-10 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:bg-white focus:border-teal-500 shadow-2xs transition-all"
          />
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(''); setIsOpen(false); }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Instant Search Results Dropdown */}
          {isOpen && (
            <div className="absolute left-0 right-0 top-full mt-2 bg-white rounded-2xl shadow-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden max-h-80 overflow-y-auto z-50 animate-in fade-in zoom-in-95 duration-150">
              {/* Patient Matches */}
              {patients.length > 0 && (
                <div className="p-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-3 py-1 block">
                    Patients ({patients.length})
                  </span>
                  {patients.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        onSelectPatient(p.id);
                        setIsOpen(false);
                        setQuery('');
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50 flex items-center justify-between text-xs group"
                    >
                      <div>
                        <span className="font-bold text-slate-800 group-hover:text-teal-800">
                          {p.fullName}
                        </span>
                        <span className="text-[11px] text-slate-400 ml-2">
                          {p.patientCode} • {p.mobile}
                        </span>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-teal-700" />
                    </button>
                  ))}
                </div>
              )}

              {/* Diagnosis Matches */}
              {matchingDiagnoses.length > 0 && (
                <div className="p-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-3 py-1 block">
                    Catalogue Diagnoses
                  </span>
                  {matchingDiagnoses.map(d => (
                    <div
                      key={d}
                      className="px-3 py-1.5 text-xs text-slate-600 flex items-center gap-2"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-teal-600" />
                      <span>{d}</span>
                    </div>
                  ))}
                </div>
              )}

              {patients.length === 0 && matchingDiagnoses.length === 0 && !isSearching && (
                <div className="p-6 text-center text-xs text-slate-400">
                  No records matching &quot;{query}&quot;.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-3">
        {/* Language selector dropdown */}
        <LanguageSelector variant="compact" />

        {/* Quick Actions */}
        <button
          type="button"
          onClick={onOpenWalkIn}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 shadow-2xs transition-colors"
        >
          <Users className="w-3.5 h-3.5 text-slate-500" />
          <span>{t('walkIn')}</span>
        </button>

        <button
          type="button"
          onClick={onOpenAIAssistant}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{t('aiAssistant')}</span>
        </button>
      </div>
    </header>
  );
};
