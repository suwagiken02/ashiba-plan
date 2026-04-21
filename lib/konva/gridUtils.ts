/** 1グリッド = 10mm */
export const GRID_UNIT_MM = 10;

/** 初期表示: 1グリッド = 3px */
export const INITIAL_GRID_PX = 3;

/** ズーム範囲 */
export const ZOOM_MIN = 0.01;
export const ZOOM_MAX = 5.0;

/** 初期グリッドサイズ */
export const DEFAULT_COLS = 600;
export const DEFAULT_ROWS = 400;

/** mm → グリッド単位変換（小数許容。1mm 精度の入力値を保持するため Math.round しない） */
export const mmToGrid = (mm: number): number => mm / GRID_UNIT_MM;

/** グリッド単位 → mm変換 */
export const gridToMm = (grid: number): number => grid * GRID_UNIT_MM;

/** グリッド単位 → 表示px変換 */
export const gridToPx = (grid: number, zoom: number): number =>
  grid * INITIAL_GRID_PX * zoom;

/** 表示px → グリッド単位変換 */
export const pxToGrid = (px: number, zoom: number): number =>
  Math.round(px / (INITIAL_GRID_PX * zoom));

/** スクリーン座標 → グリッド座標変換 */
export const screenToGrid = (
  screenX: number,
  screenY: number,
  panX: number,
  panY: number,
  zoom: number
): { x: number; y: number } => ({
  x: Math.round((screenX - panX) / (INITIAL_GRID_PX * zoom)),
  y: Math.round((screenY - panY) / (INITIAL_GRID_PX * zoom)),
});

/** グリッド座標 → スクリーン座標変換 */
export const gridToScreen = (
  gridX: number,
  gridY: number,
  panX: number,
  panY: number,
  zoom: number
): { x: number; y: number } => ({
  x: gridX * INITIAL_GRID_PX * zoom + panX,
  y: gridY * INITIAL_GRID_PX * zoom + panY,
});
