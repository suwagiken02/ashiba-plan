# Phase H-3d-7 仮: 凸型 ⭐ 表示位置ずれバグ — 調査アーカイブ

> **⚠️ 注意: このドキュメントはアーカイブ (= 将来再発した際の参考資料) です。**
>
> 2026-05-03 時点で **現象は再現しません**。 師匠が手元で再現を試みた結果、 凸型 1F + 矩形 2F の両ケース (⭐SW、 ⭐SE) のどちらも ⭐ が正しい位置に表示されました。 そのため、 このドキュメントは **現バグの修正用ではなく**、 再発したときに過去の分析を読み直せるよう残してあるものです。
>
> 失敗テストの追加・修正コードの作成は行っていません。

---

## 1. 背景: 当初のバグ報告

凸型 1F + 矩形 2F の建物を 1F+2F モード (bothmode) で開いたとき、 ⭐ (足場開始位置) の表示位置が CW 方向に +1 ずれて見えるという報告:

- **ケース A**: 1F 凸型 (8100×6100 + 北側突き出し) + 2F 矩形 で、 ⭐ を 1F の SW 角に設定 → bothmode を開くと NW に表示される
- **ケース B**: 同じ建物で ⭐ を 1F の SE 角に設定 → bothmode で SW に表示される

師匠の当初仮説: `splitBuilding2FAt1FVertices` で頂点が追加されたとき、 normalize 後の ⭐ index 再マッピングが追加分を考慮できていない。

## 2. 調査仮説 (Claude による分析)

### 仮説の核

`AutoLayoutModal.tsx` の `normalizedScaffoldStart` useMemo 内:

```ts
const oldStart = building2F.points[oldIdx];   // ★ ここが怪しい
```

`oldIdx` (= `scaffoldStart.startVertexIndex`) は `ScaffoldStartModal.tsx` で:

```ts
const edges = getBuildingEdgesClockwise(targetBuilding);  // 内部で CCW → CW reverse あり
const pts = edges.map(e => e.p1);
...
startVertexIndex: selectedIdx % n,                          // ← CW (= reverse 後) 順 index
```

として保存される。

`building2F.points` は **raw 配列** (= reverse 前)。 raw が CCW なら `getBuildingEdgesClockwise` の中で reverse される一方、 `oldIdx` は reverse 後の CW 順 index。 したがって、 raw が CCW のとき:

```
building2F.points[oldIdx] ≠ ScaffoldStartModal の pts[oldIdx]
```

となり、 ⭐ の本来の vertex 座標と異なる座標を検索することになる。

### 修正候補 (ただしこのバグでは不適用、 別の安全保険として残置可能)

```diff
   const oldIdx = scaffoldStart.startVertexIndex ?? 0;
-  const oldStart = building2F.points[oldIdx];
+  // oldIdx は ScaffoldStartModal が getBuildingEdgesClockwise(building2F).map(e=>e.p1) 上の
+  // CW 順 index として保存している。 raw points は CCW の可能性があるため、 同じ CW 順に揃える。
+  const cwEdges = getBuildingEdgesClockwise(building2F);
+  const oldStart = cwEdges[oldIdx % (cwEdges.length || 1)]?.p1;
```

## 3. 8 通り raw points 順序 全数検証表

`normalizedBuilding2F.points` は (NW=0, splitL=1, splitR=2, NE=3, SE=4, SW=5) と仮定 (= 凸型 1F + 矩形 2F、 split が north 辺に 2 頂点挿入、 NW 起点に rotate 後)。

| raw 2F.points 順 | shoelace | reversed? | pts (CW 順) | ⭐ SW: 表示位置 | ⭐ SW shift | ⭐ SE: 表示位置 | ⭐ SE shift |
|---|---|---|---|---|---|---|---|
| `[NW,NE,SE,SW]` (CW from NW) | + | no | same | SW (5) | 0 | SE (4) | 0 |
| `[NE,SE,SW,NW]` (CW from NE) | + | no | same | SW (5) | 0 | SE (4) | 0 |
| `[SE,SW,NW,NE]` (CW from SE) | + | no | same | SW (5) | 0 | SE (4) | 0 |
| `[SW,NW,NE,SE]` (CW from SW) | + | no | same | SW (5) | 0 | SE (4) | 0 |
| `[NW,SW,SE,NE]` (CCW from NW) | − | yes | `[NE,SE,SW,NW]` | **SE (4)** | **−1 CW** | **SW (5)** | **+1 CW** ✓B |
| `[NE,NW,SW,SE]` (CCW from NE) | − | yes | `[SE,SW,NW,NE]` | **NW (0)** | **+1 CW** ✓A | **NE (3)** | **−1 CW** |
| `[SE,NE,NW,SW]` (CCW from SE) | − | yes | `[SW,NW,NE,SE]` | **SE (4)** | **−1 CW** | **SW (5)** | **+1 CW** ✓B |
| `[SW,SE,NE,NW]` (CCW from SW) | − | yes | `[NW,NE,SE,SW]` | **NW (0)** | **+1 CW** ✓A | **NE (3)** | **−1 CW** |

凡例:
- ✓A = ケース A (⭐SW → NW = +1 CW) を説明できる raw 順
- ✓B = ケース B (⭐SE → SW = +1 CW) を説明できる raw 順

## 4. 「両ケース +1 CW 同時発生は単一 raw 順では不可能」 の幾何学的結論

### 各ケースを説明できる raw 順 (上の表から抽出)

- **ケース A** を説明できる raw 順: `[NE,NW,SW,SE]` (CCW from NE)、 `[SW,SE,NE,NW]` (CCW from SW)
- **ケース B** を説明できる raw 順: `[NW,SW,SE,NE]` (CCW from NW)、 `[SE,NE,NW,SW]` (CCW from SE)

これら 2 集合は **完全に互いに素** (= disjoint)。

### 同時不可能の理由

CCW raw を reverse すると、 `raw[saved(V)]` は raw 起点位置に依存する 2 種類の対称のいずれかを返す:

| CCW 起点 | 対称の種類 | 効果 |
|---|---|---|
| NW or SW 起点 | 左右反転 (NW↔NE, SW↔SE) | ⭐SW→SE (−1CW), ⭐SE→SW (+1CW) |
| NE or SE 起点 | 上下反転 (NW↔SW, NE↔SE) | ⭐SW→NW (+1CW), ⭐SE→NE (−1CW) |

「両ケース +1 CW 同時発生」 = ⭐SW→NW + ⭐SE→SW を要求 → 「上下反転 ∩ 左右反転」 = **点反転** (NW↔SE, NE↔SW) が必要。 4 通りの CCW 起点いずれもこの対称を生まないため、 **単一 raw 順では物理的に不可能**。

## 5. 再現試行結果 (2026-05-03)

師匠が手元で再現を試みた結果、 **凸型 1F + 矩形 2F の両ケース (⭐SW、 ⭐SE) のどちらも ⭐ が正しい位置に表示**された。 つまり報告された症状は現時点で再現しない。

**考えられる理由**:
- 当初の症状報告時、 一時的に建物の raw points 順が CCW で保存されていた可能性 (= 何らかの操作 / 描画手順で raw 順が変動)。 その後、 何らかの操作 (再描画、 テンプレート再適用、 リロード等) で CW 順に「自然修復」 された。
- 当初の観察自体が、 ⭐ そのものではなく **ラベル位置** (= Phase H-3d-6 で導入した `relabelByFace2F` の起点) を見ていた可能性。 ⭐ position と label A 位置の混同。
- Phase H-3d-5 (4c57667 `fix(autoLayout): map scaffoldStart to normalized vertex index in preview`) と Phase H-3d-6 の修正が組み合わさることで、 当初の症状を覆い隠している可能性。
- 師匠が当時試した特定の描画手順 (= 後から再現しづらい) で発生していた可能性。

## 6. 再発時のチェックリスト

将来同じ症状 (bothmode で ⭐ 位置 / ラベル位置のずれ) が再発した場合、 まず以下を確認:

### 観測の精度を上げる

1. **「⭐ そのもの」 と「ラベル A の位置」 を区別する**:
   - ⭐ (★ マーカー) は `AutoLayoutModal.tsx:175-194` の `points[scaffoldStart.startVertexIndex]` で描画
   - ラベル A 位置は `relabelByFace2F` で起点を決め、 `edges2FAll` の最初の edge に付与
   - 両者は理論的には同じ vertex を指すが、 別経路で計算される。 どちらがずれているかで原因が違う。

2. **同じ建物で複数ケース (⭐ 位置を SW / NE / SE / NW で切り替え) を観測**:
   - 同じ raw points 順なら、 全ケースの shift パターンは表 4 (の幾何学的対称) のいずれか 1 行に従う
   - 1 行に収まらない (例: 両ケース +1 CW) → **複数バグが重畳している** か、 **観測か建物が変わっている**
   - 表 4 の 1 行にきれいに収まる → **CW vs raw 食い違い単独**、 修正候補 A で直る

### データを直接確認

3. **`building2F.points` の raw 順を確認**:
   - Chrome DevTools Console で zustand store dump (実装依存、 アクセス方法は要確認)
   - もしくは `console.log` を AutoLayoutModal.tsx の useMemo 内で一時的に仕込む (= 修正フェーズに入ってから)
   - shoelace の符号で CW/CCW を判定し、 起点 vertex (NW/NE/SE/SW のどれか) を確認

4. **`scaffoldStart1F` vs `scaffoldStart2F` を確認**:
   - bothmode は `scaffoldStart2F` を使う前提だが、 実データで `scaffoldStart1F` のみ設定されている可能性
   - その場合 `scaffoldStart` useMemo は legacy fallback で何を返しているか辿る

### 関連経路

5. **`splitBuildingAtVertices` の NW-rotate ロジック**:
   - `lib/konva/autoLayoutUtils.ts:1238-1249` 付近の nwIdx 選択
   - 同 X 座標の頂点が複数あるとき (= 凸型 1F の splitL/splitR は y=0 で、 NW=(0,0) も y=0) のタイブレーカが意図通りか

6. **`getBuildingEdgesClockwise` の reverse 後 label 振り直し**:
   - `lib/konva/autoLayoutUtils.ts:93-138`
   - edge.index と edge.p1 / edge.p2 の対応関係に矛盾がないか

## 7. 関連ファイル / 関連 commit (将来の調査者向け)

### コード経路
- **⭐ 描画**: `components/scaffold/AutoLayoutModal.tsx:175-194` (PreviewSVG 内の `text` 要素)
- **scaffoldStart の取得**: `components/scaffold/AutoLayoutModal.tsx:308-321` (effective floor 別の選択)
- **normalizedScaffoldStart の再マッピング**: `components/scaffold/AutoLayoutModal.tsx:323-336`
- **scaffoldStart の保存**: `components/scaffold/ScaffoldStartModal.tsx:50-58, 110`
- **building2F の正規化**: `lib/konva/autoLayoutUtils.ts:1288` (`splitBuilding2FAt1FVertices`) → `:1168-1252` (`splitBuildingAtVertices`)
- **CW reverse + NW-rotate**: `lib/konva/autoLayoutUtils.ts:1229-1249`

### 関連 commit (Git log で参照)
- `4c57667 fix(autoLayout): map scaffoldStart to normalized vertex index in preview` (Phase H-3d-5、 PreviewSVG が `normalizedScaffoldStart` を使うように切り替え)
- `3ad0156 feat(autoLayout): replace face-based labeling with ⭐ origin CW labeling` (Phase H-3d-6、 ラベル付けが ⭐ 起点 CW に変更、 label と ⭐ 位置の整合性が高まった)
- `31f4f1e chore(autoLayout): remove dead code from old face-based labeling` (Phase H-3d-6 cleanup)

## 8. 将来の対応方針

このアーカイブは **証拠保全目的** であり、 現時点での修正提案は含まれません。 再発した場合は:

1. このアーカイブを読み返す
2. セクション 6 のチェックリストで観測精度を上げる
3. 観測結果が表 4 の 1 行に収まるか確認
4. 収まる → 修正候補 A (セクション 2 末尾の diff 案) を試す
5. 収まらない → 別の経路 (= NW-rotate / PreviewSVG / multi-bug 重畳) を疑う

新規修正フェーズとして起こすときは、 改めて Phase H-3d-N の番号を割り当て、 `docs/handoff-h-3d-N.md` で正式な仕様書を作成してから着手することを推奨。
