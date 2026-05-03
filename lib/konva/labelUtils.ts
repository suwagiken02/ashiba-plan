import { Point } from '@/types';
import { EdgeInfo } from './autoLayoutUtils';

// ============================================================
// Phase H-3d-6: ラベル付けロジック
//
// 師匠の現場ルール:
//   ⭐ (足場開始位置) を起点に時計回り (CW) で A, B, C, D, ... と採番。
//   2F は同面分割が起きたら同アルファベット + 数字 suffix (B1, B2, B3)。
//   1F は下屋部分のみ対象、 ⭐ に最も近い辺を 1A、 そこから CW 順に独立採番。
//   Z 超えは Excel 列番号風に AA, AB, ... と 2 文字化。
//
// 仕様詳細: docs/handoff-h-3d-6.md
// ============================================================

/**
 * Excel 列番号風の 0-indexed アルファベット変換。
 *
 *   numberToAlpha(0)   === 'A'
 *   numberToAlpha(25)  === 'Z'
 *   numberToAlpha(26)  === 'AA'
 *   numberToAlpha(27)  === 'AB'
 *   numberToAlpha(701) === 'ZZ'
 *   numberToAlpha(702) === 'AAA'
 */
export function numberToAlpha(n: number): string {
  let result = '';
  let x = n;
  while (true) {
    result = String.fromCharCode(65 + (x % 26)) + result;
    x = Math.floor(x / 26) - 1;
    if (x < 0) break;
  }
  return result;
}

/**
 * 2F edges に label を付与する (⭐ 起点 CW、 同面分割は suffix)。
 *
 * 入力 edges は normalizedBuilding2F の getBuildingEdgesClockwise 出力 (CW、
 * face/handrailDir 設定済) を想定する。 startVertexIndex は normalizedBuilding2F
 * の points 上での ⭐ vertex index。
 *
 * 戻り値は入力と同じ要素数で、 各 EdgeInfo の label のみ書き換えた配列を返す
 * (= index/face/p1/p2/... は不変)。 配列の物理 index 順序も保持。
 */
export function relabelByFace2F(
  edges: EdgeInfo[],
  startVertexIndex: number,
): EdgeInfo[] {
  const n = edges.length;
  if (n === 0) return edges;
  const startIdx = ((startVertexIndex % n) + n) % n;

  // step 1: ⭐ から CW で巡回しつつ、 連続する同 (face, handrailDir) を group 化
  type Group = { startK: number; endK: number; face: string; dir: string };
  const groups: Group[] = [];
  let curGroup: Group | null = null;
  for (let k = 0; k < n; k++) {
    const i = (startIdx + k) % n;
    const e = edges[i];
    if (curGroup && e.face === curGroup.face && e.handrailDir === curGroup.dir) {
      curGroup.endK = k;
    } else {
      if (curGroup) groups.push(curGroup);
      curGroup = { startK: k, endK: k, face: e.face, dir: e.handrailDir };
    }
  }
  if (curGroup) groups.push(curGroup);

  // step 2: 各 group に letter 付与。 group size === 1 → suffix なし、 2+ → 'B1', 'B2', ...
  const labelByOriginalIndex = new Map<number, string>();
  for (let g = 0; g < groups.length; g++) {
    const base = numberToAlpha(g);
    const size = groups[g].endK - groups[g].startK + 1;
    for (let k = groups[g].startK; k <= groups[g].endK; k++) {
      const i = (startIdx + k) % n;
      const subIdx = k - groups[g].startK;
      const label = size > 1 ? `${base}${subIdx + 1}` : base;
      labelByOriginalIndex.set(edges[i].index, label);
    }
  }

  return edges.map(e => ({
    ...e,
    label: labelByOriginalIndex.get(e.index) ?? e.label,
  }));
}

/**
 * 1F 下屋 edges に label を付与する (⭐ から 1F polygon を CW で巡回、 下屋辺のみ
 * 順次採番)。
 *
 * 旧版は「⭐ に最も近い uncoveredEdge midpoint」 を 1A としていたが、 これは
 * 師匠の現場ルールと不一致 (= L 型で SW ⭐ のとき下屋南端が 1A になってしまう)。
 * 新版は「⭐ → 最近接 1F 頂点 → そこから CW 巡回 → 最初に出会う下屋辺が 1A」。
 *
 * 入力:
 *   building1FEdges: 1F polygon の全辺 (= getBuildingEdgesClockwise(normalizedBuilding1F))
 *   uncoveredEdgeIndices: 下屋辺の edge.index Set
 *   commonStartPoint: ⭐ の絶対座標。 null なら 1F polygon vertex 0 を起点にする。
 *
 * 戻り値: 下屋辺のみ含む配列 (= 入力 building1FEdges のうち uncoveredEdgeIndices
 * に該当するものだけ)、 ⭐ から CW 巡回した順序で label = 'A', 'B', 'C', ... が
 * 付与済み。 配列順序も巡回順 (= 入力 building1FEdges の物理順とは限らない)。
 *
 * 同距離の頂点が複数ある場合は配列の先勝ち。
 */
export function relabelByFace1F(
  building1FEdges: EdgeInfo[],
  uncoveredEdgeIndices: Set<number>,
  commonStartPoint: Point | null,
): EdgeInfo[] {
  const n = building1FEdges.length;
  if (n === 0) return [];

  // step 1: ⭐ に最も近い 1F polygon 頂点 index を探す (= edge.p1 で代表)
  let startVertexIdx = 0;
  if (commonStartPoint) {
    let minDistSq = Infinity;
    for (let i = 0; i < n; i++) {
      const p = building1FEdges[i].p1;
      const dx = p.x - commonStartPoint.x;
      const dy = p.y - commonStartPoint.y;
      const dSq = dx * dx + dy * dy;
      if (dSq < minDistSq) {
        minDistSq = dSq;
        startVertexIdx = i;
      }
    }
  }

  // step 2: 起点から CW (= 配列の wraparound) で全 1F 辺を巡回、
  //          uncoveredEdgeIndices に該当する辺だけ採番
  const result: EdgeInfo[] = [];
  let labelIdx = 0;
  for (let k = 0; k < n; k++) {
    const i = (startVertexIdx + k) % n;
    const edge = building1FEdges[i];
    if (uncoveredEdgeIndices.has(edge.index)) {
      result.push({ ...edge, label: numberToAlpha(labelIdx) });
      labelIdx++;
    }
  }

  return result;
}
