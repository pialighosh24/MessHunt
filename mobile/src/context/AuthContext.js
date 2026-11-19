import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as authService from '../services/authService';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isRestoring, setIsRestoring] = useState(true);
  const [restoreError, setRestoreError] = useState(null);

  const restore = useCallback(async () => {
    setIsRestoring(true);
    setRestoreError(null);
    try {
      const restoredUser = await authService.restoreSession();
      setUser(restoredUser);
    } catch (error) {
      // Keep session unknown state? token may still exist; do not force logout on transient/network/config errors.
      setRestoreError(error);
      setUser(null);
    } finally {
      setIsRestoring(false);
    }
  }, []);

  useEffect(() => {
    restore();
  }, [restore]);

  const login = useCallback(async (credentials) => {
    const result = await authService.loginStudent(credentials);
    setUser(result.user);
    setRestoreError(null);
    return result;
  }, []);

  const register = useCallback(async (payload) => {
    const result = await authService.registerStudent(payload);
    setUser(result.user);
    setRestoreError(null);
    return result;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authService.logoutStudent();
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isRestoring,
      restoreError,
      restoreSession: restore,
      login,
      register,
      logout,
      setUser,
    }),
    [user, isRestoring, restoreError, restore, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}

export default AuthContext;
