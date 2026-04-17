'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useCanvasStore } from '@/stores/canvasStore';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase/client';
import ModeToolbar from '@/components/toolbar/ModeToolbar';
import PartSelector from '@/components/toolbar/PartSelector';
import CompassWidget from '@/components/canvas/CompassWidget';
import BuildingTemplateModal from '@/components/building/BuildingTemplateModal';
import ExportModal from '@/components/output/ExportModal';
import ScaffoldStartModal from '@/components/scaffold/ScaffoldStartModal';
import RoofSettingsModal from '@/components/building/RoofSettingsModal';
import UdekiModal from '@/components/scaffold/UdekiModal';
import AutoLayoutModal from '@/components/scaffold/AutoLayoutModal';
import HandrailReorderModal from '@/components/scaffold/HandrailReorderModal';
import SettingsPanel from '@/components/toolbar/SettingsPanel';
import MemoCreateModal from '@/components/memo/MemoCreateModal';
import { CanvasData, PaperSize, ScaleOption } from '@/types';

// Konvaはクライアントサイドのみ
const GridCanvas = dynamic(() => import('@/components/canvas/GridCanvas'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center w-full h-full bg-dark-bg">
      <div className="animate-spin w-8 h-8 border-2 border-accent border-t-transparent rounded-full" />
    </div>
  ),
});

export default function EditorPage() {
  const params = useParams();
  const router = useRouter();
  const drawingId = params.id as string;

  const {
    setDrawingId,
    setProjectId,
    setCanvasData,
    canvasData,
    mode,
    isDirty,
    saveStatus,
    setSaveStatus,
    undo,
    redo,
    history,
    zoomToFitBuildings,
    showDimensions,
    toggleShowDimensions,
    showGridGuide,
    toggleShowGridGuide,
    isDarkMode,
    toggleDarkMode,
    isDuplicateMode,
    toggleDuplicateMode,
    showKidare,
    toggleShowKidare,
    isReorderMode,
    toggleReorderMode,
    selectedLineIds,
    setSelectedLineIds,
    reorderHandrails,
    showScaffoldStart,
    setShowScaffoldStart,
    showAutoLayout,
    setShowAutoLayout,
    showBuildingModal: showBuildingModalStore,
    setShowBuildingModal: setShowBuildingModalStore,
    showBuilding2FModal: showBuilding2FModalStore,
    setShowBuilding2FModal: setShowBuilding2FModalStore,
    showSettings,
    setShowSettings,
    showSettingsPanel,
    showPartSelector,
    showMemoCreateModal,
    setShowMemoCreateModal,
    showInnerPost,
    setShowInnerPost,
    showCornerGuide,
    toggleShowCornerGuide,
    isMeasuring,
    toggleMeasuring,
    measureResultMm,
    measurePoint1,
    measurePoint2,
    setMeasurePoint1,
    setMeasurePoint2,
    setMeasureCursor,
    setMeasureResultMm,
    selectedIds,
    vertexPoints,
    clearVertexPoints,
    removeLastVertexPoint,
    addBuilding,
    setMode,
    buildingInputMethod,
    setBuildingInputMethod,
  } = useCanvasStore();
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [showBuildingModal, setShowBuildingModal] = useState(false);
  const [showBuilding2FModal, setShowBuilding2FModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showScaffoldStartModal, setShowScaffoldStartModal] = useState(false);
  const [showRoofModal, setShowRoofModal] = useState(false);
  const [showUdekiModal, setShowUdekiModal] = useState(false);
  const [showAutoLayoutModal, setShowAutoLayoutModal] = useState(false);
  const [showDimensionLines, setShowDimensionLines] = useState(false);
  const [drawingTitle, setDrawingTitle] = useState('');
  const [siteName, setSiteName] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // 画面サイズ計測
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setCanvasSize({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // 図面データ読み込み
  useEffect(() => {
    if (!drawingId) return;
    setDrawingId(drawingId);

    const loadDrawing = async () => {
      const { data: drawing } = await supabase
        .from('drawings')
        .select('*, projects(name)')
        .eq('id', drawingId)
        .single();

      if (drawing) {
        setCanvasData(drawing.canvas_data as CanvasData);
        setProjectId(drawing.project_id);
        setDrawingTitle(drawing.title);
        if (drawing.projects) {
          setSiteName((drawing.projects as { name: string }).name);
        }
      }
    };
    loadDrawing();
  }, [drawingId, setDrawingId, setProjectId, setCanvasData]);


  // 保存
  const handleSave = useCallback(async () => {
    if (!drawingId) return;
    setSaveStatus('saving');
    const { error } = await supabase
      .from('drawings')
      .update({
        canvas_data: canvasData as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      })
      .eq('id', drawingId);

    // プロジェクトのupdated_atも更新
    const projectId = useCanvasStore.getState().projectId;
    if (projectId) {
      await supabase
        .from('projects')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', projectId);
    }

    setSaveStatus(error ? 'error' : 'saved');
    setTimeout(() => setSaveStatus('idle'), 2000);
  }, [drawingId, canvasData, setSaveStatus]);

  // 出力処理
  const handleExport = useCallback(
    async (settings: { format: 'pdf' | 'png' | 'dxf'; paperSize: PaperSize; scale: ScaleOption }) => {
      try {
        if (settings.format === 'png') {
          const { exportToPng } = await import('@/lib/export/pngExport');
          await exportToPng(siteName);
        } else if (settings.format === 'pdf') {
          const { exportToPdf } = await import('@/lib/export/pdfExport');
          const store = useCanvasStore.getState();
          await exportToPdf(
            canvasData,
            {
              format: 'pdf',
              paperSize: settings.paperSize,
              scale: settings.scale,
              companyName: useAuthStore.getState().profile?.company_name || '',
              siteName,
              date: new Date().toLocaleDateString('ja-JP'),
            },
            store.printAreaCenter,
            store.zoom,
            store.panX,
            store.panY,
          );
        } else {
          const { exportToDxf } = await import('@/lib/export/dxfExport');
          exportToDxf(canvasData, siteName);
        }
        setShowExportModal(false);
      } catch (e) {
        console.error('[handleExport] error:', e);
        alert(`出力エラー: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
    [canvasData, siteName]
  );

  return (
    <div className="h-screen flex flex-col bg-dark-bg overflow-hidden">
      {/* ヘッダー */}
      <header className="flex-shrink-0 bg-dark-surface border-b border-dark-border px-3 py-2 flex items-center justify-between z-10">
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push('/projects')}
            className="text-accent text-sm px-2 py-1"
          >
            ←
          </button>
          <div>
            <h1 className="text-sm font-bold truncate max-w-[150px]">{siteName}</h1>
            <p className="text-xs text-dimension">{drawingTitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* アンドゥ/リドゥ */}
          <button
            onClick={() => {
              if (mode === 'building' && buildingInputMethod === 'vertex' && vertexPoints.length > 0) {
                removeLastVertexPoint();
              } else if (isMeasuring && (measurePoint1 || measurePoint2)) {
                setMeasurePoint1(null);
                setMeasurePoint2(null);
                setMeasureCursor(null);
                setMeasureResultMm(null);
              } else {
                undo();
              }
            }}
            disabled={
              mode === 'building' && buildingInputMethod === 'vertex'
                ? vertexPoints.length === 0
                : isMeasuring
                ? !(measurePoint1 || measurePoint2)
                : history.past.length === 0
            }
            className="px-2 py-1 text-lg disabled:opacity-30 text-dimension hover:text-canvas"
            title="元に戻す"
          >
            ↩
          </button>
          <button
            onClick={redo}
            disabled={history.future.length === 0}
            className="px-2 py-1 text-lg disabled:opacity-30 text-dimension hover:text-canvas"
            title="やり直し"
          >
            ↪
          </button>

          {/* 保存 */}
          <button
            onClick={handleSave}
            className={`px-3 py-1 rounded-lg text-sm font-bold ml-1 ${
              saveStatus === 'saved'
                ? 'bg-success text-white'
                : saveStatus === 'error'
                ? 'bg-red-500 text-white'
                : isDirty
                ? 'bg-accent text-white'
                : 'bg-dark-bg text-dimension border border-dark-border'
            }`}
          >
            {saveStatus === 'saving'
              ? '...'
              : saveStatus === 'saved'
              ? '保存済'
              : saveStatus === 'error'
              ? 'エラー'
              : '保存'}
          </button>

          {/* 出力 */}
          <button
            onClick={() => setShowExportModal(true)}
            className="px-3 py-1 bg-dark-bg border border-dark-border rounded-lg text-sm text-dimension hover:text-canvas"
          >
            出力
          </button>
        </div>
      </header>

      {/* キャンバスエリア */}
      <div ref={containerRef} data-canvas-container className="flex-1 relative overflow-hidden">
        {canvasSize.width > 0 && canvasSize.height > 0 && (
          <GridCanvas width={canvasSize.width} height={canvasSize.height} showDimensionLines={showDimensionLines} />
        )}
        <CompassWidget />

        {/* スマホ用 全体表示ボタン */}
        {canvasData.buildings.length > 0 && (
          <button
            onClick={() => {
              const vw = canvasSize.width || window.innerWidth;
              const vh = canvasSize.height || (window.innerHeight - 120);
              zoomToFitBuildings(vw, vh, 3000);
            }}
            className="sm:hidden absolute top-3 right-3 p-2 bg-dark-surface border border-dark-border rounded-lg shadow-lg text-dimension z-10"
            title="全体表示"
          >
            🔍
          </button>
        )}

        {/* 右上ボタン群（PC） */}
        <div className="hidden sm:flex absolute top-3 right-3 flex-col gap-2 z-10" style={{ display: showSettingsPanel ? undefined : 'none' }}>
          {/* 全体表示ボタン */}
          {canvasData.buildings.length > 0 && (
            <button
              onClick={() => {
                const vw = canvasSize.width || window.innerWidth;
                const vh = canvasSize.height || (window.innerHeight - 120);
                zoomToFitBuildings(vw, vh, 3000);
              }}
              className="w-10 h-10 bg-dark-surface border border-dark-border rounded-xl flex items-center justify-center text-dimension hover:text-canvas shadow-lg transition-colors"
              title="全体表示"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="8.5" cy="8.5" r="5.5" />
                <line x1="12.5" y1="12.5" x2="17" y2="17" />
                <line x1="6" y1="8.5" x2="11" y2="8.5" />
                <line x1="8.5" y1="6" x2="8.5" y2="11" />
              </svg>
            </button>
          )}

          {/* 寸法表示トグル */}
          <button
            onClick={toggleShowDimensions}
            className={`w-10 h-10 border rounded-xl flex items-center justify-center shadow-lg transition-colors ${
              showDimensions
                ? 'bg-accent border-accent text-white'
                : 'bg-dark-surface border-dark-border text-dimension hover:text-canvas'
            }`}
            title={showDimensions ? '寸法を非表示' : '寸法を表示'}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="1" y1="17" x2="17" y2="17" />
              <line x1="1" y1="17" x2="1" y2="1" />
              <line x1="1" y1="5" x2="4" y2="5" />
              <line x1="1" y1="9" x2="3" y2="9" />
              <line x1="1" y1="13" x2="4" y2="13" />
              <line x1="5" y1="17" x2="5" y2="14" />
              <line x1="9" y1="17" x2="9" y2="15" />
              <line x1="13" y1="17" x2="13" y2="14" />
            </svg>
          </button>

          {/* 寸法線トグル（方位別スパン寸法） */}
          <button
            onClick={() => setShowDimensionLines((v) => !v)}
            className={`w-10 h-10 border rounded-xl flex items-center justify-center shadow-lg transition-colors ${
              showDimensionLines
                ? 'bg-accent border-accent text-white'
                : 'bg-dark-surface border-dark-border text-dimension hover:text-canvas'
            }`}
            title={showDimensionLines ? '寸法線を非表示' : '寸法線を表示'}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="2" y1="2" x2="2" y2="16" />
              <line x1="16" y1="2" x2="16" y2="16" />
              <line x1="2" y1="9" x2="16" y2="9" />
              <line x1="5" y1="7" x2="2" y2="9" />
              <line x1="5" y1="11" x2="2" y2="9" />
              <line x1="13" y1="7" x2="16" y2="9" />
              <line x1="13" y1="11" x2="16" y2="9" />
            </svg>
          </button>

          {/* 離れ表示トグル */}
          <button
            onClick={toggleShowKidare}
            className={`w-10 h-10 border rounded-xl flex items-center justify-center shadow-lg transition-colors ${
              showKidare
                ? 'bg-accent border-accent text-white'
                : 'bg-dark-surface border-dark-border text-dimension hover:text-canvas'
            }`}
            title={showKidare ? '離れを非表示' : '離れを表示'}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M3 12 L21 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <path d="M3 8 L3 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <path d="M21 8 L21 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <path d="M6 12 L8 10 M6 12 L8 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M18 12 L16 10 M18 12 L16 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>

          {/* 寸法計測ボタン */}
          <button
            onClick={toggleMeasuring}
            className={`w-10 h-10 border rounded-xl flex items-center justify-center shadow-lg transition-colors ${
              isMeasuring
                ? 'bg-accent border-accent text-white'
                : 'bg-dark-surface border-dark-border text-dimension hover:text-canvas'
            }`}
            title="寸法計測（2点指定）"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M4 20 L20 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <circle cx="4" cy="20" r="2" fill="currentColor"/>
              <circle cx="20" cy="4" r="2" fill="currentColor"/>
            </svg>
          </button>
          {isMeasuring && measureResultMm !== null && (
            <div className="px-2 py-1 bg-accent/20 border border-accent rounded-lg text-xs font-mono font-bold text-accent text-center">
              {measureResultMm}mm
            </div>
          )}

          {/* 屋根設定ボタン（建物選択中のみ表示） */}
          {selectedIds.length === 1 && canvasData.buildings.some(b => b.id === selectedIds[0]) && (
            <button
              onClick={() => setShowRoofModal(true)}
              className="px-3 py-2 bg-dark-surface border border-dark-border rounded-xl text-xs text-dimension hover:text-canvas shadow-lg transition-colors"
            >
              屋根設定
            </button>
          )}

        </div>


        {/* スケールバー */}
        <ScaleBar />
      </div>

      {/* 部材選択パネル */}
      {showPartSelector && <PartSelector />}

      {/* モードツールバー */}
      <ModeToolbar />

      {/* 頂点タップ確定ボタン */}
      {mode === 'building' && buildingInputMethod === 'vertex' && vertexPoints.length >= 1 && (
        <div className="fixed bottom-20 sm:bottom-6 left-1/2 -translate-x-1/2 z-50 flex gap-3">
          <button
            onClick={() => {
              clearVertexPoints();
              setBuildingInputMethod('template');
              setMode('select');
            }}
            className="px-5 py-2.5 bg-dark-surface border border-dark-border rounded-xl text-sm text-dimension font-bold shadow-lg"
          >
            キャンセル
          </button>
          {vertexPoints.length >= 3 && (
            <button
              onClick={() => {
                addBuilding({ id: uuidv4(), type: 'polygon', points: [...vertexPoints], fill: '#3d3d3a' });
                clearVertexPoints();
                setMode('select');
              }}
              className="px-5 py-2.5 bg-accent text-white rounded-xl text-sm font-bold shadow-lg"
            >
              作図確定（{vertexPoints.length}点）
            </button>
          )}
        </div>
      )}

      {/* モーダル */}
      {(showBuildingModal || showBuildingModalStore) && (
        <BuildingTemplateModal onClose={() => { setShowBuildingModal(false); setShowBuildingModalStore(false); }} />
      )}
      {(showBuilding2FModal || showBuilding2FModalStore) && (
        <BuildingTemplateModal
          floor={2}
          floor1Building={canvasData.buildings.find(b => !b.floor || b.floor === 1)}
          onClose={() => { setShowBuilding2FModal(false); setShowBuilding2FModalStore(false); }}
        />
      )}
      {showExportModal && (
        <ExportModal
          onClose={() => setShowExportModal(false)}
          onExport={async (settings) => {
            await handleExport(settings);
            setShowExportModal(false);
          }}
          siteName={siteName}
        />
      )}
      {(showScaffoldStartModal || showScaffoldStart) && (
        <ScaffoldStartModal onClose={() => { setShowScaffoldStartModal(false); setShowScaffoldStart(false); }} />
      )}
      {(showUdekiModal || showInnerPost) && (
        <UdekiModal onClose={() => { setShowUdekiModal(false); setShowInnerPost(false); }} />
      )}
      {(showAutoLayoutModal || showAutoLayout) && (
        <AutoLayoutModal onClose={() => { setShowAutoLayoutModal(false); setShowAutoLayout(false); }} onOpenScaffoldStart={() => setShowScaffoldStartModal(true)} />
      )}
      {selectedLineIds.length >= 2 && (
        <HandrailReorderModal
          lineIds={selectedLineIds}
          buildingPoints={canvasData.buildings[0]?.points}
          onClose={() => setSelectedLineIds([])}
          onConfirm={(newOrder) => {
            reorderHandrails(selectedLineIds, newOrder);
            setSelectedLineIds([]);
          }}
        />
      )}
      {showSettings && (
        <SettingsPanel onClose={() => setShowSettings(false)} />
      )}
      {showMemoCreateModal && (
        <MemoCreateModal onClose={() => setShowMemoCreateModal(false)} />
      )}
      {showRoofModal && selectedIds.length === 1 && (() => {
        const bld = canvasData.buildings.find(b => b.id === selectedIds[0]);
        return bld ? (
          <RoofSettingsModal
            buildingId={bld.id}
            buildingPoints={bld.points}
            initialRoof={bld.roof}
            onClose={() => setShowRoofModal(false)}
          />
        ) : null;
      })()}
    </div>
  );
}

/** スケールバー */
function ScaleBar() {
  const { zoom } = useCanvasStore();
  const GRID_PX = 3;
  const gridPx = GRID_PX * zoom;

  // 100mmをpxで計算（10グリッド = 100mm）
  const hundredMmPx = 10 * gridPx;
  // 画面に収まるスケールを選択
  let scaleMm = 100;
  let barPx = hundredMmPx;
  if (barPx > 150) { scaleMm = 50; barPx = hundredMmPx / 2; }
  if (barPx > 150) { scaleMm = 20; barPx = hundredMmPx / 5; }
  if (barPx < 30) { scaleMm = 500; barPx = hundredMmPx * 5; }
  if (barPx < 30) { scaleMm = 1000; barPx = hundredMmPx * 10; }

  return (
    <div className="absolute bottom-20 left-3 flex items-center gap-1 bg-dark-bg/80 rounded px-2 py-1">
      <div
        className="h-0.5 bg-dimension"
        style={{ width: `${barPx}px` }}
      />
      <span className="text-xs text-dimension">{scaleMm}mm</span>
    </div>
  );
}
