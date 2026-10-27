import React, { createContext, useContext, useState, useEffect } from 'react';
import { Doctor } from '../types';
import { api, authStorage } from '../lib/api';

interface AuthContextType {
  doctor: Doctor | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithSSO: (params?: { organization?: string; email?: string; name?: string; department?: string }) => Promise<void>;
  loginWithGoogle: (params?: { email?: string; name?: string }) => Promise<void>;
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
  const [doctor, setDoctor] = useState<Doctor | null>(() => authStorage.getDoctor());
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setIsLoading(false);

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
    authStorage.setDoctor(res.doctor);
    setDoctor(res.doctor);
  };

  const loginWithSSO = async (params?: { organization?: string; email?: string; name?: string; department?: string }) => {
    const res = await api.auth.sso(params);
    authStorage.setToken(res.token);
    authStorage.setDoctor(res.doctor);
    setDoctor(res.doctor);
  };

  const loginWithGoogle = async (params?: { email?: string; name?: string }) => {
    const res = await api.auth.google(params);
    authStorage.setToken(res.token);
    authStorage.setDoctor(res.doctor);
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
    authStorage.setDoctor(res.doctor);
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
    authStorage.setDoctor(res.doctor);
    setDoctor(res.doctor);
  };

  return (
    <AuthContext.Provider
      value={{
        doctor,
        isLoading,
        login,
        loginWithSSO,
        loginWithGoogle,
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
