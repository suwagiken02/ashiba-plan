'use client';

import React from 'react';
import { Layer, Circle, Text } from 'react-konva';
import { useCanvasStore } from '@/stores/canvasStore';
import { INITIAL_GRID_PX } from '@/lib/konva/gridUtils';
import { getOutlinePolygon } from '@/lib/konva/heightMarkerUtils';

const MARKER_COLOR = '#378ADD';

export default function HeightMarkerLayer() {
  const { canvasData, zoom, panX, panY } = useCanvasStore();
  const gridPx = INITIAL_GRID_PX * zoom;
  const markers = canvasData.heightMarkers ?? [];

  return (
    <Layer listening={false}>
      {markers.map((marker) => {
        const building = canvasData.buildings.find((b) => b.id === marker.buildingId);
        if (!building) return null;
        const outline = getOutlinePolygon(building);
        if (marker.edgeIndex < 0 || marker.edgeIndex >= outline.length) return null;
        const p1 = outline[marker.edgeIndex];
        const p2 = outline[(marker.edgeIndex + 1) % outline.length];
        const x = p1.x + marker.t * (p2.x - p1.x);
        const y = p1.y + marker.t * (p2.y - p1.y);
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
              listening={false}
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
