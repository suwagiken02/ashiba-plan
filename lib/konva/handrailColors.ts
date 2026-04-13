import { HandrailLengthMm } from '@/types';

/** 手摺の長さごとの色 */
export const HANDRAIL_COLORS: Record<HandrailLengthMm, string> = {
  1800: '#60a5fa',
  1200: '#4ade80',
   900: '#facc15',
   600: '#fb923c',
   400: '#f87171',
   300: '#c084fc',
   200: '#f472b6',
};

/** 手摺の長さから色を取得（未定義なら青フォールバック） */
export function getHandrailColor(lengthMm: HandrailLengthMm): string {
  return HANDRAIL_COLORS[lengthMm] ?? '#185FA5';
}

/** 凡例用の長さリスト（降順） */
export const HANDRAIL_LEGEND: { lengthMm: HandrailLengthMm; color: string }[] = [
  { lengthMm: 1800, color: '#60a5fa' },
  { lengthMm: 1200, color: '#4ade80' },
  { lengthMm:  900, color: '#facc15' },
  { lengthMm:  600, color: '#fb923c' },
  { lengthMm:  400, color: '#f87171' },
  { lengthMm:  300, color: '#c084fc' },
  { lengthMm:  200, color: '#f472b6' },
];
