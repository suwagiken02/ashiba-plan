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
  MagnetPin,
} from '@/types';
import { PinAnchor } from '@/lib/magnetPin/anchorPoints';
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
  magnetPins: [],
});

/** 互換: 旧プロジェクトで欠落しているフィールドを補完する */
const normalizeCanvasData = (data: CanvasData): CanvasData => {
  const normalized: CanvasData = {
    ...data,
    magnetPins: data.magnetPins ?? [],
  };
  // 旧 scaffoldStart → scaffoldStart1F / scaffoldStart2F への移行。
  // 既に 1F/2F 側が入っていればそちらを優先（二重上書きしない）。
  if (data.scaffoldStart) {
    const floor = data.scaffoldStart.floor ?? 1;
    if (floor === 1 && !normalized.scaffoldStart1F) {
      normalized.scaffoldStart1F = data.scaffoldStart;
    } else if (floor === 2 && !normalized.scaffoldStart2F) {
      normalized.scaffoldStart2F = data.scaffoldStart;
    }
  }
  return normalized;
};

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
  /** マグネットピン配置モード（M-3a）: ModeType とは独立した副次フラグ */
  isMagnetPinMode: boolean;
  setMagnetPinMode: (v: boolean) => void;
  /** ピン配置の選択中起点（M-3b） */
  pinAnchor: PinAnchor | null;
  setPinAnchor: (anchor: PinAnchor | null) => void;
  /** ピン配置: anchor からの相対オフセット (mm)（M-3c） */
  pinDraftOffset: { dx: number; dy: number } | null;
  setPinDraftOffset: (offset: { dx: number; dy: number } | null) => void;
  /** ピン配置: 数値入力モーダルが開いてる方向（M-3c） */
  pinDirectionInput: 'up' | 'down' | 'left' | 'right' | null;
  setPinDirectionInput: (dir: 'up' | 'down' | 'left' | 'right' | null) => void;

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

  // 壁方向入力モード
  directionPoints: { x: number; y: number }[];
  directionPointsHistory: { x: number; y: number }[][];
  lastCompletedDirectionSession: { points: { x: number; y: number }[] } | null;
  addDirectionPoint: (p: { x: number; y: number }) => void;
  undoDirectionPoint: () => void;
  removeLastDirectionPoint: () => void;
  clearDirectionPoints: () => void;
  setDirectionPoints: (points: { x: number; y: number }[]) => void;
  setLastCompletedDirectionSession: (s: { points: { x: number; y: number }[] } | null) => void;
  autoOpenRoofForBuildingId: string | null;
  setAutoOpenRoofForBuildingId: (id: string | null) => void;
  pendingBuildingFloor: 1 | 2;
  setPendingBuildingFloor: (f: 1 | 2) => void;
  pendingTargetType: 'building' | 'obstacle';
  setPendingTargetType: (t: 'building' | 'obstacle') => void;
  pendingObstacleType: import('@/types').ObstacleType | null;
  setPendingObstacleType: (t: import('@/types').ObstacleType | null) => void;
  showDirectionInputModal: boolean;
  setShowDirectionInputModal: (show: boolean) => void;
  pendingDirection: 'up' | 'down' | 'left' | 'right' | null;
  setPendingDirection: (dir: 'up' | 'down' | 'left' | 'right' | null) => void;
  pendingDirectionTarget: { x: number; y: number } | null;
  setPendingDirectionTarget: (p: { x: number; y: number } | null) => void;
  lastMoveDirection: 'up' | 'down' | 'left' | 'right';
  setLastMoveDirection: (dir: 'up' | 'down' | 'left' | 'right') => void;
  showDirectionGuide: boolean;
  toggleDirectionGuide: () => void;

  // Dimensions toggle
  showDimensions: boolean;
  toggleShowDimensions: () => void;
  setShowDimensions: (v: boolean) => void;
  showDimensionLines: boolean;
  toggleShowDimensionLines: () => void;
  setShowDimensionLines: (v: boolean) => void;
  /** キャンバス描画エリアのピクセルサイズ（EditorPage から同期） */
  canvasSize: { width: number; height: number };
  setCanvasSize: (size: { width: number; height: number }) => void;
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
  measureAxisMode: 'free' | 'x' | 'y';
  setMeasureAxisMode: (mode: 'free' | 'x' | 'y') => void;
  toggleMeasuring: () => void;
  setMeasurePoint1: (p: { x: number; y: number } | null) => void;
  setMeasurePoint2: (p: { x: number; y: number } | null) => void;
  setMeasureCursor: (p: { x: number; y: number } | null) => void;
  setMeasureResultMm: (mm: number | null) => void;

  // Dark mode
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  initDarkMode: () => void;

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
  /** 共通警告ダイアログのメッセージ (null=非表示) */
  alertMessage: string | null;
  setAlertMessage: (msg: string | null) => void;
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

  // グリッド強弱
  gridStrength: number;
  setGridStrength: (s: number) => void;

  // 手摺入れ替えモード
  isReorderMode: boolean;
  toggleReorderMode: () => void;
  reorderHandrails: (lineIds: string[], newOrder: string[]) => void;
  selectedLineIds: string[];
  setSelectedLineIds: (ids: string[]) => void;

  // 移動モード共通ステップ (選択移動の矢印ボタン step、mm 単位)
  moveSelectStepMm: 1 | 10 | 100;
  setMoveSelectStepMm: (s: 1 | 10 | 100) => void;

  // 選択移動モード (カテゴリ別 + 選択範囲の要素だけをまとめて移動)
  moveSelectMode: {
    active: boolean;
    /** 3 ステップフローの現在位置 */
    step: 'category' | 'select' | 'move';
    categories: {
      scaffold: boolean;   // handrails + posts + antis
      building: boolean;
      obstacle: boolean;
      memo: boolean;
    };
    selectedIds: string[];
    /** backup からの累積シフト量 (mm) */
    dxMm: number;
    dyMm: number;
    /** enter 時点の canvasData スナップショット (cancel 用) */
    backup: CanvasData | null;
  };
  enterMoveSelectMode: () => void;
  setMoveSelectStep: (step: 'category' | 'select' | 'move') => void;
  /** category → select */
  confirmCategorySelection: () => void;
  /** select → move */
  confirmRangeSelection: () => void;
  /** select → category (選択リセット + canvasData 復元) */
  backToCategory: () => void;
  /** move → select (移動をリセット、選択は維持) */
  backToSelect: () => void;
  setMoveSelectCategories: (categories: { scaffold: boolean; building: boolean; obstacle: boolean; memo: boolean }) => void;
  setMoveSelectIds: (ids: string[]) => void;
  toggleMoveSelectId: (id: string) => void;
  clearMoveSelectIds: () => void;
  /** backup からの絶対シフト量を指定し、選択要素のみ動かす（mm 単位） */
  shiftMoveSelected: (dxMm: number, dyMm: number) => void;
  commitMoveSelectMode: () => void;
  cancelMoveSelectMode: () => void;

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
  addMagnetPin: (pin: MagnetPin) => void;
  addMagnetPins: (pins: MagnetPin[]) => void;
  updateMagnetPin: (id: string, updates: Partial<MagnetPin>) => void;
  removeMagnetPin: (id: string) => void;
  removeMagnetPins: (ids: string[]) => void;
  removeElement: (id: string) => void;
  removeElements: (ids: string[]) => void;
  moveElement: (id: string, dx: number, dy: number) => void;
  setCompassAngle: (angle: number) => void;
  setScaffoldStart: (config: ScaffoldStartConfig) => void;
  setScaffoldStart1F: (config: ScaffoldStartConfig | undefined) => void;
  setScaffoldStart2F: (config: ScaffoldStartConfig | undefined) => void;
  removeScaffoldStart1F: () => void;
  removeScaffoldStart2F: () => void;
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
  setCanvasData: (data) => set({ canvasData: normalizeCanvasData(data), isDirty: false }),

  mode: 'select',
  setMode: (mode) => set({ mode, selectedIds: [] }),
  buildingInputMethod: 'template',
  setBuildingInputMethod: (m) => set({ buildingInputMethod: m }),
  isMagnetPinMode: false,
  setMagnetPinMode: (v) => set(
    v
      ? { isMagnetPinMode: true }
      : { isMagnetPinMode: false, pinAnchor: null, pinDraftOffset: null, pinDirectionInput: null },
  ),
  pinAnchor: null,
  setPinAnchor: (anchor) => set({ pinAnchor: anchor, pinDraftOffset: null, pinDirectionInput: null }),
  pinDraftOffset: null,
  setPinDraftOffset: (offset) => set({ pinDraftOffset: offset }),
  pinDirectionInput: null,
  setPinDirectionInput: (dir) => set({ pinDirectionInput: dir }),

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

  directionPoints: [],
  directionPointsHistory: [],
  lastCompletedDirectionSession: null,
  addDirectionPoint: (p) => set((s) => ({
    directionPointsHistory: [...s.directionPointsHistory, [...s.directionPoints]],
    directionPoints: [...s.directionPoints, p],
  })),
  undoDirectionPoint: () => set((s) => {
    if (s.directionPointsHistory.length === 0) return { directionPoints: [] };
    const newHistory = [...s.directionPointsHistory];
    const prevPoints = newHistory.pop()!;
    return { directionPoints: prevPoints, directionPointsHistory: newHistory };
  }),
  removeLastDirectionPoint: () => set((s) => ({ directionPoints: s.directionPoints.slice(0, -1) })),
  clearDirectionPoints: () => set({ directionPoints: [], directionPointsHistory: [] }),
  setDirectionPoints: (points) => set({ directionPoints: points }),
  setLastCompletedDirectionSession: (s) => set({ lastCompletedDirectionSession: s }),
  autoOpenRoofForBuildingId: null,
  setAutoOpenRoofForBuildingId: (id) => set({ autoOpenRoofForBuildingId: id }),
  pendingBuildingFloor: 1,
  setPendingBuildingFloor: (f) => set({ pendingBuildingFloor: f }),
  pendingTargetType: 'building',
  setPendingTargetType: (t) => set({ pendingTargetType: t }),
  pendingObstacleType: null,
  setPendingObstacleType: (t) => set({ pendingObstacleType: t }),
  showDirectionInputModal: false,
  setShowDirectionInputModal: (show) => set({ showDirectionInputModal: show }),
  pendingDirection: null,
  setPendingDirection: (dir) => set({ pendingDirection: dir }),
  pendingDirectionTarget: null,
  setPendingDirectionTarget: (p) => set({ pendingDirectionTarget: p }),
  lastMoveDirection: 'down',
  setLastMoveDirection: (dir) => set({ lastMoveDirection: dir }),
  showDirectionGuide: true,
  toggleDirectionGuide: () => set({ showDirectionGuide: !get().showDirectionGuide }),

  showDimensions: true,
  toggleShowDimensions: () => set({ showDimensions: !get().showDimensions }),
  setShowDimensions: (v) => set({ showDimensions: v }),
  showDimensionLines: false,
  toggleShowDimensionLines: () => set({ showDimensionLines: !get().showDimensionLines }),
  setShowDimensionLines: (v) => set({ showDimensionLines: v }),
  canvasSize: { width: 0, height: 0 },
  setCanvasSize: (size) => set({ canvasSize: size }),
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
  measureAxisMode: 'free',
  setMeasureAxisMode: (mode) => set({ measureAxisMode: mode }),
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
      try { localStorage.setItem('ashiba:darkMode', next ? '1' : '0'); } catch {}
    }
  },
  /** アプリ起動時に localStorage から dark mode を復元する */
  initDarkMode: () => {
    if (typeof window === 'undefined') return;
    try {
      const saved = localStorage.getItem('ashiba:darkMode');
      const dark = saved === '1';
      set({ isDarkMode: dark });
      document.body.classList.toggle('dark-mode', dark);
    } catch {
      // アクセス不可環境は無視
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
  alertMessage: null,
  setAlertMessage: (msg) => set({ alertMessage: msg }),
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

  // --- 移動モード共通 step (mm) ---
  moveSelectStepMm: 10,
  setMoveSelectStepMm: (s) => set({ moveSelectStepMm: s }),

  // --- 選択移動モード ---
  moveSelectMode: {
    active: false,
    step: 'category',
    categories: { scaffold: true, building: false, obstacle: false, memo: false },
    selectedIds: [],
    dxMm: 0,
    dyMm: 0,
    backup: null,
  },
  enterMoveSelectMode: () => {
    const { canvasData } = get();
    // 現在の（pre-move）状態を履歴に積む → commit 後に undo で戻せる
    get().pushHistory();
    set({
      moveSelectMode: {
        active: true,
        step: 'category',
        categories: { scaffold: true, building: false, obstacle: false, memo: false },
        selectedIds: [],
        dxMm: 0,
        dyMm: 0,
        backup: JSON.parse(JSON.stringify(canvasData)),
      },
      mode: 'move-select',
      selectedIds: [],
    });
  },
  setMoveSelectStep: (step) => {
    const { moveSelectMode } = get();
    set({ moveSelectMode: { ...moveSelectMode, step } });
  },
  confirmCategorySelection: () => {
    const { moveSelectMode } = get();
    set({ moveSelectMode: { ...moveSelectMode, step: 'select' } });
  },
  confirmRangeSelection: () => {
    const { moveSelectMode } = get();
    set({ moveSelectMode: { ...moveSelectMode, step: 'move' } });
  },
  backToCategory: () => {
    const { moveSelectMode } = get();
    const backup = moveSelectMode.backup;
    // 既に何か動かしていたら backup に戻す（念のため）
    if (backup) {
      set({ canvasData: JSON.parse(JSON.stringify(backup)) });
    }
    set({
      moveSelectMode: {
        ...moveSelectMode,
        step: 'category',
        selectedIds: [],
        dxMm: 0,
        dyMm: 0,
      },
    });
  },
  backToSelect: () => {
    const { moveSelectMode } = get();
    const backup = moveSelectMode.backup;
    // 移動は巻き戻すが selectedIds は維持（再調整を想定）
    if (backup) {
      set({ canvasData: JSON.parse(JSON.stringify(backup)) });
    }
    set({
      moveSelectMode: {
        ...moveSelectMode,
        step: 'select',
        dxMm: 0,
        dyMm: 0,
      },
    });
  },
  setMoveSelectCategories: (categories) => {
    const { moveSelectMode } = get();
    set({ moveSelectMode: { ...moveSelectMode, categories } });
  },
  setMoveSelectIds: (ids) => {
    const { moveSelectMode } = get();
    set({ moveSelectMode: { ...moveSelectMode, selectedIds: ids } });
  },
  toggleMoveSelectId: (id) => {
    const { moveSelectMode } = get();
    const exists = moveSelectMode.selectedIds.includes(id);
    const selectedIds = exists
      ? moveSelectMode.selectedIds.filter(x => x !== id)
      : [...moveSelectMode.selectedIds, id];
    set({ moveSelectMode: { ...moveSelectMode, selectedIds } });
  },
  clearMoveSelectIds: () => {
    const { moveSelectMode } = get();
    set({ moveSelectMode: { ...moveSelectMode, selectedIds: [] } });
  },
  shiftMoveSelected: (dxMm, dyMm) => {
    const { moveSelectMode } = get();
    const backup = moveSelectMode.backup;
    if (!backup) return;
    const sel = new Set(moveSelectMode.selectedIds);
    const cats = moveSelectMode.categories;
    const dx = dxMm / 10; // mm → grid
    const dy = dyMm / 10;

    const shifted: CanvasData = {
      ...backup,
      buildings: backup.buildings.map(b =>
        cats.building && sel.has(b.id)
          ? { ...b, points: b.points.map(p => ({ x: p.x + dx, y: p.y + dy })) }
          : b
      ),
      handrails: backup.handrails.map(h =>
        cats.scaffold && sel.has(h.id) ? { ...h, x: h.x + dx, y: h.y + dy } : h
      ),
      posts: backup.posts.map(p =>
        cats.scaffold && sel.has(p.id) ? { ...p, x: p.x + dx, y: p.y + dy } : p
      ),
      antis: backup.antis.map(a =>
        cats.scaffold && sel.has(a.id) ? { ...a, x: a.x + dx, y: a.y + dy } : a
      ),
      obstacles: backup.obstacles.map(o =>
        cats.obstacle && sel.has(o.id)
          ? {
              ...o,
              x: o.x + dx,
              y: o.y + dy,
              ...(o.points ? { points: o.points.map(p => ({ x: p.x + dx, y: p.y + dy })) } : {}),
            }
          : o
      ),
      memos: backup.memos.map(m =>
        cats.memo && sel.has(m.id) ? { ...m, x: m.x + dx, y: m.y + dy } : m
      ),
    };

    set({
      canvasData: shifted,
      moveSelectMode: { ...moveSelectMode, dxMm, dyMm },
      isDirty: true,
    });
  },
  commitMoveSelectMode: () => {
    set({
      moveSelectMode: {
        active: false,
        step: 'category',
        categories: { scaffold: true, building: false, obstacle: false, memo: false },
        selectedIds: [],
        dxMm: 0,
        dyMm: 0,
        backup: null,
      },
      mode: 'select',
      isDirty: true,
    });
  },
  cancelMoveSelectMode: () => {
    const { moveSelectMode } = get();
    const backup = moveSelectMode.backup;
    if (backup) {
      set({ canvasData: backup });
    }
    set({
      moveSelectMode: {
        active: false,
        step: 'category',
        categories: { scaffold: true, building: false, obstacle: false, memo: false },
        selectedIds: [],
        dxMm: 0,
        dyMm: 0,
        backup: null,
      },
      mode: 'select',
    });
  },

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
    set({ history: { past, future: [] }, isDirty: true, lastCompletedDirectionSession: null });
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
  addMagnetPin: (pin) => {
    const { canvasData, pushHistory } = get();
    pushHistory();
    set({
      canvasData: { ...canvasData, magnetPins: [...(canvasData.magnetPins ?? []), pin] },
      isDirty: true,
    });
  },
  addMagnetPins: (pins) => {
    const { canvasData, pushHistory } = get();
    pushHistory();
    set({
      canvasData: { ...canvasData, magnetPins: [...(canvasData.magnetPins ?? []), ...pins] },
      isDirty: true,
    });
  },
  updateMagnetPin: (id, updates) => {
    const { canvasData, pushHistory } = get();
    pushHistory();
    set({
      canvasData: {
        ...canvasData,
        magnetPins: (canvasData.magnetPins ?? []).map((p) =>
          p.id === id ? { ...p, ...updates } : p
        ),
      },
      isDirty: true,
    });
  },
  removeMagnetPin: (id) => {
    const { canvasData, pushHistory } = get();
    pushHistory();
    set({
      canvasData: {
        ...canvasData,
        magnetPins: (canvasData.magnetPins ?? []).filter((p) => p.id !== id),
      },
      isDirty: true,
    });
  },
  removeMagnetPins: (ids) => {
    const { canvasData, pushHistory } = get();
    pushHistory();
    const idSet = new Set(ids);
    set({
      canvasData: {
        ...canvasData,
        magnetPins: (canvasData.magnetPins ?? []).filter((p) => !idSet.has(p.id)),
      },
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
        magnetPins: (canvasData.magnetPins ?? []).filter((p) => p.id !== id),
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
        magnetPins: (canvasData.magnetPins ?? []).filter((p) => !idSet.has(p.id)),
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
          o.id === id
            ? { ...o, x: o.x + dx, y: o.y + dy, ...(o.points ? { points: o.points.map(p => ({ x: p.x + dx, y: p.y + dy })) } : {}) }
            : o
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
    // 後方互換: scaffoldStart 本体を更新しつつ、floor に応じて
    // scaffoldStart1F / scaffoldStart2F にも同じ値を振り分ける。
    const floor = config.floor ?? 1;
    const next: CanvasData = { ...canvasData, scaffoldStart: config };
    if (floor === 1) {
      next.scaffoldStart1F = config;
    } else {
      next.scaffoldStart2F = config;
    }
    set({ canvasData: next, isDirty: true });
  },
  setScaffoldStart1F: (config) => {
    const { canvasData, pushHistory } = get();
    pushHistory();
    set({
      canvasData: { ...canvasData, scaffoldStart1F: config },
      isDirty: true,
    });
  },
  setScaffoldStart2F: (config) => {
    const { canvasData, pushHistory } = get();
    pushHistory();
    set({
      canvasData: { ...canvasData, scaffoldStart2F: config },
      isDirty: true,
    });
  },
  removeScaffoldStart1F: () => {
    const { canvasData, pushHistory } = get();
    pushHistory();
    set({
      canvasData: { ...canvasData, scaffoldStart1F: undefined },
      isDirty: true,
    });
  },
  removeScaffoldStart2F: () => {
    const { canvasData, pushHistory } = get();
    pushHistory();
    set({
      canvasData: { ...canvasData, scaffoldStart2F: undefined },
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
