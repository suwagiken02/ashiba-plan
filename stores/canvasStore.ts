'use client';

import { create } from 'zustand';
import {
  CanvasData,
  ModeType,
  BuildingShape,
  Handrail,
  Post,
  Anti,
  Obstacle,
  Memo,
  RoofOverhang,
  AntiWidth,
  HandrailLengthMm,
  HandrailDirection,
  BuildingInputMethod,
  ScaffoldStartConfig,
  MemoShape,
} from '@/types';
import { DEFAULT_COLS, DEFAULT_ROWS, INITIAL_GRID_PX, ZOOM_MIN, ZOOM_MAX } from '@/lib/konva/gridUtils';

const createEmptyCanvasData = (): CanvasData => ({
  version: '1.0',
  grid: { unitMm: 10, cols: DEFAULT_COLS, rows: DEFAULT_ROWS },
  buildings: [],
  roofOverhangs: [],
  obstacles: [],
  handrails: [],
  posts: [],
  antis: [],
  memos: [],
  compass: { angle: 0 },
});

type HistoryState = {
  past: CanvasData[];
  future: CanvasData[];
};

type CanvasStore = {
  // Drawing ID
  drawingId: string | null;
  projectId: string | null;
  setDrawingId: (id: string | null) => void;
  setProjectId: (id: string | null) => void;

  // Canvas data
  canvasData: CanvasData;
  setCanvasData: (data: CanvasData) => void;

  // Mode
  mode: ModeType;
  setMode: (mode: ModeType) => void;
  buildingInputMethod: BuildingInputMethod;
  setBuildingInputMethod: (m: BuildingInputMethod) => void;

  // Selection
  selectedIds: string[];
  setSelectedIds: (ids: string[]) => void;
  selectedHandrailLength: HandrailLengthMm;
  setSelectedHandrailLength: (l: HandrailLengthMm) => void;
  selectedAntiWidth: AntiWidth;
  setSelectedAntiWidth: (w: AntiWidth) => void;
  selectedAntiLength: number;
  setSelectedAntiLength: (l: number) => void;

  // Handrail drag preview & snap
  handrailPreview: { x: number; y: number; lengthMm: number; direction: HandrailDirection } | null;
  setHandrailPreview: (p: { x: number; y: number; lengthMm: number; direction: HandrailDirection } | null) => void;
  snapPoint: { x: number; y: number } | null;
  setSnapPoint: (p: { x: number; y: number } | null) => void;

  // Obstacle drag preview
  obstaclePreview: { x: number; y: number; widthGrid: number; heightGrid: number; type: import('@/types').ObstacleType } | null;
  setObstaclePreview: (p: { x: number; y: number; widthGrid: number; heightGrid: number; type: import('@/types').ObstacleType } | null) => void;

  // 頂点タップモード
  vertexPoints: { x: number; y: number }[];
  addVertexPoint: (p: { x: number; y: number }) => void;
  removeLastVertexPoint: () => void;
  clearVertexPoints: () => void;

  // 壁方向入力モード
  directionPoints: { x: number; y: number }[];
  addDirectionPoint: (p: { x: number; y: number }) => void;
  removeLastDirectionPoint: () => void;
  clearDirectionPoints: () => void;
  showDirectionInputModal: boolean;
  setShowDirectionInputModal: (show: boolean) => void;
  pendingDirection: 'up' | 'down' | 'left' | 'right' | null;
  setPendingDirection: (dir: 'up' | 'down' | 'left' | 'right' | null) => void;
  lastMoveDirection: 'up' | 'down' | 'left' | 'right';
  setLastMoveDirection: (dir: 'up' | 'down' | 'left' | 'right') => void;
  showDirectionGuide: boolean;
  toggleDirectionGuide: () => void;

  // Dimensions toggle
  showDimensions: boolean;
  toggleShowDimensions: () => void;
  showGridGuide: boolean;
  toggleShowGridGuide: () => void;
  showPrintArea: boolean;
  toggleShowPrintArea: () => void;
  printPaperSize: import('@/types').PaperSize;
  printScale: import('@/types').ScaleOption;
  setPrintPaperSize: (s: import('@/types').PaperSize) => void;
  setPrintScale: (s: import('@/types').ScaleOption) => void;
  /** 印刷枠の中心位置（グリッド座標、null=建物中心に自動配置） */
  printAreaCenter: { x: number; y: number } | null;
  setPrintAreaCenter: (p: { x: number; y: number } | null) => void;

  // Measurement
  isMeasuring: boolean;
  measurePoint1: { x: number; y: number } | null;
  measureCursor: { x: number; y: number } | null;
  measureResultMm: number | null;
  measurePoint2: { x: number; y: number } | null;
  toggleMeasuring: () => void;
  setMeasurePoint1: (p: { x: number; y: number } | null) => void;
  setMeasurePoint2: (p: { x: number; y: number } | null) => void;
  setMeasureCursor: (p: { x: number; y: number } | null) => void;
  setMeasureResultMm: (mm: number | null) => void;

  // Dark mode
  isDarkMode: boolean;
  toggleDarkMode: () => void;

  // Duplicate mode
  isDuplicateMode: boolean;
  toggleDuplicateMode: () => void;

  // Highlight (点滅表示)
  highlightIds: string[];
  setHighlightIds: (ids: string[]) => void;

  // 離れ表示
  showKidare: boolean;
  toggleShowKidare: () => void;

  // モーダル表示（ボトムナビから開く）
  showScaffoldStart: boolean;
  setShowScaffoldStart: (show: boolean) => void;
  showAutoLayout: boolean;
  setShowAutoLayout: (show: boolean) => void;
  showBuildingModal: boolean;
  setShowBuildingModal: (show: boolean) => void;
  showBuilding2FModal: boolean;
  setShowBuilding2FModal: (show: boolean) => void;
  showSettings: boolean;
  setShowSettings: (show: boolean) => void;
  showPartSelector: boolean;
  togglePartSelector: () => void;
  showSettingsPanel: boolean;
  toggleSettingsPanel: () => void;

  // メモ作成
  memoDraft: { shape: MemoShape; text: string; angle: number; scaleX: number; scaleY: number } | null;
  setMemoDraft: (draft: { shape: MemoShape; text: string; angle: number; scaleX: number; scaleY: number } | null) => void;
  clearMemoDraft: () => void;
  showMemoCreateModal: boolean;
  setShowMemoCreateModal: (show: boolean) => void;
  lastMemoSettings: { shape: MemoShape; text: string; angle: number; scaleX: number; scaleY: number } | null;
  setLastMemoSettings: (s: { shape: MemoShape; text: string; angle: number; scaleX: number; scaleY: number } | null) => void;
  showInnerPost: boolean;
  setShowInnerPost: (show: boolean) => void;

  // コーナーガイド・グリッド強弱
  showCornerGuide: boolean;
  toggleShowCornerGuide: () => void;
  gridStrength: number;
  setGridStrength: (s: number) => void;

  // 手摺入れ替えモード
  isReorderMode: boolean;
  toggleReorderMode: () => void;
  reorderHandrails: (lineIds: string[], newOrder: string[]) => void;
  selectedLineIds: string[];
  setSelectedLineIds: (ids: string[]) => void;

  // 2F仮配置
  building2FDraft: {
    points: { x: number; y: number }[];
    anchorPoint: string;
    floor: 2;
    fill: string;
    roof?: import('@/types').RoofConfig;
    templateId?: string;
    templateDims?: Record<string, number>;
  } | null;
  setBuilding2FDraft: (draft: CanvasStore['building2FDraft']) => void;
  clearBuilding2FDraft: () => void;

  // Zoom & Pan
  zoom: number;
  panX: number;
  panY: number;
  setZoom: (z: number) => void;
  setPan: (x: number, y: number) => void;

  // History
  history: HistoryState;
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;

  // Save state
  isDirty: boolean;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  setSaveStatus: (s: 'idle' | 'saving' | 'saved' | 'error') => void;

  // Actions
  addBuilding: (b: BuildingShape) => void;
  updateBuilding: (id: string, points: { x: number; y: number }[]) => void;
  updateBuildingRoof: (id: string, roof: import('@/types').RoofConfig) => void;
  addRoofOverhang: (r: RoofOverhang) => void;
  addHandrail: (h: Handrail) => void;
  addHandrails: (hs: Handrail[]) => void;
  addPost: (p: Post) => void;
  addAnti: (a: Anti) => void;
  addObstacle: (o: Obstacle) => void;
  addMemo: (m: Memo) => void;
  removeElement: (id: string) => void;
  removeElements: (ids: string[]) => void;
  moveElement: (id: string, dx: number, dy: number) => void;
  setCompassAngle: (angle: number) => void;
  setScaffoldStart: (config: ScaffoldStartConfig) => void;
  zoomToFitBuildings: (viewportWidth: number, viewportHeight: number, marginMm?: number) => void;
  resetCanvas: () => void;
};

const MAX_HISTORY = 40;

export const useCanvasStore = create<CanvasStore>((set, get) => ({
  drawingId: null,
  projectId: null,
  setDrawingId: (id) => set({ drawingId: id }),
  setProjectId: (id) => set({ projectId: id }),

  canvasData: createEmptyCanvasData(),
  setCanvasData: (data) => set({ canvasData: data, isDirty: false }),

  mode: 'select',
  setMode: (mode) => set({ mode, selectedIds: [], vertexPoints: [] }),
  buildingInputMethod: 'template',
  setBuildingInputMethod: (m) => set({ buildingInputMethod: m }),

  selectedIds: [],
  setSelectedIds: (ids) => set({ selectedIds: ids }),
  selectedHandrailLength: 1800,
  setSelectedHandrailLength: (l) => set({ selectedHandrailLength: l }),
  selectedAntiWidth: 400,
  setSelectedAntiWidth: (w) => set({ selectedAntiWidth: w }),
  selectedAntiLength: 1800,
  setSelectedAntiLength: (l) => set({ selectedAntiLength: l }),

  handrailPreview: null,
  setHandrailPreview: (p) => set({ handrailPreview: p }),
  snapPoint: null,
  setSnapPoint: (p) => set({ snapPoint: p }),

  obstaclePreview: null,
  setObstaclePreview: (p) => set({ obstaclePreview: p }),

  vertexPoints: [],
  addVertexPoint: (p) => set((state) => ({ vertexPoints: [...state.vertexPoints, p] })),
  removeLastVertexPoint: () => set((state) => ({
    vertexPoints: state.vertexPoints.slice(0, -1)
  })),
  clearVertexPoints: () => set({ vertexPoints: [] }),

  directionPoints: [],
  addDirectionPoint: (p) => set((s) => ({ directionPoints: [...s.directionPoints, p] })),
  removeLastDirectionPoint: () => set((s) => ({ directionPoints: s.directionPoints.slice(0, -1) })),
  clearDirectionPoints: () => set({ directionPoints: [] }),
  showDirectionInputModal: false,
  setShowDirectionInputModal: (show) => set({ showDirectionInputModal: show }),
  pendingDirection: null,
  setPendingDirection: (dir) => set({ pendingDirection: dir }),
  lastMoveDirection: 'down',
  setLastMoveDirection: (dir) => set({ lastMoveDirection: dir }),
  showDirectionGuide: true,
  toggleDirectionGuide: () => set({ showDirectionGuide: !get().showDirectionGuide }),

  showDimensions: true,
  toggleShowDimensions: () => set({ showDimensions: !get().showDimensions }),
  showGridGuide: false,
  toggleShowGridGuide: () => set({ showGridGuide: !get().showGridGuide }),
  showPrintArea: false,
  toggleShowPrintArea: () => set({ showPrintArea: !get().showPrintArea }),
  printPaperSize: 'A4_landscape' as import('@/types').PaperSize,
  printScale: '1/100' as import('@/types').ScaleOption,
  setPrintPaperSize: (s) => set({ printPaperSize: s }),
  setPrintScale: (s) => set({ printScale: s }),
  printAreaCenter: null,
  setPrintAreaCenter: (p) => set({ printAreaCenter: p }),

  isMeasuring: false,
  measurePoint1: null,
  measurePoint2: null,
  measureCursor: null,
  measureResultMm: null,
  toggleMeasuring: () => {
    const { isMeasuring } = get();
    set({
      isMeasuring: !isMeasuring,
      measurePoint1: null,
      measurePoint2: null,
      measureCursor: null,
      measureResultMm: null,
    });
  },
  setMeasurePoint1: (p) => set({ measurePoint1: p }),
  setMeasurePoint2: (p) => set({ measurePoint2: p }),
  setMeasureCursor: (p) => set({ measureCursor: p }),
  setMeasureResultMm: (mm) => set({ measureResultMm: mm }),

  isDarkMode: false,
  toggleDarkMode: () => {
    const next = !get().isDarkMode;
    set({ isDarkMode: next });
    if (typeof document !== 'undefined') {
      document.body.classList.toggle('dark-mode', next);
    }
  },

  isDuplicateMode: false,
  toggleDuplicateMode: () => set({ isDuplicateMode: !get().isDuplicateMode }),

  highlightIds: [],
  setHighlightIds: (ids) => set({ highlightIds: ids }),

  showKidare: false,
  toggleShowKidare: () => set({ showKidare: !get().showKidare }),

  showScaffoldStart: false,
  setShowScaffoldStart: (show) => set({ showScaffoldStart: show }),
  showAutoLayout: false,
  setShowAutoLayout: (show) => set({ showAutoLayout: show }),
  showBuildingModal: false,
  setShowBuildingModal: (show) => set({ showBuildingModal: show }),
  showBuilding2FModal: false,
  setShowBuilding2FModal: (show) => set({ showBuilding2FModal: show }),
  showSettings: false,
  setShowSettings: (show) => set({ showSettings: show }),
  showPartSelector: false,
  togglePartSelector: () => set({ showPartSelector: !get().showPartSelector }),
  showSettingsPanel: true,
  toggleSettingsPanel: () => set({ showSettingsPanel: !get().showSettingsPanel }),

  memoDraft: null,
  setMemoDraft: (draft) => set({ memoDraft: draft }),
  clearMemoDraft: () => set({ memoDraft: null }),
  showMemoCreateModal: false,
  setShowMemoCreateModal: (show) => set({ showMemoCreateModal: show }),
  lastMemoSettings: null,
  setLastMemoSettings: (s) => set({ lastMemoSettings: s }),
  showInnerPost: false,
  setShowInnerPost: (show) => set({ showInnerPost: show }),

  showCornerGuide: false,
  toggleShowCornerGuide: () => set({ showCornerGuide: !get().showCornerGuide }),
  gridStrength: 1,
  setGridStrength: (s) => set({ gridStrength: s }),

  isReorderMode: false,
  toggleReorderMode: () => {
    const next = !get().isReorderMode;
    set({ isReorderMode: next });
    if (next) {
      // 入替モードON時はselectモードに切り替え
      get().setMode('select');
    }
  },
  selectedLineIds: [],
  setSelectedLineIds: (ids) => set({ selectedLineIds: ids }),
  reorderHandrails: (lineIds: string[], newOrder: string[]) => {
    const { canvasData } = get();
    const lineGroup = canvasData.handrails.filter(h => lineIds.includes(h.id));
    const others = canvasData.handrails.filter(h => !lineIds.includes(h.id));
    const isHoriz = lineGroup[0]?.direction === 'horizontal';
    const sorted = [...lineGroup].sort((a, b) =>
      isHoriz ? a.x - b.x : a.y - b.y
    );
    // 先頭の開始座標を固定
    const startCoord = isHoriz ? sorted[0].x : sorted[0].y;
    // newOrderの順番で手摺を取り出してcursorで詰める
    const reordered: typeof lineGroup = [];
    let cursor = startCoord;
    for (const id of newOrder) {
      const handrail = lineGroup.find(h => h.id === id)!;
      if (isHoriz) {
        reordered.push({ ...handrail, x: cursor });
      } else {
        reordered.push({ ...handrail, y: cursor });
      }
      cursor += Math.round(handrail.lengthMm / 10);
    }
    get().pushHistory();
    set({
      canvasData: { ...canvasData, handrails: [...others, ...reordered] },
      isDirty: true,
    });
  },

  building2FDraft: null,
  setBuilding2FDraft: (draft) => set({ building2FDraft: draft }),
  clearBuilding2FDraft: () => set({ building2FDraft: null }),

  zoom: 1.0,
  panX: 0,
  panY: 0,
  setZoom: (z) => set({ zoom: Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z)) }),
  setPan: (x, y) => set({ panX: x, panY: y }),

  history: { past: [], future: [] },
  pushHistory: () => {
    const { canvasData, history } = get();
    const past = [...history.past, JSON.parse(JSON.stringify(canvasData))].slice(-MAX_HISTORY);
    set({ history: { past, future: [] }, isDirty: true });
  },
  undo: () => {
    const { canvasData, history } = get();
    if (history.past.length === 0) return;
    const past = [...history.past];
    const prev = past.pop()!;
    set({
      canvasData: prev,
      history: {
        past,
        future: [JSON.parse(JSON.stringify(canvasData)), ...history.future],
      },
      isDirty: true,
    });
  },
  redo: () => {
    const { canvasData, history } = get();
    if (history.future.length === 0) return;
    const future = [...history.future];
    const next = future.shift()!;
    set({
      canvasData: next,
      history: {
        past: [...history.past, JSON.parse(JSON.stringify(canvasData))],
        future,
      },
      isDirty: true,
    });
  },

  isDirty: false,
  saveStatus: 'idle',
  setSaveStatus: (s) => set({ saveStatus: s }),

  addBuilding: (b) => {
    const { canvasData, pushHistory } = get();
    pushHistory();
    set({
      canvasData: { ...canvasData, buildings: [...canvasData.buildings, b] },
      isDirty: true,
    });
  },
  updateBuilding: (id, points) => {
    const { canvasData, pushHistory } = get();
    pushHistory();
    set({
      canvasData: {
        ...canvasData,
        buildings: canvasData.buildings.map((b) =>
          b.id === id ? { ...b, points } : b
        ),
      },
      isDirty: true,
    });
  },
  updateBuildingRoof: (id, roof) => {
    const { canvasData, pushHistory } = get();
    pushHistory();
    set({
      canvasData: {
        ...canvasData,
        buildings: canvasData.buildings.map((b) =>
          b.id === id ? { ...b, roof } : b
        ),
      },
      isDirty: true,
    });
  },
  addRoofOverhang: (r) => {
    const { canvasData, pushHistory } = get();
    pushHistory();
    set({
      canvasData: {
        ...canvasData,
        roofOverhangs: [...canvasData.roofOverhangs, r],
      },
      isDirty: true,
    });
  },
  addHandrail: (h) => {
    const { canvasData, pushHistory } = get();
    pushHistory();
    set({
      canvasData: { ...canvasData, handrails: [...canvasData.handrails, h] },
      isDirty: true,
    });
  },
  addHandrails: (hs) => {
    if (hs.length === 0) return;
    const { canvasData, pushHistory } = get();
    pushHistory();
    set({
      canvasData: { ...canvasData, handrails: [...canvasData.handrails, ...hs] },
      isDirty: true,
    });
  },
  addPost: (p) => {
    const { canvasData, pushHistory } = get();
    pushHistory();
    set({
      canvasData: { ...canvasData, posts: [...canvasData.posts, p] },
      isDirty: true,
    });
  },
  addAnti: (a) => {
    const { canvasData, pushHistory } = get();
    pushHistory();
    set({
      canvasData: { ...canvasData, antis: [...canvasData.antis, a] },
      isDirty: true,
    });
  },
  addObstacle: (o) => {
    const { canvasData, pushHistory } = get();
    pushHistory();
    set({
      canvasData: { ...canvasData, obstacles: [...canvasData.obstacles, o] },
      isDirty: true,
    });
  },
  addMemo: (m) => {
    const { canvasData, pushHistory } = get();
    pushHistory();
    set({
      canvasData: { ...canvasData, memos: [...canvasData.memos, m] },
      isDirty: true,
    });
  },
  removeElement: (id) => {
    const { canvasData, pushHistory } = get();
    pushHistory();
    set({
      canvasData: {
        ...canvasData,
        buildings: canvasData.buildings.filter((b) => b.id !== id),
        roofOverhangs: canvasData.roofOverhangs.filter((r) => r.id !== id),
        handrails: canvasData.handrails.filter((h) => h.id !== id),
        posts: canvasData.posts.filter((p) => p.id !== id),
        antis: canvasData.antis.filter((a) => a.id !== id),
        obstacles: canvasData.obstacles.filter((o) => o.id !== id),
        memos: canvasData.memos.filter((m) => m.id !== id),
      },
      isDirty: true,
    });
  },
  removeElements: (ids) => {
    const { canvasData, pushHistory } = get();
    pushHistory();
    const idSet = new Set(ids);
    set({
      canvasData: {
        ...canvasData,
        buildings: canvasData.buildings.filter((b) => !idSet.has(b.id)),
        roofOverhangs: canvasData.roofOverhangs.filter((r) => !idSet.has(r.id)),
        handrails: canvasData.handrails.filter((h) => !idSet.has(h.id)),
        posts: canvasData.posts.filter((p) => !idSet.has(p.id)),
        antis: canvasData.antis.filter((a) => !idSet.has(a.id)),
        obstacles: canvasData.obstacles.filter((o) => !idSet.has(o.id)),
        memos: canvasData.memos.filter((m) => !idSet.has(m.id)),
      },
      selectedIds: [],
      isDirty: true,
    });
  },
  moveElement: (id, dx, dy) => {
    const { canvasData } = get();
    set({
      canvasData: {
        ...canvasData,
        buildings: canvasData.buildings.map((b) =>
          b.id === id
            ? { ...b, points: b.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) }
            : b
        ),
        handrails: canvasData.handrails.map((h) =>
          h.id === id ? { ...h, x: h.x + dx, y: h.y + dy } : h
        ),
        posts: canvasData.posts.map((p) =>
          p.id === id ? { ...p, x: p.x + dx, y: p.y + dy } : p
        ),
        antis: canvasData.antis.map((a) =>
          a.id === id ? { ...a, x: a.x + dx, y: a.y + dy } : a
        ),
        obstacles: canvasData.obstacles.map((o) =>
          o.id === id ? { ...o, x: o.x + dx, y: o.y + dy } : o
        ),
        memos: canvasData.memos.map((m) =>
          m.id === id ? { ...m, x: m.x + dx, y: m.y + dy } : m
        ),
      },
      isDirty: true,
    });
  },
  setCompassAngle: (angle) => {
    const { canvasData } = get();
    set({ canvasData: { ...canvasData, compass: { angle } } });
  },
  setScaffoldStart: (config) => {
    const { canvasData, pushHistory } = get();
    pushHistory();
    set({
      canvasData: { ...canvasData, scaffoldStart: config },
      isDirty: true,
    });
  },
  zoomToFitBuildings: (viewportWidth, viewportHeight, marginMm = 2000) => {
    const { canvasData } = get();
    if (canvasData.buildings.length === 0) return;

    // 全建物の頂点からバウンディングボックスを計算
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const b of canvasData.buildings) {
      for (const p of b.points) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
    }

    const buildingW = maxX - minX;
    const buildingH = maxY - minY;
    if (buildingW <= 0 || buildingH <= 0) return;

    // 建物の周囲に指定mmの余白を含めてフィット
    const marginGrid = marginMm / 10;
    const fitW = buildingW + marginGrid * 2;
    const fitH = buildingH + marginGrid * 2;
    const zoomX = viewportWidth / (fitW * INITIAL_GRID_PX);
    const zoomY = viewportHeight / (fitH * INITIAL_GRID_PX);
    const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.min(zoomX, zoomY)));

    // 建物中心が画面中央に来るようにパンを計算
    const centerGridX = (minX + maxX) / 2;
    const centerGridY = (minY + maxY) / 2;
    const newPanX = viewportWidth / 2 - centerGridX * INITIAL_GRID_PX * newZoom;
    const newPanY = viewportHeight / 2 - centerGridY * INITIAL_GRID_PX * newZoom;

    set({ zoom: newZoom, panX: newPanX, panY: newPanY });
  },
  resetCanvas: () => {
    set({
      canvasData: createEmptyCanvasData(),
      history: { past: [], future: [] },
      isDirty: false,
      selectedIds: [],
    });
  },
}));
