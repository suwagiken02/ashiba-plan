'use client';

import React, { useRef, useCallback, useEffect, useState } from 'react';
import { Stage, Layer, Line, Rect, Circle, Text } from 'react-konva';
import Konva from 'konva';
import { useCanvasStore } from '@/stores/canvasStore';
import {
  INITIAL_GRID_PX,
  ZOOM_MIN,
  ZOOM_MAX,
} from '@/lib/konva/gridUtils';
import BuildingLayer from './BuildingLayer';
import ScaffoldLayer from './ScaffoldLayer';
import DimensionLayer from './DimensionLayer';
import DimensionLineLayer from './DimensionLineLayer';
import ObstacleLayer from './ObstacleLayer';
import MemoLayer from './MemoLayer';
import CompassWidget from './CompassWidget';
import { useCanvasInteraction } from '@/lib/konva/useCanvasInteraction';
import { mmToGrid } from '@/lib/konva/gridUtils';
import { getPrintAreaGrid } from '@/lib/export/pdfExport';

type Props = {
  width: number;
  height: number;
  showDimensionLines?: boolean;
};

export default function GridCanvas({ width, height, showDimensionLines = false }: Props) {
  const stageRef = useRef<Konva.Stage>(null);
  const { zoom, panX, panY, setZoom, setPan, mode, canvasData, handrailPreview, snapPoint, obstaclePreview, isMeasuring, measurePoint1, measureCursor, vertexPoints, buildingInputMethod, showGridGuide, showPrintArea, printPaperSize, printScale, printAreaCenter, setPrintAreaCenter, isDarkMode } = useCanvasStore();

  const colorCanvasBg = isDarkMode ? '#0a0a0a' : '#f5f4f0';
  const colorGridMinor = isDarkMode ? 'rgba(0,255,65,0.15)' : '#e5e4e0';
  const colorGridMajor = isDarkMode ? 'rgba(0,255,65,0.35)' : '#d0cfcb';
  const { handleStageMouseDown, handleStageMouseMove, handleStageMouseUp, selectionRect } = useCanvasInteraction();

  // ピンチズーム用
  const lastDist = useRef<number>(0);
  const lastCenter = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const isPinching = useRef(false);
  const [isPanning, setIsPanning] = useState(false);
  const panInitialized = useRef(false);
  const lastPanPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // グリッド描画（キャンバス全体に広がる無限グリッド）
  const gridLines = useCallback(() => {
    const lines: React.ReactElement[] = [];
    const gridPx = INITIAL_GRID_PX * zoom;

    // ズームが低すぎる場合は間引く
    let step = 1;
    if (gridPx < 2) step = 10;
    else if (gridPx < 5) step = 5;
    else if (gridPx < 10) step = 2;

    // 100mm (10グリッド) ごとの太線
    const majorStep = 10;

    // ビューポート全体をカバーするグリッド範囲を計算
    const startCol = Math.floor(-panX / gridPx / step) * step - step;
    const endCol = Math.ceil((width - panX) / gridPx / step) * step + step;
    const startRow = Math.floor(-panY / gridPx / step) * step - step;
    const endRow = Math.ceil((height - panY) / gridPx / step) * step + step;

    for (let i = startCol; i <= endCol; i += step) {
      const x = i * gridPx + panX;
      const isMajor = i % majorStep === 0;
      lines.push(
        <Line
          key={`v${i}`}
          points={[x, 0, x, height]}
          stroke={isMajor ? colorGridMajor : colorGridMinor}
          strokeWidth={isMajor ? 0.5 : 0.25}
          listening={false}
        />
      );
    }
    for (let j = startRow; j <= endRow; j += step) {
      const y = j * gridPx + panY;
      const isMajor = j % majorStep === 0;
      lines.push(
        <Line
          key={`h${j}`}
          points={[0, y, width, y]}
          stroke={isMajor ? colorGridMajor : colorGridMinor}
          strokeWidth={isMajor ? 0.5 : 0.25}
          listening={false}
        />
      );
    }
    return lines;
  }, [zoom, panX, panY, width, height, colorGridMajor, colorGridMinor]);

  // グリッドガイド（500mm/1000mmライン）
  const gridGuideLines = useCallback(() => {
    if (!showGridGuide) return [];
    const lines: React.ReactElement[] = [];
    const gridPx = INITIAL_GRID_PX * zoom;

    // 50グリッド=500mm, 100グリッド=1000mm
    const minorStep = 50;
    const majorStep = 100;

    const startCol = Math.floor(-panX / gridPx / minorStep) * minorStep - minorStep;
    const endCol = Math.ceil((width - panX) / gridPx / minorStep) * minorStep + minorStep;
    const startRow = Math.floor(-panY / gridPx / minorStep) * minorStep - minorStep;
    const endRow = Math.ceil((height - panY) / gridPx / minorStep) * minorStep + minorStep;

    for (let i = startCol; i <= endCol; i += minorStep) {
      const x = i * gridPx + panX;
      const isMajor = i % majorStep === 0;
      lines.push(
        <Line key={`gv${i}`}
          points={[x, 0, x, height]}
          stroke={isMajor ? '#888' : '#666'}
          strokeWidth={isMajor ? 0.8 : 0.4}
          opacity={isMajor ? 0.3 : 0.15}
          listening={false} />,
      );
    }
    for (let j = startRow; j <= endRow; j += minorStep) {
      const y = j * gridPx + panY;
      const isMajor = j % majorStep === 0;
      lines.push(
        <Line key={`gh${j}`}
          points={[0, y, width, y]}
          stroke={isMajor ? '#888' : '#666'}
          strokeWidth={isMajor ? 0.8 : 0.4}
          opacity={isMajor ? 0.3 : 0.15}
          listening={false} />,
      );
    }
    return lines;
  }, [zoom, panX, panY, width, height, showGridGuide]);

  // マウスホイールズーム
  const handleWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault();
      const stage = stageRef.current;
      if (!stage) return;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const direction = e.evt.deltaY > 0 ? -1 : 1;
      const factor = 1.08;
      const newZoom = Math.max(
        ZOOM_MIN,
        Math.min(ZOOM_MAX, direction > 0 ? zoom * factor : zoom / factor)
      );

      // ポインタ位置を中心にズーム
      const mouseX = pointer.x;
      const mouseY = pointer.y;
      const newPanX = mouseX - ((mouseX - panX) / zoom) * newZoom;
      const newPanY = mouseY - ((mouseY - panY) / zoom) * newZoom;

      setZoom(newZoom);
      setPan(newPanX, newPanY);
    },
    [zoom, panX, panY, setZoom, setPan]
  );

  // タッチイベント: ピンチズーム & 2本指パン
  const handleTouchStart = useCallback(
    (e: Konva.KonvaEventObject<TouchEvent>) => {
      const touches = e.evt.touches;
      if (touches.length === 2) {
        e.evt.preventDefault();
        isPinching.current = true;
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        lastDist.current = Math.sqrt(dx * dx + dy * dy);
        lastCenter.current = {
          x: (touches[0].clientX + touches[1].clientX) / 2,
          y: (touches[0].clientY + touches[1].clientY) / 2,
        };
      }
    },
    []
  );

  const handleTouchMove = useCallback(
    (e: Konva.KonvaEventObject<TouchEvent>) => {
      const touches = e.evt.touches;
      if (touches.length === 2 && isPinching.current) {
        e.evt.preventDefault();
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const center = {
          x: (touches[0].clientX + touches[1].clientX) / 2,
          y: (touches[0].clientY + touches[1].clientY) / 2,
        };

        const scale = dist / lastDist.current;
        const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom * scale));

        // パン
        const panDx = center.x - lastCenter.current.x;
        const panDy = center.y - lastCenter.current.y;
        const newPanX = panX + panDx + (center.x - panX) * (1 - scale);
        const newPanY = panY + panDy + (center.y - panY) * (1 - scale);

        setZoom(newZoom);
        setPan(newPanX, newPanY);

        lastDist.current = dist;
        lastCenter.current = center;
      }
    },
    [zoom, panX, panY, setZoom, setPan]
  );

  const handleTouchEnd = useCallback(() => {
    isPinching.current = false;
  }, []);

  // PC: 中ボタン or 右ボタンドラッグでパン
  const handleMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (e.evt.button === 1 || e.evt.button === 2) {
        e.evt.preventDefault();
        setIsPanning(true);
        panInitialized.current = true;
        lastPanPos.current = { x: e.evt.clientX, y: e.evt.clientY };
      }
    },
    []
  );

  const handleMouseMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (isPanning) {
        if (!panInitialized.current) {
          // Space+ドラッグの初回: 現在位置で初期化（ジャンプ防止）
          panInitialized.current = true;
          lastPanPos.current = { x: e.evt.clientX, y: e.evt.clientY };
          return;
        }
        const dx = e.evt.clientX - lastPanPos.current.x;
        const dy = e.evt.clientY - lastPanPos.current.y;
        setPan(panX + dx, panY + dy);
        lastPanPos.current = { x: e.evt.clientX, y: e.evt.clientY };
      }
    },
    [isPanning, panX, panY, setPan]
  );

  const handleMouseUp = useCallback(
    (_e?: Konva.KonvaEventObject<MouseEvent>) => {
      setIsPanning(false);
    },
    []
  );

  // Space+ドラッグでパン & コンテキストメニュー無効化
  useEffect(() => {
    const handleContextMenu = (e: Event) => {
      e.preventDefault();
    };
    const container = stageRef.current?.container();
    container?.addEventListener('contextmenu', handleContextMenu);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isPanning) {
        e.preventDefault();
        setIsPanning(true);
        panInitialized.current = false; // 初回moveで位置を取得
      }
      // Ctrl+Z / Ctrl+Shift+Z
      if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        useCanvasStore.getState().undo();
      }
      if (e.ctrlKey && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        useCanvasStore.getState().redo();
      }
      // Delete / Backspace: 選択中の要素を削除
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const s = useCanvasStore.getState();
        if (s.selectedIds.length > 0) {
          e.preventDefault();
          s.removeElements(s.selectedIds);
        }
      }
      // Escape: 頂点タップモードをキャンセル
      if (e.key === 'Escape') {
        const s = useCanvasStore.getState();
        if (s.mode === 'building' && s.buildingInputMethod === 'vertex') {
          e.preventDefault();
          s.clearVertexPoints();
          s.setMode('select');
        }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setIsPanning(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      container?.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [isPanning]);

  return (
    <Stage
      ref={stageRef}
      width={width}
      height={height}
      listening={true}
      onWheel={handleWheel}
      onTouchStart={(e) => {
        handleTouchStart(e);
        if (e.evt.touches.length === 1) handleStageMouseDown(e);
      }}
      onTouchMove={(e) => {
        handleTouchMove(e);
        if (e.evt.touches.length === 1) handleStageMouseMove(e);
      }}
      onTouchEnd={(e) => {
        handleTouchEnd();
        handleStageMouseUp(e);
      }}
      onMouseDown={(e) => { handleMouseDown(e); handleStageMouseDown(e); }}
      onMouseMove={(e) => { handleMouseMove(e); handleStageMouseMove(e); }}
      onMouseUp={(e) => { handleMouseUp(e); handleStageMouseUp(e); }}
      style={{ touchAction: 'none', cursor: isPanning ? 'grab' : 'default' }}
    >
      {/* キャンバス背景（ビューポート全体） */}
      <Layer listening={false}>
        <Rect
          x={0}
          y={0}
          width={width}
          height={height}
          fill={colorCanvasBg}
        />
      </Layer>

      {/* グリッド線（キャンバス全体の背景として描画） */}
      <Layer listening={false}>
        {gridLines()}
        {gridGuideLines()}
      </Layer>

      {/* 建物レイヤー（グリッドの上） */}
      <BuildingLayer />

      {/* 障害物レイヤー */}
      <ObstacleLayer />

      {/* 足場部材レイヤー（手摺・支柱・アンチ） */}
      <ScaffoldLayer />

      {/* 寸法線レイヤー（離れ寸法） */}
      <DimensionLayer />

      {/* 寸法線レイヤー（方位別スパン寸法） */}
      <DimensionLineLayer visible={showDimensionLines} />

      {/* メモレイヤー */}
      <MemoLayer />

      {/* 手摺プレビュー＋スナップインジケーター */}
      {(handrailPreview || snapPoint) && (
        <Layer listening={false}>
          {handrailPreview && (() => {
            const gridPx = INITIAL_GRID_PX * zoom;
            const sx = handrailPreview.x * gridPx + panX;
            const sy = handrailPreview.y * gridPx + panY;
            const lenGrid = mmToGrid(handrailPreview.lengthMm);
            const ex = handrailPreview.direction === 'horizontal' ? sx + lenGrid * gridPx : sx;
            const ey = handrailPreview.direction === 'vertical' ? sy + lenGrid * gridPx : sy;
            return (
              <Line
                points={[sx, sy, ex, ey]}
                stroke="#378ADD"
                strokeWidth={3}
                opacity={0.4}
                lineCap="round"
                dash={[8, 4]}
              />
            );
          })()}
          {snapPoint && (
            <>
              <Circle
                x={snapPoint.x * INITIAL_GRID_PX * zoom + panX}
                y={snapPoint.y * INITIAL_GRID_PX * zoom + panY}
                radius={8}
                fill="rgba(239, 68, 68, 0.3)"
                stroke="#EF4444"
                strokeWidth={2}
              />
              <Circle
                x={snapPoint.x * INITIAL_GRID_PX * zoom + panX}
                y={snapPoint.y * INITIAL_GRID_PX * zoom + panY}
                radius={3}
                fill="#EF4444"
              />
            </>
          )}
        </Layer>
      )}

      {/* 障害物プレビュー */}
      {obstaclePreview && (
        <Layer listening={false}>
          {(() => {
            const gridPx = INITIAL_GRID_PX * zoom;
            const sx = obstaclePreview.x * gridPx + panX;
            const sy = obstaclePreview.y * gridPx + panY;
            const w = obstaclePreview.widthGrid * gridPx;
            const h = obstaclePreview.heightGrid * gridPx;
            const colors: Record<string, string> = {
              ecocute: '#B5D4F4', aircon: '#C0DD97', bay_window: '#FAC775',
              carport: '#CECBF6', sunroom: '#F5C4B3', custom_rect: '#D3D1C7', custom_circle: '#D3D1C7',
            };
            const labels: Record<string, string> = {
              ecocute: 'ECO', aircon: '室外機', bay_window: '出窓',
              carport: 'CP', sunroom: 'SR', custom_rect: '', custom_circle: '',
            };
            const color = colors[obstaclePreview.type] || '#D3D1C7';
            const isCircle = obstaclePreview.type === 'custom_circle';
            const label = labels[obstaclePreview.type] || '';

            if (isCircle) {
              const r = Math.max(w, h) / 2;
              return (
                <>
                  <Circle x={sx + r} y={sy + r} radius={r} fill={color} opacity={0.5} stroke={color} strokeWidth={1.5} />
                  {label && <Text x={sx} y={sy + r - 5} width={w} align="center" text={label} fontSize={Math.max(8, 9 * zoom)} fill="#333" />}
                </>
              );
            }
            return (
              <>
                <Rect x={sx} y={sy} width={w} height={h} fill={color} opacity={0.5} stroke={color} strokeWidth={1.5} cornerRadius={2} />
                {label && <Text x={sx + 2} y={sy + 2} text={label} fontSize={Math.max(8, 9 * zoom)} fill="#333" />}
              </>
            );
          })()}
        </Layer>
      )}

      {/* 印刷枠ガイド（ドラッグ移動可能） */}
      {showPrintArea && (() => {
        const area = getPrintAreaGrid(printPaperSize, printScale);
        if (!area) return null;
        // 建物と同じ座標変換: gridCoord * INITIAL_GRID_PX * zoom + pan
        const gridPx = INITIAL_GRID_PX * zoom;
        // 中心座標（グリッド単位）
        let centerGrid: { x: number; y: number };
        if (printAreaCenter) {
          centerGrid = printAreaCenter;
        } else {
          if (canvasData.buildings.length > 0) {
            let bMinX = Infinity, bMinY = Infinity, bMaxX = -Infinity, bMaxY = -Infinity;
            for (const b of canvasData.buildings)
              for (const p of b.points) {
                if (p.x < bMinX) bMinX = p.x; if (p.y < bMinY) bMinY = p.y;
                if (p.x > bMaxX) bMaxX = p.x; if (p.y > bMaxY) bMaxY = p.y;
              }
            centerGrid = { x: (bMinX + bMaxX) / 2, y: (bMinY + bMaxY) / 2 };
          } else {
            centerGrid = { x: (width / 2 - panX) / gridPx, y: (height / 2 - panY) / gridPx };
          }
        }
        // 印刷枠サイズはズームに追従する（グリッド数 × 1グリッドのピクセルサイズ）
        // INITIAL_GRID_PX はズーム1.0のときの1グリッドのピクセルサイズ
        const pw = area.widthGrid * INITIAL_GRID_PX * zoom;
        const ph = area.heightGrid * INITIAL_GRID_PX * zoom;
        const px = centerGrid.x * gridPx + panX - pw / 2;
        const py = centerGrid.y * gridPx + panY - ph / 2;

        // デバッグ: 建物の最初の頂点のスクリーン座標も出力
        const bldPt0 = canvasData.buildings[0]?.points[0];
        console.log('[PrintArea]', {
          widthGrid: area.widthGrid,
          heightGrid: area.heightGrid,
          INITIAL_GRID_PX,
          zoom,
          gridPx,
          pw, ph,
          panX, panY,
          centerX: centerGrid.x,
          centerY: centerGrid.y,
          rectX: px, rectY: py,
          bldPt0Grid: bldPt0 ? `(${bldPt0.x},${bldPt0.y})` : 'none',
          bldPt0Screen: bldPt0 ? `(${bldPt0.x * gridPx + panX}, ${bldPt0.y * gridPx + panY})` : 'none',
        });

        return (
          <Layer>
            <Rect x={px} y={py} width={pw} height={ph}
              stroke="#EF4444" strokeWidth={1.5} dash={[8, 4]}
              draggable
              onDragEnd={(e) => {
                const newCenterX = (e.target.x() + pw / 2 - panX) / gridPx;
                const newCenterY = (e.target.y() + ph / 2 - panY) / gridPx;
                setPrintAreaCenter({ x: Math.round(newCenterX), y: Math.round(newCenterY) });
              }}
            />
            <Text x={px + 4} y={py + 4}
              text={`${printPaperSize.replace('_', ' ')} S=${printScale}`}
              fontSize={11} fill="#EF4444" listening={false} />
          </Layer>
        );
      })()}

      {/* 頂点タップ建物入力プレビュー */}
      {mode === 'building' && buildingInputMethod === 'vertex' && vertexPoints.length > 0 && (
        <Layer listening={false}>
          {(() => {
            const gridPx = INITIAL_GRID_PX * zoom;
            const screenPts = vertexPoints.map(p => ({
              x: p.x * gridPx + panX,
              y: p.y * gridPx + panY,
            }));
            const flatPts = screenPts.flatMap(p => [p.x, p.y]);
            const first = screenPts[0];
            return (
              <>
                {/* 辺の線 */}
                <Line points={flatPts} stroke="#378ADD" strokeWidth={2} opacity={0.6} />
                {/* 始点に戻る破線（3点以上） */}
                {screenPts.length >= 3 && (
                  <Line
                    points={[screenPts[screenPts.length - 1].x, screenPts[screenPts.length - 1].y, first.x, first.y]}
                    stroke="#378ADD" strokeWidth={1.5} opacity={0.3} dash={[6, 4]}
                  />
                )}
                {/* 各頂点のドット */}
                {screenPts.map((p, i) => (
                  <Circle key={i} x={p.x} y={p.y} radius={i === 0 ? 8 : 5}
                    fill={i === 0 ? '#EF4444' : '#378ADD'}
                    stroke={i === 0 ? '#fff' : undefined}
                    strokeWidth={i === 0 ? 2 : 0}
                  />
                ))}
                {/* 始点ラベル */}
                <Text x={first.x + 10} y={first.y - 10}
                  text="始点" fontSize={12} fill="#EF4444" />
                {/* 頂点数表示 */}
                <Text x={screenPts[screenPts.length - 1].x + 10} y={screenPts[screenPts.length - 1].y - 10}
                  text={`${screenPts.length}点`} fontSize={11} fill="#378ADD" />
              </>
            );
          })()}
        </Layer>
      )}

      {/* 寸法計測オーバーレイ */}
      {isMeasuring && measurePoint1 && (
        <Layer listening={false}>
          {(() => {
            const gridPx = INITIAL_GRID_PX * zoom;
            const p1x = measurePoint1.x * gridPx + panX;
            const p1y = measurePoint1.y * gridPx + panY;

            const cursor = measureCursor;
            const p2x = cursor ? cursor.x * gridPx + panX : p1x;
            const p2y = cursor ? cursor.y * gridPx + panY : p1y;

            // リアルタイム距離（mm）
            const dx = cursor ? (cursor.x - measurePoint1.x) * 10 : 0;
            const dy = cursor ? (cursor.y - measurePoint1.y) * 10 : 0;
            const distMm = Math.round(Math.sqrt(dx * dx + dy * dy));

            // ラベル位置（中間点の少し上）
            const midX = (p1x + p2x) / 2;
            const midY = (p1y + p2y) / 2 - 14;

            return (
              <>
                {/* 破線 */}
                {cursor && (
                  <Line
                    points={[p1x, p1y, p2x, p2y]}
                    stroke="#EF4444"
                    strokeWidth={1.5}
                    dash={[6, 4]}
                    opacity={0.8}
                  />
                )}
                {/* 1点目 赤● */}
                <Circle x={p1x} y={p1y} radius={6} fill="#EF4444" />
                <Circle x={p1x} y={p1y} radius={2.5} fill="white" />
                {/* 距離ラベル */}
                {cursor && distMm > 0 && (
                  <Text
                    x={midX}
                    y={midY}
                    text={`${distMm}mm`}
                    fontSize={12}
                    fontFamily="monospace"
                    fontStyle="bold"
                    fill="#EF4444"
                    offsetX={(`${distMm}mm`.length * 7) / 2}
                    offsetY={0}
                  />
                )}
              </>
            );
          })()}
        </Layer>
      )}

      {/* 範囲選択矩形 */}
      {selectionRect && (
        <Layer listening={false}>
          <Rect
            x={selectionRect.x * INITIAL_GRID_PX * zoom + panX}
            y={selectionRect.y * INITIAL_GRID_PX * zoom + panY}
            width={selectionRect.w * INITIAL_GRID_PX * zoom}
            height={selectionRect.h * INITIAL_GRID_PX * zoom}
            fill="rgba(55, 138, 221, 0.15)"
            stroke="#378ADD"
            strokeWidth={1}
            dash={[4, 4]}
          />
        </Layer>
      )}
    </Stage>
  );
}
