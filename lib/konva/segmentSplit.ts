import { BuildingShape, Point } from '@/types';
import { EdgeInfo, getBuildingEdgesClockwise } from './autoLayoutUtils';

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

