import React, { createContext, useContext, useState, useEffect } from 'react';
import { Doctor } from '../types';
import { api, authStorage } from '../lib/api';

interface AuthContextType {
  doctor: Doctor | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: {
    name: string;
    email: string;
    password: string;
    speciality?: string;
    registrationNumber?: string;
    clinicName?: string;
    phone?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  updateDoctor: (data: Partial<Doctor>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkSession = async () => {
      const token = authStorage.getToken();
      if (!token) {
        setIsLoading(false);
        return;
      }

      try {
        const res = await api.auth.me();
        setDoctor(res.doctor);
      } catch (err) {
        console.warn('Session check failed, clearing token');
        authStorage.clearToken();
        setDoctor(null);
      } finally {
        setIsLoading(false);
      }
    };

    checkSession();

    const handleUnauthorized = () => {
      setDoctor(null);
    };

    window.addEventListener('clinical_os_unauthorized', handleUnauthorized);
    return () => {
      window.removeEventListener('clinical_os_unauthorized', handleUnauthorized);
    };
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.auth.login({ email, password });
    authStorage.setToken(res.token);
    setDoctor(res.doctor);
  };

  const register = async (data: {
    name: string;
    email: string;
    password: string;
    speciality?: string;
    registrationNumber?: string;
    clinicName?: string;
    phone?: string;
  }) => {
    const res = await api.auth.register(data);
    authStorage.setToken(res.token);
    setDoctor(res.doctor);
  };

  const logout = async () => {
    try {
      await api.auth.logout();
    } catch {
      // ignore
    } finally {
      authStorage.clearToken();
      setDoctor(null);
    }
  };

  const updateDoctor = async (data: Partial<Doctor>) => {
    const res = await api.auth.updateProfile(data);
    setDoctor(res.doctor);
  };

  return (
    <AuthContext.Provider
      value={{
        doctor,
        isLoading,
        login,
        register,
        logout,
        updateDoctor,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
