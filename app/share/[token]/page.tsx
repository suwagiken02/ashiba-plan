'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';

type ShareInfo = {
  project: { name: string; address: string | null };
  drawings: { count: number };
  expiresAt: string;
  createdBy: { companyName: string | null };
};

export default function SharePage() {
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const [info, setInfo] = useState<ShareInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    const fetchInfo = async () => {
      try {
        const res = await fetch(`/api/share/${params.token}`);
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || '共有情報の取得に失敗しました');
        } else {
          setInfo(data);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : '共有情報の取得に失敗しました');
      } finally {
        setLoading(false);
      }
    };
    fetchInfo();
  }, [params.token]);

  const handleImport = async () => {
    setImporting(true);
    setError('');
    try {
      const res = await fetch(`/api/share/${params.token}/import`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '取り込みに失敗しました');
        setImporting(false);
        return;
      }
      router.replace('/projects');
    } catch (e) {
      setError(e instanceof Error ? e.message : '取り込みに失敗しました');
      setImporting(false);
    }
  };

  return (
    <div className="min-h-screen p-4 sm:p-6">
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl font-bold text-accent mb-6">共有プロジェクトの取り込み</h1>

        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin w-8 h-8 border-2 border-accent border-t-transparent rounded-full" />
          </div>
        )}

        {error && (
          <div className="bg-dark-surface border border-red-400/40 rounded-lg p-5 mb-4">
            <p className="text-sm text-canvas">{error}</p>
          </div>
        )}

        {info && !error && (
          <>
            <div className="bg-dark-surface border border-dark-border rounded-xl p-5 mb-4 space-y-3">
              <div>
                <p className="text-xs text-dimension mb-1">プロジェクト名</p>
                <p className="text-base font-bold text-canvas">{info.project.name}</p>
              </div>
              {info.project.address && (
                <div>
                  <p className="text-xs text-dimension mb-1">住所</p>
                  <p className="text-sm text-canvas">{info.project.address}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-dimension mb-1">図面数</p>
                <p className="text-sm text-canvas">{info.drawings.count} 件</p>
              </div>
              {info.createdBy.companyName && (
                <div>
                  <p className="text-xs text-dimension mb-1">共有者</p>
                  <p className="text-sm text-canvas">{info.createdBy.companyName}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-dimension mb-1">有効期限</p>
                <p className="text-xs text-dimension">
                  {new Date(info.expiresAt).toLocaleString('ja-JP')}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleImport}
              disabled={importing}
              className="w-full py-3 bg-accent text-white font-bold rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors"
            >
              {importing ? '取り込み中...' : '自分のプロジェクトとして取り込む'}
            </button>
          </>
        )}

        <button
          type="button"
          onClick={() => router.push('/projects')}
          className="w-full mt-4 py-3 text-accent text-sm hover:underline"
        >
          ← プロジェクト一覧に戻る
        </button>
      </div>
    </div>
  );
}
