'use client';

import { useCallback, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import Konva from 'konva';
import { useCanvasStore } from '@/stores/canvasStore';
import { screenToGrid, INITIAL_GRID_PX, mmToGrid } from './gridUtils';
import { snapToHandrail, snapHandrailPlacement } from './snapUtils';
import { Point, Handrail, HandrailDirection } from '@/types';

const SNAP_PX = 80;

function snapRadiusGrid(zoom: number) {
  return Math.max(Math.round(SNAP_PX / (INITIAL_GRID_PX * zoom)), 5);
}

/** カーソル位置にスナップを適用して返す（始点+終点の両方チェック） */
function applySnap(pos: Point, direction?: 'horizontal' | 'vertical'): Point {
  const s = useCanvasStore.getState();
  if (s.mode !== 'handrail' && s.mode !== 'anti') return pos;

  const radius = snapRadiusGrid(s.zoom);
  const dir = direction || 'horizontal';
  const result = snapHandrailPlacement(pos, s.selectedHandrailLength, dir, s.canvasData.handrails, radius, s.canvasData.antis);
  if (result) {
    s.setSnapPoint(result.snapIndicator);
    return result.snappedStart;
  }
  s.setSnapPoint(null);
  return pos;
}

export function useCanvasInteraction() {
  const dragStart = useRef<Point | null>(null);
  const isDragging = useRef(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isLongPress, setIsLongPress] = useState(false);
  const [selectionRect, setSelectionRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  // 画面座標をグリッド座標に変換
  const toGrid = useCallback(
    (stage: Konva.Stage, evt: { clientX: number; clientY: number }) => {
      const rect = stage.container().getBoundingClientRect();
      const s = useCanvasStore.getState();
      return screenToGrid(evt.clientX - rect.left, evt.clientY - rect.top, s.panX, s.panY, s.zoom);
    },
    []
  );

  const handleStageMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      if ('touches' in e.evt && (e.evt as TouchEvent).touches.length >= 2) return;
      if ('button' in e.evt && ((e.evt as MouseEvent).button === 1 || (e.evt as MouseEvent).button === 2)) return;

      const stage = e.target.getStage();
      if (!stage) return;

      const clientPos =
        'touches' in e.evt
          ? { clientX: (e.evt as TouchEvent).touches[0].clientX, clientY: (e.evt as TouchEvent).touches[0].clientY }
          : { clientX: (e.evt as MouseEvent).clientX, clientY: (e.evt as MouseEvent).clientY };

      const rawPos = toGrid(stage, clientPos);
      const s = useCanvasStore.getState();

      // 寸法計測モード
      if (s.isMeasuring) {
        if (!s.measurePoint1) {
          s.setMeasurePoint1(rawPos);
        } else {
          const dx = (rawPos.x - s.measurePoint1.x) * 10;
          const dy = (rawPos.y - s.measurePoint1.y) * 10;
          s.setMeasureResultMm(Math.round(Math.sqrt(dx * dx + dy * dy)));
          s.setMeasurePoint1(null);
          s.setMeasureCursor(null);
        }
        return;
      }

      // 手摺モード: ドラッグ開始点をスナップ
      const gridPos = applySnap(rawPos);

      dragStart.current = gridPos;
      isDragging.current = false;

      // select モード: 長押し検出
      if (s.mode === 'select') {
        longPressTimer.current = setTimeout(() => setIsLongPress(true), 500);
      }

      // post モード
      if (s.mode === 'post') {
        const snapped = snapToHandrail(rawPos, s.canvasData.handrails, snapRadiusGrid(s.zoom));
        s.addPost({ id: uuidv4(), x: (snapped || rawPos).x, y: (snapped || rawPos).y });
      }

      // memo モード
      if (s.mode === 'memo') {
        const text = prompt('メモを入力:');
        if (text) s.addMemo({ id: uuidv4(), x: rawPos.x, y: rawPos.y, text, style: 'plain' });
      }

      // obstacle モード
      if (s.mode === 'obstacle') {
        const obstacleDefaults: Record<string, { w: number; h: number }> = {
          ecocute: { w: mmToGrid(460), h: mmToGrid(1100) },
          aircon: { w: mmToGrid(800), h: mmToGrid(300) },
          bay_window: { w: mmToGrid(1600), h: mmToGrid(600) },
          carport: { w: mmToGrid(2700), h: mmToGrid(5000) },
          sunroom: { w: mmToGrid(2000), h: mmToGrid(1500) },
          custom_rect: { w: mmToGrid(1000), h: mmToGrid(1000) },
          custom_circle: { w: mmToGrid(800), h: mmToGrid(800) },
        };
        const type = 'aircon';
        const size = obstacleDefaults[type] || { w: 100, h: 100 };
        s.addObstacle({
          id: uuidv4(), type,
          x: rawPos.x - Math.round(size.w / 2), y: rawPos.y - Math.round(size.h / 2),
          width: size.w, height: size.h,
        });
      }

      // erase モード
      if (s.mode === 'erase') {
        const target = e.target;
        if (target !== stage && target.id()) s.removeElement(target.id());
      }

      // select モード
      if (s.mode === 'select' && !isLongPress) {
        const target = e.target;
        if (target === stage) s.setSelectedIds([]);
        else if (target.id()) s.setSelectedIds([target.id()]);
      }
    },
    [toGrid, isLongPress]
  );

  const handleStageMouseMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      if ('touches' in e.evt && (e.evt as TouchEvent).touches.length >= 2) return;

      const stage = e.target.getStage();
      if (!stage) return;

      const clientPos =
        'touches' in e.evt
          ? { clientX: (e.evt as TouchEvent).touches[0].clientX, clientY: (e.evt as TouchEvent).touches[0].clientY }
          : { clientX: (e.evt as MouseEvent).clientX, clientY: (e.evt as MouseEvent).clientY };

      const s = useCanvasStore.getState();

      // 寸法計測モード
      if (s.isMeasuring && s.measurePoint1) {
        s.setMeasureCursor(toGrid(stage, clientPos));
        return;
      }

      if (!dragStart.current) return;
      isDragging.current = true;

      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }

      const gridPos = toGrid(stage, clientPos);

      // 手摺モード: ドラッグ中もスナップしてプレビュー表示
      if (s.mode === 'handrail' && dragStart.current) {
        const dx = Math.abs(gridPos.x - dragStart.current.x);
        const dy = Math.abs(gridPos.y - dragStart.current.y);
        if (dx > 2 || dy > 2) {
          const direction: 'horizontal' | 'vertical' = dx >= dy ? 'horizontal' : 'vertical';
          // ドラッグ開始点を始点+終点の両方でスナップ
          const snappedStart = applySnap(dragStart.current, direction);
          dragStart.current = snappedStart;

          s.setHandrailPreview({
            x: snappedStart.x,
            y: snappedStart.y,
            lengthMm: s.selectedHandrailLength,
            direction,
          });
        }
      }

      // select + longPress: 範囲選択矩形
      if (s.mode === 'select' && isLongPress) {
        setSelectionRect({
          x: Math.min(dragStart.current.x, gridPos.x),
          y: Math.min(dragStart.current.y, gridPos.y),
          w: Math.abs(gridPos.x - dragStart.current.x),
          h: Math.abs(gridPos.y - dragStart.current.y),
        });
      }

      // erase モード
      if (s.mode === 'erase') {
        const target = e.target;
        if (target !== stage && target.id()) s.removeElement(target.id());
      }
    },
    [toGrid, isLongPress]
  );

  const handleStageMouseUp = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }

      const stage = e.target.getStage();
      if (!stage) return;

      const clientPos =
        'changedTouches' in e.evt
          ? { clientX: (e.evt as TouchEvent).changedTouches[0].clientX, clientY: (e.evt as TouchEvent).changedTouches[0].clientY }
          : { clientX: (e.evt as MouseEvent).clientX, clientY: (e.evt as MouseEvent).clientY };

      const gridPos = toGrid(stage, clientPos);
      const s = useCanvasStore.getState();

      // 手摺モード: ドラッグで配置（始点+終点の両方でスナップ）
      if (s.mode === 'handrail' && dragStart.current && isDragging.current) {
        const start = dragStart.current;
        const dx = Math.abs(gridPos.x - start.x);
        const dy = Math.abs(gridPos.y - start.y);

        if (dx > 2 || dy > 2) {
          const direction: 'horizontal' | 'vertical' = dx >= dy ? 'horizontal' : 'vertical';
          const radius = snapRadiusGrid(s.zoom);

          const result = snapHandrailPlacement(start, s.selectedHandrailLength, direction, s.canvasData.handrails, radius, s.canvasData.antis);
          const placePos = result ? result.snappedStart : start;

          if (result) {
            s.setSnapPoint(result.snapIndicator);
            setTimeout(() => useCanvasStore.getState().setSnapPoint(null), 400);
          }

          s.addHandrail({
            id: uuidv4(),
            x: placePos.x,
            y: placePos.y,
            lengthMm: s.selectedHandrailLength,
            direction,
            color: '#185FA5',
          });
        }
      }
      s.setHandrailPreview(null);
      if (!s.snapPoint) s.setSnapPoint(null);

      // アンチモード
      if (s.mode === 'anti' && dragStart.current) {
        const start = dragStart.current;
        const dx = Math.abs(gridPos.x - start.x);
        const dy = Math.abs(gridPos.y - start.y);
        s.addAnti({
          id: uuidv4(),
          x: Math.min(start.x, gridPos.x), y: Math.min(start.y, gridPos.y),
          width: s.selectedAntiWidth, lengthMm: s.selectedAntiLength,
          direction: dx >= dy ? 'horizontal' : 'vertical',
        });
      }

      // 範囲選択完了
      if (s.mode === 'select' && isLongPress && selectionRect) {
        const rect = selectionRect;
        const ids: string[] = [];
        s.canvasData.handrails.forEach((h) => {
          if (h.x >= rect.x && h.y >= rect.y && h.x <= rect.x + rect.w && h.y <= rect.y + rect.h) ids.push(h.id);
        });
        s.canvasData.posts.forEach((p) => {
          if (p.x >= rect.x && p.y >= rect.y && p.x <= rect.x + rect.w && p.y <= rect.y + rect.h) ids.push(p.id);
        });
        s.canvasData.antis.forEach((a) => {
          if (a.x >= rect.x && a.y >= rect.y && a.x <= rect.x + rect.w && a.y <= rect.y + rect.h) ids.push(a.id);
        });
        s.setSelectedIds(ids);
        setSelectionRect(null);
      }

      setIsLongPress(false);
      dragStart.current = null;
      isDragging.current = false;
    },
    [toGrid, isLongPress, selectionRect]
  );

  return {
    handleStageMouseDown,
    handleStageMouseMove,
    handleStageMouseUp,
    selectionRect,
  };
}
