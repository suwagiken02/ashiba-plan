'use client';

import React, { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useCanvasStore } from '@/stores/canvasStore';
import { StartCorner, HandrailLengthMm } from '@/types';
import { mmToGrid } from '@/lib/konva/gridUtils';
import { getHandrailColor } from '@/lib/konva/handrailColors';

type Props = {
  onClose: () => void;
};

const CORNERS: { id: StartCorner; label: string }[] = [
  { id: 'nw', label: '北西' },
  { id: 'ne', label: '北東' },
  { id: 'sw', label: '南西' },
  { id: 'se', label: '南東' },
];

/** 角に接する面のラベル */
function faceLabels(corner: StartCorner): [string, string] {
  switch (corner) {
    case 'ne': return ['北面', '東面'];
    case 'nw': return ['北面', '西面'];
    case 'se': return ['南面', '東面'];
    case 'sw': return ['南面', '西面'];
  }
}

const HANDRAIL_OPTIONS: HandrailLengthMm[] = [1800, 1200, 900];

export default function ScaffoldStartModal({ onClose }: Props) {
  const { setScaffoldStart, canvasData, addHandrail } = useCanvasStore();

  const [corner, setCorner] = useState<StartCorner>('ne');
  const [face1Distance, setFace1Distance] = useState(900);
  const [face2Distance, setFace2Distance] = useState(900);
  const [face1Handrail, setFace1Handrail] = useState<HandrailLengthMm>(1800);
  const [face2Handrail, setFace2Handrail] = useState<HandrailLengthMm>(1800);

  const [label1, label2] = faceLabels(corner);

  const handleConfirm = () => {
    // 設定を保存
    setScaffoldStart({
      corner,
      face1DistanceMm: face1Distance,
      face2DistanceMm: face2Distance,
      face1FirstHandrail: face1Handrail,
      face2FirstHandrail: face2Handrail,
    });

    // 建物のバウンディングボックスを計算
    if (canvasData.buildings.length === 0) { onClose(); return; }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const b of canvasData.buildings) {
      for (const p of b.points) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
    }

    const d1 = mmToGrid(face1Distance); // face1: 北面 or 南面の離れ(グリッド)
    const d2 = mmToGrid(face2Distance); // face2: 東面 or 西面の離れ(グリッド)
    const len1 = mmToGrid(face1Handrail); // face1の手摺長さ(グリッド)
    const len2 = mmToGrid(face2Handrail); // face2の手摺長さ(グリッド)

    // 角の位置に応じて scaffold の角点と手摺の配置を計算
    // face1 = 北/南面(horizontal), face2 = 東/西面(vertical)
    let h1x: number, h1y: number; // face1(横方向)手摺の始点
    let h2x: number, h2y: number; // face2(縦方向)手摺の始点

    switch (corner) {
      case 'ne': {
        // scaffold角点: (maxX + d2, minY - d1)
        // 北面手摺: 角点から西へ → start = (cornerX - len1, cornerY)
        // 東面手摺: 角点から南へ → start = (cornerX, cornerY)
        const cx = maxX + d2;
        const cy = minY - d1;
        h1x = cx - len1; h1y = cy;
        h2x = cx;         h2y = cy;
        break;
      }
      case 'nw': {
        // scaffold角点: (minX - d2, minY - d1)
        // 北面手摺: 角点から東へ → start = (cornerX, cornerY)
        // 西面手摺: 角点から南へ → start = (cornerX, cornerY)
        const cx = minX - d2;
        const cy = minY - d1;
        h1x = cx;  h1y = cy;
        h2x = cx;  h2y = cy;
        break;
      }
      case 'se': {
        // scaffold角点: (maxX + d2, maxY + d1)
        // 南面手摺: 角点から西へ → start = (cornerX - len1, cornerY)
        // 東面手摺: 角点から北へ → start = (cornerX, cornerY - len2)
        const cx = maxX + d2;
        const cy = maxY + d1;
        h1x = cx - len1; h1y = cy;
        h2x = cx;         h2y = cy - len2;
        break;
      }
      case 'sw': {
        // scaffold角点: (minX - d2, maxY + d1)
        // 南面手摺: 角点から東へ → start = (cornerX, cornerY)
        // 西面手摺: 角点から北へ → start = (cornerX, cornerY - len2)
        const cx = minX - d2;
        const cy = maxY + d1;
        h1x = cx;  h1y = cy;
        h2x = cx;  h2y = cy - len2;
        break;
      }
    }

    // 手摺を2本配置
    addHandrail({
      id: uuidv4(),
      x: h1x,
      y: h1y,
      lengthMm: face1Handrail,
      direction: 'horizontal',
      color: getHandrailColor(face1Handrail),
    });
    addHandrail({
      id: uuidv4(),
      x: h2x,
      y: h2y,
      lengthMm: face2Handrail,
      direction: 'vertical',
      color: getHandrailColor(face2Handrail),
    });

    onClose();
  };

  return (
    <div
      className="fixed inset-0 modal-overlay flex items-end sm:items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-dark-surface border-t sm:border border-dark-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="sticky top-0 bg-dark-surface px-4 py-3 border-b border-dark-border flex items-center justify-between">
          <h2 className="font-bold text-lg">足場開始設定</h2>
          <button onClick={onClose} className="text-dimension hover:text-canvas px-2">
            ✕
          </button>
        </div>

        <div className="p-4 space-y-6">
          {/* スタート角の選択 */}
          <div>
            <label className="block text-sm text-dimension mb-2">スタート角</label>
            <CornerSelector value={corner} onChange={setCorner} />
          </div>

          {/* 各面の離れ */}
          <div>
            <label className="block text-sm text-dimension mb-2">各面の離れ (mm)</label>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-sm w-16 shrink-0">{label1}</span>
                <input
                  type="number"
                  value={face1Distance}
                  onChange={(e) => setFace1Distance(Math.max(0, Number(e.target.value)))}
                  className="flex-1 bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm"
                  min={0}
                  step={10}
                />
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm w-16 shrink-0">{label2}</span>
                <input
                  type="number"
                  value={face2Distance}
                  onChange={(e) => setFace2Distance(Math.max(0, Number(e.target.value)))}
                  className="flex-1 bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm"
                  min={0}
                  step={10}
                />
              </div>
            </div>
          </div>

          {/* 各面の最初の手摺の長さ */}
          <div>
            <label className="block text-sm text-dimension mb-2">最初の手摺の長さ</label>
            <div className="space-y-3">
              <div>
                <span className="text-xs text-dimension">{label1}</span>
                <div className="flex gap-2 mt-1">
                  {HANDRAIL_OPTIONS.map((len) => (
                    <button
                      key={`f1-${len}`}
                      onClick={() => setFace1Handrail(len)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        face1Handrail === len
                          ? 'border-accent bg-accent/15 text-accent'
                          : 'border-dark-border text-dimension hover:border-accent/50'
                      }`}
                    >
                      {len}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className="text-xs text-dimension">{label2}</span>
                <div className="flex gap-2 mt-1">
                  {HANDRAIL_OPTIONS.map((len) => (
                    <button
                      key={`f2-${len}`}
                      onClick={() => setFace2Handrail(len)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        face2Handrail === len
                          ? 'border-accent bg-accent/15 text-accent'
                          : 'border-dark-border text-dimension hover:border-accent/50'
                      }`}
                    >
                      {len}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 確定ボタン */}
          <button
            onClick={handleConfirm}
            className="w-full py-3 bg-accent text-white font-bold rounded-xl text-lg"
          >
            足場開始
          </button>
        </div>
      </div>
    </div>
  );
}

/** 4角選択 - 建物の俯瞰図で角をタップ */
function CornerSelector({
  value,
  onChange,
}: {
  value: StartCorner;
  onChange: (c: StartCorner) => void;
}) {
  // 方角ラベルとコーナー位置のマッピング
  const corners: { id: StartCorner; label: string; posClass: string }[] = [
    { id: 'nw', label: '北西', posClass: 'top-0 left-0' },
    { id: 'ne', label: '北東', posClass: 'top-0 right-0' },
    { id: 'sw', label: '南西', posClass: 'bottom-0 left-0' },
    { id: 'se', label: '南東', posClass: 'bottom-0 right-0' },
  ];

  return (
    <div className="flex justify-center">
      <div className="relative w-48 h-36">
        {/* 方角ラベル */}
        <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-xs text-dimension">北</span>
        <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-xs text-dimension">南</span>
        <span className="absolute top-1/2 -left-6 -translate-y-1/2 text-xs text-dimension">西</span>
        <span className="absolute top-1/2 -right-6 -translate-y-1/2 text-xs text-dimension">東</span>

        {/* 建物の形 */}
        <div className="absolute inset-3 bg-[#3d3d3a] border-2 border-[#1a1a18] rounded-sm" />

        {/* 角ボタン */}
        {corners.map((c) => (
          <button
            key={c.id}
            onClick={() => onChange(c.id)}
            className={`absolute ${c.posClass} w-10 h-10 flex items-center justify-center rounded-full transition-all z-10 ${
              value === c.id
                ? 'bg-accent text-white scale-110 shadow-lg shadow-accent/30'
                : 'bg-dark-bg border border-dark-border text-dimension hover:border-accent/50'
            }`}
            title={c.label}
          >
            <span className="text-xs font-bold">{c.label.slice(0, 1)}{c.label.slice(1)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
