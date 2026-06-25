import React, { createContext, useContext, useEffect, useState } from "react";
import { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

interface UserProfile {
  id: string;
  role: "host" | "player";
  display_name: string;
  email: string;
  host_approved: boolean | null; // null = pending, false = rejected, true = approved
  host_approved_at: string | null;
  created_at: string;
  avatar_url?: string | null;
  cover_url?: string | null;
  bio?: string | null;
  host_code?: string | null;
  is_superadmin?: boolean;
}

interface AuthContextType {
  user: UserProfile | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string, displayName: string, role: "host" | "player") => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  isHostApproved: boolean;
  isHostPending: boolean;
  isHostRejected: boolean;
  isSuperadmin: boolean;
  error: string | null;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize auth state on mount
  useEffect(() => {
    let mounted = true;

    async function getSession() {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (!mounted) return;

      if (sessionError) {
        console.error("Session error:", sessionError);
        setError(sessionError.message);
      } else if (session) {
        setSession(session);
        await fetchUserProfile(session.user.id);
      }
      setLoading(false);
    }

    // Subscribe to auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (!mounted) return;

      setSession(newSession);
      if (newSession?.user) {
        await fetchUserProfile(newSession.user.id);
      } else {
        setUser(null);
      }
    });

    getSession();

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  async function fetchUserProfile(userId: string) {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (error) {
      console.error("Profile fetch error:", error);
      setUser(null);
    } else if (data) {
      setUser(data as UserProfile);
    }
  }

  // Re-fetch the current user's profile (after a photo/bio update, etc.)
  async function refreshProfile() {
    if (session?.user) await fetchUserProfile(session.user.id);
  }

  async function signUp(
    email: string,
    password: string,
    displayName: string,
    role: "host" | "player"
  ) {
    setError(null);
    setLoading(true);

    try {
      // Sign up with Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: displayName,
            role,
          },
        },
      });

      if (authError) {
        throw new Error(authError.message);
      }

      if (!authData.user) {
        throw new Error("Sign up failed");
      }

      // Create profile in database
      const { error: profileError } = await supabase.from("profiles").insert([
        {
          id: authData.user.id,
          email,
          display_name: displayName,
          role,
          // Hosts start with pending approval
          host_approved: role === "host" ? null : undefined,
          created_at: new Date().toISOString(),
        },
      ]);

      if (profileError) {
        throw new Error(profileError.message);
      }

      setUser({
        id: authData.user.id,
        email,
        display_name: displayName,
        role,
        host_approved: role === "host" ? null : false,
        host_approved_at: null,
        created_at: new Date().toISOString(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sign up failed";
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }

  async function signIn(email: string, password: string) {
    setError(null);
    setLoading(true);

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        throw new Error(authError.message);
      }

      if (data.user) {
        await fetchUserProfile(data.user.id);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sign in failed";
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    setError(null);
    try {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) throw signOutError;
      setUser(null);
      setSession(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sign out failed";
      setError(message);
      throw err;
    }
  }

  // Compute approval status
  const isHostApproved = user?.role === "host" && user?.host_approved === true;
  const isHostPending = user?.role === "host" && user?.host_approved === null;
  const isHostRejected = user?.role === "host" && user?.host_approved === false;
  const isSuperadmin = user?.is_superadmin === true;

  return (
    <AuthContext.Provider 
      value={{ 
        user, 
        session, 
        loading, 
        signUp, 
        signIn, 
        signOut, 
        error,
        isHostApproved,
        isHostPending,
        isHostRejected,
        isSuperadmin,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
