'use client';

import React, { useRef, useCallback, useEffect, useState, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Stage, Layer, Line, Rect, Circle, Text, Path, Group, Ellipse, Arc } from 'react-konva';
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
import KidareLayer from './KidareLayer';
import CompassWidget from './CompassWidget';
import { useCanvasInteraction } from '@/lib/konva/useCanvasInteraction';
import { mmToGrid } from '@/lib/konva/gridUtils';
import { getAllExistingVertices } from '@/lib/konva/snapUtils';
import { getPrintAreaGrid } from '@/lib/export/pdfExport';

type Props = {
  width: number;
  height: number;
  showDimensionLines?: boolean;
};

export default function GridCanvas({ width, height, showDimensionLines = false }: Props) {
  const stageRef = useRef<Konva.Stage>(null);
  const { zoom, panX, panY, setZoom, setPan, mode, canvasData, handrailPreview, snapPoint, obstaclePreview, isMeasuring, measurePoint1, measurePoint2, measureCursor, measureResultMm, buildingInputMethod, showGridGuide, showPrintArea, printPaperSize, printScale, printAreaCenter, setPrintAreaCenter, isDarkMode, building2FDraft, memoDraft, directionPoints, lastMoveDirection, showDirectionGuide } = useCanvasStore();

  const colorCanvasBg = isDarkMode ? '#0a0a0a' : '#f5f4f0';
  const colorGridMinor = isDarkMode ? 'rgba(0,255,65,0.15)' : '#e5e4e0';
  const colorGridMajor = isDarkMode ? 'rgba(0,255,65,0.35)' : '#d0cfcb';
  const { handleStageMouseDown, handleStageMouseMove, handleStageMouseUp, selectionRect } = useCanvasInteraction();

  // ピンチズーム用
  const lastDist = useRef<number>(0);
  const lastCenter = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const isPinching = useRef(false);
  const [isPanning, setIsPanning] = useState(false);
  const [draft2FPos, setDraft2FPos] = useState<{ x: number; y: number } | null>(null);
  const [memoCursorPos, setMemoCursorPos] = useState<{ x: number; y: number } | null>(null);
  const panInitialized = useRef(false);

  // 十字ガイド用: 全頂点のユニークX/Y（建物+障害物+directionPoints）
  const guideXs = useMemo(() => {
    if (!showDirectionGuide || buildingInputMethod !== 'direction' || directionPoints.length === 0) return [];
    const verts = getAllExistingVertices(canvasData.buildings, canvasData.obstacles);
    verts.push(...directionPoints);
    return Array.from(new Set(verts.map(v => v.x)));
  }, [showDirectionGuide, buildingInputMethod, directionPoints, canvasData.buildings, canvasData.obstacles]);

  const guideYs = useMemo(() => {
    if (!showDirectionGuide || buildingInputMethod !== 'direction' || directionPoints.length === 0) return [];
    const verts = getAllExistingVertices(canvasData.buildings, canvasData.obstacles);
    verts.push(...directionPoints);
    return Array.from(new Set(verts.map(v => v.y)));
  }, [showDirectionGuide, buildingInputMethod, directionPoints, canvasData.buildings, canvasData.obstacles]);
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
        const s = useCanvasStore.getState();
        s.undo();
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
      onMouseDown={(e) => {
        if (building2FDraft && draft2FPos) {
          const finalPoints = building2FDraft.points.map(p => ({
            x: p.x + draft2FPos.x,
            y: p.y + draft2FPos.y,
          }));
          useCanvasStore.getState().addBuilding({
            id: uuidv4(),
            type: 'polygon',
            points: finalPoints,
            fill: building2FDraft.fill,
            floor: 2,
            roof: building2FDraft.roof,
            templateId: building2FDraft.templateId,
            templateDims: building2FDraft.templateDims,
          });
          useCanvasStore.getState().clearBuilding2FDraft();
          setDraft2FPos(null);
          return;
        }
        handleMouseDown(e); handleStageMouseDown(e);
      }}
      onMouseMove={(e) => {
        if (building2FDraft) {
          const stage = e.target.getStage();
          if (!stage) return;
          const s = useCanvasStore.getState();
          const pointer = stage.getPointerPosition();
          if (!pointer) return;
          const gridX = Math.round((pointer.x - s.panX) / (INITIAL_GRID_PX * s.zoom));
          const gridY = Math.round((pointer.y - s.panY) / (INITIAL_GRID_PX * s.zoom));
          let snapX = gridX, snapY = gridY;
          const STRONG_SNAP = 15;  // 頂点スナップ
          const WEAK_SNAP = 8;     // 辺スナップ
          let bestDist = Infinity;

          for (const b of s.canvasData.buildings.filter(b => !b.floor || b.floor === 1)) {
            // 頂点への強スナップ
            for (const p of b.points) {
              const d = Math.hypot(p.x - gridX, p.y - gridY);
              if (d < STRONG_SNAP && d < bestDist) {
                bestDist = d;
                snapX = p.x; snapY = p.y;
              }
            }

            // 辺への弱スナップ（頂点スナップが優先）
            if (bestDist >= STRONG_SNAP) {
              const n = b.points.length;
              for (let i = 0; i < n; i++) {
                const p1 = b.points[i];
                const p2 = b.points[(i + 1) % n];
                const dx = p2.x - p1.x, dy = p2.y - p1.y;
                const len2 = dx * dx + dy * dy;
                if (len2 < 0.01) continue;
                const t = Math.max(0, Math.min(1, ((gridX - p1.x) * dx + (gridY - p1.y) * dy) / len2));
                const projX = p1.x + t * dx;
                const projY = p1.y + t * dy;
                const d = Math.hypot(gridX - projX, gridY - projY);
                if (d < WEAK_SNAP && d < bestDist) {
                  bestDist = d;
                  if (Math.abs(dy) < Math.abs(dx)) {
                    snapX = gridX; snapY = Math.round(projY);
                  } else {
                    snapX = Math.round(projX); snapY = gridY;
                  }
                }
              }
            }
          }
          setDraft2FPos({ x: snapX, y: snapY });
          return;
        }
        if (memoDraft) {
          const stage = e.target.getStage();
          if (!stage) return;
          const s = useCanvasStore.getState();
          const pointer = stage.getPointerPosition();
          if (!pointer) return;
          const gridX = Math.round((pointer.x - s.panX) / (INITIAL_GRID_PX * s.zoom));
          const gridY = Math.round((pointer.y - s.panY) / (INITIAL_GRID_PX * s.zoom));
          setMemoCursorPos({ x: gridX, y: gridY });
          return;
        }
        handleMouseMove(e); handleStageMouseMove(e);
      }}
      onMouseUp={(e) => { handleMouseUp(e); handleStageMouseUp(e); }}
      style={{ touchAction: 'none', cursor: building2FDraft || memoDraft ? 'crosshair' : isPanning ? 'grab' : 'default' }}
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

      {/* 離れ表示レイヤー */}
      <KidareLayer />

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
            const dir = handrailPreview.direction;
            let ex: number, ey: number;
            if (dir === 'horizontal') { ex = sx + lenGrid * gridPx; ey = sy; }
            else if (dir === 'vertical') { ex = sx; ey = sy + lenGrid * gridPx; }
            else { const rad = dir * (Math.PI / 180); ex = sx + Math.round(lenGrid * Math.cos(rad)) * gridPx; ey = sy + Math.round(lenGrid * Math.sin(rad)) * gridPx; }
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

      {/* 2Fドラフトプレビュー */}
      {building2FDraft && draft2FPos && (
        <Layer listening={false}>
          {(() => {
            const gridPx = INITIAL_GRID_PX * zoom;
            const pts = building2FDraft.points.map(p => ({
              x: (p.x + draft2FPos.x) * gridPx + panX,
              y: (p.y + draft2FPos.y) * gridPx + panY,
            }));
            const flatPts = pts.flatMap(p => [p.x, p.y]);
            return (
              <Line
                points={flatPts}
                closed
                fill="rgba(90, 90, 122, 0.5)"
                stroke="#8888aa"
                strokeWidth={2}
                dash={[6, 4]}
              />
            );
          })()}
        </Layer>
      )}

      {/* メモドラフトプレビュー */}
      {memoDraft && memoCursorPos && (
        <Layer listening={false}>
          {(() => {
            const gridPx = INITIAL_GRID_PX * zoom;
            const sx = memoCursorPos.x * gridPx + panX;
            const sy = memoCursorPos.y * gridPx + panY;
            const scX = memoDraft.scaleX;
            const scY = memoDraft.scaleY;
            const fontSize = Math.max(10, 12 * zoom) * Math.min(scX, scY);
            const lines = memoDraft.text.split('\n');
            const maxLineLen = Math.max(...lines.map(l => l.length));
            const w = Math.max(80, maxLineLen * fontSize * 0.6 + 24);
            const h = Math.max(40, lines.length * (fontSize + 4) + 16);

            const shapePaths: Record<string, string> = {
              rect: `M8 0 H${w-8} Q${w} 0 ${w} 8 V${h-8} Q${w} ${h} ${w-8} ${h} H8 Q0 ${h} 0 ${h-8} V8 Q0 0 8 0 Z`,
              cloud: (() => { const r = h/3; return `M${r} ${h/2} Q${r} 0 ${w/3} ${r} Q${w/2} 0 ${w*2/3} ${r} Q${w-r} 0 ${w-r} ${h/2} Q${w} ${h} ${w-r} ${h*3/4} Q${w*2/3} ${h} ${w/2} ${h*3/4} Q${w/3} ${h} ${r} ${h*3/4} Q0 ${h} ${r} ${h/2} Z`; })(),
              circle: `M${w/2} 0 A${w/2} ${h/2} 0 1 1 ${w/2} ${h} A${w/2} ${h/2} 0 1 1 ${w/2} 0 Z`,
              speech: `M8 0 H${w-8} Q${w} 0 ${w} 8 V${h-16} Q${w} ${h-8} ${w-8} ${h-8} H${w/2+10} L${w/2} ${h} L${w/2-4} ${h-8} H8 Q0 ${h-8} 0 ${h-16} V8 Q0 0 8 0 Z`,
            };

            return (
              <Group x={sx} y={sy} rotation={memoDraft.angle} offsetX={w / 2} offsetY={h / 2} opacity={0.6}>
                <Path
                  data={shapePaths[memoDraft.shape] || shapePaths.rect}
                  fill="rgba(55, 138, 221, 0.2)"
                  stroke="#378ADD"
                  strokeWidth={2}
                  dash={[6, 4]}
                />
                <Text
                  x={0} y={0} width={w} height={h}
                  text={memoDraft.text}
                  fontSize={fontSize}
                  fill="#378ADD"
                  align="center"
                  verticalAlign="middle"
                />
              </Group>
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

      {/* 壁方向入力プレビュー */}
      {mode === 'building' && buildingInputMethod === 'direction' && directionPoints.length > 0 && (
        <>
          <Layer listening={false}>
            {(() => {
              const gridPx = INITIAL_GRID_PX * zoom;
              const screenPts = directionPoints.map(p => ({
                x: p.x * gridPx + panX,
                y: p.y * gridPx + panY,
              }));
              const flatPts = screenPts.flatMap(p => [p.x, p.y]);
              const first = screenPts[0];
              return (
                <>
                  {/* ガイド線（全頂点のユニークX/Yから） */}
                  {guideXs.map((gx, i) => {
                    const sx = gx * gridPx + panX;
                    if (sx < -10 || sx > width + 10) return null;
                    return <Line key={`gx-${i}`} points={[sx, 0, sx, height]} stroke="#F97316" strokeWidth={1} opacity={0.5} dash={[6, 6]} listening={false} />;
                  })}
                  {guideYs.map((gy, i) => {
                    const sy = gy * gridPx + panY;
                    if (sy < -10 || sy > height + 10) return null;
                    return <Line key={`gy-${i}`} points={[0, sy, width, sy]} stroke="#F97316" strokeWidth={1} opacity={0.5} dash={[6, 6]} listening={false} />;
                  })}
                  <Line points={flatPts} stroke="#3B82F6" strokeWidth={5} opacity={1} />
                  {screenPts.length >= 3 && (
                    <Line
                      points={[screenPts[screenPts.length - 1].x, screenPts[screenPts.length - 1].y, first.x, first.y]}
                      stroke="#3B82F6" strokeWidth={3} opacity={0.4} dash={[6, 4]}
                    />
                  )}
                  {screenPts.map((p, i) => (
                    <Circle key={i} x={p.x} y={p.y} radius={i === 0 ? 9 : 7}
                      fill={i === 0 ? '#EF4444' : '#3B82F6'}
                      stroke="#fff"
                      strokeWidth={2.5}
                    />
                  ))}
                  <Text x={first.x + 10} y={first.y - 10}
                    text="始点" fontSize={12} fill="#EF4444" />
                  <Text x={screenPts[screenPts.length - 1].x + 10} y={screenPts[screenPts.length - 1].y - 10}
                    text={`${screenPts.length}点`} fontSize={11} fill="#378ADD" />
                </>
              );
            })()}
          </Layer>
          {/* 方向ボタン */}
          <Layer>
            {(() => {
              const gridPx = INITIAL_GRID_PX * zoom;
              const last = directionPoints[directionPoints.length - 1];
              const px = last.x * gridPx + panX;
              const py = last.y * gridPx + panY;
              const btnSize = 36;
              const btnDist = 50;

              const handleDirection = (dir: 'up' | 'down' | 'left' | 'right') => {
                useCanvasStore.getState().setPendingDirection(dir);
                useCanvasStore.getState().setShowDirectionInputModal(true);
              };

              return (
                <>
                  {/* トップダウン視点キャラ */}
                  <Group x={px} y={py} rotation={{ down: 180, left: 270, up: 0, right: 90 }[lastMoveDirection]} listening={false}>
                    <Circle x={0} y={0} radius={14} fill="#F59E0B" />
                    <Circle x={0} y={0} radius={10} fill="#FBBF77" />
                    <Arc x={0} y={0} innerRadius={0} outerRadius={10} angle={180} rotation={180} fill="#78350F" />
                    <Circle x={-9} y={5} radius={6} fill="#3B82F6" />
                    <Circle x={9} y={5} radius={6} fill="#3B82F6" />
                    <Ellipse x={0} y={6} radiusX={10} radiusY={7} fill="#3B82F6" />
                    <Circle x={-3.5} y={0} radius={1.2} fill="#000" />
                    <Circle x={3.5} y={0} radius={1.2} fill="#000" />
                  </Group>
                  {/* ↑ */}
                  <Rect x={px - btnSize/2} y={py - btnDist - btnSize} width={btnSize} height={btnSize}
                    fill="#378ADD" cornerRadius={8} shadowBlur={5} shadowOpacity={0.3}
                    onClick={() => handleDirection('up')} onTap={() => handleDirection('up')} />
                  <Text x={px - 10} y={py - btnDist - btnSize + 8} text="↑" fontSize={20} fill="white" fontStyle="bold" listening={false} />
                  {/* ↓ */}
                  <Rect x={px - btnSize/2} y={py + btnDist} width={btnSize} height={btnSize}
                    fill="#378ADD" cornerRadius={8} shadowBlur={5} shadowOpacity={0.3}
                    onClick={() => handleDirection('down')} onTap={() => handleDirection('down')} />
                  <Text x={px - 10} y={py + btnDist + 8} text="↓" fontSize={20} fill="white" fontStyle="bold" listening={false} />
                  {/* ← */}
                  <Rect x={px - btnDist - btnSize} y={py - btnSize/2} width={btnSize} height={btnSize}
                    fill="#378ADD" cornerRadius={8} shadowBlur={5} shadowOpacity={0.3}
                    onClick={() => handleDirection('left')} onTap={() => handleDirection('left')} />
                  <Text x={px - btnDist - btnSize + 10} y={py - 10} text="←" fontSize={20} fill="white" fontStyle="bold" listening={false} />
                  {/* → */}
                  <Rect x={px + btnDist} y={py - btnSize/2} width={btnSize} height={btnSize}
                    fill="#378ADD" cornerRadius={8} shadowBlur={5} shadowOpacity={0.3}
                    onClick={() => handleDirection('right')} onTap={() => handleDirection('right')} />
                  <Text x={px + btnDist + 10} y={py - 10} text="→" fontSize={20} fill="white" fontStyle="bold" listening={false} />
                </>
              );
            })()}
          </Layer>
          {/* グリッド交点マーカー */}
          {showDirectionGuide && (
            <Layer>
              {(() => {
                const gridPx = INITIAL_GRID_PX * zoom;
                const last = directionPoints[directionPoints.length - 1];
                const cx = last.x;
                const cy = last.y;
                // 可視範囲をグリッド座標で算出
                const minGX = Math.floor(-panX / gridPx) - 1;
                const maxGX = Math.ceil((width - panX) / gridPx) + 1;
                const minGY = Math.floor(-panY / gridPx) - 1;
                const maxGY = Math.ceil((height - panY) / gridPx) + 1;

                const markers: { x: number; y: number }[] = [];
                // guideXs × guideYs の全組み合わせ（現在位置のみ除外）
                for (const x of guideXs) {
                  if (x < minGX || x > maxGX) continue;
                  for (const y of guideYs) {
                    if (y < minGY || y > maxGY) continue;
                    if (x === cx && y === cy) continue;
                    markers.push({ x, y });
                  }
                }
                // 密集対策: 300個超えたら非表示
                if (markers.length > 300) return null;

                const handleMarkerTap = (target: { x: number; y: number }) => {
                  const dx = target.x - cx;
                  const dy = target.y - cy;
                  let dir: 'up' | 'down' | 'left' | 'right';
                  if (Math.abs(dx) >= Math.abs(dy)) {
                    dir = dx > 0 ? 'right' : 'left';
                  } else {
                    dir = dy > 0 ? 'down' : 'up';
                  }
                  useCanvasStore.getState().setPendingDirection(dir);
                  useCanvasStore.getState().setPendingDirectionTarget(target);
                  useCanvasStore.getState().setShowDirectionInputModal(true);
                };
                return markers.map((m, i) => {
                  const sx = m.x * gridPx + panX;
                  const sy = m.y * gridPx + panY;
                  return (
                    <Circle
                      key={`gm-${i}`}
                      x={sx} y={sy}
                      radius={4}
                      fill="#F97316"
                      opacity={0.5}
                      hitStrokeWidth={12}
                      onClick={() => handleMarkerTap(m)}
                      onTap={() => handleMarkerTap(m)}
                    />
                  );
                });
              })()}
            </Layer>
          )}
        </>
      )}

      {/* 寸法計測オーバーレイ */}
      {isMeasuring && measurePoint1 && (
        <Layer listening={false}>
          {(() => {
            const gridPx = INITIAL_GRID_PX * zoom;
            const p1x = measurePoint1.x * gridPx + panX;
            const p1y = measurePoint1.y * gridPx + panY;

            // 確定済み2点目 or カーソル追従
            const endPoint = measurePoint2 || measureCursor;
            const p2x = endPoint ? endPoint.x * gridPx + panX : p1x;
            const p2y = endPoint ? endPoint.y * gridPx + panY : p1y;

            // 距離（mm）
            const dx = endPoint ? (endPoint.x - measurePoint1.x) * 10 : 0;
            const dy = endPoint ? (endPoint.y - measurePoint1.y) * 10 : 0;
            const distMm = measurePoint2 && measureResultMm !== null
              ? measureResultMm
              : Math.round(Math.sqrt(dx * dx + dy * dy));

            // ラベル位置（中間点の少し上）
            const midX = (p1x + p2x) / 2;
            const midY = (p1y + p2y) / 2 - 14;

            return (
              <>
                {/* 線 */}
                {endPoint && (
                  <Line
                    points={[p1x, p1y, p2x, p2y]}
                    stroke="#EF4444"
                    strokeWidth={measurePoint2 ? 2 : 1.5}
                    dash={measurePoint2 ? undefined : [6, 4]}
                    opacity={measurePoint2 ? 1 : 0.8}
                  />
                )}
                {/* 1点目 赤● */}
                <Circle x={p1x} y={p1y} radius={6} fill="#EF4444" />
                <Circle x={p1x} y={p1y} radius={2.5} fill="white" />
                {/* 2点目 赤● */}
                {endPoint && (
                  <>
                    <Circle x={p2x} y={p2y} radius={6} fill="#EF4444" />
                    <Circle x={p2x} y={p2y} radius={2.5} fill="white" />
                  </>
                )}
                {/* 距離ラベル */}
                {endPoint && distMm > 0 && (
                  <Text
                    x={midX}
                    y={midY}
                    text={`${distMm}mm`}
                    fontSize={measurePoint2 ? 14 : 12}
                    fontFamily="monospace"
                    fontStyle="bold"
                    fill="#EF4444"
                    offsetX={(`${distMm}mm`.length * (measurePoint2 ? 8 : 7)) / 2}
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
