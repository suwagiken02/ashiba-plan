'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const handleCallback = async () => {
      // Supabase が OAuth 完了後に hash fragment にトークンを返す。
      // loadSession でセッションを確立 → /projects へリダイレクト。
      await useAuthStore.getState().loadSession();
      router.replace('/projects');
    };
    handleCallback();
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <div className="text-center">
        <div className="animate-spin w-8 h-8 border-2 border-accent border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-dimension text-sm">ログイン処理中...</p>
      </div>
    </div>
  );
}
