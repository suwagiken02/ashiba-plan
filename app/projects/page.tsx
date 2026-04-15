'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase/client';
import { Project } from '@/types';

export default function ProjectsPage() {
  const router = useRouter();
  const { user, profile, signOut, loadSession } = useAuthStore();
  const [projects, setProjects] = useState<Project[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'updated' | 'name'>('updated');
  const [showNewModal, setShowNewModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [creating, setCreating] = useState(false);

  const loadProjects = useCallback(async () => {
    const currentUser = useAuthStore.getState().user;
    const query = currentUser && currentUser.id !== 'anonymous'
      ? supabase.from('projects').select('*').eq('owner_id', currentUser.id).order('updated_at', { ascending: false })
      : supabase.from('projects').select('*').order('updated_at', { ascending: false });
    const { data } = await query;
    if (data) setProjects(data);
  }, []);

  useEffect(() => {
    loadSession().then(() => loadProjects());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createProject = async () => {
    if (!newName.trim()) return;
    setCreating(true);

    try {
      // セッション確認（Safari対策: 匿名セッションが切れている場合に再取得）
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        await supabase.auth.signInAnonymously();
      }

      const currentUser = useAuthStore.getState().user;
      const ownerId = currentUser ? currentUser.id : null;

      const { data, error } = await supabase
        .from('projects')
        .insert({
          owner_id: ownerId,
          name: newName.trim(),
          address: newAddress.trim() || null,
        })
        .select()
        .single();

      if (error) {
        console.error('[createProject] projects insert error:', error);
        alert(`現場作成エラー: ${error.message}`);
        setCreating(false);
        return;
      }
      if (!data) {
        alert('現場作成エラー: データが返されませんでした');
        setCreating(false);
        return;
      }

      // 図面も自動作成
      const { data: drawing, error: drawingError } = await supabase
        .from('drawings')
        .insert({
          project_id: data.id,
          title: '平面図',
          canvas_data: {
            version: '1.0',
            grid: { unitMm: 10, cols: 600, rows: 400 },
            buildings: [],
            roofOverhangs: [],
            obstacles: [],
            handrails: [],
            posts: [],
            antis: [],
            memos: [],
            compass: { angle: 0 },
          },
        })
        .select()
        .single();

      if (drawingError) {
        console.error('[createProject] drawings insert error:', drawingError);
        alert(`図面作成エラー: ${drawingError.message}`);
        setCreating(false);
        return;
      }

      if (drawing) {
        router.push(`/editor/${drawing.id}`);
      }
    } catch (e) {
      console.error('[createProject] unexpected error:', e);
      alert(`予期しないエラー: ${e instanceof Error ? e.message : String(e)}`);
    }

    setCreating(false);
    setShowNewModal(false);
    setNewName('');
    setNewAddress('');
  };

  const deleteProject = async (id: string) => {
    if (!confirm('このプロジェクトを削除しますか？')) return;
    await supabase.from('drawings').delete().eq('project_id', id);
    await supabase.from('projects').delete().eq('id', id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
  };

  const openProject = async (projectId: string) => {
    const { data } = await supabase
      .from('drawings')
      .select('id')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

    if (data) {
      router.push(`/editor/${data.id}`);
    }
  };

  const filtered = projects
    .filter((p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.address || '').toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name, 'ja');
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });

  return (
    <div className="min-h-screen">
      {/* ヘッダー */}
      <header className="sticky top-0 z-10 bg-dark-surface border-b border-dark-border px-4 py-3">
        <div className="flex items-center justify-between max-w-4xl mx-auto">
          <div>
            <h1 className="text-lg font-bold text-accent">Ashiba Plan</h1>
            {profile?.company_name && (
              <p className="text-xs text-dimension">{profile.company_name}</p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => router.push('/settings')}
              className="px-3 py-2 text-sm text-dimension hover:text-canvas rounded-lg"
            >
              設定
            </button>
            <button
              onClick={signOut}
              className="px-3 py-2 text-sm text-dimension hover:text-canvas rounded-lg"
            >
              ログアウト
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4">
        {/* 検索・並び替え */}
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            placeholder="現場名・住所で検索"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 px-4 py-2 bg-dark-surface border border-dark-border rounded-lg text-canvas text-sm focus:outline-none focus:border-accent"
          />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'updated' | 'name')}
            className="px-3 py-2 bg-dark-surface border border-dark-border rounded-lg text-canvas text-sm"
          >
            <option value="updated">更新順</option>
            <option value="name">名前順</option>
          </select>
        </div>

        {/* 新規作成ボタン */}
        <button
          type="button"
          onClick={() => setShowNewModal(true)}
          className="w-full mb-6 py-4 bg-accent text-white font-bold rounded-xl text-lg hover:bg-blue-600 transition-colors"
        >
          + 新規プロジェクト作成
        </button>

        {/* プロジェクト一覧 */}
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-dimension">
            <p className="text-lg mb-2">プロジェクトがありません</p>
            <p className="text-sm">「新規プロジェクト作成」から始めましょう</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {filtered.map((project) => (
              <div
                key={project.id}
                className="bg-dark-surface border border-dark-border rounded-xl p-4 hover:border-accent transition-colors cursor-pointer"
                onClick={() => openProject(project.id)}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h3 className="font-bold text-canvas mb-1">{project.name}</h3>
                    {project.address && (
                      <p className="text-sm text-dimension mb-2">{project.address}</p>
                    )}
                    <p className="text-xs text-dimension">
                      更新: {new Date(project.updated_at).toLocaleDateString('ja-JP')}
                    </p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteProject(project.id); }}
                    className="ml-2 px-3 py-1 text-xs text-red-400 hover:bg-red-400/10 rounded-lg"
                  >
                    削除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* 新規作成モーダル */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* 背景overlay（クリックで閉じる） */}
          <div
            className="absolute inset-0 modal-overlay"
            onClick={() => setShowNewModal(false)}
          />
          {/* コンテンツ（overlayの上にrelativeで配置、formタグ不使用） */}
          <div
            className="relative bg-dark-surface border border-dark-border rounded-2xl p-6 w-full max-w-sm"
          >
            <h2 className="text-lg font-bold mb-4">新規プロジェクト</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-dimension mb-1">現場名 *</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); createProject(); } }}
                  className="w-full px-4 py-3 bg-dark-bg border border-dark-border rounded-lg text-canvas focus:outline-none focus:border-accent"
                  placeholder="○○邸 足場工事"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm text-dimension mb-1">住所</label>
                <input
                  type="text"
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); createProject(); } }}
                  className="w-full px-4 py-3 bg-dark-bg border border-dark-border rounded-lg text-canvas focus:outline-none focus:border-accent"
                  placeholder="東京都..."
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="flex-1 py-3 bg-dark-bg border border-dark-border rounded-lg text-dimension"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={createProject}
                disabled={!newName.trim() || creating}
                className="flex-1 py-3 bg-accent text-white font-bold rounded-lg disabled:opacity-50"
              >
                {creating ? '作成中...' : '作成'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
