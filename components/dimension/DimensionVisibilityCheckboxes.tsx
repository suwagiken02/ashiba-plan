'use client';

import React from 'react';
import { useHandrailSettingsStore, type DimensionVisibility } from '@/stores/handrailSettingsStore';

// Phase J-5: 寸法線の段別 ON/OFF チェックボックス共通コンポーネント。
// 設定画面 (/settings) と SettingsPanel (スマホ)、editor 右上 (PC) の 3 箇所で共有。
// 状態は handrailSettingsStore (DB 連動、会社単位) を直接読み書き。

const ITEMS: Array<{ key: keyof DimensionVisibility; label: string }> = [
  { key: 'roof1F', label: '1F 屋根' },
  { key: 'wall1F', label: '1F 外壁' },
  { key: 'scaffold1F', label: '1F 足場' },
  { key: 'roof2F', label: '2F 屋根' },
  { key: 'wall2F', label: '2F 外壁' },
  { key: 'scaffold2F', label: '2F 足場' },
];

type DimensionVisibilityCheckboxesProps = {
  disabled?: boolean;
  value?: DimensionVisibility;
  onChange?: (updates: Partial<DimensionVisibility>) => void;
};

export default function DimensionVisibilityCheckboxes({ disabled = false, value, onChange }: DimensionVisibilityCheckboxesProps) {
  const storeDimensionVisibility = useHandrailSettingsStore(s => s.dimensionVisibility);
  const storeUpdate = useHandrailSettingsStore(s => s.updateDimensionVisibility);

  // controlled 判定: value + onChange 両方渡されたら controlled mode (= /settings 画面)
  // そうでなければ uncontrolled (= store 直接読み書き、 SettingsPanel + editor 右上 既存挙動維持)
  const isControlled = value !== undefined && onChange !== undefined;
  const dimensionVisibility = isControlled ? value : storeDimensionVisibility;
  const handleChange = (updates: Partial<DimensionVisibility>) => {
    if (isControlled) {
      onChange!(updates);
    } else {
      storeUpdate(updates);
    }
  };

  return (
    <div className="grid grid-cols-2 gap-1.5">
      {ITEMS.map(item => {
        const checked = dimensionVisibility[item.key];
        return (
          <label
            key={item.key}
            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border cursor-pointer transition-colors ${
              checked
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-dark-border bg-dark-bg text-dimension'
            } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
          >
            <input
              type="checkbox"
              checked={checked}
              disabled={disabled}
              onChange={(e) => {
                if (disabled) return;
                handleChange({ [item.key]: e.target.checked });
              }}
              className="w-4 h-4 accent-accent shrink-0"
            />
            <span className="text-xs font-bold whitespace-nowrap">{item.label}</span>
          </label>
        );
      })}
    </div>
  );
}
