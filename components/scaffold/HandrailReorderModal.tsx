'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useCanvasStore } from '@/stores/canvasStore';
import { getHandrailColor } from '@/lib/konva/handrailColors';
import { HandrailLengthMm } from '@/types';

type Props = {
  lineIds: string[];
  onClose: () => void;
  onConfirm: (newOrder: string[]) => void;
  buildingPoints?: { x: number; y: number }[];
};

function getBlockSize(lengthMm: number) {
  const ratio = (lengthMm - 200) / (1800 - 200);
  return Math.round(40 + ratio * (120 - 40));
}

type Face = 'north' | 'south' | 'east' | 'west';

function detectFace(
  handrails: { x: number; y: number; direction: 'horizontal' | 'vertical' | number }[],
  buildingPoints?: { x: number; y: number }[]
): Face {
  if (handrails.length === 0) return 'north';
  const isHoriz = handrails[0].direction === 'horizontal';

  if (!buildingPoints || buildingPoints.length === 0) {
    return isHoriz ? 'north' : 'west';
  }

  const centroid = {
    x: buildingPoints.reduce((s, p) => s + p.x, 0) / buildingPoints.length,
    y: buildingPoints.reduce((s, p) => s + p.y, 0) / buildingPoints.length,
  };

  if (isHoriz) {
    const avgY = handrails.reduce((s, h) => s + h.y, 0) / handrails.length;
    return avgY < centroid.y ? 'north' : 'south';
  } else {
    const avgX = handrails.reduce((s, h) => s + h.x, 0) / handrails.length;
    return avgX < centroid.x ? 'west' : 'east';
  }
}

export default function HandrailReorderModal({ lineIds, onClose, onConfirm, buildingPoints }: Props) {
  const { canvasData } = useCanvasStore();

  const lineHandrails = canvasData.handrails
    .filter(h => lineIds.includes(h.id))
    .sort((a, b) => {
      const isHoriz = a.direction === 'horizontal';
      return isHoriz ? a.x - b.x : a.y - b.y;
    });

  const isHoriz = lineHandrails.length > 0 && lineHandrails[0].direction === 'horizontal';
  const face = detectFace(lineHandrails, buildingPoints);

  const [order, setOrder] = useState<string[]>(() => lineHandrails.map(h => h.id));
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [pointerPos, setPointerPos] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const dragStartPos = useRef(0);
  const dragStartOffset = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const blockRefs = useRef<(HTMLDivElement | null)[]>([]);

  // 各ブロックのオフセット位置を計算（水平=left、垂直=top）
  const getOffsets = useCallback((ids: string[]) => {
    const offsets: number[] = [];
    let pos = 0;
    const gap = 8;
    for (const id of ids) {
      offsets.push(pos);
      const h = lineHandrails.find(hr => hr.id === id);
      pos += (h ? getBlockSize(h.lengthMm) : 48) + gap;
    }
    return offsets;
  }, [lineHandrails]);

  const handlePointerDown = useCallback((e: React.PointerEvent, idx: number) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    const offsets = getOffsets(order);
    const clientPos = isHoriz ? e.clientX : e.clientY;
    dragStartPos.current = clientPos;
    dragStartOffset.current = offsets[idx];
    setDragIndex(idx);
    setPointerPos(clientPos);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [order, getOffsets, isHoriz]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (dragIndex === null) return;
    const clientPos = isHoriz ? e.clientX : e.clientY;
    setPointerPos(clientPos);

    const dp = clientPos - dragStartPos.current;
    const draggedOffset = dragStartOffset.current + dp;
    const draggedId = order[dragIndex];
    const draggedH = lineHandrails.find(hr => hr.id === draggedId);
    const draggedSize = draggedH ? getBlockSize(draggedH.lengthMm) : 48;
    const draggedCenter = draggedOffset + draggedSize / 2;

    const offsets = getOffsets(order);
    let targetIdx = dragIndex;

    for (let i = 0; i < order.length; i++) {
      if (i === dragIndex) continue;
      const h = lineHandrails.find(hr => hr.id === order[i]);
      const size = h ? getBlockSize(h.lengthMm) : 48;
      const mid = offsets[i] + size / 2;

      if (dragIndex > i && draggedCenter < mid) {
        targetIdx = i;
        break;
      }
      if (dragIndex < i && draggedCenter > mid) {
        targetIdx = i;
      }
    }

    if (targetIdx !== dragIndex) {
      const newOrder = [...order];
      const [removed] = newOrder.splice(dragIndex, 1);
      newOrder.splice(targetIdx, 0, removed);

      const newOffsets = getOffsets(newOrder);
      dragStartOffset.current = newOffsets[targetIdx];
      dragStartPos.current = clientPos;

      setOrder(newOrder);
      setDragIndex(targetIdx);
      if (selectedIndex === dragIndex) setSelectedIndex(targetIdx);
    }
  }, [dragIndex, order, lineHandrails, getOffsets, isHoriz, selectedIndex]);

  const handlePointerUp = useCallback(() => {
    setDragIndex(null);
  }, []);

  const moveSelected = useCallback((dir: -1 | 1) => {
    if (selectedIndex === null) return;
    const target = selectedIndex + dir;
    if (target < 0 || target >= order.length) return;
    const newOrder = [...order];
    const [removed] = newOrder.splice(selectedIndex, 1);
    newOrder.splice(target, 0, removed);
    setOrder(newOrder);
    setSelectedIndex(target);
    // スクロール追従
    requestAnimationFrame(() => {
      blockRefs.current[target]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    });
  }, [selectedIndex, order]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const offsets = getOffsets(order);
  const totalSize = offsets.length > 0
    ? offsets[offsets.length - 1] + (() => {
        const lastH = lineHandrails.find(hr => hr.id === order[order.length - 1]);
        return lastH ? getBlockSize(lastH.lengthMm) : 48;
      })()
    : 0;

  // 躯体帯の表示
  const kutaiThickness = 24;

  // 方向ラベル
  const dirLabels = isHoriz
    ? { start: '← 左', end: '右 →' }
    : { start: '← 上', end: '下 →' };

  const faceLabel =
    face === 'north' ? '北面' :
    face === 'south' ? '南面' :
    face === 'east' ? '東面' : '西面';

  // 躯体が手摺に対してどちら側か
  const kutaiPosition = face === 'north' ? 'after' : face === 'south' ? 'before' : face === 'east' ? 'before' : 'after';

  const canMoveBack = selectedIndex !== null && selectedIndex > 0;
  const canMoveForward = selectedIndex !== null && selectedIndex < order.length - 1;

  const moveBtnClass = (enabled: boolean) =>
    `w-7 h-7 border border-dark-border rounded text-dimension text-xs ${enabled ? 'hover:bg-dark-bg' : 'opacity-30'}`;

  const renderBlocks = () => (
    <div
      className="relative"
      style={isHoriz
        ? { width: totalSize, height: 70 }
        : { width: 70, height: totalSize }
      }
    >
      {order.map((id, idx) => {
        const h = lineHandrails.find(hr => hr.id === id);
        if (!h) return null;
        const size = getBlockSize(h.lengthMm);
        const color = getHandrailColor(h.lengthMm as HandrailLengthMm);
        const isDragging = dragIndex === idx;
        const isSelected = selectedIndex === idx;

        let offset = offsets[idx];
        if (isDragging) {
          const dp = pointerPos - dragStartPos.current;
          offset = dragStartOffset.current + dp;
        }

        return (
          <div
            key={id}
            ref={(el) => { blockRefs.current[idx] = el; }}
            className="absolute cursor-grab active:cursor-grabbing"
            style={isHoriz
              ? {
                  left: offset,
                  top: 0,
                  width: size,
                  opacity: isDragging ? 0.5 : 1,
                  zIndex: isDragging ? 10 : isSelected ? 5 : 1,
                  transition: isDragging ? 'none' : 'left 0.2s ease',
                }
              : {
                  top: offset,
                  left: 0,
                  height: size,
                  opacity: isDragging ? 0.5 : 1,
                  zIndex: isDragging ? 10 : isSelected ? 5 : 1,
                  transition: isDragging ? 'none' : 'top 0.2s ease',
                }
            }
            onPointerDown={(e) => {
              setSelectedIndex(idx);
              handlePointerDown(e, idx);
            }}
            onClick={() => setSelectedIndex(idx)}
          >
            <div className="flex flex-col items-center">
              <div
                className={`rounded flex items-center justify-center font-bold text-xs ${isSelected ? 'border-4' : 'border-2'}`}
                style={isHoriz
                  ? { width: size, height: 48, backgroundColor: color + '33', borderColor: color, color }
                  : { width: 48, height: size, backgroundColor: color + '33', borderColor: color, color }
                }
              >
                {h.lengthMm}
              </div>
              <span className="text-[10px] text-dimension mt-0.5">{idx + 1}</span>
            </div>
          </div>
        );
      })}
    </div>
  );

  // 躯体帯 + 移動ボタンのサイドバー（固定、スクロールしない）
  const kutaiSidebar = isHoriz ? (
    // 水平辺: 上側に横帯 + ←→ボタン
    <div className="flex items-center shrink-0 rounded-t-lg" style={{ backgroundColor: '#555550', border: '2px solid #888', height: kutaiThickness }}>
      <div className="flex gap-0.5 ml-1 shrink-0">
        <button type="button" className={moveBtnClass(canMoveBack)} disabled={!canMoveBack} onClick={() => moveSelected(-1)}>←</button>
        <button type="button" className={moveBtnClass(canMoveForward)} disabled={!canMoveForward} onClick={() => moveSelected(1)}>→</button>
      </div>
      <span className="flex-1 text-center text-[10px] text-gray-300 font-bold">躯体</span>
    </div>
  ) : (
    // 垂直辺: 右側に縦帯 + ↑↓ボタン
    <div className="flex flex-col items-center shrink-0 rounded-r-lg" style={{ width: 60 }}>
      <div className="flex flex-col items-center gap-2 py-2">
        <button
          type="button"
          className="rounded text-white font-bold"
          style={{
            width: 44, height: 44, fontSize: 20,
            backgroundColor: (!canMoveBack || selectedIndex === null) ? '#555' : '#378ADD',
            opacity: selectedIndex === null ? 0.4 : (!canMoveBack ? 0.3 : 1),
          }}
          disabled={!canMoveBack || selectedIndex === null}
          onClick={() => moveSelected(-1)}
        >↑</button>
        <button
          type="button"
          className="rounded text-white font-bold"
          style={{
            width: 44, height: 44, fontSize: 20,
            backgroundColor: (!canMoveForward || selectedIndex === null) ? '#555' : '#378ADD',
            opacity: selectedIndex === null ? 0.4 : (!canMoveForward ? 0.3 : 1),
          }}
          disabled={!canMoveForward || selectedIndex === null}
          onClick={() => moveSelected(1)}
        >↓</button>
      </div>
      <div
        className="flex-1 w-full flex items-center justify-center rounded-br-lg"
        style={{ backgroundColor: '#555550', border: '2px solid #888' }}
      >
        <span className="text-[10px] text-gray-300 font-bold" style={{ writingMode: 'vertical-rl' }}>躯体</span>
      </div>
    </div>
  );

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center pointer-events-none">
        <div
          className="bg-dark-panel border border-dark-border rounded-t-xl sm:rounded-xl shadow-xl p-5 pointer-events-auto overflow-y-auto"
          style={{
            ...(isHoriz
              ? { width: 'calc(100vw - 16px)', maxWidth: 'none' }
              : { width: 'fit-content', minWidth: '160px', maxWidth: '280px' }),
            marginLeft: 8, marginRight: 8, maxHeight: '70vh',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="text-base font-bold text-white mb-1">手摺の並び替え（{faceLabel}）</h3>
          <p className="text-xs text-dimension mb-3">
            {isHoriz ? '水平ライン（左→右）' : '垂直ライン（上→下）'}
          </p>

          {/* ブロック並び替えエリア */}
          <div
            className="bg-dark-bg rounded-lg select-none touch-none flex"
            style={{
              flexDirection: isHoriz ? 'column' : 'row',
              maxHeight: isHoriz ? undefined : '50vh',
            }}
          >
            {/* 躯体帯(上 or 右) */}
            {kutaiPosition === 'before' && kutaiSidebar}
            {/* スクロール可能なブロックエリア */}
            <div
              ref={containerRef}
              className="relative p-4"
              style={{
                flex: 1,
                overflowX: isHoriz ? 'auto' : undefined,
                overflowY: isHoriz ? undefined : 'auto',
                ...(isHoriz ? { whiteSpace: 'nowrap' } : {}),
              }}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
            >
              {renderBlocks()}
            </div>
            {/* 躯体帯(下 or 右) */}
            {kutaiPosition === 'after' && kutaiSidebar}
          </div>

          {/* 方向ラベル */}
          <div className="flex justify-between mt-1.5 px-1 text-[10px] text-dimension">
            <span>{dirLabels.start}</span>
            <span>{dirLabels.end}</span>
          </div>

          {/* ボタン */}
          <div className="flex justify-end gap-3 mt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm border border-dark-border text-dimension hover:bg-dark-bg transition-colors"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={() => onConfirm(order)}
              className="px-4 py-2 rounded-lg text-sm bg-accent text-white font-bold hover:bg-accent/90 transition-colors"
            >
              OK
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
