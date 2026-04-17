'use client';

import React from 'react';
import { useCanvasStore } from '@/stores/canvasStore';

export default function CompassWidget() {
  const { canvasData, setCompassAngle } = useCanvasStore();
  const angle = canvasData.compass.angle;

  const handleRotate = () => {
    setCompassAngle((angle + 45) % 360);
  };

  return (
    <div
      className="absolute top-3 left-3 w-10 h-10 cursor-pointer select-none"
      onClick={handleRotate}
      title="タップで方位を回転"
    >
      <svg
        viewBox="0 0 40 40"
        className="w-full h-full"
        style={{ transform: `rotate(${angle}deg)` }}
      >
        {/* 外円 */}
        <circle cx="20" cy="20" r="18" fill="none" stroke="#888780" strokeWidth="1" />
        {/* 北矢印 */}
        <polygon points="20,3 16,18 20,15 24,18" fill="#E53E3E" />
        {/* 南矢印 */}
        <polygon points="20,37 16,22 20,25 24,22" fill="#888780" />
        {/* N */}
        <text x="20" y="12" textAnchor="middle" fontSize="7" fill="#E53E3E" fontWeight="bold">
          N
        </text>
      </svg>
    </div>
  );
}
