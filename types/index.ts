// === 座標（グリッド単位、1単位=10mm） ===
export type Point = { x: number; y: number };

// === 操作モード ===
export type ModeType = 'building' | 'handrail' | 'post' | 'anti' | 'select' | 'erase' | 'memo' | 'obstacle';

// === 建物入力方式 ===
export type BuildingInputMethod = 'template' | 'freedraw' | 'vertex';

// === 屋根タイプ ===
export type RoofType = 'kirizuma' | 'yosemune' | 'katanagare' | 'none';

// === 屋根出幅設定 ===
export type RoofConfig = {
  roofType: RoofType;
  /** 全面同じ出幅の場合の値(mm) */
  uniformMm: number;
  /** 面ごとの出幅(mm)。null=全面同じ */
  northMm: number | null;
  southMm: number | null;
  eastMm: number | null;
  westMm: number | null;
  /** 片流れの軒側 */
  katanagareDirection?: 'north' | 'south' | 'east' | 'west';
  /** 切妻の妻面方向 */
  kirizumaGableFace?: 'ew' | 'ns';
};

// === 建物外形 ===
export type BuildingShape = {
  id: string;
  type: 'polygon';
  points: Point[];
  fill: string;
  roof?: RoofConfig;
};

// === 屋根の出幅 ===
export type RoofOverhang = {
  id: string;
  buildingId: string;
  faceIndex: number;
  overhangMm: number;
};

// === 障害物 ===
export type ObstacleType = 'ecocute' | 'aircon' | 'bay_window' | 'carport' | 'sunroom' | 'custom_rect' | 'custom_circle';

export type Obstacle = {
  id: string;
  type: ObstacleType;
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
  memo?: string;
};

// === 手摺 ===
export type HandrailLengthMm = 1800 | 1200 | 900 | 600 | 400 | 300 | 200;
export type HandrailDirection = 'horizontal' | 'vertical' | number;

export type Handrail = {
  id: string;
  x: number;
  y: number;
  lengthMm: HandrailLengthMm;
  direction: HandrailDirection;
  color: string;
};

// === 支柱 ===
export type Post = {
  id: string;
  x: number;
  y: number;
};

// === アンチ（踏板） ===
export type AntiWidth = 400 | 250;

export type Anti = {
  id: string;
  x: number;
  y: number;
  width: AntiWidth;
  lengthMm: number;
  direction: 'horizontal' | 'vertical';
};

// === メモ ===
export type Memo = {
  id: string;
  x: number;
  y: number;
  text: string;
  style: 'plain' | 'callout';
  arrowTo?: Point;
};

// === キャンバスデータ（保存用） ===
export type CanvasData = {
  version: string;
  grid: {
    unitMm: 10;
    cols: number;
    rows: number;
  };
  buildings: BuildingShape[];
  roofOverhangs: RoofOverhang[];
  obstacles: Obstacle[];
  handrails: Handrail[];
  posts: Post[];
  antis: Anti[];
  memos: Memo[];
  compass: { angle: number };
  scaffoldStart?: ScaffoldStartConfig;
};

// === 建物テンプレート ===
export type BuildingTemplateId =
  | 'rect'
  | 'l_ne' | 'l_nw' | 'l_se' | 'l_sw'
  | 'convex_s' | 'convex_n' | 'convex_e' | 'convex_w'
  | 'u_s' | 'u_n'
  | 't_cross'
  | 'circle';

export type TemplateDimension = {
  key: string;
  label: string;
  defaultMm: number;
};

export type BuildingTemplate = {
  id: BuildingTemplateId;
  name: string;
  icon: string;
  dimensions: TemplateDimension[];
  buildPoints: (dims: Record<string, number>) => Point[];
};

// === 足場開始設定 ===
export type StartCorner = 'ne' | 'nw' | 'se' | 'sw';

export type ScaffoldStartConfig = {
  corner: StartCorner;
  /** 選択した頂点のインデックス（getBuildingEdgesClockwise の辺順） */
  startVertexIndex?: number;
  /** 角に接する2面の離れ(mm) - face1は水平面、face2は垂直面 */
  face1DistanceMm: number;
  face2DistanceMm: number;
  /** 角に接する2面の最初の手摺の長さ(mm) */
  face1FirstHandrail: HandrailLengthMm;
  face2FirstHandrail: HandrailLengthMm;
};

// === 出力設定 ===
export type PaperSize = 'A4_portrait' | 'A4_landscape' | 'A3_portrait' | 'A3_landscape';
export type ScaleOption = '1/50' | '1/100' | '1/200' | '1/300' | 'auto';

export type ExportSettings = {
  format: 'pdf' | 'png' | 'dxf';
  paperSize: PaperSize;
  scale: ScaleOption;
  companyName: string;
  companyLogoUrl?: string;
  siteName: string;
  date: string;
};

// === プロジェクト ===
export type Project = {
  id: string;
  owner_id: string;
  name: string;
  address?: string;
  created_at: string;
  updated_at: string;
};

export type Drawing = {
  id: string;
  project_id: string;
  title: string;
  canvas_data: CanvasData;
  thumbnail_url?: string;
  created_at: string;
  updated_at: string;
};
