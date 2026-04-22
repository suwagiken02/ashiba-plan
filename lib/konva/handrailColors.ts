import { HandrailLengthMm } from '@/types';

/** 手摺の長さごとの色 */
export const HANDRAIL_COLORS: Record<HandrailLengthMm, string> = {
  1800: '#60a5fa',
  1500: '#22d3ee',
  1200: '#4ade80',
  1000: '#a3e635',
   900: '#facc15',
   800: '#fb7185',
   600: '#fb923c',
   500: '#ef4444',
   400: '#f87171',
   300: '#c084fc',
   200: '#f472b6',
   100: '#94a3b8',
};

/** 手摺の長さから色を取得（未定義なら青フォールバック） */
export function getHandrailColor(lengthMm: HandrailLengthMm): string {
  return HANDRAIL_COLORS[lengthMm] ?? '#185FA5';
}

/** 凡例用の長さリスト（降順） */
export const HANDRAIL_LEGEND: { lengthMm: HandrailLengthMm; color: string }[] = [
  { lengthMm: 1800, color: '#60a5fa' },
  { lengthMm: 1500, color: '#22d3ee' },
  { lengthMm: 1200, color: '#4ade80' },
  { lengthMm: 1000, color: '#a3e635' },
  { lengthMm:  900, color: '#facc15' },
  { lengthMm:  800, color: '#fb7185' },
  { lengthMm:  600, color: '#fb923c' },
  { lengthMm:  500, color: '#ef4444' },
  { lengthMm:  400, color: '#f87171' },
  { lengthMm:  300, color: '#c084fc' },
  { lengthMm:  200, color: '#f472b6' },
  { lengthMm:  100, color: '#94a3b8' },
];
