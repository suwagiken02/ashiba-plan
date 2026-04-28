import { BuildingShape, Point, HandrailLengthMm, PriorityConfig } from '@/types';
import { EdgeInfo, getBuildingEdgesClockwise, scoreCombination } from './autoLayoutUtils';

/**
 * 1F 下屋辺の根本（凸の根本）を表す。
 * 「根本」とは、1F 全辺の中で「下屋辺と非下屋辺の境界点」を指す。
 * 凸 1 つにつき左右 2 つの根本がある。
 */
export type ShedRoot = {
  /** 凸の根本に隣接する 1F 下屋辺の edge.index（履歴・参照用）*/
  edge1FIndex: number;
  /** その 1F 下屋辺の希望離れ (mm) */
  desiredDistance1FMm: number;
  /** 凸の根本の絶対座標を、2F 辺の進行軸方向（grid 単位）に投影した値
   *  - 2F 辺が水平 → x 座標
   *  - 2F 辺が垂直 → y 座標
   */
  rootAxisCoord: number;
  /** 2F 辺の進行方向に対する凸の位置:
   *   - 'start' = 凸が進行方向で「先」にある（切れ目は凸より進行方向手前に打つ）
   *   - 'end'   = 凸が進行方向で「後ろ」にある（切れ目は凸より進行方向先に打つ）
   *  この side を切れ目位置計算で利用:
   *    切れ目 axisCoord = rootAxisCoord + (side === 'start' ? -1 : +1) * sign * (appliedDist / 10)
   */
  side: 'start' | 'end';
};

/**
 * 区間分割の切れ目位置。
 * 1F 下屋辺の希望離れ（または ±調整値）を反映した、2F 辺上の切れ目絶対座標。
 */
export type BreakPoint = {
  /** 切れ目位置の絶対座標（2F 辺の進行軸方向、grid 単位）*/
  axisCoord: number;
  /** 由来: どの 1F 下屋辺の根本から計算されたか */
  sourceEdge1FIndex: number;
  /** 凸の根本の絶対座標（軸方向、grid 単位）*/
  rootAxisCoord: number;
  /** 凸の側（ShedRoot から継承）*/
  side: 'start' | 'end';
  /** 適用された 1F 下屋辺の離れ (mm)、調整後の値 */
  appliedDistance1FMm: number;
  /** ユーザー入力の希望離れ (mm)、調整前の値 */
  desiredDistance1FMm: number;
  /** 調整量 (mm) = applied - desired、符号付き */
  adjustmentMm: number;
};

/**
 * 点 p が線分 (a, b) 上にあるかを判定（軸並行のみ）。
 * 1mm 精度の grid 座標前提、座標比較は完全一致でよい。
 */
function isPointOnAxisAlignedSegment(p: Point, a: Point, b: Point): boolean {
  // 水平線分 (y 一定)
  if (a.y === b.y && p.y === a.y) {
    const xMin = Math.min(a.x, b.x);
    const xMax = Math.max(a.x, b.x);
    return p.x >= xMin && p.x <= xMax;
  }
  // 垂直線分 (x 一定)
  if (a.x === b.x && p.x === a.x) {
    const yMin = Math.min(a.y, b.y);
    const yMax = Math.max(a.y, b.y);
    return p.y >= yMin && p.y <= yMax;
  }
  return false;
}

/**
 * 2F 辺の進行軸方向（'x' / 'y'）と進行方向の符号（+1 / -1）を取得。
 */
function getEdgeAxis(edge: EdgeInfo): { axis: 'x' | 'y'; sign: 1 | -1 } {
  if (edge.handrailDir === 'horizontal') {
    return { axis: 'x', sign: edge.p2.x >= edge.p1.x ? 1 : -1 };
  }
  return { axis: 'y', sign: edge.p2.y >= edge.p1.y ? 1 : -1 };
}

/**
 * 1F 下屋辺の根本を 2F 辺上に投影し、ShedRoot[] を返す。
 *
 * 「凸の根本」とは:
 *   1F の全辺を時計回りに見て、隣接辺の uncovered 状態が遷移する境界点。
 *   - covered 辺 → uncovered 辺: 凸への入口（境界点 = covered.p2 == uncovered.p1）
 *   - uncovered 辺 → covered 辺: 凸からの出口（境界点 = uncovered.p2 == covered.p1）
 *   この境界点が 2F 辺上に乗っていれば、その 2F 辺は分割対象となる。
 *
 * @param building1F 1F 建物
 * @param building2F 2F 建物
 * @param edge2F 対象の 2F 辺
 * @param uncoveredEdges1F 事前計算済みの下屋辺リスト（getEdgesNotCoveredBy 結果）
 * @param desiredDistances1F 1F 各辺の希望離れ (mm)
 * @returns 2F 辺上の凸の根本リスト
 */
export function findShedRoots(
  building1F: BuildingShape,
  building2F: BuildingShape,
  edge2F: EdgeInfo,
  uncoveredEdges1F: EdgeInfo[],
  desiredDistances1F: Record<number, number>,
): ShedRoot[] {
  const edges1F = getBuildingEdgesClockwise(building1F);
  const n = edges1F.length;
  const uncoveredIdxSet = new Set(uncoveredEdges1F.map(e => e.index));

  const { axis: edge2FAxis, sign: edge2FSign } = getEdgeAxis(edge2F);

  const roots: ShedRoot[] = [];

  for (let i = 0; i < n; i++) {
    const curr = edges1F[i];
    const next = edges1F[(i + 1) % n];
    const currIsUncovered = uncoveredIdxSet.has(curr.index);
    const nextIsUncovered = uncoveredIdxSet.has(next.index);

    // 隣接辺の uncovered 状態が遷移する点だけが「凸の根本」
    if (currIsUncovered === nextIsUncovered) continue;

    // 境界点 = 現辺の終点 = 次辺の始点
    const boundary: Point = curr.p2;

    // 境界点が edge2F の線分上に乗るかチェック
    if (!isPointOnAxisAlignedSegment(boundary, edge2F.p1, edge2F.p2)) continue;

    // 凸を成す uncovered 辺（1F 下屋辺の側面 = H 面 / B 面）と、その希望離れ
    const uncoveredEdge = currIsUncovered ? curr : next;
    const desiredDistance1FMm = desiredDistances1F[uncoveredEdge.index] ?? 900;

    // 凸の中央方向を判定:
    //   隣接する covered 辺（境界点が 2F 辺上にある以上、これは 2F 辺と axis 一致）の
    //   進行方向で凸の axis 中央位置を推定する。
    //   - covered → uncovered 遷移（curr=covered, next=uncovered）:
    //     凸は curr の進行方向の続き → towardConvexSign = covered の進行方向 sign
    //   - uncovered → covered 遷移（curr=uncovered, next=covered）:
    //     凸は next の進行方向の逆 → towardConvexSign = -(covered の進行方向 sign)
    const coveredEdge = currIsUncovered ? next : curr;
    const isExit = currIsUncovered; // uncovered → covered なら exit
    const coveredAxisSign: 1 | -1 = (
      edge2FAxis === 'x'
        ? (coveredEdge.p2.x > coveredEdge.p1.x ? 1 : -1)
        : (coveredEdge.p2.y > coveredEdge.p1.y ? 1 : -1)
    );
    const towardConvexSign = (isExit ? -coveredAxisSign : coveredAxisSign) as 1 | -1;

    // 凸が進行方向で「先」にあるか:
    //   towardConvex * edge2FSign > 0 なら凸の中央が進行方向で先 → side='start'
    //   towardConvex * edge2FSign < 0 なら凸の中央が進行方向で後 → side='end'
    const side: 'start' | 'end' = towardConvexSign * edge2FSign > 0 ? 'start' : 'end';

    // 投影座標
    const rootAxisCoord = edge2FAxis === 'x' ? boundary.x : boundary.y;

    roots.push({
      edge1FIndex: uncoveredEdge.index,
      desiredDistance1FMm,
      rootAxisCoord,
      side,
    });
  }

  return roots;
}

/**
 * ShedRoot から BreakPoint（切れ目位置）を計算するヘルパー。
 * adjustment は ±1mm 単位の調整値。
 *
 * 切れ目位置の式:
 *   axisCoord = rootAxisCoord + (side === 'start' ? -1 : +1) * sign * (appliedDist / 10)
 *   ※ side の語義: 'start' = 凸が進行方向で先 → 切れ目は凸より手前に打つ
 *
 * @param root 凸の根本
 * @param edge2FSign 2F 辺の進行方向符号 (+1 / -1)
 * @param adjustmentMm 希望離れからの調整 (mm)
 */
export function calculateBreakpoint(
  root: ShedRoot,
  edge2FSign: 1 | -1,
  adjustmentMm: number,
): BreakPoint {
  const appliedDist = root.desiredDistance1FMm + adjustmentMm;
  const offsetGrid = (root.side === 'start' ? -1 : +1) * edge2FSign * (appliedDist / 10);
  const axisCoord = root.rootAxisCoord + offsetGrid;
  return {
    axisCoord,
    sourceEdge1FIndex: root.edge1FIndex,
    rootAxisCoord: root.rootAxisCoord,
    side: root.side,
    appliedDistance1FMm: appliedDist,
    desiredDistance1FMm: root.desiredDistance1FMm,
    adjustmentMm,
  };
}

// ============================================================
// Phase H-3d-2b: 区間分割 + 手摺再割付
// ============================================================

/** 区間（cursorStart → cursorEnd の中の 1 区切り）*/
export type Segment = {
  /** 区間の開始軸座標（grid 単位）*/
  startAxis: number;
  /** 区間の終了軸座標（grid 単位）*/
  endAxis: number;
  /** 区間長 (mm)、必ず enabledSizes の組み合わせで作成可能な値 */
  lengthMm: number;
  /** この区間に割り付ける手摺リスト（合計 == lengthMm）*/
  rails: HandrailLengthMm[];
};

/** 区間分割の解（1 つの 2F 辺に対する切れ目 + 区間の組み合わせ）*/
export type SegmentSolution = {
  breakpoints: BreakPoint[];
  segments: Segment[];
  /** 全切れ目の調整量の合計 (mm) */
  totalAdjustmentMm: number;
  /** 全切れ目の調整量の最大 (mm)、偏り検出用 */
  maxAdjustmentMm: number;
  /** 手摺総本数 */
  totalRailCount: number;
  /** 総合スコア（高いほど良い）*/
  score: number;
  /** フォールバック解か（探索範囲内に解が無く強制的に提示）*/
  isFallback?: boolean;
};

/** 区間分割計算の入力 */
export type SegmentSplitInput = {
  edge2F: EdgeInfo;
  /** 2F 順次決定で確定した cursorStart / cursorEnd（grid 単位）*/
  cursorStart: number;
  cursorEnd: number;
  /** 確定済み 2F 離れ（変更不可）*/
  confirmedDistance2FMm: number;
  /** この 2F 辺に紐付く 1F 下屋辺の根本リスト */
  shedRoots: ShedRoot[];
  /** 使える手摺サイズ */
  enabledSizes: HandrailLengthMm[];
  /** 優先度設定（スコアリング用）*/
  priorityConfig?: PriorityConfig;
  /** 探索範囲（mm）。デフォルト 50mm、段階拡大あり */
  searchRangeMm?: number;
};

/* ----- 内部ヘルパー ----- */

const MAX_DEPTH = 20;
const MAX_RESULTS_PER_TARGET = 100;
const MAX_SOLUTIONS = 8;
const MAX_DFS_COMBOS = 50000;
const SEARCH_RANGES = [50, 100, 200] as const;
const FALLBACK_RANGE = 1000;

/** ユークリッド GCD */
function gcd(a: number, b: number): number {
  while (b) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a;
}

/** 配列の GCD */
function gcdAll(arr: number[]): number {
  return arr.reduce((g, v) => gcd(g, v), arr[0]);
}

/**
 * targetMm にぴったり合計する手摺の組み合わせを全列挙する DFS。
 * - 早期 reject: target <= 0 / sizes 空 / GCD 不整合
 * - 深さ MAX_DEPTH、結果数 MAX_RESULTS_PER_TARGET で打ち切り
 */
function findCombinationsExactlySumToTarget(
  targetMm: number,
  enabledSizes: HandrailLengthMm[],
): HandrailLengthMm[][] {
  if (targetMm <= 0 || enabledSizes.length === 0) return [];
  const sortedSizes: HandrailLengthMm[] = [...enabledSizes].sort((a, b) => b - a);
  const stepGcd = gcdAll(sortedSizes);
  if (targetMm % stepGcd !== 0) return [];

  const results: HandrailLengthMm[][] = [];
  const dfs = (remaining: number, current: HandrailLengthMm[], maxIndex: number): void => {
    if (results.length >= MAX_RESULTS_PER_TARGET) return;
    if (remaining === 0) {
      results.push([...current]);
      return;
    }
    if (current.length >= MAX_DEPTH) return;
    for (let i = maxIndex; i < sortedSizes.length; i++) {
      const size = sortedSizes[i];
      if (size > remaining) continue;
      current.push(size);
      dfs(remaining - size, current, i);
      current.pop();
      if (results.length >= MAX_RESULTS_PER_TARGET) return;
    }
  };
  dfs(targetMm, [], 0);
  return results;
}

/**
 * targetMm にぴったり合計する rails のうち、最良スコアのもの 1 つを返す。
 * priorityConfig あり: scoreCombination で評価
 * priorityConfig なし: 本数最少を優先（短い rails ほど高スコア）
 */
export function findBestRailsExactly(
  targetMm: number,
  enabledSizes: HandrailLengthMm[],
  priorityConfig?: PriorityConfig,
): HandrailLengthMm[] | null {
  const combos = findCombinationsExactlySumToTarget(targetMm, enabledSizes);
  if (combos.length === 0) return null;
  const scoreFn = (rails: HandrailLengthMm[]) =>
    priorityConfig ? scoreCombination(rails, priorityConfig) : -rails.length;
  return combos.reduce((best, cur) => (scoreFn(cur) > scoreFn(best) ? cur : best));
}

/**
 * 切れ目組み合わせを評価して SegmentSolution を生成。
 * 不成立なら null。
 */
function evaluateCombo(
  breakpoints: BreakPoint[],
  input: SegmentSplitInput,
  edge2FSign: 1 | -1,
  minSegmentMm: number,
): SegmentSolution | null {
  const { cursorStart, cursorEnd, enabledSizes, priorityConfig } = input;

  // 軸方向に進行方向順でソート
  const sorted = [...breakpoints].sort((a, b) => edge2FSign * (a.axisCoord - b.axisCoord));

  // 切れ目間隔チェック（隣接 BP 間の grid 距離 → mm）
  for (let i = 0; i < sorted.length - 1; i++) {
    const gapGrid = edge2FSign * (sorted[i + 1].axisCoord - sorted[i].axisCoord);
    if (gapGrid * 10 < minSegmentMm) return null;
  }

  // 区間境界
  const boundaries = [cursorStart, ...sorted.map(bp => bp.axisCoord), cursorEnd];

  // 各区間の rails 割付
  const segments: Segment[] = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const lengthGrid = edge2FSign * (boundaries[i + 1] - boundaries[i]);
    const lengthMm = Math.round(lengthGrid * 10);
    if (lengthMm < minSegmentMm) return null;
    const rails = findBestRailsExactly(lengthMm, enabledSizes, priorityConfig);
    if (!rails) return null;
    segments.push({
      startAxis: boundaries[i],
      endAxis: boundaries[i + 1],
      lengthMm,
      rails,
    });
  }

  const totalAdj = sorted.reduce((s, bp) => s + Math.abs(bp.adjustmentMm), 0);
  const maxAdj = sorted.reduce((m, bp) => Math.max(m, Math.abs(bp.adjustmentMm)), 0);
  const totalRails = segments.reduce((s, seg) => s + seg.rails.length, 0);
  const score = computeScore(segments, totalAdj, maxAdj, totalRails, priorityConfig);

  return {
    breakpoints: sorted,
    segments,
    totalAdjustmentMm: totalAdj,
    maxAdjustmentMm: maxAdj,
    totalRailCount: totalRails,
    score,
  };
}

/** スコア計算（高いほど良い）*/
function computeScore(
  segments: Segment[],
  totalAdj: number,
  maxAdj: number,
  totalRails: number,
  pc?: PriorityConfig,
): number {
  const ADJ_TOTAL_W = 1.0;
  const ADJ_MAX_W = 2.0;
  const RAIL_COUNT_W = 3.0;
  const priorityBonus = pc
    ? segments.reduce((s, seg) => s + scoreCombination(seg.rails, pc), 0)
    : 0;
  return -totalAdj * ADJ_TOTAL_W
       - maxAdj * ADJ_MAX_W
       - totalRails * RAIL_COUNT_W
       + priorityBonus;
}

/** 指定範囲内で解を探索 */
function findSegmentSolutionsWithRange(
  input: SegmentSplitInput,
  searchRangeMm: number,
): SegmentSolution[] {
  const { edge2F, cursorStart, cursorEnd, shedRoots, enabledSizes } = input;
  const minSegmentMm = enabledSizes.length > 0 ? Math.min(...enabledSizes) : 200;

  // 進行方向の sign
  const { sign: edge2FSign } = (() => {
    if (edge2F.handrailDir === 'horizontal') {
      return { sign: (edge2F.p2.x >= edge2F.p1.x ? 1 : -1) as 1 | -1 };
    }
    return { sign: (edge2F.p2.y >= edge2F.p1.y ? 1 : -1) as 1 | -1 };
  })();

  // shedRoots ごとの BreakPoint 候補（cursor 範囲外を除外、|adj| 昇順）
  const breakpointCandidatesPerRoot: BreakPoint[][] = shedRoots.map(root => {
    const candidates: BreakPoint[] = [];
    for (let adj = -searchRangeMm; adj <= searchRangeMm; adj++) {
      const appliedMm = root.desiredDistance1FMm + adj;
      if (appliedMm <= 0) continue;
      const bp = calculateBreakpoint(root, edge2FSign, adj);
      // cursor 範囲外チェック
      if (edge2FSign * (bp.axisCoord - cursorStart) <= 0) continue;
      if (edge2FSign * (cursorEnd - bp.axisCoord) <= 0) continue;
      candidates.push(bp);
    }
    candidates.sort((a, b) => Math.abs(a.adjustmentMm) - Math.abs(b.adjustmentMm));
    return candidates;
  });

  // shedRoots が 0 個 → 単一区間として評価
  if (shedRoots.length === 0) {
    const sol = evaluateCombo([], input, edge2FSign, minSegmentMm);
    return sol ? [sol] : [];
  }

  // 全組み合わせを列挙して合計 |adj| 昇順でソート → 早期に良解到達
  const allCombos: BreakPoint[][] = [];
  const gen = (rootIdx: number, current: BreakPoint[]): void => {
    if (rootIdx === shedRoots.length) {
      allCombos.push([...current]);
      return;
    }
    for (const bp of breakpointCandidatesPerRoot[rootIdx]) {
      current.push(bp);
      gen(rootIdx + 1, current);
      current.pop();
    }
  };
  gen(0, []);
  allCombos.sort((a, b) => {
    const sumA = a.reduce((s, bp) => s + Math.abs(bp.adjustmentMm), 0);
    const sumB = b.reduce((s, bp) => s + Math.abs(bp.adjustmentMm), 0);
    return sumA - sumB;
  });

  // 評価（先頭から MAX_DFS_COMBOS 件まで）
  const solutions: SegmentSolution[] = [];
  const evalCount = Math.min(allCombos.length, MAX_DFS_COMBOS);
  for (let i = 0; i < evalCount; i++) {
    const sol = evaluateCombo(allCombos[i], input, edge2FSign, minSegmentMm);
    if (sol) solutions.push(sol);
  }

  solutions.sort((a, b) => b.score - a.score);
  return solutions.slice(0, MAX_SOLUTIONS);
}

/** フォールバック解: 探索範囲を 1000mm まで広げて、それでも 0 件なら adjustment=0 で空 rails の解を返す */
function findFallbackSolution(input: SegmentSplitInput): SegmentSolution[] {
  // 最終探索範囲（1000mm）でリトライ
  const wide = findSegmentSolutionsWithRange(input, FALLBACK_RANGE);
  if (wide.length > 0) return wide.map(s => ({ ...s, isFallback: true }));

  // それでも 0 件 → adjustment=0、各区間は rails=[]（割付不能）として返す
  const { edge2F, cursorStart, cursorEnd, shedRoots, enabledSizes } = input;
  const minSegmentMm = enabledSizes.length > 0 ? Math.min(...enabledSizes) : 200;
  const edge2FSign: 1 | -1 = (
    edge2F.handrailDir === 'horizontal'
      ? (edge2F.p2.x >= edge2F.p1.x ? 1 : -1)
      : (edge2F.p2.y >= edge2F.p1.y ? 1 : -1)
  );
  const breakpoints: BreakPoint[] = shedRoots.map(r => calculateBreakpoint(r, edge2FSign, 0));
  const sorted = [...breakpoints].sort((a, b) => edge2FSign * (a.axisCoord - b.axisCoord));
  const boundaries = [cursorStart, ...sorted.map(bp => bp.axisCoord), cursorEnd];
  const segments: Segment[] = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const lengthGrid = edge2FSign * (boundaries[i + 1] - boundaries[i]);
    const lengthMm = Math.max(0, Math.round(lengthGrid * 10));
    const rails = findBestRailsExactly(lengthMm, enabledSizes, input.priorityConfig) ?? [];
    segments.push({
      startAxis: boundaries[i],
      endAxis: boundaries[i + 1],
      lengthMm,
      rails,
    });
  }
  // segments の minSegmentMm 違反は許容（フォールバックなのでベストエフォート）
  void minSegmentMm;
  return [{
    breakpoints: sorted,
    segments,
    totalAdjustmentMm: 0,
    maxAdjustmentMm: 0,
    totalRailCount: segments.reduce((s, seg) => s + seg.rails.length, 0),
    score: -Infinity,
    isFallback: true,
  }];
}

/**
 * 区間分割解を求める。
 * 段階探索: ±50mm → ±100mm → ±200mm。それでも 0 件なら ±1000mm のフォールバック。
 * 最終的に最低 1 件の解を返す（fallback フラグ付き）。
 *
 * @returns スコア降順の上位 8 件、または fallback 解
 */
export function findSegmentSolutions(input: SegmentSplitInput): SegmentSolution[] {
  // 入力の searchRangeMm が指定されている場合はそれだけで実行
  if (input.searchRangeMm !== undefined) {
    const sols = findSegmentSolutionsWithRange(input, input.searchRangeMm);
    if (sols.length > 0) return sols;
    return findFallbackSolution(input);
  }
  // 段階拡大
  for (const range of SEARCH_RANGES) {
    const sols = findSegmentSolutionsWithRange(input, range);
    if (sols.length > 0) return sols;
  }
  // フォールバック
  return findFallbackSolution(input);
}

