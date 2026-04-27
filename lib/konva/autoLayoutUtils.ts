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
type SequentialCandidate = {
  rails: HandrailLengthMm[];
  totalMm: number;
  actualEndDistanceMm: number;
  diffFromDesired: number;
};

export function generateSequentialCandidates(
  edgeLengthMm: number,
  startDistanceMm: number,
  desiredEndDistanceMm: number,
  isNextConvex: boolean,
  enabledSizes: HandrailLengthMm[] = HANDRAIL_SIZES,
  priorityConfig?: PriorityConfig,
): SequentialCandidate[] {
  // 有効長の計算
  // 凸: effective = startDist + edgeLength + desiredEndDist
  // 凹: effective = startDist + edgeLength - desiredEndDist
  const effectiveMm = isNextConvex
    ? startDistanceMm + edgeLengthMm + desiredEndDistanceMm
    : startDistanceMm + edgeLengthMm - desiredEndDistanceMm;

  if (effectiveMm <= 0) {
    return [];
  }

  // 希望値の周辺 ±500mm を 50mm ステップで探索
  const candidatesMap = new Map<number, SequentialCandidate>();

  for (let offset = -500; offset <= 500; offset += 50) {
    const targetMm = effectiveMm + offset;
    if (targetMm <= 0) continue;

    const cands = findBestEndCombinations(targetMm, enabledSizes, priorityConfig);

    for (const c of cands) {
      const railsTotal = c.rails.reduce((a, b) => a + b, 0);

      // 実際の終点離れを逆算
      // 凸: actualEnd = railsTotal - edgeLength - startDist
      // 凹: actualEnd = startDist + edgeLength - railsTotal
      const actualEndDistanceMm = isNextConvex
        ? railsTotal - edgeLengthMm - startDistanceMm
        : startDistanceMm + edgeLengthMm - railsTotal;

      if (actualEndDistanceMm < 0) continue;

      const diffFromDesired = actualEndDistanceMm - desiredEndDistanceMm;

      if (!candidatesMap.has(railsTotal)) {
        candidatesMap.set(railsTotal, {
          rails: c.rails,
          totalMm: railsTotal,
          actualEndDistanceMm,
          diffFromDesired,
        });
      }
    }
  }

  if (candidatesMap.size === 0) return [];

  const allCandidates = Array.from(candidatesMap.values());

  // 端数0なら1つだけ
  const exactMatch = allCandidates.find(c => c.diffFromDesired === 0);
  if (exactMatch) {
    return [exactMatch];
  }

  // 希望より大きい側 / 小さい側
  const largerCandidates = allCandidates
    .filter(c => c.diffFromDesired > 0)
    .sort((a, b) => a.diffFromDesired - b.diffFromDesired);

  const smallerCandidates = allCandidates
    .filter(c => c.diffFromDesired < 0)
    .sort((a, b) => b.diffFromDesired - a.diffFromDesired);

  const result: SequentialCandidate[] = [];
  if (smallerCandidates[0]) result.push(smallerCandidates[0]);
  if (largerCandidates[0]) result.push(largerCandidates[0]);

  return result;
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
// target 建物の辺のうち、cover 建物で「覆われていない」辺を返す。
// 判定: target の辺の中点から外向き法線方向に 1 グリッド (=10mm) ずらした点が
//      cover ポリゴンの「外側」にあれば、その辺は cover で覆われていない。
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
  const polyCover = cover.points;
  return edges.filter(edge => {
    const midX = (edge.p1.x + edge.p2.x) / 2;
    const midY = (edge.p1.y + edge.p2.y) / 2;
    // 外向きに 1 グリッド = 10mm ずらす
    const testX = midX + edge.nx * 1;
    const testY = midY + edge.ny * 1;
    // cover ポリゴンの外側なら覆われていない
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
