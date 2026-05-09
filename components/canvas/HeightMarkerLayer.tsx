'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Layer, Circle, Text } from 'react-konva';
import Konva from 'konva';
import { useCanvasStore } from '@/stores/canvasStore';
import { INITIAL_GRID_PX } from '@/lib/konva/gridUtils';
import {
  getOutlinePolygon,
  projectPointToOutline,
  snapToCornersAndMidpoint,
} from '@/lib/konva/heightMarkerUtils';

const MARKER_COLOR = '#378ADD';
const LONG_PRESS_MS = 300;
const SNAP_PX = 10;
const PRESS_MOVE_THRESHOLD_PX = 10;

type DragInfo = {
  markerId: string;
  edgeIndex: number;
  t: number;
};

export default function HeightMarkerLayer() {
  const { canvasData, zoom, panX, panY, setHeightInputMarkerId, moveHeightMarker } = useCanvasStore();
  const gridPx = INITIAL_GRID_PX * zoom;
  const markers = canvasData.heightMarkers ?? [];

  const layerRef = useRef<Konva.Layer>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef(false);
  const wasDraggingRef = useRef(false);
  const dragMarkerIdRef = useRef<string | null>(null);
  const dragInfoRef = useRef<DragInfo | null>(null);

  // ドラッグ中の論理位置 (= 視覚フィードバック用 state、 dragEnd で 1 回 store 確定)
  const [dragInfo, setDragInfo] = useState<DragInfo | null>(null);

  const updateDragInfo = (info: DragInfo | null) => {
    dragInfoRef.current = info;
    setDragInfo(info);
  };

  // Stage の pointermove / pointerup を購読 (= GridCanvas 触らず Layer 内で完結)
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const stage = layer.getStage();
    if (!stage) return;

    const onStagePointerMove = () => {
      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      // 長押し成立前: 移動量で長押しキャンセル判定
      if (longPressTimerRef.current && pressStartPosRef.current) {
        const dist = Math.hypot(
          pointer.x - pressStartPosRef.current.x,
          pointer.y - pressStartPosRef.current.y,
        );
        if (dist > PRESS_MOVE_THRESHOLD_PX) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
          pressStartPosRef.current = null;
        }
      }

      // 長押し成立後 (= ドラッグ中): 射影 + スナップ
      if (isDraggingRef.current && dragMarkerIdRef.current) {
        const marker = (canvasData.heightMarkers ?? []).find((m) => m.id === dragMarkerIdRef.current);
        if (!marker) return;
        const building = canvasData.buildings.find((b) => b.id === marker.buildingId);
        if (!building) return;
        const pointGrid = {
          x: (pointer.x - panX) / gridPx,
          y: (pointer.y - panY) / gridPx,
        };
        const outline = getOutlinePolygon(building);
        const projected = projectPointToOutline(pointGrid, building);
        const snapToleranceGrid = SNAP_PX / gridPx;
        const snapped = snapToCornersAndMidpoint(projected.edgeIndex, projected.t, outline, snapToleranceGrid);
        updateDragInfo({ markerId: marker.id, edgeIndex: snapped.edgeIndex, t: snapped.t });
      }
    };

    const onStagePointerUp = () => {
      // タイマー解除
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      pressStartPosRef.current = null;

      // ドラッグ確定 (= 1 回 moveHeightMarker、 history 1 件のみ追加)
      if (isDraggingRef.current && dragInfoRef.current) {
        const info = dragInfoRef.current;
        moveHeightMarker(info.markerId, info.edgeIndex, info.t);
        wasDraggingRef.current = true; // onClick での modal 抑止フラグ
      }
      isDraggingRef.current = false;
      dragMarkerIdRef.current = null;
      updateDragInfo(null);
    };

    stage.on('pointermove.heightmarker', onStagePointerMove);
    stage.on('pointerup.heightmarker', onStagePointerUp);

    return () => {
      stage.off('pointermove.heightmarker');
      stage.off('pointerup.heightmarker');
    };
  }, [canvasData, gridPx, panX, panY, moveHeightMarker]);

  // unmount 時にタイマー残らないよう保険
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    };
  }, []);

  const onCircleDown = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>, marker: { id: string; edgeIndex: number; t: number }) => {
    e.cancelBubble = true; // Stage の onMouseDown 不発火 (= 新マーカー誤作成回避)
    const stage = e.target.getStage();
    const pointer = stage?.getPointerPosition();
    if (pointer) pressStartPosRef.current = { x: pointer.x, y: pointer.y };
    longPressTimerRef.current = setTimeout(() => {
      // 長押し成立 → ドラッグ可能化 + 視覚フィードバック開始
      isDraggingRef.current = true;
      dragMarkerIdRef.current = marker.id;
      updateDragInfo({ markerId: marker.id, edgeIndex: marker.edgeIndex, t: marker.t });
      longPressTimerRef.current = null;
    }, LONG_PRESS_MS);
  };

  const onCircleClick = (markerId: string) => {
    // 直前にドラッグした場合は modal 抑止 (= flag を 1 回消費)
    if (wasDraggingRef.current) {
      wasDraggingRef.current = false;
      return;
    }
    setHeightInputMarkerId(markerId);
  };

  return (
    <Layer ref={layerRef}>
      {markers.map((marker) => {
        const building = canvasData.buildings.find((b) => b.id === marker.buildingId);
        if (!building) return null;
        const outline = getOutlinePolygon(building);
        // ドラッグ中なら dragInfo の論理位置を表示、 それ以外は marker 自身
        const isThisDragging = dragInfo?.markerId === marker.id;
        const ei = isThisDragging ? dragInfo!.edgeIndex : marker.edgeIndex;
        const tt = isThisDragging ? dragInfo!.t : marker.t;
        if (ei < 0 || ei >= outline.length) return null;
        const p1 = outline[ei];
        const p2 = outline[(ei + 1) % outline.length];
        const x = p1.x + tt * (p2.x - p1.x);
        const y = p1.y + tt * (p2.y - p1.y);
        const screenX = x * gridPx + panX;
        const screenY = y * gridPx + panY;
        const r = Math.max(6, 8 * zoom);
        const fs = Math.max(11, 13 * zoom);
        const labelText = marker.heightMm === 0
          ? 'H?'
          : `H${(marker.heightMm / 1000).toFixed(1)}m`;
        return (
          <React.Fragment key={marker.id}>
            <Circle
              x={screenX} y={screenY} radius={r}
              fill={MARKER_COLOR} stroke="#fff" strokeWidth={1.5}
              onMouseDown={(e) => onCircleDown(e, { id: marker.id, edgeIndex: marker.edgeIndex, t: marker.t })}
              onTouchStart={(e) => onCircleDown(e, { id: marker.id, edgeIndex: marker.edgeIndex, t: marker.t })}
              onClick={() => onCircleClick(marker.id)}
              onTap={() => onCircleClick(marker.id)}
            />
            <Text
              x={screenX + r + 4} y={screenY - fs / 2}
              text={labelText} fontSize={fs} fontStyle="bold"
              fill={MARKER_COLOR} listening={false}
            />
          </React.Fragment>
        );
      })}
    </Layer>
  );
}
