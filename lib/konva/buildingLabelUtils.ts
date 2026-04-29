// ============================================================
// Phase J-1: 建物プレビューの辺ラベル位置計算ヘルパ。
// 凹型建物の入隅で隣接辺ラベル同士が外側で重なる問題を解決するため、
// 凹角に隣接する辺は法線を反転して建物内側に配置する。
//
// 全 5 プレビュー (AutoLayoutModal / RoofSettingsModal /
// BuildingTemplateModal / ScaffoldStartModal) で共通利用。
//
// isInside=true のとき、UI 側で paint-order="stroke" + stroke 色 (= 躯体色)
// で白/暗ハローを付与し、躯体との重なり時の視認性を確保する責務がある。
// ============================================================

export type EdgeForLabel = {
  nx: number; // 法線 x (建物外側を正、autoLayoutUtils の規約)
  ny: number; // 法線 y
  p1: { x: number; y: number };
  p2: { x: number; y: number };
};

export type LabelPosition = {
  x: number;
  y: number;
  isInside: boolean; // true: 凹角隣接で内側配置、false: 通常の外側配置
};

// isConvexCorner の自前実装。autoLayoutUtils 側は EdgeInfo (full type) を
// 要求するため、subset (EdgeForLabel) でも呼べるようにここで実装する。
function isConvexLocal(prev: EdgeForLabel, curr: EdgeForLabel): boolean {
  const ax = prev.p2.x - prev.p1.x;
  const ay = prev.p2.y - prev.p1.y;
  const bx = curr.p2.x - curr.p1.x;
  const by = curr.p2.y - curr.p1.y;
  return ax * by - ay * bx > 0;
}

/**
 * 建物の辺ラベルの配置位置を計算する。
 * - 両端とも凸: 外側に baseOffset でオフセット (isInside=false)
 * - 片端 or 両端が凹: 法線反転で内側に baseOffset (isInside=true)
 *
 * @param edge       現在の辺
 * @param prevEdge   物理隣接の前辺 (時計回りで一つ前)
 * @param nextEdge   物理隣接の次辺 (時計回りで一つ後)
 * @param midX       辺中点 X (画面座標、scale 適用済み)
 * @param midY       辺中点 Y (画面座標)
 * @param baseOffset オフセット量 (画面座標単位、推奨 14)
 */
export function computeEdgeLabelPosition(
  edge: EdgeForLabel,
  prevEdge: EdgeForLabel,
  nextEdge: EdgeForLabel,
  midX: number,
  midY: number,
  baseOffset: number,
): LabelPosition {
  const concavePrev = !isConvexLocal(prevEdge, edge);
  const concaveNext = !isConvexLocal(edge, nextEdge);
  const isInside = concavePrev || concaveNext;
  const sign = isInside ? -1 : 1;
  return {
    x: midX + edge.nx * baseOffset * sign,
    y: midY + edge.ny * baseOffset * sign,
    isInside,
  };
}
