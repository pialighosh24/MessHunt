import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getStoredUser, getStoredToken, getMe, clearAuthSession } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(getStoredUser());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const token = getStoredToken();
      if (!token) { if (mounted) setLoading(false); return; }
      try {
        const me = await getMe();
        if (mounted) setUser(me);
      } catch {
        clearAuthSession();
        if (mounted) setUser(null);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const value = useMemo(() => ({ user, setUser, loading, isAuthenticated: Boolean(user), role: user?.role || null }), [user, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() { return useContext(AuthContext); }
