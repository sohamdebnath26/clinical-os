import React, { createContext, useContext, useState, useEffect } from 'react';
import { Moon, Sun } from 'lucide-react';

export type ThemeMode = 'light' | 'dark';

interface ThemeContextType {
  theme: ThemeMode;
  isDark: boolean;
  toggleTheme: () => void;
  setTheme: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'light',
  isDark: false,
  toggleTheme: () => {},
  setTheme: () => {}
});

const STORAGE_KEY = 'clinical_os_theme';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'dark' || saved === 'light') {
        return saved;
      }
    } catch {
      // ignore storage errors
    }
    return 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      root.style.colorScheme = 'dark';
    } else {
      root.classList.remove('dark');
      root.style.colorScheme = 'light';
    }
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // ignore
    }
  }, [theme]);

  const toggleTheme = () => {
    setThemeState(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  const setTheme = (mode: ThemeMode) => {
    setThemeState(mode);
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        isDark: theme === 'dark',
        toggleTheme,
        setTheme
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);

interface ThemeToggleButtonProps {
  variant?: 'navbar' | 'dashboard' | 'sidebar-rail' | 'sidebar-expanded';
}

export const ThemeToggleButton: React.FC<ThemeToggleButtonProps> = ({
  variant = 'navbar'
}) => {
  const { isDark, toggleTheme } = useTheme();

  if (variant === 'sidebar-rail') {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        aria-label={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        className="w-full rounded-xl transition-all cursor-pointer flex flex-col items-center justify-center py-2 px-1 gap-1 text-[#c9e3df] hover:bg-white/8 hover:text-white font-medium"
      >
        {isDark ? (
          <Sun className="w-[18px] h-[18px] text-amber-300 shrink-0" />
        ) : (
          <Moon className="w-[18px] h-[18px] shrink-0" />
        )}
        <span className="text-[10px] leading-tight text-center">
          {isDark ? 'Light' : 'Dark'}
        </span>
      </button>
    );
  }

  if (variant === 'sidebar-expanded') {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        aria-label={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        className="w-full rounded-xl transition-all cursor-pointer flex items-center gap-2.5 px-3 py-2 text-xs text-[#c9e3df] hover:bg-white/8 hover:text-white font-medium"
      >
        {isDark ? (
          <Sun className="w-[18px] h-[18px] text-amber-300 shrink-0" />
        ) : (
          <Moon className="w-[18px] h-[18px] shrink-0" />
        )}
        <span className="truncate">{isDark ? 'Light Mode' : 'Dark Mode'}</span>
      </button>
    );
  }

  if (variant === 'dashboard') {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        aria-label={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        className="px-4 py-3.5 bg-white dark:bg-[#132623] hover:bg-[#f7faf9] dark:hover:bg-[#1a332f] border border-[#dce5e3] dark:border-[#25423e] rounded-2xl text-sm font-bold text-[#0f2926] dark:text-[#e2f1ee] transition-colors shrink-0 cursor-pointer flex items-center gap-2"
      >
        {isDark ? (
          <>
            <Sun className="w-4 h-4 text-amber-400" />
            <span className="hidden sm:inline">Light</span>
          </>
        ) : (
          <>
            <Moon className="w-4 h-4 text-[#115e56]" />
            <span className="hidden sm:inline">Dark</span>
          </>
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      aria-label={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-[#132623] hover:bg-slate-50 dark:hover:bg-[#1a332f] border border-slate-300 dark:border-[#25423e] rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-2xs transition-colors cursor-pointer"
    >
      {isDark ? (
        <>
          <Sun className="w-3.5 h-3.5 text-amber-400" />
          <span className="hidden sm:inline">Light</span>
        </>
      ) : (
        <>
          <Moon className="w-3.5 h-3.5 text-slate-600" />
          <span className="hidden sm:inline">Dark</span>
        </>
      )}
    </button>
  );
};
