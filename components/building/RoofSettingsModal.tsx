'use client';

import React, { useState } from 'react';
import { useCanvasStore } from '@/stores/canvasStore';
import { RoofType, RoofConfig } from '@/types';

type Props = {
  buildingId: string;
  initialRoof?: RoofConfig;
  onClose: () => void;
};

const ROOF_TYPES: { id: RoofType; label: string; desc: string }[] = [
  { id: 'yosemune', label: '寄棟', desc: '全4面に出幅' },
  { id: 'kirizuma', label: '切妻', desc: '桁面のみ出幅' },
  { id: 'katanagare', label: '片流れ', desc: '軒側1面のみ' },
  { id: 'none', label: 'なし', desc: '出幅なし' },
];

const DIRECTIONS = [
  { id: 'north' as const, label: '北' },
  { id: 'south' as const, label: '南' },
  { id: 'east' as const, label: '東' },
  { id: 'west' as const, label: '西' },
];

const DEFAULT_OVERHANG = 600;

export default function RoofSettingsModal({ buildingId, initialRoof, onClose }: Props) {
  const { updateBuildingRoof } = useCanvasStore();

  const [roofType, setRoofType] = useState<RoofType>(initialRoof?.roofType || 'yosemune');
  const [uniform, setUniform] = useState(initialRoof ? initialRoof.northMm === null : true);
  const [uniformMm, setUniformMm] = useState(initialRoof?.uniformMm || DEFAULT_OVERHANG);
  const [northMm, setNorthMm] = useState(initialRoof?.northMm ?? DEFAULT_OVERHANG);
  const [southMm, setSouthMm] = useState(initialRoof?.southMm ?? DEFAULT_OVERHANG);
  const [eastMm, setEastMm] = useState(initialRoof?.eastMm ?? DEFAULT_OVERHANG);
  const [westMm, setWestMm] = useState(initialRoof?.westMm ?? DEFAULT_OVERHANG);
  const [katanagareDir, setKatanagareDir] = useState<'north' | 'south' | 'east' | 'west'>(
    initialRoof?.katanagareDirection || 'south'
  );
  const [kirizumaGable, setKirizumaGable] = useState<'ew' | 'ns'>(
    initialRoof?.kirizumaGableFace || 'ew'
  );

  const handleConfirm = () => {
    const config: RoofConfig = {
      roofType,
      uniformMm: uniform ? uniformMm : DEFAULT_OVERHANG,
      northMm: uniform ? null : northMm,
      southMm: uniform ? null : southMm,
      eastMm: uniform ? null : eastMm,
      westMm: uniform ? null : westMm,
      katanagareDirection: roofType === 'katanagare' ? katanagareDir : undefined,
      kirizumaGableFace: roofType === 'kirizuma' ? kirizumaGable : undefined,
    };
    updateBuildingRoof(buildingId, config);
    onClose();
  };

  return (
    <div className="fixed inset-0 modal-overlay flex items-end sm:items-center justify-center z-50" onClick={onClose}>
      <div className="bg-dark-surface border-t sm:border border-dark-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-dark-surface px-4 py-3 border-b border-dark-border flex items-center justify-between">
          <h2 className="font-bold text-lg">屋根設定</h2>
          <button onClick={onClose} className="text-dimension hover:text-canvas px-2">✕</button>
        </div>

        <div className="p-4 space-y-5">
          {/* 屋根形状 */}
          <div>
            <label className="block text-sm text-dimension mb-2">屋根形状</label>
            <div className="grid grid-cols-4 gap-2">
              {ROOF_TYPES.map((rt) => (
                <button key={rt.id} onClick={() => setRoofType(rt.id)}
                  className={`py-2 px-1 rounded-lg text-center border transition-colors ${
                    roofType === rt.id ? 'border-accent bg-accent/15 text-accent' : 'border-dark-border text-dimension hover:border-accent/50'
                  }`}
                >
                  <span className="text-sm font-medium block">{rt.label}</span>
                  <span className="text-[10px] block mt-0.5 opacity-70">{rt.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {roofType !== 'none' && (
            <>
              {/* 切妻の妻面選択 */}
              {roofType === 'kirizuma' && (
                <div>
                  <label className="block text-sm text-dimension mb-2">妻面の方向</label>
                  <div className="flex gap-2">
                    {([['ew', '東西面が妻面'], ['ns', '南北面が妻面']] as const).map(([id, label]) => (
                      <button key={id} onClick={() => setKirizumaGable(id)}
                        className={`flex-1 py-2 rounded-lg text-sm border transition-colors ${
                          kirizumaGable === id ? 'border-accent bg-accent/15 text-accent' : 'border-dark-border text-dimension'
                        }`}
                      >{label}</button>
                    ))}
                  </div>
                </div>
              )}

              {/* 片流れの軒側選択 */}
              {roofType === 'katanagare' && (
                <div>
                  <label className="block text-sm text-dimension mb-2">水下方向（軒側）</label>
                  <div className="flex gap-2">
                    {DIRECTIONS.map((d) => (
                      <button key={d.id} onClick={() => setKatanagareDir(d.id)}
                        className={`flex-1 py-2 rounded-lg text-sm border transition-colors ${
                          katanagareDir === d.id ? 'border-accent bg-accent/15 text-accent' : 'border-dark-border text-dimension'
                        }`}
                      >{d.label}</button>
                    ))}
                  </div>
                </div>
              )}

              {/* 一括 / 面別切替 */}
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={uniform} onChange={(e) => setUniform(e.target.checked)}
                    className="w-4 h-4 rounded border-dark-border accent-accent"
                  />
                  <span className="text-sm">全面同じ出幅</span>
                </label>
              </div>

              {/* 出幅入力 */}
              {uniform ? (
                <div>
                  <label className="block text-sm text-dimension mb-1">出幅 (mm)</label>
                  <input type="number" value={uniformMm} onChange={(e) => setUniformMm(Math.max(0, Number(e.target.value)))}
                    className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm" min={0} step={50}
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="block text-sm text-dimension">面ごとの出幅 (mm)</label>
                  {[
                    { label: '北面', value: northMm, set: setNorthMm },
                    { label: '南面', value: southMm, set: setSouthMm },
                    { label: '東面', value: eastMm, set: setEastMm },
                    { label: '西面', value: westMm, set: setWestMm },
                  ].map((f) => (
                    <div key={f.label} className="flex items-center gap-3">
                      <span className="text-sm w-10 shrink-0">{f.label}</span>
                      <input type="number" value={f.value} onChange={(e) => f.set(Math.max(0, Number(e.target.value)))}
                        className="flex-1 bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm" min={0} step={50}
                      />
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          <button onClick={handleConfirm} className="w-full py-3 bg-accent text-white font-bold rounded-xl text-lg">
            設定する
          </button>
        </div>
      </div>
    </div>
  );
}
