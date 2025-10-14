import { useEffect, useState } from "react";
import { supabase } from "./supabase";

// A tiny auth layer that mirrors supabase auth state into a module-global singleton
const __authSingleton = { set: null, get: null };

export function useAuth() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    let mounted = true;

    // fetch current session/user
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      const u = data?.session?.user ?? null;
      setUser(u);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        const u = session?.user ?? null;
        setUser(u);
      },
    );

    return () => {
      mounted = false;
      listener?.subscription?.unsubscribe();
    };
  }, []);

  const login = async (u = null) => {
    // If a user object is provided (from a sign-in flow), use it.
    if (u) {
      setUser(u);
      return;
    }
    // Otherwise, refresh session from supabase
    try {
      const { data } = await supabase.auth.getSession();
      setUser(data?.session?.user ?? null);
    } catch (err) {
      console.error("Failed to get session during login()", err);
      setUser(null);
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  return { user, login, logout };
}

export function AuthProvider({ children }) {
  const { user, login, logout } = useAuth();
  // expose the login/logout functions and the current user directly
  __authSingleton.set = { login, logout };
  __authSingleton.get = user;
  return children;
}

export function useAuthRedirect() {
  // Return a safe object so callers can destructure { login, logout }
  return (
    __authSingleton.set ?? {
      login: async () => {},
      logout: async () => {},
    }
  );
}

export function useAuthedUser() {
  return __authSingleton.get ?? null;
}
