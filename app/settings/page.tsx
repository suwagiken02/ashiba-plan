'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase/client';

export default function SettingsPage() {
  const router = useRouter();
  const { user, profile, updateProfile } = useAuthStore();
  const [companyName, setCompanyName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (profile) setCompanyName(profile.company_name || '');
  }, [profile]);

  const handleSave = async () => {
    setSaving(true);
    await updateProfile(companyName);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    const ext = file.name.split('.').pop();
    const path = `logos/${user.id}.${ext}`;
    const { error } = await supabase.storage.from('assets').upload(path, file, { upsert: true });
    if (error) return;

    const { data } = supabase.storage.from('assets').getPublicUrl(path);
    await updateProfile(companyName, data.publicUrl);
  };

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 bg-dark-surface border-b border-dark-border px-4 py-3">
        <div className="flex items-center justify-between max-w-md mx-auto">
          <button onClick={() => router.back()} className="text-accent text-sm px-3 py-2">
            ← 戻る
          </button>
          <h1 className="font-bold">設定</h1>
          <div className="w-16" />
        </div>
      </header>

      <main className="max-w-md mx-auto p-4 space-y-6">
        <section>
          <h2 className="text-sm text-dimension mb-2 font-bold">会社情報</h2>
          <div className="bg-dark-surface border border-dark-border rounded-xl p-4 space-y-4">
            <div>
              <label className="block text-sm text-dimension mb-1">会社名</label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full px-4 py-3 bg-dark-bg border border-dark-border rounded-lg text-canvas focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-sm text-dimension mb-1">会社ロゴ</label>
              {profile?.logo_url && (
                <img
                  src={profile.logo_url}
                  alt="Logo"
                  className="w-24 h-24 object-contain bg-white rounded-lg mb-2"
                />
              )}
              <input
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                className="text-sm text-dimension"
              />
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full py-3 bg-accent text-white font-bold rounded-lg disabled:opacity-50"
            >
              {saving ? '保存中...' : saved ? '保存しました' : '保存'}
            </button>
          </div>
        </section>

        <section>
          <h2 className="text-sm text-dimension mb-2 font-bold">アカウント</h2>
          <div className="bg-dark-surface border border-dark-border rounded-xl p-4">
            <p className="text-sm text-dimension">
              メール: {user?.email}
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
