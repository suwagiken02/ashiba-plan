'use client';

import React from 'react';
import { TemplateDimension } from '@/types';

type Props = {
  dimensions: TemplateDimension[];
  values: Record<string, number>;
  onChange: (values: Record<string, number>) => void;
};

export default function DimensionInput({ dimensions, values, onChange }: Props) {
  const handleChange = (key: string, value: string) => {
    const num = parseInt(value, 10);
    if (!isNaN(num) && num > 0) {
      onChange({ ...values, [key]: num });
    }
  };

  return (
    <div className="space-y-3">
      {dimensions.map((dim) => (
        <div key={dim.key}>
          <label className="block text-sm text-dimension mb-1">{dim.label}</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={values[dim.key] || dim.defaultMm}
              onChange={(e) => handleChange(dim.key, e.target.value)}
              className="flex-1 px-4 py-3 bg-dark-bg border border-dark-border rounded-lg text-canvas text-right font-mono focus:outline-none focus:border-accent"
              step={100}
              min={100}
            />
            <span className="text-dimension text-sm w-8">mm</span>
          </div>
        </div>
      ))}
    </div>
  );
}
