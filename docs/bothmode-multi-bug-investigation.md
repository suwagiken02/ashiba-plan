# bothmode 自動割付モーダル 複合バグ調査

> **⚠️ 注意書き**
>
> - 調査時点: 2026-05-04
> - バグは現存、 修正未着手
> - 失敗テスト追加済 (`lib/konva/__tests__/bothmode-multi-bug.test.ts`、 6 件 fail)
> - 修正コードは別フェーズで着手予定 (= 共通根 1 と 共通根 2 の修正、 順序未定)

---

## 1. 観測されたバグの 3 点

矩形 2F (= 凸型 1F + 矩形 2F の bothmode 計算) で、 以下 3 つの異常が同時観測される。

### 1-1. 観測点 A: 入力欄ラベルの方角表記が誤っている

⭐ at SW のシナリオ (= 矩形 1F + 矩形 2F):

| edge | プレビュー (= 正解、 ⭐-relative) | 入力欄 (= バグ、 raw face-based) |
|---|---|---|
| 物理 north | 2B | 2A |
| 物理 east | 2C | 2B |
| 物理 south | 2D | 2C |
| 物理 west | 2A | 2D |

プレビューが正しいことは師匠 (現場のプロ) が確認済。

### 1-2. 観測点 B: 「固定」 マークの対象辺が誤っている

師匠仕様: スタート角に隣接する 2 辺を固定する。

| ケース | スタート角 | 隣接辺 (⭐-relative) | 期待 lock label | 実際 lock label |
|---|---|---|---|---|
| 1 | SE = ⭐右下 | south (2A) + east (2D) | 2A, 2D | **2B, 2C** |
| 2 | SW = ⭐左下 | west (2A) + south (2D) | 2A, 2D | **2C, 2D** |

物理 lock 対象は両ケースとも正しい (= ⭐ adjacent の物理 edge)。 表示ラベルが face-based のため期待と乖離。

### 1-3. 観測点 C: 2A 割付計算で +12mm のずれ

入力 (自動割付モーダル):
- 2A = 888 (北、 外壁 9000mm)
- 2B = 900 (東、 外壁 7000mm)
- 2C = 900 (南、 外壁 9000mm)
- 2D = 888 (西、 外壁 7000mm)
- 1F 下屋: 1A = 1B = 1C = 888

足場開始モーダル: 南 C = 900、 東 B = 900 (= ⭐ at SE で face1=南, face2=東)。

師匠仕様 (確定済 = 仕様 b): 各入力欄 = その面の壁から足場までの離れ。 cascade で:
- 有効長 = 前辺 (2D = 西 = 888) 離れ + 当該外壁 (2A = 南 = 9000) + 次辺 (2B = 西 = 888) 希望離れ

**師匠の期待**:
- 候補 1: 1800×6 = 10800 → 2B 離れ 900 (= 10800 − 9000 − 900)
- 候補 2: 1800×5 + 900 + 600 + 200 = 10700 → 2B 離れ 800

注: 期待値の `900` を引いている部分は、 仕様 b で 「⭐-relative の 2A 計算では prev=東 (= 「2B 東」 入力値 = 900)、 next=西 (= 「2D 西」 入力値 = 888)」 が正しい。 詳細は §3 / §4 で。

**実際の表示 (バグ)**:
- 候補 1: 2B 離れ 912 (= +12 ずれ)
- 候補 2: 2B 離れ 812 (= +12 ずれ)
- 警告メッセージ: 「2B 面を希望の離れ 900mm にすることは不可能」 (= 期待 888 と乖離)

---

## 2. 真因の特定

### 2-1. 観測点 A の真因 (確定)

**ファイル**: `components/scaffold/AutoLayoutModal.tsx:375-381`

```ts
const edges = useMemo(() => {
  if (!building) return [];
  const rawEdges = getBuildingEdgesClockwise(building);
  if (targetFloor === 'both') return rawEdges;       // ← ここ: bothmode は raw のまま
  const startIdx = (scaffoldStart?.startVertexIndex ?? 0) % (building.points.length || 1);
  return relabelByFace2F(rawEdges, startIdx);
}, [building, targetFloor, scaffoldStart]);
```

bothmode 分岐で `relabelByFace2F` を適用していない (= **Phase H-3d-6 の実装漏れ**)。 入力欄 (`AutoLayoutModal.tsx:1295-1302`) は `edges.label` を使うため、 bothmode で常に raw face-based ラベル (= `String.fromCharCode(65+i)`) が表示される。

一方、 プレビューは `edges2FAll` (`AutoLayoutModal.tsx:298-322`) を使い `relabelByFace2F` 経由で ⭐-relative ラベルを生成。 → 入力欄 vs プレビューで ⭐ ≠ NW のとき乖離。

### 2-2. 観測点 B の真因 (確定)

**ファイル**: `components/scaffold/AutoLayoutModal.tsx:384-392`

```ts
const lockedEdgeIndices = useMemo(() => {
  if (!scaffoldStart || !building) return new Set<number>();
  const edgeList = getBuildingEdgesClockwise(building);
  const n = edgeList.length;
  const startIdx = scaffoldStart.startVertexIndex ?? 0;
  const outEdge = edgeList[startIdx % n];
  const inEdge = edgeList[(startIdx - 1 + n) % n];
  return new Set([outEdge.index, inEdge.index]);
}, [scaffoldStart, building]);
```

物理 index ベースで ⭐ adjacent 2 辺を Set に登録。 **物理 lock 対象は正しい**。 入力欄レンダリングで `lockedEdgeIndices.has(edge.index)` で判定し lock マークを描画 (= `AutoLayoutModal.tsx:1304`)。

表示ラベルが入力欄の `edge.label` (= raw face-based、 観測点 A と同じ経路) のため、 ⭐ ≠ NW で期待 (⭐-relative) と乖離。 → **観測点 A と同根**。

### 2-3. 観測点 C の真因 (推測 + コード検証)

#### 上位ファイル: `components/scaffold/AutoLayoutModal.tsx:514-516` (setDistance)

```ts
const setDistance = (idx: number, value: number) => {
  setDistances(prev => ({ ...prev, [idx]: value }));
  ...
};
```

`distances` state は `edge.index` (= 入力欄 = raw building の `getBuildingEdgesClockwise` 出力の i) でキー保存。 矩形 2F なら 0..3、 凸型 1F + 矩形 2F の split 後は normalized で 0..5 だが **入力欄は raw の 0..3 のまま**。

#### 下位ファイル: `lib/konva/autoLayoutUtils.ts:1605-1607` (cascade lookup)

```ts
const prevEdgeStartDistanceMm = prevSegmentStartDist
  ?? (distances2F[edges2F[(i - 1 + n2F) % n2F].index] ?? 900);
```

`edges2F = getBuildingEdgesClockwise(normalizedBuilding2F)` (`autoLayoutUtils.ts:1487`) で normalized 基準。 cascade は normalized の edge.index で `distances2F` を読む。

#### 数値検証: ⭐ at SE、 凸型 1F + 矩形 2F

`splitBuilding2FAt1FVertices` で 2F 北辺に splitL=(3000,0)、 splitR=(6000,0) が挿入され normalized は 6 頂点。

```
normalizedBuilding2F.points = [NW, splitL, splitR, NE, SE, SW]
normalized edges:
  index 0: NW→splitL = north (左)
  index 1: splitL→splitR = north (中)
  index 2: splitR→NE = north (右)
  index 3: NE→SE = east       ← ⭐ at SE で 2A の prev physical
  index 4: SE→SW = south      ← 2A 本体 (cascade k=0)
  index 5: SW→NW = west       ← 2A の next physical
```

師匠の入力 (raw key):
- distances[0] = 888 (= UI 「2A 北」、 物理 north 意図)
- distances[1] = 900 (= UI 「2B 東」)
- distances[2] = 900 (= UI 「2C 南」)
- distances[3] = 888 (= UI 「2D 西」)

cascade k=0 (= 2A south, normalized i=4) の lookup:
- `prevEdgeStartDistanceMm = distances2F[3]` (= normalized 3 = east) = **888** (= raw key 3 = 「2D 西」 値が east として解決される)
- `desiredEndDistanceMm = distances2F[5]` (= normalized 5 = west) = **undefined** → fallback **900**

`requiredRailsTotal = 888 + 9000 + targetEnd`:
- 1800×6 = 10800 → targetEnd = **912** ✓ 観測一致
- 1800×5+900+600+200 = 10700 → targetEnd = **812** ✓ 観測一致

警告メッセージ (`AutoLayoutModal.tsx:1944`) は `seg2A.desiredEndDistanceMm = 900` (default) を表示。 → 「希望の離れ 900mm」 ✓ 観測一致。

#### 真因確定

**「データ層 (= AutoLayoutModal の `distances` state) が raw building 基準、 計算層 (= computeBothmode2FLayout) が normalized building 基準」**。 split で頂点挿入されると raw 0..3 と normalized 0..5 で意味が乖離し、 cascade が 「raw 西の値」 を 「normalized east」 として誤読する。

---

## 3. 入力欄の意味確認 (仕様 b 確定の根拠)

師匠と AI の対話で 3 つの解釈候補が出た:

- **(a)** 「2A 欄入力値 = 2A 面の終端離れ = 次辺 2B 側の離れ」: 2A の cascade 計算で 2A 入力値 (888) を 2B 希望離れとして使う。
- **(b)** 「各入力欄 = その面の壁から足場までの離れ」: 2A 入力 = 2A 面の離れ、 2B 入力 = 2B 面の離れ。 cascade で 2A 計算は 2D (前辺) と 2B (次辺) の値を読む。
- **(c)** その他

### コード読解

`autoLayoutUtils.ts:1562-1564` (cascade での next desired 読み出し):
```ts
const desiredEndDistanceMm = pillarEdge1FIdx !== null
  ? (distances1F[pillarEdge1FIdx] ?? 900)
  : (distances2F[nextEdge2F.index] ?? 900);
//             ↑ next edge (= 2B) の index で distances を引く
```

`autoLayoutUtils.ts:1605-1607` (cascade での prev start 読み出し):
```ts
const prevEdgeStartDistanceMm = prevSegmentStartDist
  ?? (distances2F[edges2F[(i - 1 + n2F) % n2F].index] ?? 900);
//                 ↑ prev edge (= 2D) の index で distances を引く
```

### 確定: 仕様 (b)

cascade は **next edge = 2B の index で desired を読み、 prev edge = 2D の index で prev start を読む**。 「2A 入力値を 2B 希望として使う」 ロジックはコード上に存在しない。

→ **仕様 (b) で実装されている**。 警告メッセージの「900」 表示は仕様 (b) のコードが正しく動作した結果 (= 「2B 入力値 = 900」 が次辺希望として読まれている、 のはずだが、 観測点 C の key 不一致でズレが起きている)。

---

## 4. 共通根の整理

| 観測点 | 共通根 | 修正対象 (推定) |
|---|---|---|
| A | **共通根 1**: bothmode で `edges` への `relabelByFace2F` 未適用 (Phase H-3d-6 の実装漏れ) | `AutoLayoutModal.tsx:375-381` |
| B (ケース 1, 2) | **共通根 1** (同上、 lock マーク表示が入力欄 label を流用) | 同上 (= A と同時修正) |
| C | **共通根 2**: distances state の key 解釈が raw / normalized で不一致 | `AutoLayoutModal.tsx` 周辺 + 計算層 lookup |

**結論**: 共通根 1 と共通根 2 は **別の構造的バグ**。 修正は独立に進める必要がある。

両者とも上位概念で「raw building と normalized building の使い分けがコード全体で整合していない」 という共通の構造問題に属する (= 観測点 A・B は label 文字列、 観測点 C は数値 key の側面)。

---

## 5. Phase H-3d-7 (archived 2afcbf5) との関連性

H-3d-7 archive (`docs/h-3d-7-investigation-archived.md`) は「凸型 1F + 矩形 2F の bothmode で ⭐ marker 表示位置がずれる」 報告で、 当時再現せずアーカイブされた。 当時の仮説:

> normalizedScaffoldStart の lookup で `building2F.points[oldIdx]` を使うが、 `oldIdx` は `getBuildingEdgesClockwise` 後の CW order (= reverse 後の order) なので、 raw が CCW なら index 不一致。

### 観測点 C との共通構造

観測点 C の真因と H-3d-7 の仮説は、 **「raw building と normalized building の index 解釈が混在している」** という同じ構造問題のサブパターン:

| バグ | データ要素 | raw vs normalized 不一致点 | 解決 |
|---|---|---|---|
| H-3d-7 (archive) | `scaffoldStart.startVertexIndex` | raw points 上の vertex 番号 vs normalized points 上の vertex 番号 | `normalizedScaffoldStart` 再マッピング (= Phase H-3d-2 で導入) で対処済 |
| 観測点 C (本件) | `distances` state の key | raw edges 上の edge.index vs normalized edges 上の edge.index | **未対処** |

H-3d-7 では Phase H-3d-2 の `normalizedScaffoldStart` 再マッピング機構で scaffoldStart の index 不一致を解消したが、 **同等の機構を `distances` には適用していない**。 観測点 C は H-3d-7 と同じ構造問題のうち、 別のデータ要素 (= scaffoldStart ではなく distances) に残存しているもの。

### 再発リスク

共通根 2 修正時には、 H-3d-7 archive の「再発時のチェックリスト」 と合わせて確認すべき:
- distances 修正後、 scaffoldStart の index も正しく動作しているか (= ⭐ marker 表示位置)
- 1F 下屋距離 (`distances1F`) も同じ raw/normalized key 問題を持つか確認 (= `splitBuilding1FAtBuilding2FVertices` で 1F が split される場合)

---

## 6. 修正方向の候補

### 共通根 1 (= 観測点 A・B)

**案 1A**: bothmode の `edges` useMemo に「normalized 基準で `relabelByFace2F` を適用、 ただし raw edge の数 (= 入力欄の数) と normalize 後の edge 数が異なる場合は coord match で raw → normalized label を貼り直す」 を追加

```diff
 const edges = useMemo(() => {
   if (!building) return [];
   const rawEdges = getBuildingEdgesClockwise(building);
-  if (targetFloor === 'both') return rawEdges;
+  if (targetFloor === 'both' && normalizedBuilding2F && normalizedScaffoldStart) {
+    const normalizedEdges = getBuildingEdgesClockwise(normalizedBuilding2F);
+    const startIdx = (normalizedScaffoldStart.startVertexIndex ?? 0) % normalizedEdges.length;
+    const labeled = relabelByFace2F(normalizedEdges, startIdx);
+    // raw edges の各 e に対し、 同座標 (e.p1) を normalized から探して label を貼り直す
+    return rawEdges.map(re => {
+      const match = labeled.find(le =>
+        Math.abs(le.p1.x - re.p1.x) < 0.001 && Math.abs(le.p1.y - re.p1.y) < 0.001,
+      );
+      return match ? { ...re, label: match.label } : re;
+    });
+  }
   const startIdx = (scaffoldStart?.startVertexIndex ?? 0) % (building.points.length || 1);
   return relabelByFace2F(rawEdges, startIdx);
 }, [building, targetFloor, scaffoldStart, normalizedBuilding2F, normalizedScaffoldStart]);
```

**副作用**:
- 入力欄 / 結果パネル / lock マークすべての label が ⭐-relative になる。
- raw 1 edge が normalized で複数 edge に split される場合 (= 凸型 1F のとき raw 北辺 1 つが normalized で 3 split)、 1 入力欄に対する label が複数候補ある。 「raw edge.p1 と一致する normalized edge」 を選ぶことで一意化 (= raw 北辺の p1=NW に一致する normalized 0=NW→splitL の label を使う)。 妥当性は要検証。

**案 1B**: 入力欄を normalized edges ベースに切り替える (= 共通根 2 と一緒に解消、 大改造)。 `distances` state も normalized key に統一。

### 共通根 2 (= 観測点 C)

**案 2A**: `distances` state を normalized building の edge.index でキー化
- 入力欄レンダリング: normalizedBuilding2F の edges を使う
- setDistance: normalized edge.index で保存
- 副作用: split で増えた edge にもユーザ入力欄が必要 (= 4 → 6 入力欄)。 UX 変化大、 「同じ wall を分割した複数入力欄」 が出るため使いにくい。

**案 2B**: `computeBothmode2FLayout` 入口で `distances2F` を raw key → normalized key にマッピング
- マッピング: raw edge と normalized edge を coord match (= edge.p1 一致) で対応
- raw 1 edge が normalized で 3 split されるとき、 同じ raw 値を 3 つの normalized key にコピー (= 同じ wall なので同じ離れで自然)
- 副作用: 計算層への変更。 入力欄 UI は raw のまま。

**案 2C**: AutoLayoutModal に `normalizedDistances` re-keyed useMemo を作り、 計算層に渡す (= H-3d-7 の `normalizedScaffoldStart` パターンに対称)
- raw `distances` state はそのまま入力欄 UI に使う
- `normalizedDistances` を coord match で構築し、 `computeBothmode2FLayout` に渡す
- 副作用: 修正最小、 既存 H-3d-7 のパターンと整合。 推奨。

### 推奨

**案 1A + 案 2C** の組み合わせ。 ただし両方とも別フェーズで個別に検証すべき:

1. 共通根 1 (案 1A): 観測点 A・B の失敗テストが PASS に転じるか実機確認
2. 共通根 2 (案 2C): 観測点 C の失敗テスト 3 件が PASS に転じるか実機確認

順序は共通根 1 (= 表示問題で UX 影響大、 修正が比較的局所) を先に修正、 次に共通根 2 (= 計算問題、 H-3d-7 のパターン参照) が妥当か。

---

## 7. 修正前のチェックリスト

修正実装フェーズ着手時の確認事項:

- [ ] 共通根 1 修正後、 既存 114+α テストの label 関連テストが期待ラベルで動作するか (= `labelUtils.test.ts` の 16 件、 既存 H-3d-6 テストへの影響)
- [ ] 共通根 1 修正後、 単一階モードへの影響なし (= edges useMemo の bothmode 分岐のみ修正)
- [ ] 共通根 2 修正後、 凸型 1F + 矩形 2F の cascade が +12 ずれずに動作するか (= 本ファイルの観測点 C 失敗テスト 3 件が PASS)
- [ ] 共通根 2 修正後、 1F 下屋距離 (`distances1F`) も同じ raw/normalized key 問題を持つか確認 (= `splitBuilding1FAtBuilding2FVertices` で 1F が split される場合の挙動)
- [ ] H-3d-7 archived の再現性が変わるか確認 (= ⭐ marker ずれが再発しないか)
- [ ] ScaffoldStartModal の face1/face2 割当ロジックが共通根 1・2 修正で壊れていないか

---

## 8. 関連 commit / ファイル

### 関連 commit
- `2afcbf5 docs: archive H-3d-7 investigation (bug not reproducible)` (= 観測点 C と同じ構造問題のうち別のサブパターン)
- `3ad0156 feat(autoLayout): replace face-based labeling with ⭐ origin CW labeling` (= Phase H-3d-6、 観測点 A の前提となる relabelByFace2F 導入。 bothmode への適用漏れがあった)
- `4c57667 fix(autoLayout): map scaffoldStart to normalized vertex index in preview` (= Phase H-3d-5、 normalizedScaffoldStart 導入。 観測点 C 修正案 2C のパターン参照)

### 関連ファイル

#### コード経路
- **入力欄レンダリング**: `components/scaffold/AutoLayoutModal.tsx:1295-1310` (= edges.map で各辺を表示)
- **edges useMemo**: `components/scaffold/AutoLayoutModal.tsx:375-381` (= 共通根 1 の本丸)
- **edges2FAll useMemo (preview)**: `components/scaffold/AutoLayoutModal.tsx:298-322`
- **lockedEdgeIndices**: `components/scaffold/AutoLayoutModal.tsx:384-392`
- **distances state**: `components/scaffold/AutoLayoutModal.tsx:396-413` (init), `:514-516` (setDistance)
- **normalizedBuilding2F**: `components/scaffold/AutoLayoutModal.tsx:286-289`
- **normalizedScaffoldStart**: `components/scaffold/AutoLayoutModal.tsx:323-336` (= Phase H-3d-5、 共通根 2 の参考パターン)
- **cascade prev/next lookup**: `lib/konva/autoLayoutUtils.ts:1562-1564` (next desired), `:1605-1607` (prev start)
- **split 関数**: `lib/konva/autoLayoutUtils.ts:1168-1252` (`splitBuildingAtVertices`)
- **relabelByFace2F**: `lib/konva/labelUtils.ts:43-` (= Phase H-3d-6)

#### テスト
- **本ファイル**: `lib/konva/__tests__/bothmode-multi-bug.test.ts` (失敗テスト 6 件)
- **既存関連**: `lib/konva/__tests__/labelUtils.test.ts` (relabelByFace2F の単体テスト)、 `lib/konva/__tests__/computeBothmode2FLayout.test.ts` (cascade のシナリオテスト)
