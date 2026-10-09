import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  Language,
  LanguageOption,
  SUPPORTED_LANGUAGES,
  translations,
  TranslationKey
} from '../data/translations';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey, fallback?: string) => string;
  supportedLanguages: LanguageOption[];
  currentLanguageOption: LanguageOption;
}

const STORAGE_KEY = 'clinical_os_language';

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as Language;
      if (saved && (saved === 'en' || saved === 'hi' || saved === 'pa')) {
        return saved;
      }
    } catch {
      // ignore
    }
    return 'en';
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // ignore
    }
  };

  const t = (key: TranslationKey, fallback?: string): string => {
    const langDict = translations[language] || translations.en;
    if (langDict && key in langDict) {
      return langDict[key];
    }
    if (translations.en && key in translations.en) {
      return translations.en[key];
    }
    return fallback || key;
  };

  const currentLanguageOption =
    SUPPORTED_LANGUAGES.find(l => l.code === language) || SUPPORTED_LANGUAGES[0];

  return (
    <LanguageContext.Provider
      value={{
        language,
        setLanguage,
        t,
        supportedLanguages: SUPPORTED_LANGUAGES,
        currentLanguageOption
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
