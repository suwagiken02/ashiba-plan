import { Point, BuildingShape, HandrailLengthMm, ScaffoldStartConfig, PriorityConfig, PhaseDCandidate, PhaseDEdgeCandidates } from '@/types';
import { mmToGrid } from './gridUtils';

// === 使用可能な手摺長さ（mm） ===
export const HANDRAIL_SIZES: HandrailLengthMm[] = [1800, 1200, 900, 600, 400, 300, 200];

// === 方位 ===
export type FaceDir = 'north' | 'south' | 'east' | 'west';

// === 辺情報 ===
export type EdgeInfo = {
  index: number;
  label: string;
  p1: Point;
  p2: Point;
  lengthMm: number;
  face: FaceDir;
  handrailDir: 'horizontal' | 'vertical';
  nx: number;
  ny: number;
};

// === 割付結果の1パターン ===
export type LayoutCombination = {
  rails: HandrailLengthMm[];
  remainder: number;
  count: number;
};

// === 1辺の割付情報 ===
export type EdgeLayout = {
  edge: EdgeInfo;
  distanceMm: number;
  edgeLengthMm: number;
  effectiveMm: number;
  /** 足場ラインの固定軸座標（グリッド） horizontal→y, vertical→x */
  scaffoldCoord: number;
  /** カーソル開始座標（可変軸、グリッド） */
  cursorStart: number;
  /** カーソル終了座標（可変軸、グリッド） */
  cursorEnd: number;
  candidates: LayoutCombination[];
  selectedIndex: number;
  locked: boolean;
};

// === 全体結果 ===
export type AutoLayoutResult = {
  edgeLayouts: EdgeLayout[];
};

// ============================================================
function isClockwise(pts: Point[]): boolean {
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % pts.length];
    sum += p1.x * p2.y - p2.x * p1.y;
  }
  return sum > 0;
}

export function isPointInPolygon(px: number, py: number, polygon: Point[]): boolean {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    if ((yi > py) !== (yj > py) &&
        px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export function isConvexCorner(prevEdge: EdgeInfo, currEdge: EdgeInfo): boolean {
  const ax = prevEdge.p2.x - prevEdge.p1.x;
  const ay = prevEdge.p2.y - prevEdge.p1.y;
  const bx = currEdge.p2.x - currEdge.p1.x;
  const by = currEdge.p2.y - currEdge.p1.y;
  return ax * by - ay * bx > 0;
}

// ============================================================
// 建物ポリゴンの辺を時計回りで取得
// ============================================================
export function getBuildingEdgesClockwise(building: BuildingShape): EdgeInfo[] {
  const pts = building.points;
  const n = pts.length;
  if (n < 3) return [];

  const cw = isClockwise(pts);
  const orderedPts = cw ? [...pts] : [...pts].reverse();

  const edges: EdgeInfo[] = [];
  for (let i = 0; i < orderedPts.length; i++) {
    const p1 = orderedPts[i];
    const p2 = orderedPts[(i + 1) % orderedPts.length];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const lenGrid = Math.sqrt(dx * dx + dy * dy);
    const lengthMm = Math.round(lenGrid * 10);
    const len = lenGrid || 1;

    let nx = dy / len;
    let ny = -dx / len;

    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;
    if (isPointInPolygon(midX + nx * 0.5, midY + ny * 0.5, orderedPts)) {
      nx = -nx; ny = -ny;
    }

    let face: FaceDir;
    if (Math.abs(ny) > Math.abs(nx)) {
      face = ny < 0 ? 'north' : 'south';
    } else {
      face = nx > 0 ? 'east' : 'west';
    }

    const handrailDir: 'horizontal' | 'vertical' =
      (face === 'north' || face === 'south') ? 'horizontal' : 'vertical';

    edges.push({
      index: i,
      label: String.fromCharCode(65 + i),
      p1, p2, lengthMm, face, handrailDir, nx, ny,
    });
  }

  return edges;
}

// ============================================================
// 手摺割付: 1800mm優先 → 端数を小部材で充填
//
// 1. 1800mm をできるだけ多く使う
// 2. 残りの端数（< 1800mm）を小部材で埋める複数パターンを生成
// 3. 端数が最小になるパターンを返す
// ============================================================
export function findBestEndCombinations(
  effectiveMm: number,
  enabledSizes: HandrailLengthMm[] = HANDRAIL_SIZES,
  // priorityConfig: Phase 5-B 以降、渡されれば優先部材パターンを追加候補として合流する
  // 未指定なら既存の A〜G パターンのみで動作（互換性完全維持）
  priorityConfig?: PriorityConfig,
): LayoutCombination[] {
  if (effectiveMm <= 0) return [{ rails: [], remainder: 0, count: 0 }];
  // サイズが 0 件なら解なし（UI 側でその旨を通知する想定）
  if (enabledSizes.length === 0) return [{ rails: [], remainder: effectiveMm, count: 0 }];

  // 降順ソート + baseSize（最大サイズを基準）と FILLER_SIZES（残り）に分離
  const sizes: HandrailLengthMm[] = [...enabledSizes].sort((a, b) => b - a);
  const baseSize = sizes[0];
  const FILLER_SIZES: HandrailLengthMm[] = sizes.slice(1);

  // baseSize をできるだけ詰める
  const numBase = Math.floor(effectiveMm / baseSize);
  const leftover = effectiveMm - numBase * baseSize;
  const base1800: HandrailLengthMm[] = Array(numBase).fill(baseSize);

  // 端数がゼロなら完璧（priorityConfig あり時は追加パターンを検討するため早期 return しない）
  if (leftover === 0 && !priorityConfig) {
    return [{ rails: base1800, remainder: 0, count: numBase }];
  }

  const results: LayoutCombination[] = [];
  const seen = new Set<string>();

  const addResult = (rails: HandrailLengthMm[], rem: number) => {
    const sorted = [...rails].sort((a, b) => b - a);
    const key = sorted.join(',') + '|' + rem;
    if (seen.has(key)) return;
    seen.add(key);
    results.push({ rails, remainder: rem, count: rails.length });
  };

  // ── パターンA: 端数をグリーディに充填 ──
  const fillGreedy = (remaining: number, sizes: HandrailLengthMm[]): HandrailLengthMm[] => {
    const rails: HandrailLengthMm[] = [];
    let left = remaining;
    for (const size of sizes) {
      while (left >= size) { rails.push(size); left -= size; }
    }
    return rails;
  };

  const fillerA = fillGreedy(leftover, FILLER_SIZES);
  const totalA = fillerA.reduce((s, r) => s + r, 0);
  addResult([...base1800, ...fillerA], leftover - totalA);

  // ── パターンB: 端数部の末尾を1サイズ上げる（はみ出し許容） ──
  if (fillerA.length > 0) {
    const lastSize = fillerA[fillerA.length - 1];
    const idx = FILLER_SIZES.indexOf(lastSize);
    if (idx > 0) {
      const altFiller = [...fillerA];
      altFiller[altFiller.length - 1] = FILLER_SIZES[idx - 1];
      const totalB = altFiller.reduce((s, r) => s + r, 0);
      addResult([...base1800, ...altFiller], leftover - totalB);
    }
  }

  // ── パターンC: 端数部の末尾を削除 ──
  if (fillerA.length > 1) {
    const fewer = fillerA.slice(0, -1);
    const totalC = fewer.reduce((s, r) => s + r, 0);
    addResult([...base1800, ...fewer], leftover - totalC);
  }

  // ── パターンD: 端数を1本で賄えるサイズを試す ──
  // 有効サイズ全てを試す（早期 break しない）。長側候補（rem < 0）を 0 に
  // 最も近づけるには最小サイズまで列挙する必要がある。
  for (const size of sizes) {
    const rem = leftover - size;
    addResult([...base1800, size], rem);
  }

  // ── パターンE: 端数を2本で賄う組み合わせ ──
  for (const s1 of FILLER_SIZES) {
    if (s1 > leftover) continue;
    const rest = leftover - s1;
    for (const s2 of FILLER_SIZES) {
      if (s2 > s1) continue;
      const rem = rest - s2;
      addResult([...base1800, s1, s2], rem);
      if (rem === 0) break; // ぴったりならbreak、マイナスでも次を試す
    }
  }

  // ── パターンG: 端数を3本で賄う組み合わせ ──
  for (const s1 of FILLER_SIZES) {
    if (s1 > leftover) continue;
    const rest1 = leftover - s1;
    for (const s2 of FILLER_SIZES) {
      if (s2 > rest1) continue;
      const rest2 = rest1 - s2;
      for (const s3 of FILLER_SIZES) {
        const rem = rest2 - s3;
        addResult([...base1800, s1, s2, s3], rem);
        if (rem <= 0) break;
      }
      if (rest2 <= 0) break;
    }
  }

  // ── パターンF: baseSize を1本減らして端数を広げる ──
  if (numBase > 0) {
    const base1800m1: HandrailLengthMm[] = Array(numBase - 1).fill(baseSize);
    const bigLeftover = leftover + baseSize;
    const fillerF = fillGreedy(bigLeftover, sizes);
    const totalF = fillerF.reduce((s, r) => s + r, 0);
    addResult([...base1800m1, ...fillerF], bigLeftover - totalF);
  }

  // 結果がなければフォールバック
  if (results.length === 0) {
    addResult(base1800, leftover);
  }

  // 【Phase 5-B】priorityConfig が渡されていれば、優先リストに基づく追加パターンを合流
  // addResult 経由で results に追加されるため、seen セットで重複除去、以降の選出ロジックは既存通り
  if (priorityConfig) {
    const extra = generatePriorityPatterns(effectiveMm, enabledSizes, priorityConfig);
    for (const p of extra) {
      addResult(p.rails, p.remainder);
    }
  }

  // 有効長より短い側（+remainder = 不足）/ 長い側（-remainder = 突出）
  // それぞれの最良候補を選び、候補A/Bダイアログで提示する。
  //   Short: remainder >= 0 の中で最小（端数最小）
  //   Long : remainder < 0 の中で最大（突出最小、つまり 0 に近い負）
  let shorts: LayoutCombination[];
  let longs: LayoutCombination[];

  if (!priorityConfig) {
    // 既存動作（変更なし）
    shorts = results
      .filter(r => r.remainder >= 0)
      .sort((a, b) => (a.remainder - b.remainder) || (a.count - b.count));
    longs = results
      .filter(r => r.remainder < 0)
      .sort((a, b) => (b.remainder - a.remainder) || (a.count - b.count));
  } else {
    // 【Phase 5-C】priorityConfig ありの優先度評価ソート
    // 1. |remainder| 最小  2. 平均スコア最大  3. 最低ランク部材を避ける（最小スコア最大）  4. 本数最小
    const pc = priorityConfig;
    const sortByPriority = (a: LayoutCombination, b: LayoutCombination): number => {
      const remDiff = Math.abs(a.remainder) - Math.abs(b.remainder);
      if (remDiff !== 0) return remDiff;
      const scoreA = scoreCombination(a.rails, pc);
      const scoreB = scoreCombination(b.rails, pc);
      const scoreDiff = scoreB - scoreA;
      if (Math.abs(scoreDiff) > 1e-9) return scoreDiff;
      // avg タイブレーク: 最低スコアが高い方 (= 優先度の低い部材を使っていない方) を優先
      const minA = Math.min(...a.rails.map(r => getScoreOfSize(r, pc)));
      const minB = Math.min(...b.rails.map(r => getScoreOfSize(r, pc)));
      const minDiff = minB - minA;
      if (Math.abs(minDiff) > 1e-9) return minDiff;
      return a.count - b.count;
    };
    shorts = results.filter(r => r.remainder >= 0).slice().sort(sortByPriority);
    longs = results.filter(r => r.remainder < 0).slice().sort(sortByPriority);
  }

  const out: LayoutCombination[] = [];
  if (shorts[0]) out.push(shorts[0]);
  if (longs[0]) out.push(longs[0]);
  // 端数 abs が小さい側を先頭（プライマリ候補）にする
  out.sort((a, b) => Math.abs(a.remainder) - Math.abs(b.remainder));
  return out.length > 0 ? out : results.slice(0, 1);
}

// ============================================================
// Phase H-1: 順次決定用の候補生成
// 「希望より大きい結果」「希望より小さい結果」を1つずつ、計2つ返す。
// 端数0の候補があれば、それ1つだけを返す（自動進行用）。
// ============================================================
export type SequentialCandidateSide = 'exact' | 'smaller' | 'larger';

export type SequentialCandidate = {
  rails: HandrailLengthMm[];
  totalMm: number;
  actualEndDistanceMm: number;
  diffFromDesired: number;
  // Phase I-1: 「割り変更」「←/→」操作の状態管理
  side: SequentialCandidateSide;
  variationIdx: number;     // この delta 内で何番目の rails パターンか (0-based, score 降順)
  variationCount: number;   // この delta 内の総 rails パターン数 (UI の (m/N) 表示用)
};

/**
 * 指定された targetEndDistanceMm をぴったり実現する手摺の組み合わせを全て見つける。
 * DFS で列挙、深さ20本・結果100件で打ち切り。
 */
function findAllCombinationsForEnd(
  edgeLengthMm: number,
  startContribution: number,
  targetEndDistanceMm: number,
  isNextConvex: boolean,
  enabledSizes: HandrailLengthMm[],
): HandrailLengthMm[][] {
  const endContribution = isNextConvex ? targetEndDistanceMm : -targetEndDistanceMm;
  const requiredRailsTotal = startContribution + edgeLengthMm + endContribution;

  if (requiredRailsTotal <= 0) return [];
  if (enabledSizes.length === 0) return [];

  const sortedSizes: HandrailLengthMm[] = [...enabledSizes].sort((a, b) => b - a);

  // 早期枝刈り: requiredRailsTotal が GCD の倍数でなければ達成不可能
  const computeGcd = (a: number, b: number): number => {
    while (b) { const t = b; b = a % b; a = t; }
    return a;
  };
  let stepGcd: number = sortedSizes[0];
  for (const s of sortedSizes) stepGcd = computeGcd(stepGcd, s);
  if (requiredRailsTotal % stepGcd !== 0) return [];

  const results: HandrailLengthMm[][] = [];
  const MAX_DEPTH = 20;
  const MAX_RESULTS = 100;

  const dfs = (remaining: number, current: HandrailLengthMm[], maxIndex: number): void => {
    if (results.length >= MAX_RESULTS) return;
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
      if (results.length >= MAX_RESULTS) return;
    }
  };

  dfs(requiredRailsTotal, [], 0);
  return results;
}

export function generateSequentialCandidates(
  edgeLengthMm: number,
  startDistanceMm: number,
  desiredEndDistanceMm: number,
  isPrevConvex: boolean,
  isNextConvex: boolean,
  // Phase H-fix-2a: 前辺の wall 距離 (= 物理 prev edge の startDist)。
  // cursor 計算 (effectiveMm = edgeLen + s_{i-1} + s_{i+1}) と整合させるため、
  // startContribution は「前辺の startDist」を使う（自身の startDist ではない）。
  prevEdgeStartDistanceMm: number,
  enabledSizes: HandrailLengthMm[] = HANDRAIL_SIZES,
  priorityConfig?: PriorityConfig,
  // Phase I-1: 「←/→」「割り変更」UI 操作のための offset / variation 引数。
  // - offsetIdx: 希望から何個目の delta を採用するか (0=最も近い)
  // - variationIdx: その delta 内で何番目の rails パターンを使うか (0=最高 score)
  // 全デフォルト 0 で既存挙動と完全互換。
  largerOffsetIdx: number = 0,
  smallerOffsetIdx: number = 0,
  largerVariationIdx: number = 0,
  smallerVariationIdx: number = 0,
): SequentialCandidate[] {
  if (enabledSizes.length === 0) return [];

  // startDistanceMm はインターフェース互換のため受け取るが、
  // requiredRailsTotal の計算には prevEdgeStartDistanceMm を使う。
  void startDistanceMm;
  const startContribution = isPrevConvex ? prevEdgeStartDistanceMm : -prevEdgeStartDistanceMm;
  const MAX_DELTA = 1000;

  // priorityConfig なしは本数少ない順
  const scoreFn = (rails: HandrailLengthMm[]): number =>
    priorityConfig ? scoreCombination(rails, priorityConfig) : -rails.length;

  // combos を score 降順で安定ソートして variationIdx 番目を取り出す
  const pickVariation = (
    combos: HandrailLengthMm[][],
    variationIdx: number,
  ): HandrailLengthMm[] | null => {
    if (combos.length === 0) return null;
    const sorted = [...combos].sort((a, b) => scoreFn(b) - scoreFn(a));
    if (variationIdx < 0 || variationIdx >= sorted.length) return null;
    return sorted[variationIdx];
  };

  const buildCandidate = (
    rails: HandrailLengthMm[],
    targetEnd: number,
    side: SequentialCandidateSide,
    delta: number,
    variationIdx: number,
    variationCount: number,
  ): SequentialCandidate => ({
    rails,
    totalMm: rails.reduce((a, b) => a + b, 0),
    actualEndDistanceMm: targetEnd,
    diffFromDesired: delta,
    side,
    variationIdx,
    variationCount,
  });

  const isDefaultArgs =
    largerOffsetIdx === 0 &&
    smallerOffsetIdx === 0 &&
    largerVariationIdx === 0 &&
    smallerVariationIdx === 0;

  // === exact (delta=0) 探索 ===
  // exact 候補の variation 切替は smallerVariationIdx を流用（指示書に exact 専用引数なし）。
  let exactCand: SequentialCandidate | undefined;
  if (desiredEndDistanceMm >= 0) {
    const exactCombos = findAllCombinationsForEnd(
      edgeLengthMm, startContribution, desiredEndDistanceMm, isNextConvex, enabledSizes,
    );
    if (exactCombos.length > 0) {
      const rails = pickVariation(exactCombos, smallerVariationIdx);
      if (rails) {
        exactCand = buildCandidate(
          rails, desiredEndDistanceMm, 'exact', 0,
          smallerVariationIdx, exactCombos.length,
        );
      }
    }
  }

  // 既存互換: exact ありかつデフォルト引数 → exact 1 候補のみ返す（自動進行）
  if (exactCand && isDefaultArgs) {
    return [exactCand];
  }

  // === smaller 側 (delta = -1, -2, ...) を smallerOffsetIdx 番目まで探索 ===
  let smallerCand: SequentialCandidate | undefined;
  let smallerFoundCount = 0;
  for (let delta = 1; delta <= MAX_DELTA; delta++) {
    const targetEnd = desiredEndDistanceMm - delta;
    if (targetEnd < 0) break;
    const combos = findAllCombinationsForEnd(
      edgeLengthMm, startContribution, targetEnd, isNextConvex, enabledSizes,
    );
    if (combos.length === 0) continue;
    if (smallerFoundCount === smallerOffsetIdx) {
      const rails = pickVariation(combos, smallerVariationIdx);
      if (rails) {
        smallerCand = buildCandidate(
          rails, targetEnd, 'smaller', -delta,
          smallerVariationIdx, combos.length,
        );
      }
      // variationIdx で枯れた場合も配列に含めない
      break;
    }
    smallerFoundCount++;
  }

  // === larger 側 (delta = +1, +2, ...) を largerOffsetIdx 番目まで探索 ===
  let largerCand: SequentialCandidate | undefined;
  let largerFoundCount = 0;
  for (let delta = 1; delta <= MAX_DELTA; delta++) {
    const targetEnd = desiredEndDistanceMm + delta;
    const combos = findAllCombinationsForEnd(
      edgeLengthMm, startContribution, targetEnd, isNextConvex, enabledSizes,
    );
    if (combos.length === 0) continue;
    if (largerFoundCount === largerOffsetIdx) {
      const rails = pickVariation(combos, largerVariationIdx);
      if (rails) {
        largerCand = buildCandidate(
          rails, targetEnd, 'larger', delta,
          largerVariationIdx, combos.length,
        );
      }
      break;
    }
    largerFoundCount++;
  }

  const result: SequentialCandidate[] = [];
  if (exactCand) result.push(exactCand);
  if (smallerCand) result.push(smallerCand);
  if (largerCand) result.push(largerCand);
  return result;
}

// ============================================================
// Phase H-2: 順次決定アルゴリズムによる自動割付
// 各辺を時計回りに処理し、前辺の終点離れを次辺の始点離れとして継承する。
// 端数発生時は2択候補を返す（UI で選択させる）。
// ============================================================
export type SequentialEdgeResult = {
  edge: EdgeInfo;
  startDistanceMm: number;
  desiredEndDistanceMm: number;
  candidates: SequentialCandidate[];
  selectedIndex: number;
  isLocked: boolean;
  isAutoProgress: boolean;
  prevCornerIsConvex: boolean;
  nextCornerIsConvex: boolean;
  // Phase H-3a: 配置に必要な座標情報
  scaffoldCoord: number;
  cursorStart: number;
  cursorEnd: number;
  effectiveMm: number;
};

export type SequentialLayoutResult = {
  edgeResults: SequentialEdgeResult[];
  hasUnresolved: boolean;
};

// Phase I-2: 各辺ごとの「割り変更」「←/→」操作の状態。
// AutoLayoutModal から computeAutoLayoutSequential 経由で
// generateSequentialCandidates の offset/variation 引数に伝搬される。
export type EdgeAdjustment = {
  larger: { offsetIdx: number; variationIdx: number };
  smaller: { offsetIdx: number; variationIdx: number };
};

export const DEFAULT_EDGE_ADJUSTMENT: EdgeAdjustment = {
  larger: { offsetIdx: 0, variationIdx: 0 },
  smaller: { offsetIdx: 0, variationIdx: 0 },
};

export function computeAutoLayoutSequential(
  building: BuildingShape,
  distances: Record<number, number>,
  scaffoldStart?: ScaffoldStartConfig,
  enabledSizes: HandrailLengthMm[] = HANDRAIL_SIZES,
  priorityConfig?: PriorityConfig,
  userSelections?: Record<number, number>,
  // Phase I-2: 各辺の「割り変更」「←/→」操作状態。undefined or 該当 edge 無しなら
  // 全 0 (既存挙動と完全互換)。
  userAdjustments?: Record<number, EdgeAdjustment>,
): SequentialLayoutResult {
  const edges = getBuildingEdgesClockwise(building);
  const n = edges.length;

  // Phase H-fix-2b: 順次決定の起点を scaffoldStart にローテート。
  // edges[startIdx]   = out edge (角から出る辺、cascade 起点、face で初期化)
  // edges[startIdx-1] = in edge  (角に入る辺、cascade 終点、face で閉合)
  // scaffoldStart 無し時は startIdx=0 → 旧来 i=0 起点と一致 (後方互換)
  const startIdx = scaffoldStart && n >= 2
    ? (scaffoldStart.startVertexIndex ?? 0) % n
    : 0;

  // lockedIndices: 既存 computeAutoLayout のロジックをそのまま使用
  const lockedIndices = new Set<number>();
  if (scaffoldStart && n >= 2) {
    lockedIndices.add(edges[startIdx].index);
    lockedIndices.add(edges[(startIdx - 1 + n) % n].index);
  }

  // 各コーナーの凸/凹判定: cornerConvexity[i] = 辺i と 辺(i+1) の間のコーナー
  const cornerConvexity: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const next = edges[(i + 1) % n];
    cornerConvexity.push(isConvexCorner(edges[i], next));
  }

  // 順次決定パス: 座標以外の情報を確定。
  // ループ順は scaffoldStart 起点 (k=0 で out edge、k=n-1 で in edge)。
  // intermediate は edges 物理 index 順で格納 → 2 パス目 (cursor 計算) は無変更で動作。
  type Intermediate = Omit<
    SequentialEdgeResult,
    'scaffoldCoord' | 'cursorStart' | 'cursorEnd' | 'effectiveMm'
  >;
  const intermediate: Intermediate[] = new Array(n);
  let prevEndDistanceMm: number | undefined = undefined;
  let hasUnresolved = false;

  for (let k = 0; k < n; k++) {
    const i = (startIdx + k) % n;
    const edge = edges[i];
    const isLocked = lockedIndices.has(edge.index);
    const prevCornerIsConvex = cornerConvexity[(i - 1 + n) % n];
    const nextCornerIsConvex = cornerConvexity[i];

    // 始点離れの決定
    // - k===0: 起点辺。scaffoldStart があれば locked = face1/2、無ければ distances or 900
    // - k===n-1: 閉じ辺。scaffoldStart があれば locked = face1/2 で cascade を上書きして閉合
    // - その他: 前辺 (cascade k-1) の actualEnd を継承
    let startDistanceMm: number;
    if (k === 0) {
      if (scaffoldStart && isLocked) {
        startDistanceMm = edge.handrailDir === 'horizontal'
          ? scaffoldStart.face1DistanceMm
          : scaffoldStart.face2DistanceMm;
      } else {
        startDistanceMm = distances[edge.index] ?? 900;
      }
    } else if (k === n - 1 && scaffoldStart && isLocked) {
      // 閉じ辺: もう一方の locked を face で固定 (cascade 値を捨てる)
      startDistanceMm = edge.handrailDir === 'horizontal'
        ? scaffoldStart.face1DistanceMm
        : scaffoldStart.face2DistanceMm;
    } else {
      startDistanceMm = prevEndDistanceMm ?? distances[edge.index] ?? 900;
    }

    // 終点離れ希望 = 次の辺の希望離れ
    const nextEdge = edges[(i + 1) % n];
    const desiredEndDistanceMm = distances[nextEdge.index] ?? 900;

    // Phase H-fix-2a: 前辺 wall 距離 = 物理 prev edge の startDist
    // 物理 prev = (i-1+n)%n は cascade 順では k-1 (= 前回処理した辺) と一致するため、
    // k>=1 では intermediate[prevIdx] が既に書き込み済み。
    // k===0 のみ物理 prev = 閉じ辺 (cascade 最後で確定) → ユーザー入力 distances から取る。
    // scaffoldStart 有り時は AutoLayoutModal が distances[locked_edge.index] = face で
    // 初期化するため、k=0 起点辺の prevEdgeStart と k=n-1 閉じ辺の上書き値 (face) が
    // 一致 → 閉合誤差ゼロ。scaffoldStart 無し時は edges[n-1]/edges[0] 境界に残存。
    const prevIdx = (i - 1 + n) % n;
    const prevEdgeStartDistanceMm = k === 0
      ? distances[edges[prevIdx].index] ?? 900
      : intermediate[prevIdx].startDistanceMm;

    // Phase I-2: 該当辺の adjustments を generateSequentialCandidates へ伝搬
    const adj = userAdjustments?.[edge.index] ?? DEFAULT_EDGE_ADJUSTMENT;
    const candidates = generateSequentialCandidates(
      edge.lengthMm,
      startDistanceMm,
      desiredEndDistanceMm,
      prevCornerIsConvex,
      nextCornerIsConvex,
      prevEdgeStartDistanceMm,
      enabledSizes,
      priorityConfig,
      adj.larger.offsetIdx,
      adj.smaller.offsetIdx,
      adj.larger.variationIdx,
      adj.smaller.variationIdx,
    );

    let selectedIndex = userSelections?.[edge.index] ?? 0;
    if (selectedIndex >= candidates.length) selectedIndex = 0;

    const isAutoProgress = candidates.length === 1;
    if (!isLocked && !isAutoProgress) hasUnresolved = true;

    intermediate[i] = {
      edge,
      startDistanceMm,
      desiredEndDistanceMm,
      candidates,
      selectedIndex,
      isLocked,
      isAutoProgress,
      prevCornerIsConvex,
      nextCornerIsConvex,
    };

    if (candidates.length > 0) {
      prevEndDistanceMm = candidates[selectedIndex].actualEndDistanceMm;
    } else {
      prevEndDistanceMm = desiredEndDistanceMm;
    }
  }

  // Phase H-3a: 1パス目相当 — 確定 startDistanceMm から distGrid と scaffoldCoord を計算
  const distGrids: number[] = [];
  const scaffoldCoords: number[] = [];
  for (let i = 0; i < n; i++) {
    const dg = mmToGrid(intermediate[i].startDistanceMm);
    distGrids.push(dg);
    scaffoldCoords.push(calcScaffoldCoord(edges[i], dg));
  }

  // Phase H-3a: 2パス目相当 — cursorStart/cursorEnd/effectiveMm を計算
  // 既存 computeAutoLayout の 2パス目ロジックを忠実にコピー
  const edgeResults: SequentialEdgeResult[] = [];
  for (let i = 0; i < n; i++) {
    const edge = edges[i];
    const prevIdx = (i - 1 + n) % n;
    const nextIdx = (i + 1) % n;
    const prevEdge = edges[prevIdx];
    const nextEdge = edges[nextIdx];

    const dx = edge.p2.x - edge.p1.x;
    const dy = edge.p2.y - edge.p1.y;

    // --- cursorStart ---
    const prevScaffold = scaffoldCoords[prevIdx];
    let cursorStart: number;
    if (prevEdge.handrailDir !== edge.handrailDir) {
      cursorStart = prevScaffold;
    } else {
      cursorStart = edge.handrailDir === 'horizontal' ? edge.p1.x : edge.p1.y;
    }

    // --- cursorEnd ---
    const endConvex = isConvexCorner(edge, nextEdge);
    const nextScaffold = scaffoldCoords[nextIdx];
    const nextDistGrid = distGrids[nextIdx];
    let cursorEnd: number;
    if (edge.handrailDir === 'horizontal') {
      const sign = dx > 0 ? 1 : -1;
      if (endConvex) {
        cursorEnd = edge.p2.x + sign * nextDistGrid;
      } else if (nextEdge.handrailDir !== edge.handrailDir) {
        cursorEnd = nextScaffold;
      } else {
        cursorEnd = edge.p2.x;
      }
    } else {
      const sign = dy > 0 ? 1 : -1;
      if (endConvex) {
        cursorEnd = edge.p2.y + sign * nextDistGrid;
      } else if (nextEdge.handrailDir !== edge.handrailDir) {
        cursorEnd = nextScaffold;
      } else {
        cursorEnd = edge.p2.y;
      }
    }

    const effectiveMm = Math.max(0, Math.round(Math.abs(cursorEnd - cursorStart) * 10));

    edgeResults.push({
      ...intermediate[i],
      scaffoldCoord: scaffoldCoords[i],
      cursorStart,
      cursorEnd,
      effectiveMm,
    });
  }

  return { edgeResults, hasUnresolved };
}

// ============================================================
// Phase H-3b-1: SequentialLayoutResult → AutoLayoutResult アダプタ
// 既存 placeHandrailsForEdge / handlePlace を変更せずに使うため、
// SequentialLayoutResult を AutoLayoutResult 形式に変換する。
//
// cursorEnd は rails 合計ベースに再計算する（cursor 由来の effectiveMm と
// 順次決定の railsTotal が乖離するケースで配置が崩れるのを防ぐ）。
// 提案モーダルは H-3b-2 で順次決定方式に置き換わるまでの暫定対応として
// remainder=0 で発火を抑止する。
// ============================================================
export function sequentialResultToAutoLayoutResult(
  seqResult: SequentialLayoutResult,
): AutoLayoutResult {
  const edgeLayouts: EdgeLayout[] = seqResult.edgeResults.map(er => {
    const selectedCandidate = er.candidates[er.selectedIndex];
    const railsTotal = selectedCandidate
      ? selectedCandidate.rails.reduce((a, b) => a + b, 0)
      : 0;

    // cursorEnd を rails 合計ベースに再計算
    // cursorStart から辺の進行方向に rails 合計分進んだ位置を cursorEnd とする
    const railsTotalGrid = railsTotal / 10;
    const sign = er.edge.handrailDir === 'horizontal'
      ? (er.edge.p2.x > er.edge.p1.x ? 1 : -1)
      : (er.edge.p2.y > er.edge.p1.y ? 1 : -1);
    const cursorEndAdjusted = er.cursorStart + sign * railsTotalGrid;

    // 暫定: 提案モーダル発火抑止のため remainder=0
    const candidates: LayoutCombination[] = er.candidates.map(c => ({
      rails: c.rails,
      remainder: 0,
      count: c.rails.length,
    }));

    return {
      edge: er.edge,
      distanceMm: er.startDistanceMm,
      edgeLengthMm: er.edge.lengthMm,
      effectiveMm: railsTotal,
      scaffoldCoord: er.scaffoldCoord,
      cursorStart: er.cursorStart,
      cursorEnd: cursorEndAdjusted,
      candidates,
      selectedIndex: er.selectedIndex,
      locked: er.isLocked,
    };
  });

  return { edgeLayouts };
}

// ============================================================
// 辺のscaffoldCoordを計算（固定軸座標）
// ============================================================
function calcScaffoldCoord(edge: EdgeInfo, distGrid: number): number {
  // 1mm精度の離れ（例: 999mm = 99.9 grid）を保持したまま足場ライン座標を計算。
  // 候補A/Bダイアログが 1mm 単位で正しい新離れを提案できるようにする。
  if (edge.handrailDir === 'horizontal') {
    return edge.p1.y + edge.ny * distGrid;
  } else {
    return edge.p1.x + edge.nx * distGrid;
  }
}

// ============================================================
// 全辺の自動割付を計算
//
// 各辺のcursor開始点は「前の辺のscaffoldCoord」で決まる。
// 凸コーナー: 前の辺のscaffoldCoordが次の辺の開始位置になる
// 凹コーナー: 同様に前の辺のscaffoldCoordから開始
//
// 終了点は凸コーナーならendFlyout付き、凹なら辺のp2座標で止まる。
// ============================================================
export function computeAutoLayout(
  building: BuildingShape,
  distances: Record<number, number>,
  scaffoldStart?: ScaffoldStartConfig,
  enabledSizes: HandrailLengthMm[] = HANDRAIL_SIZES,
  // priorityConfig: Phase 5 で findBestEndCombinations の評価関数に使用予定
  // Phase 4 時点では受け取って findBestEndCombinations に素通しするだけ
  priorityConfig?: PriorityConfig,
): AutoLayoutResult {
  const edges = getBuildingEdgesClockwise(building);
  const n = edges.length;

  // L字スタート角に隣接する 2 辺を「固定辺」として識別。
  // この 2 辺は ScaffoldStartModal で既に手摺 1 本配置済みなので、
  // 自動割付では追加配置をスキップする（locked=true）。
  const lockedIndices = new Set<number>();
  if (scaffoldStart && n >= 2) {
    const startIdx = scaffoldStart.startVertexIndex ?? 0;
    lockedIndices.add(edges[startIdx % n].index);
    lockedIndices.add(edges[(startIdx - 1 + n) % n].index);
  }

  // 1パス目: 各辺のscaffoldCoordを計算
  // 離れは 1mm 精度のまま保持（候補A/B提案で正しい 10mm 単位の新離れを算出するため）。
  const scaffoldCoords: number[] = [];
  const distGrids: number[] = [];
  for (let i = 0; i < n; i++) {
    const e = edges[i];
    const dist = distances[edges[i].index] ?? 900;
    const dg = mmToGrid(dist);
    distGrids.push(dg);
    const sc = calcScaffoldCoord(edges[i], dg);
    scaffoldCoords.push(sc);
  }

  // 2パス目: cursorStart/cursorEnd と effectiveMm を計算
  const edgeLayouts: EdgeLayout[] = [];

  for (let i = 0; i < n; i++) {
    const edge = edges[i];
    const prevIdx = (i - 1 + n) % n;
    const nextIdx = (i + 1) % n;
    const prevEdge = edges[prevIdx];
    const nextEdge = edges[nextIdx];

    const thisDist = distances[edge.index] ?? 900;

    const dx = edge.p2.x - edge.p1.x;
    const dy = edge.p2.y - edge.p1.y;

    // --- cursorStart ---
    // 方向転換するコーナーでは前の面のscaffoldCoordを引き継ぐ
    // （凸・凹問わず、足場ラインの交点から開始）
    // 同方向連続の場合のみ p1 座標
    const prevScaffold = scaffoldCoords[prevIdx];
    const startConvex = isConvexCorner(prevEdge, edge);
    let cursorStart: number;
    if (prevEdge.handrailDir !== edge.handrailDir) {
      // 方向転換（H→V or V→H）→ 前の面のscaffoldCoordが開始位置
      cursorStart = prevScaffold;
    } else {
      // 同方向連続 → p1座標
      cursorStart = edge.handrailDir === 'horizontal' ? edge.p1.x : edge.p1.y;
    }


    // --- cursorEnd ---
    // 凸コーナー: p2 + 次の面の離れ分飛び出し
    // 凹コーナー: 次の面のscaffoldCoord（足場ラインの交点で止まる）
    const endConvex = isConvexCorner(edge, nextEdge);
    const nextScaffold = scaffoldCoords[nextIdx];
    let cursorEnd: number;
    // 1mm精度のまま計算し、effectiveMm で Math.round して整数 mm 化する
    const nextDistGrid = distGrids[nextIdx];
    if (edge.handrailDir === 'horizontal') {
      const sign = dx > 0 ? 1 : -1;
      if (endConvex) {
        cursorEnd = edge.p2.x + sign * nextDistGrid;
      } else if (nextEdge.handrailDir !== edge.handrailDir) {
        cursorEnd = nextScaffold;
      } else {
        cursorEnd = edge.p2.x;
      }
    } else {
      const sign = dy > 0 ? 1 : -1;
      if (endConvex) {
        cursorEnd = edge.p2.y + sign * nextDistGrid;
      } else if (nextEdge.handrailDir !== edge.handrailDir) {
        cursorEnd = nextScaffold;
      } else {
        cursorEnd = edge.p2.y;
      }
    }


    // 1mm精度の建物座標でも float 誤差で `=== 0` 判定が壊れるのを防ぐため整数 mm に正規化
    const effectiveMm = Math.round(Math.abs(cursorEnd - cursorStart) * 10);
    const candidates = findBestEndCombinations(Math.max(0, effectiveMm), enabledSizes, priorityConfig);

    edgeLayouts.push({
      edge,
      distanceMm: thisDist,
      edgeLengthMm: edge.lengthMm,
      effectiveMm: Math.max(0, effectiveMm),
      scaffoldCoord: scaffoldCoords[i],
      cursorStart,
      cursorEnd,
      candidates,
      selectedIndex: 0,
      locked: lockedIndices.has(edge.index),
    });
  }

  return { edgeLayouts };
}

// ============================================================
// 1辺の手摺座標を生成
// ============================================================
export function placeHandrailsForEdge(
  layout: EdgeLayout,
  rails: HandrailLengthMm[],
): { x: number; y: number; lengthMm: HandrailLengthMm; direction: 'horizontal' | 'vertical' }[] {
  const edge = layout.edge;
  const dx = edge.p2.x - edge.p1.x;
  const dy = edge.p2.y - edge.p1.y;

  const results: { x: number; y: number; lengthMm: HandrailLengthMm; direction: 'horizontal' | 'vertical' }[] = [];


  if (edge.handrailDir === 'horizontal') {
    const scaffoldY = layout.scaffoldCoord;
    const sign = dx > 0 ? 1 : -1;
    let cursor = layout.cursorStart;

    for (const railMm of rails) {
      const railGrid = mmToGrid(railMm);
      const x = sign > 0 ? cursor : cursor - railGrid;
      results.push({ x, y: scaffoldY, lengthMm: railMm, direction: 'horizontal' });
      cursor += sign * railGrid;
    }
  } else {
    const scaffoldX = layout.scaffoldCoord;
    const sign = dy > 0 ? 1 : -1;
    let cursor = layout.cursorStart;

    for (const railMm of rails) {
      const railGrid = mmToGrid(railMm);
      const y = sign > 0 ? cursor : cursor - railGrid;
      results.push({ x: scaffoldX, y, lengthMm: railMm, direction: 'vertical' });
      cursor += sign * railGrid;
    }
  }

  return results;
}

// ============================================================
// 内側の辺 inner が外側の辺 outer に「乗っている（包含されている）」かを判定。
// 軸並行（水平/垂直）の辺のみ対応。足場図面は基本これで十分。
// ============================================================
function isEdgeContainedIn(inner: EdgeInfo, outer: EdgeInfo): boolean {
  // 水平線同士: 同じ Y、X 範囲が outer に含まれる
  if (
    inner.p1.y === inner.p2.y &&
    outer.p1.y === outer.p2.y &&
    inner.p1.y === outer.p1.y
  ) {
    const innerXMin = Math.min(inner.p1.x, inner.p2.x);
    const innerXMax = Math.max(inner.p1.x, inner.p2.x);
    const outerXMin = Math.min(outer.p1.x, outer.p2.x);
    const outerXMax = Math.max(outer.p1.x, outer.p2.x);
    return innerXMin >= outerXMin && innerXMax <= outerXMax;
  }
  // 垂直線同士: 同じ X、Y 範囲が outer に含まれる
  if (
    inner.p1.x === inner.p2.x &&
    outer.p1.x === outer.p2.x &&
    inner.p1.x === outer.p1.x
  ) {
    const innerYMin = Math.min(inner.p1.y, inner.p2.y);
    const innerYMax = Math.max(inner.p1.y, inner.p2.y);
    const outerYMin = Math.min(outer.p1.y, outer.p2.y);
    const outerYMax = Math.max(outer.p1.y, outer.p2.y);
    return innerYMin >= outerYMin && innerYMax <= outerYMax;
  }
  // 斜め辺は対象外
  return false;
}

// ============================================================
// target 建物の辺のうち、cover 建物で「覆われていない」辺を返す。
//
// 判定:
//   1. target の辺が cover の辺と完全一致するなら共通辺扱い → 覆われている (false)
//      （1F が 2F と同じ位置の辺を持つケースで誤判定回避）
//   2. target の辺が cover のいずれかの辺の上に完全に乗っている（包含）なら
//      共通部分扱い → 覆われている (false)
//      （1F の C 辺・G 辺などが 2F の長い1辺の一部分と重なるケース）
//   3. それ以外は、辺の中点から外向き法線方向に 1 グリッド (=10mm) ずらした点が
//      cover ポリゴンの「外側」にあれば、その辺は覆われていない (true)
//
// 使用例（1F+2F同時モード）:
//   getEdgesNotCoveredBy(building1F, building2F)
//     → 1F のうち 2F で覆えない辺（＝下屋部分）に 1F 足場必要
//   2F 側は常に全周足場なので、この関数で絞り込む必要なし
// ============================================================
export function getEdgesNotCoveredBy(
  target: BuildingShape,
  cover: BuildingShape,
): EdgeInfo[] {
  const edges = getBuildingEdgesClockwise(target);
  const coverEdges = getBuildingEdgesClockwise(cover);
  const polyCover = cover.points;
  return edges.filter(edge => {
    // 1. cover の辺と完全一致するなら共通辺 → 覆われている扱い
    const isSharedEdge = coverEdges.some(ce =>
      (edge.p1.x === ce.p1.x && edge.p1.y === ce.p1.y && edge.p2.x === ce.p2.x && edge.p2.y === ce.p2.y) ||
      (edge.p1.x === ce.p2.x && edge.p1.y === ce.p2.y && edge.p2.x === ce.p1.x && edge.p2.y === ce.p1.y)
    );
    if (isSharedEdge) return false;

    // 2. target の辺が cover のいずれかの辺に包含されているなら共通部分扱い
    const isContainedInCoverEdge = coverEdges.some(ce => isEdgeContainedIn(edge, ce));
    if (isContainedInCoverEdge) return false;

    // 3. 中点を外向きに 1 グリッドずらした点が cover ポリゴン外なら覆われていない
    const midX = (edge.p1.x + edge.p2.x) / 2;
    const midY = (edge.p1.y + edge.p2.y) / 2;
    const testX = midX + edge.nx * 1;
    const testY = midY + edge.ny * 1;
    return !isPointInPolygon(testX, testY, polyCover);
  });
}

// ============================================================
// 優先度評価ヘルパー（Phase 5-B 以降でアルゴリズム本体に組み込み）
// ============================================================

/** スコアリング用定数（Phase 5-B/D で使用） */
export const SCORING_CONFIG = {
  RANK_MAIN: 10.0,
  RANK_SUB: 6.0,
  RANK_ADJUST: 2.0,
  RANK_INNER_STEP: 0.1, // ランク内の部材間差
  PENALTY_PER_RAIL: 0.5, // 本数ペナルティ係数（Phase 5-D で使用）
  PENALTY_PER_MM: 0.01, // remainder ペナルティ係数（Phase 5-D で使用）
} as const;

/** 指定サイズが優先リストのどのセクションに属するかを返す */
export function getSectionOfSize(
  size: HandrailLengthMm,
  priorityConfig: PriorityConfig,
): 'main' | 'sub' | 'adjust' | 'excluded' {
  const idx = priorityConfig.order.indexOf(size);
  if (idx < 0) return 'excluded';
  const mainEnd = priorityConfig.mainCount;
  const subEnd = priorityConfig.mainCount + priorityConfig.subCount;
  const adjustEnd =
    priorityConfig.mainCount + priorityConfig.subCount + priorityConfig.adjustCount;
  if (idx < mainEnd) return 'main';
  if (idx < subEnd) return 'sub';
  if (idx < adjustEnd) return 'adjust';
  return 'excluded';
}

/** 指定サイズのスコアを返す
 *  - main: 基準 10.0、ランク内 -0.1 ずつ
 *  - sub:  基準 6.0、ランク内 -0.1 ずつ
 *  - adjust: 基準 2.0、ランク内 -0.1 ずつ
 *  - excluded: -Infinity（使用禁止）
 */
export function getScoreOfSize(
  size: HandrailLengthMm,
  priorityConfig: PriorityConfig,
): number {
  const section = getSectionOfSize(size, priorityConfig);
  if (section === 'excluded') return -Infinity;

  const idx = priorityConfig.order.indexOf(size);
  const mainEnd = priorityConfig.mainCount;
  const subEnd = priorityConfig.mainCount + priorityConfig.subCount;

  let base: number;
  let innerIndex: number;
  if (section === 'main') {
    base = SCORING_CONFIG.RANK_MAIN;
    innerIndex = idx; // main 先頭からの位置
  } else if (section === 'sub') {
    base = SCORING_CONFIG.RANK_SUB;
    innerIndex = idx - mainEnd;
  } else {
    base = SCORING_CONFIG.RANK_ADJUST;
    innerIndex = idx - subEnd;
  }
  return base - innerIndex * SCORING_CONFIG.RANK_INNER_STEP;
}

/** 複数部材の構成に対する平均スコア（空配列は 0） */
export function scoreCombination(
  rails: HandrailLengthMm[],
  priorityConfig: PriorityConfig,
): number {
  if (rails.length === 0) return 0;
  let total = 0;
  for (const r of rails) {
    total += getScoreOfSize(r, priorityConfig);
  }
  return total / rails.length;
}

/**
 * 優先リストの各部材を baseSize としたパターンを生成する。
 * 除外セクションの部材は使わない。
 * Phase 5-B 時点では候補に追加するのみ、ソート基準は既存のまま。
 */
function generatePriorityPatterns(
  effectiveMm: number,
  enabledSizes: HandrailLengthMm[],
  priorityConfig: PriorityConfig,
): LayoutCombination[] {
  // 除外セクションを除いた使用可能部材を優先順 (main→sub→adjust) で取得
  const usableSizes: HandrailLengthMm[] = [];
  const totalInSections =
    priorityConfig.mainCount + priorityConfig.subCount + priorityConfig.adjustCount;
  for (let i = 0; i < totalInSections && i < priorityConfig.order.length; i++) {
    const size = priorityConfig.order[i];
    if (enabledSizes.includes(size)) {
      usableSizes.push(size);
    }
  }

  if (usableSizes.length === 0) return [];

  const patterns: LayoutCombination[] = [];

  // 各 usableSize を baseSize として試す
  for (const baseSize of usableSizes) {
    const baseCount = Math.floor(effectiveMm / baseSize);
    if (baseCount === 0) continue; // baseSize が長すぎる場合はスキップ

    const leftover = effectiveMm - baseSize * baseCount;

    // パターン 1: baseSize のみで埋める（端数は残す）
    patterns.push({
      rails: Array(baseCount).fill(baseSize),
      remainder: leftover,
      count: baseCount,
    });

    // パターン 2: baseSize を1本減らして、端数を他の部材で埋める
    if (baseCount >= 1) {
      const targetLeftover = leftover + baseSize;
      const fillers = usableSizes.filter((s) => s !== baseSize);

      // 単一部材で埋める
      for (const s of fillers) {
        const n = Math.floor(targetLeftover / s);
        if (n > 0) {
          const rem = targetLeftover - s * n;
          patterns.push({
            rails: [...Array(baseCount - 1).fill(baseSize), ...Array(n).fill(s)],
            remainder: rem,
            count: baseCount - 1 + n,
          });
        }
      }

      // 2部材の組み合わせで埋める（s1 + s2）
      for (let i = 0; i < fillers.length; i++) {
        for (let j = i; j < fillers.length; j++) {
          const s1 = fillers[i];
          const s2 = fillers[j];
          if (s1 + s2 <= targetLeftover + 50) { // 50mm の許容
            const rem = targetLeftover - s1 - s2;
            const rails = [...Array(baseCount - 1).fill(baseSize), s1, s2].sort(
              (a, b) => b - a,
            ) as HandrailLengthMm[];
            patterns.push({
              rails,
              remainder: rem,
              count: baseCount - 1 + 2,
            });
          }
        }
      }
    }
  }

  // 優先部材のみで小部材 2 本の組み合わせパターン（baseSize 不使用、短辺向け）
  for (let i = 0; i < usableSizes.length; i++) {
    for (let j = i; j < usableSizes.length; j++) {
      const s1 = usableSizes[i];
      const s2 = usableSizes[j];
      if (s1 + s2 <= effectiveMm + 50) {
        const rem = effectiveMm - s1 - s2;
        patterns.push({
          rails: [s1, s2].sort((a, b) => b - a) as HandrailLengthMm[],
          remainder: rem,
          count: 2,
        });
      }
    }
  }

  return patterns;
}

// ============================================================
// Phase D: 1辺の候補を「exact / larger / smaller」の3枠で返す純粋関数
// ============================================================
/**
 * Phase D: 1辺の候補を生成する。
 *
 * 仕様:
 * - 終点離れ = 割付合計 - 辺長 - 始点離れ
 * - 希望離れにぴったりな候補（exact）が存在すれば exact のみ返す
 * - 無ければ larger/smaller それぞれで「希望との距離 <= 100mm ならスコア優先、超えるなら距離優先」で選定
 */
export function generateEdgeCandidatesForPhaseD(
  edgeLengthMm: number,
  startDistanceMm: number,
  desiredEndDistanceMm: number,
  enabledSizes: HandrailLengthMm[] = HANDRAIL_SIZES,
  priorityConfig?: PriorityConfig,
  options?: {
    /** 大小判定の同スコア許容範囲 (デフォルト 100mm) */
    exactToleranceMm?: number;
    /** 候補生成時の effectiveMm 探索範囲（希望±何mm、デフォルト 500）*/
    searchRangeMm?: number;
  },
): PhaseDEdgeCandidates {
  const tolerance = options?.exactToleranceMm ?? 100;
  const range = options?.searchRangeMm ?? 500;

  // 1. 希望終点離れから逆算した割付合計を中心に、±rangeMm で探索
  const centerTotal = edgeLengthMm + startDistanceMm + desiredEndDistanceMm;

  // 2. findBestEndCombinations を複数回呼んで候補を集める
  const collectedRails: { rails: HandrailLengthMm[]; total: number }[] = [];

  for (let delta = -range; delta <= range; delta += 50) {
    const targetTotal = centerTotal + delta;
    if (targetTotal <= 0) continue;

    const results = findBestEndCombinations(targetTotal, enabledSizes, priorityConfig);
    for (const r of results) {
      const total = r.rails.reduce((a, b) => a + b, 0);
      // 重複除去（同じ total かつ 同じ rails 構成）
      const keySorted = JSON.stringify(r.rails.slice().sort((a, b) => a - b));
      const dup = collectedRails.some(
        (c) =>
          c.total === total &&
          JSON.stringify(c.rails.slice().sort((a, b) => a - b)) === keySorted,
      );
      if (!dup) {
        collectedRails.push({ rails: r.rails, total });
      }
    }
  }

  // 3. 各候補の終点離れを計算
  const phaseDCandidates: PhaseDCandidate[] = collectedRails
    .map((c) => {
      const endDist = c.total - edgeLengthMm - startDistanceMm;
      const diff = endDist - desiredEndDistanceMm;
      const score = priorityConfig ? scoreCombination(c.rails, priorityConfig) : 0;
      return {
        railsTotalMm: c.total,
        endDistanceMm: endDist,
        diffFromDesired: diff,
        score,
        rails: c.rails,
      };
    })
    .filter((c) => c.endDistanceMm > 0); // 終点離れ 0 以下は除外

  // 4. 3グループに分類
  const exactGroup = phaseDCandidates.filter((c) => c.diffFromDesired === 0);
  const largerGroup = phaseDCandidates.filter((c) => c.diffFromDesired > 0);
  const smallerGroup = phaseDCandidates.filter((c) => c.diffFromDesired < 0);

  // 5. exact は1つあれば終了（スコア最大）
  if (exactGroup.length > 0) {
    const exact = exactGroup.reduce((best, cur) =>
      cur.score > best.score ? cur : best,
    );
    return { exact, larger: null, smaller: null };
  }

  // 6. larger/smaller からそれぞれ選定
  const pickByRule = (group: PhaseDCandidate[]): PhaseDCandidate | null => {
    if (group.length === 0) return null;
    // 許容範囲内の候補
    const inTolerance = group.filter((c) => Math.abs(c.diffFromDesired) <= tolerance);
    if (inTolerance.length > 0) {
      // スコア最大、同着なら距離最小、同着なら本数最小
      return inTolerance.reduce((best, cur) => {
        if (cur.score > best.score + 1e-9) return cur;
        if (Math.abs(cur.score - best.score) < 1e-9) {
          if (Math.abs(cur.diffFromDesired) < Math.abs(best.diffFromDesired)) return cur;
          if (
            Math.abs(cur.diffFromDesired) === Math.abs(best.diffFromDesired) &&
            cur.rails.length < best.rails.length
          )
            return cur;
        }
        return best;
      });
    }
    // 許容範囲外なら距離最小（同着はスコア最大）
    return group.reduce((best, cur) => {
      if (Math.abs(cur.diffFromDesired) < Math.abs(best.diffFromDesired)) return cur;
      if (
        Math.abs(cur.diffFromDesired) === Math.abs(best.diffFromDesired) &&
        cur.score > best.score
      )
        return cur;
      return best;
    });
  };

  return {
    exact: null,
    larger: pickByRule(largerGroup),
    smaller: pickByRule(smallerGroup),
  };
}
