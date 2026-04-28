'use client';

import { create } from 'zustand';
import { supabase } from '@/lib/supabase/client';

/** Phase 0a で作成した固定 Default Company の UUID。
 *  Phase 0d で本格的な認証 + 会社割当が入るまでフォールバックとして使用。 */
export const DEFAULT_COMPANY_ID = '00000000-0000-0000-0000-000000000001';

type Profile = {
  id: string;
  company_id: string | null;
  company_name: string | null;
  logo_url: string | null;
};

const ANON_USER = { id: 'anonymous', email: '' };
const ANON_PROFILE: Profile = { id: 'anonymous', company_id: null, company_name: null, logo_url: null };

type AuthStore = {
  user: { id: string; email: string } | null;
  profile: Profile | null;
  /** 現在のユーザーの所属会社 ID（Phase 0b）。null なら未ロード or 匿名 → DEFAULT_COMPANY_ID にフォールバック */
  currentCompanyId: string | null;
  loading: boolean;
  setUser: (user: { id: string; email: string } | null) => void;
  setProfile: (profile: Profile | null) => void;
  setCurrentCompanyId: (id: string | null) => void;
  setLoading: (loading: boolean) => void;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string, companyName: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  loadSession: () => Promise<void>;
  updateProfile: (companyName: string, logoUrl?: string) => Promise<void>;
};

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: ANON_USER,
  profile: ANON_PROFILE,
  currentCompanyId: null,
  loading: false,
  setUser: (user) => set({ user }),
  setProfile: (profile) => set({ profile }),
  setCurrentCompanyId: (id) => set({ currentCompanyId: id }),
  setLoading: (loading) => set({ loading }),

  signIn: async () => null,
  signUp: async () => null,
  signOut: async () => {
    // no-op: 認証スキップ中
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
          if (data) {
            set({
              profile: data,
              currentCompanyId: data.company_id ?? DEFAULT_COMPANY_ID,
            });
          } else {
            set({ currentCompanyId: DEFAULT_COMPANY_ID });
          }
        } catch {
          // profile取得失敗しても続行、currentCompanyId はフォールバック
          set({ currentCompanyId: DEFAULT_COMPANY_ID });
        }
      } else {
        // セッションなし → Supabase匿名サインインを試行（RLS回避）
        try {
          const { data: anonData } = await supabase.auth.signInAnonymously();
          if (anonData?.user) {
            set({
              user: { id: anonData.user.id, email: '' },
              currentCompanyId: DEFAULT_COMPANY_ID,
            });
          } else {
            set({ user: ANON_USER, profile: ANON_PROFILE, currentCompanyId: DEFAULT_COMPANY_ID });
          }
        } catch {
          set({ user: ANON_USER, profile: ANON_PROFILE, currentCompanyId: DEFAULT_COMPANY_ID });
        }
      }
    } catch {
      set({ user: ANON_USER, profile: ANON_PROFILE, currentCompanyId: DEFAULT_COMPANY_ID });
    }
    set({ loading: false });
  },

  updateProfile: async (companyName, logoUrl) => {
    const { user } = get();
    if (!user || user.id === 'anonymous') return;
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
