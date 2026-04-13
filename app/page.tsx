'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';

export default function Home() {
  const router = useRouter();
  const { user, loading, loadSession } = useAuthStore();
  const loaded = useRef(false);

  useEffect(() => {
    if (!loaded.current) {
      loaded.current = true;
      loadSession();
    }
  }, [loadSession]);

  useEffect(() => {
    if (!loading) {
      if (user) {
        router.replace('/projects');
      } else {
        router.replace('/auth');
      }
    }
  }, [user, loading, router]);

  // 5秒のタイムアウト — Supabase接続失敗でも認証画面に飛ばす
  useEffect(() => {
    const timer = setTimeout(() => {
      if (useAuthStore.getState().loading) {
        useAuthStore.setState({ loading: false, user: null, profile: null });
      }
    }, 5000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="animate-spin w-8 h-8 border-2 border-accent border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-dimension">読み込み中...</p>
      </div>
    </div>
  );
}
