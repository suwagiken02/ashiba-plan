'use client';

import { create } from 'zustand';
import { supabase } from '@/lib/supabase/client';

type Profile = {
  id: string;
  company_name: string | null;
  logo_url: string | null;
};

type AuthStore = {
  user: { id: string; email: string } | null;
  profile: Profile | null;
  loading: boolean;
  setUser: (user: { id: string; email: string } | null) => void;
  setProfile: (profile: Profile | null) => void;
  setLoading: (loading: boolean) => void;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string, companyName: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  loadSession: () => Promise<void>;
  updateProfile: (companyName: string, logoUrl?: string) => Promise<void>;
};

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  profile: null,
  loading: true,
  setUser: (user) => set({ user }),
  setProfile: (profile) => set({ profile }),
  setLoading: (loading) => set({ loading }),

  signIn: async (email, password) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return error.message;
      await get().loadSession();
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : '接続エラー';
    }
  },

  signUp: async (email, password, companyName) => {
    try {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) return error.message;
      if (data.user) {
        await supabase.from('profiles').upsert({
          id: data.user.id,
          company_name: companyName,
        });
      }
      await get().loadSession();
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : '接続エラー';
    }
  },

  signOut: async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore
    }
    set({ user: null, profile: null });
  },

  loadSession: async () => {
    set({ loading: true });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        set({ user: { id: session.user.id, email: session.user.email || '' } });
        try {
          const { data } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();
          if (data) set({ profile: data });
        } catch {
          // profile取得失敗しても続行
        }
      } else {
        set({ user: null, profile: null });
      }
    } catch {
      set({ user: null, profile: null });
    }
    set({ loading: false });
  },

  updateProfile: async (companyName, logoUrl) => {
    const { user } = get();
    if (!user) return;
    const updates: Record<string, string> = { company_name: companyName };
    if (logoUrl) updates.logo_url = logoUrl;
    try {
      await supabase.from('profiles').update(updates).eq('id', user.id);
      set({ profile: { ...get().profile!, ...updates } as Profile });
    } catch {
      // ignore
    }
  },
}));
