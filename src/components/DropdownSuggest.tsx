import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, Plus, Trash2, Check, AlertCircle } from 'lucide-react';

export interface DropdownOption {
  label: string;
  subtext?: string;
  category?: string;
}

interface DropdownSuggestProps {
  label: string;
  placeholder?: string;
  suggestions: (string | DropdownOption)[];
  value: string; // Comma or newline separated or single
  onChange: (val: string) => void;
  helperText?: string;
  isAllergy?: boolean;
}

export const DropdownSuggest: React.FC<DropdownSuggestProps> = ({
  label,
  placeholder = 'Select or type to auto-suggest...',
  suggestions,
  value,
  onChange,
  helperText,
  isAllergy = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Normalize suggestions to DropdownOption
  const normalizedOptions: DropdownOption[] = suggestions.map(s =>
    typeof s === 'string' ? { label: s } : s
  );

  // Parse current items into an array
  const currentItems = value
    ? value
        .split(',')
        .map(i => i.trim())
        .filter(Boolean)
    : [];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectItem = (itemLabel: string) => {
    if (itemLabel === 'No Known Drug Allergies (NKDA)') {
      onChange('No Known Drug Allergies (NKDA)');
      setSearchTerm('');
      setIsOpen(false);
      return;
    }

    // If NKDA was previously selected, remove it
    let filtered = currentItems.filter(i => i !== 'No Known Drug Allergies (NKDA)');

    if (!filtered.includes(itemLabel)) {
      filtered.push(itemLabel);
      onChange(filtered.join(', '));
    }
    setSearchTerm('');
    setIsOpen(false);
  };

  const handleRemoveItem = (indexToRemove: number) => {
    const updated = currentItems.filter((_, idx) => idx !== indexToRemove);
    onChange(updated.join(', '));
  };

  const handleAddCustom = () => {
    if (!searchTerm.trim()) return;
    const clean = searchTerm.trim();
    if (!currentItems.includes(clean)) {
      const filtered = currentItems.filter(i => i !== 'No Known Drug Allergies (NKDA)');
      filtered.push(clean);
      onChange(filtered.join(', '));
    }
    setSearchTerm('');
    setIsOpen(false);
  };

  const filteredOptions = normalizedOptions.filter(opt =>
    opt.label.toLowerCase().includes(searchTerm.toLowerCase().trim())
  );

  return (
    <div className="space-y-1.5" ref={containerRef}>
      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide">
        {label}
      </label>

      {/* Input bar with Dropdown toggle button */}
      <div className="relative">
        <div className="flex items-center w-full bg-white border border-slate-300 rounded-xl focus-within:ring-2 focus-within:ring-teal-500 focus-within:border-teal-500 shadow-2xs">
          <input
            type="text"
            placeholder={placeholder}
            value={searchTerm}
            onChange={e => {
              setSearchTerm(e.target.value);
              if (!isOpen) setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (filteredOptions.length > 0) {
                  handleSelectItem(filteredOptions[0].label);
                } else if (searchTerm.trim()) {
                  handleAddCustom();
                }
              }
            }}
            className="w-full text-xs px-3 py-2 bg-transparent border-0 focus:outline-hidden"
          />

          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="px-2.5 py-2 text-slate-400 hover:text-slate-600 border-l border-slate-200 flex items-center justify-center transition-colors"
            title="Open drop-down menu"
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180 text-teal-700' : ''}`} />
          </button>
        </div>

        {/* Drop-down menu with auto-suggest */}
        {isOpen && (
          <div className="absolute left-0 right-0 top-full mt-1.5 bg-white rounded-2xl shadow-xl border border-slate-200 z-50 max-h-64 overflow-y-auto divide-y divide-slate-100 animate-in fade-in zoom-in-95 duration-150">
            {/* Header / status */}
            <div className="px-3 py-1.5 bg-slate-50 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <span>{searchTerm ? 'Auto-suggest matches' : 'Drop-down Catalogue'}</span>
              <span>{filteredOptions.length} available</span>
            </div>

            {/* Custom add option if user typed something not matching */}
            {searchTerm.trim() &&
              !filteredOptions.some(o => o.label.toLowerCase() === searchTerm.toLowerCase().trim()) && (
                <button
                  type="button"
                  onClick={handleAddCustom}
                  className="w-full text-left px-3.5 py-2 text-xs bg-teal-50/60 hover:bg-teal-50 text-teal-900 font-semibold flex items-center gap-2 border-b border-teal-100"
                >
                  <Plus className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                  <span>
                    Add custom entry: <strong>&quot;{searchTerm.trim()}&quot;</strong>
                  </span>
                </button>
              )}

            {/* Suggestions list */}
            {filteredOptions.length === 0 && !searchTerm.trim() ? (
              <div className="p-4 text-center text-xs text-slate-400">
                No items found.
              </div>
            ) : filteredOptions.length === 0 && searchTerm.trim() ? (
              <div className="p-4 text-center text-xs text-slate-500">
                No exact match. Click above to add &quot;{searchTerm.trim()}&quot;.
              </div>
            ) : (
              <div className="py-1">
                {filteredOptions.map((opt, idx) => {
                  const isSelected = currentItems.includes(opt.label);
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSelectItem(opt.label)}
                      className={`w-full text-left px-3.5 py-2 text-xs hover:bg-slate-50 flex items-center justify-between transition-colors ${
                        isSelected ? 'bg-teal-50/50 text-teal-900 font-bold' : 'text-slate-700'
                      }`}
                    >
                      <div>
                        <span className="block leading-tight">{opt.label}</span>
                        {opt.subtext && (
                          <span className="text-[10px] text-slate-400 block mt-0.5">
                            {opt.subtext}
                          </span>
                        )}
                      </div>
                      {isSelected ? (
                        <Check className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                      ) : (
                        <Plus className="w-3.5 h-3.5 text-slate-300 hover:text-teal-600 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Selected Items (Rendered as clean structured list rows, NOT loose chips!) */}
      {currentItems.length > 0 ? (
        <div className="mt-2 border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 bg-slate-50/50">
          <div className="px-3 py-1 bg-slate-100/70 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500">
            <span>Selected {label} ({currentItems.length})</span>
            <button
              type="button"
              onClick={() => onChange('')}
              className="text-[10px] text-slate-400 hover:text-red-600 font-normal lowercase"
            >
              Clear all
            </button>
          </div>

          {currentItems.map((item, idx) => (
            <div
              key={idx}
              className="px-3 py-2 flex items-center justify-between text-xs hover:bg-white transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-600 shrink-0" />
                <span
                  className={`font-semibold ${
                    isAllergy && item !== 'No Known Drug Allergies (NKDA)'
                      ? 'text-rose-800'
                      : 'text-slate-800'
                  }`}
                >
                  {item}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleRemoveItem(idx)}
                className="text-slate-400 hover:text-red-600 p-1 rounded-md transition-colors"
                title="Remove item"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        helperText && (
          <span className="text-[10px] text-slate-400 mt-1 block">
            {helperText}
          </span>
        )
      )}
    </div>
  );
};
