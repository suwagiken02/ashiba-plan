import { BuildingTemplate, BuildingTemplateId, Point } from '@/types';
import { mmToGrid } from './gridUtils';

/** 全12種のテンプレート定義 */
export const BUILDING_TEMPLATES: BuildingTemplate[] = [
  {
    id: 'rect',
    name: '長方形',
    icon: '▬',
    dimensions: [
      { key: 'top', label: '上辺(mm)', defaultMm: 9000 },
      { key: 'right', label: '右辺(mm)', defaultMm: 7000 },
      { key: 'bottom', label: '下辺(mm)', defaultMm: 9000 },
      { key: 'left', label: '左辺(mm)', defaultMm: 7000 },
    ],
    buildPoints: (d) => {
      const top = mmToGrid(d.top);
      const right = mmToGrid(d.right);
      const bottom = mmToGrid(d.bottom);
      const left = mmToGrid(d.left);
      // 上辺を基準に、下辺を中央揃えで配置（台形対応）
      const h = Math.round((right + left) / 2); // 平均高さ
      const bx = Math.round((top - bottom) / 2); // 下辺の左端オフセット
      return [
        { x: 0, y: 0 },
        { x: top, y: 0 },
        { x: bx + bottom, y: h },
        { x: bx, y: h },
      ];
    },
  },
  // --- L字 4種 ---
  {
    id: 'l_ne',
    name: 'L字（北東欠け）',
    icon: '⌐',
    dimensions: [
      { key: 'tw', label: '全幅(mm)', defaultMm: 9000 },
      { key: 'th', label: '全高(mm)', defaultMm: 7000 },
      { key: 'cw', label: '欠け幅(mm)', defaultMm: 3000 },
      { key: 'ch', label: '欠け高(mm)', defaultMm: 3000 },
    ],
    buildPoints: (d) => {
      const tw = mmToGrid(d.tw);
      const th = mmToGrid(d.th);
      const cw = mmToGrid(d.cw);
      const ch = mmToGrid(d.ch);
      return [
        { x: 0, y: 0 },
        { x: tw - cw, y: 0 },
        { x: tw - cw, y: ch },
        { x: tw, y: ch },
        { x: tw, y: th },
        { x: 0, y: th },
      ];
    },
  },
  {
    id: 'l_nw',
    name: 'L字（北西欠け）',
    icon: '¬',
    dimensions: [
      { key: 'tw', label: '全幅(mm)', defaultMm: 9000 },
      { key: 'th', label: '全高(mm)', defaultMm: 7000 },
      { key: 'cw', label: '欠け幅(mm)', defaultMm: 3000 },
      { key: 'ch', label: '欠け高(mm)', defaultMm: 3000 },
    ],
    buildPoints: (d) => {
      const tw = mmToGrid(d.tw);
      const th = mmToGrid(d.th);
      const cw = mmToGrid(d.cw);
      const ch = mmToGrid(d.ch);
      return [
        { x: cw, y: 0 },
        { x: tw, y: 0 },
        { x: tw, y: th },
        { x: 0, y: th },
        { x: 0, y: ch },
        { x: cw, y: ch },
      ];
    },
  },
  {
    id: 'l_se',
    name: 'L字（南東欠け）',
    icon: '⌙',
    dimensions: [
      { key: 'tw', label: '全幅(mm)', defaultMm: 9000 },
      { key: 'th', label: '全高(mm)', defaultMm: 7000 },
      { key: 'cw', label: '欠け幅(mm)', defaultMm: 3000 },
      { key: 'ch', label: '欠け高(mm)', defaultMm: 3000 },
    ],
    buildPoints: (d) => {
      const tw = mmToGrid(d.tw);
      const th = mmToGrid(d.th);
      const cw = mmToGrid(d.cw);
      const ch = mmToGrid(d.ch);
      return [
        { x: 0, y: 0 },
        { x: tw, y: 0 },
        { x: tw, y: th - ch },
        { x: tw - cw, y: th - ch },
        { x: tw - cw, y: th },
        { x: 0, y: th },
      ];
    },
  },
  {
    id: 'l_sw',
    name: 'L字（南西欠け）',
    icon: '⌞',
    dimensions: [
      { key: 'tw', label: '全幅(mm)', defaultMm: 9000 },
      { key: 'th', label: '全高(mm)', defaultMm: 7000 },
      { key: 'cw', label: '欠け幅(mm)', defaultMm: 3000 },
      { key: 'ch', label: '欠け高(mm)', defaultMm: 3000 },
    ],
    buildPoints: (d) => {
      const tw = mmToGrid(d.tw);
      const th = mmToGrid(d.th);
      const cw = mmToGrid(d.cw);
      const ch = mmToGrid(d.ch);
      return [
        { x: 0, y: 0 },
        { x: tw, y: 0 },
        { x: tw, y: th },
        { x: cw, y: th },
        { x: cw, y: th - ch },
        { x: 0, y: th - ch },
      ];
    },
  },
  // --- 凸字 4種 ---
  {
    id: 'convex_s',
    name: '凸字（南出）',
    icon: '⊥',
    dimensions: [
      { key: 'tw', label: '全幅(mm)', defaultMm: 9000 },
      { key: 'th', label: '全高(mm)', defaultMm: 7000 },
      { key: 'pw', label: '出幅(mm)', defaultMm: 3000 },
      { key: 'ph', label: '出高(mm)', defaultMm: 2000 },
      { key: 'px', label: '出横位置(mm)', defaultMm: 3000 },
    ],
    buildPoints: (d) => {
      const tw = mmToGrid(d.tw);
      const th = mmToGrid(d.th);
      const pw = mmToGrid(d.pw);
      const ph = mmToGrid(d.ph);
      const px = mmToGrid(d.px);
      return [
        { x: 0, y: 0 },
        { x: tw, y: 0 },
        { x: tw, y: th },
        { x: px + pw, y: th },
        { x: px + pw, y: th + ph },
        { x: px, y: th + ph },
        { x: px, y: th },
        { x: 0, y: th },
      ];
    },
  },
  {
    id: 'convex_n',
    name: '凸字（北出）',
    icon: '⊤',
    dimensions: [
      { key: 'tw', label: '全幅(mm)', defaultMm: 9000 },
      { key: 'th', label: '全高(mm)', defaultMm: 7000 },
      { key: 'pw', label: '出幅(mm)', defaultMm: 3000 },
      { key: 'ph', label: '出高(mm)', defaultMm: 2000 },
      { key: 'px', label: '出横位置(mm)', defaultMm: 3000 },
    ],
    buildPoints: (d) => {
      const tw = mmToGrid(d.tw);
      const th = mmToGrid(d.th);
      const pw = mmToGrid(d.pw);
      const ph = mmToGrid(d.ph);
      const px = mmToGrid(d.px);
      return [
        { x: px, y: -ph },
        { x: px + pw, y: -ph },
        { x: px + pw, y: 0 },
        { x: tw, y: 0 },
        { x: tw, y: th },
        { x: 0, y: th },
        { x: 0, y: 0 },
        { x: px, y: 0 },
      ];
    },
  },
  {
    id: 'convex_e',
    name: '凸字（東出）',
    icon: '⊢',
    dimensions: [
      { key: 'tw', label: '全幅(mm)', defaultMm: 7000 },
      { key: 'th', label: '全高(mm)', defaultMm: 9000 },
      { key: 'pw', label: '出幅(mm)', defaultMm: 2000 },
      { key: 'ph', label: '出高(mm)', defaultMm: 3000 },
      { key: 'py', label: '出縦位置(mm)', defaultMm: 3000 },
    ],
    buildPoints: (d) => {
      const tw = mmToGrid(d.tw);
      const th = mmToGrid(d.th);
      const pw = mmToGrid(d.pw);
      const ph = mmToGrid(d.ph);
      const py = mmToGrid(d.py);
      return [
        { x: 0, y: 0 },
        { x: tw, y: 0 },
        { x: tw, y: py },
        { x: tw + pw, y: py },
        { x: tw + pw, y: py + ph },
        { x: tw, y: py + ph },
        { x: tw, y: th },
        { x: 0, y: th },
      ];
    },
  },
  {
    id: 'convex_w',
    name: '凸字（西出）',
    icon: '⊣',
    dimensions: [
      { key: 'tw', label: '全幅(mm)', defaultMm: 7000 },
      { key: 'th', label: '全高(mm)', defaultMm: 9000 },
      { key: 'pw', label: '出幅(mm)', defaultMm: 2000 },
      { key: 'ph', label: '出高(mm)', defaultMm: 3000 },
      { key: 'py', label: '出縦位置(mm)', defaultMm: 3000 },
    ],
    buildPoints: (d) => {
      const tw = mmToGrid(d.tw);
      const th = mmToGrid(d.th);
      const pw = mmToGrid(d.pw);
      const ph = mmToGrid(d.ph);
      const py = mmToGrid(d.py);
      return [
        { x: 0, y: 0 },
        { x: tw, y: 0 },
        { x: tw, y: th },
        { x: 0, y: th },
        { x: 0, y: py + ph },
        { x: -pw, y: py + ph },
        { x: -pw, y: py },
        { x: 0, y: py },
      ];
    },
  },
  // --- コの字 2種 ---
  {
    id: 'u_s',
    name: 'コの字（南開）',
    icon: '∪',
    dimensions: [
      { key: 'tw', label: '全幅(mm)', defaultMm: 9000 },
      { key: 'th', label: '全高(mm)', defaultMm: 7000 },
      { key: 'ow', label: '開口幅(mm)', defaultMm: 3000 },
      { key: 'od', label: '奥行き(mm)', defaultMm: 3000 },
    ],
    buildPoints: (d) => {
      const tw = mmToGrid(d.tw);
      const th = mmToGrid(d.th);
      const ow = mmToGrid(d.ow);
      const od = mmToGrid(d.od);
      const ox = Math.round((tw - ow) / 2);
      return [
        { x: 0, y: 0 },
        { x: tw, y: 0 },
        { x: tw, y: th },
        { x: ox + ow, y: th },
        { x: ox + ow, y: th - od },
        { x: ox, y: th - od },
        { x: ox, y: th },
        { x: 0, y: th },
      ];
    },
  },
  {
    id: 'u_n',
    name: 'コの字（北開）',
    icon: '∩',
    dimensions: [
      { key: 'tw', label: '全幅(mm)', defaultMm: 9000 },
      { key: 'th', label: '全高(mm)', defaultMm: 7000 },
      { key: 'ow', label: '開口幅(mm)', defaultMm: 3000 },
      { key: 'od', label: '奥行き(mm)', defaultMm: 3000 },
    ],
    buildPoints: (d) => {
      const tw = mmToGrid(d.tw);
      const th = mmToGrid(d.th);
      const ow = mmToGrid(d.ow);
      const od = mmToGrid(d.od);
      const ox = Math.round((tw - ow) / 2);
      return [
        { x: 0, y: 0 },
        { x: ox, y: 0 },
        { x: ox, y: od },
        { x: ox + ow, y: od },
        { x: ox + ow, y: 0 },
        { x: tw, y: 0 },
        { x: tw, y: th },
        { x: 0, y: th },
      ];
    },
  },
  // --- T字・十字 ---
  {
    id: 't_cross',
    name: 'T字・十字',
    icon: '✚',
    dimensions: [
      { key: 'hw', label: '横幅(mm)', defaultMm: 12000 },
      { key: 'hh', label: '横高さ(mm)', defaultMm: 3000 },
      { key: 'vw', label: '縦幅(mm)', defaultMm: 3000 },
      { key: 'vh', label: '縦高さ(mm)', defaultMm: 12000 },
    ],
    buildPoints: (d) => {
      const hw = mmToGrid(d.hw);
      const hh = mmToGrid(d.hh);
      const vw = mmToGrid(d.vw);
      const vh = mmToGrid(d.vh);
      const cx = Math.round(hw / 2);
      const cy = Math.round(vh / 2);
      const hvw = Math.round(vw / 2);
      const hhh = Math.round(hh / 2);
      return [
        { x: cx - hvw, y: 0 },
        { x: cx + hvw, y: 0 },
        { x: cx + hvw, y: cy - hhh },
        { x: hw, y: cy - hhh },
        { x: hw, y: cy + hhh },
        { x: cx + hvw, y: cy + hhh },
        { x: cx + hvw, y: vh },
        { x: cx - hvw, y: vh },
        { x: cx - hvw, y: cy + hhh },
        { x: 0, y: cy + hhh },
        { x: 0, y: cy - hhh },
        { x: cx - hvw, y: cy - hhh },
      ];
    },
  },
];

/** テンプレートIDからテンプレートを取得 */
export const getTemplate = (id: BuildingTemplateId): BuildingTemplate | undefined =>
  BUILDING_TEMPLATES.find((t) => t.id === id);

/** テンプレートからBuilding形状を生成し、キャンバス中央に配置 */
export const buildFromTemplate = (
  templateId: BuildingTemplateId,
  dims: Record<string, number>,
  centerX: number,
  centerY: number
): Point[] => {
  const template = getTemplate(templateId);
  if (!template) return [];

  const points = template.buildPoints(dims);

  // バウンディングボックスを計算して中央配置
  const minX = Math.min(...points.map((p) => p.x));
  const maxX = Math.max(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y));
  const maxY = Math.max(...points.map((p) => p.y));
  const bw = maxX - minX;
  const bh = maxY - minY;
  const offsetX = centerX - Math.round(bw / 2) - minX;
  const offsetY = centerY - Math.round(bh / 2) - minY;

  return points.map((p) => ({ x: p.x + offsetX, y: p.y + offsetY }));
};
