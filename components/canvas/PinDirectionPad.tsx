'use client';

import React from 'react';
import { Layer, Rect, Text, Group } from 'react-konva';
import { useCanvasStore } from '@/stores/canvasStore';
import { INITIAL_GRID_PX } from '@/lib/konva/gridUtils';
import type Konva from 'konva';

/**
 * ピンモード中、選択された anchor の周囲に十字方向ボタンと
 * 確定/キャンセルボタンを描画する Konva レイヤー（既存の壁入力方向ボタンと同流儀）。
 */
export default function PinDirectionPad() {
  // Phase M-3c-fix: selector ベース購読
  const isMagnetPinMode = useCanvasStore(s => s.isMagnetPinMode);
  const pinAnchor = useCanvasStore(s => s.pinAnchor);
  const pinDraftOffset = useCanvasStore(s => s.pinDraftOffset);
  const setPinDirectionInput = useCanvasStore(s => s.setPinDirectionInput);
  const setPinAnchor = useCanvasStore(s => s.setPinAnchor);
  const zoom = useCanvasStore(s => s.zoom);
  const panX = useCanvasStore(s => s.panX);
  const panY = useCanvasStore(s => s.panY);

  if (!isMagnetPinMode || !pinAnchor) return null;

  const gridPx = INITIAL_GRID_PX * zoom;
  // 仮位置（anchor + draftOffset/10 in grid units）の画面ピクセル座標
  const dxGrid = (pinDraftOffset?.dx ?? 0) / 10;
  const dyGrid = (pinDraftOffset?.dy ?? 0) / 10;
  const px = (pinAnchor.x + dxGrid) * gridPx + panX;
  const py = (pinAnchor.y + dyGrid) * gridPx + panY;

  const btnSize = 36;
  const btnDist = 50;

  const handleDirection =
    (dir: 'up' | 'down' | 'left' | 'right') =>
    (e: Konva.KonvaEventObject<Event>) => {
      e.cancelBubble = true;
      setPinDirectionInput(dir);
    };

  const handleConfirm = (e: Konva.KonvaEventObject<Event>) => {
    e.cancelBubble = true;
    if (!pinDraftOffset) return;
    // M-3d で実際の addMagnetPin を実装。今は TODO ログ + UI リセット。
    console.log('TODO M-3d: addMagnetPin', { anchor: pinAnchor, draftOffset: pinDraftOffset });
    setPinAnchor(null); // pinDraftOffset / pinDirectionInput も同時にリセットされる
  };

  const handleCancel = (e: Konva.KonvaEventObject<Event>) => {
    e.cancelBubble = true;
    setPinAnchor(null); // pinDraftOffset / pinDirectionInput も同時にリセットされる
  };

  const dirButtons: { dir: 'up' | 'down' | 'left' | 'right'; arrow: string; ox: number; oy: number }[] = [
    { dir: 'up', arrow: '↑', ox: -btnSize / 2, oy: -btnDist - btnSize },
    { dir: 'down', arrow: '↓', ox: -btnSize / 2, oy: btnDist },
    { dir: 'left', arrow: '←', ox: -btnDist - btnSize, oy: -btnSize / 2 },
    { dir: 'right', arrow: '→', ox: btnDist, oy: -btnSize / 2 },
  ];

  const draftReady = pinDraftOffset !== null;
  const confirmFill = draftReady ? '#10B981' : '#4B5563'; // emerald-500 / gray-600 (disabled)

  return (
    <Layer>
      {/* 方向ボタン（4つ） */}
      {dirButtons.map(({ dir, arrow, ox, oy }) => (
        <Group key={dir}>
          <Rect
            x={px + ox}
            y={py + oy}
            width={btnSize}
            height={btnSize}
            fill="#378ADD"
            cornerRadius={8}
            shadowBlur={5}
            shadowOpacity={0.3}
            onClick={handleDirection(dir)}
            onTap={handleDirection(dir)}
          />
          <Text
            x={px + ox}
            y={py + oy}
            width={btnSize}
            height={btnSize}
            text={arrow}
            fontSize={20}
            fill="white"
            fontStyle="bold"
            align="center"
            verticalAlign="middle"
            listening={false}
          />
        </Group>
      ))}

      {/* 確定ボタン（右下、enabled は draftReady のみ） */}
      <Group>
        <Rect
          x={px + btnDist}
          y={py + btnDist}
          width={btnSize}
          height={btnSize}
          fill={confirmFill}
          cornerRadius={8}
          shadowBlur={5}
          shadowOpacity={0.3}
          onClick={draftReady ? handleConfirm : undefined}
          onTap={draftReady ? handleConfirm : undefined}
          opacity={draftReady ? 1 : 0.5}
        />
        <Text
          x={px + btnDist}
          y={py + btnDist}
          width={btnSize}
          height={btnSize}
          text="✓"
          fontSize={20}
          fill="white"
          fontStyle="bold"
          align="center"
          verticalAlign="middle"
          listening={false}
        />
      </Group>

      {/* キャンセルボタン（左下） */}
      <Group>
        <Rect
          x={px - btnDist - btnSize}
          y={py + btnDist}
          width={btnSize}
          height={btnSize}
          fill="#6B7280"
          cornerRadius={8}
          shadowBlur={5}
          shadowOpacity={0.3}
          onClick={handleCancel}
          onTap={handleCancel}
        />
        <Text
          x={px - btnDist - btnSize}
          y={py + btnDist}
          width={btnSize}
          height={btnSize}
          text="✕"
          fontSize={18}
          fill="white"
          fontStyle="bold"
          align="center"
          verticalAlign="middle"
          listening={false}
        />
      </Group>
    </Layer>
  );
}
