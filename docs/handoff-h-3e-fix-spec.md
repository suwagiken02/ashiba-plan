# Phase H-3e 修正仕様書

> **⚠️ ステータス**: 修正未着手、 仕様書フェーズ
>
> 引継ぎノート (`docs/handoff-h-3e.md`) 第 6 章 「仕様書先行ルート」 に従って作成。 本書 commit 後、 別 commit で実装着手する。
>
> **調査根拠**: `docs/bothmode-multi-bug-investigation.md` (= 詳細調査)、 `docs/h-3d-7-investigation-archived.md` (= 関連 archive)、 失敗テスト 6 件 (`lib/konva/__tests__/bothmode-multi-bug.test.ts`)。

---

## 1. 修正の目標

- **失敗テスト 6 件 (= bothmode-multi-bug.test.ts) を全 pass にする**
- **既存 114 件は全 pass を維持** (= 修正で副作用が出ていないことを確認)
- **共通根 1 と 共通根 2 を別 commit で分割修正** (= 各 commit で対応する failing test subset の遷移を確認)

最終状態: 既存 114 + 失敗解消 6 = 120 件全 pass。

---

## 2. 着手順序の決定

### 推奨: **共通根 1 → 共通根 2** の順

### 各順序の長所・短所

| 順序 | 長所 | 短所 |
|---|---|---|
| **共通根 1 → 共通根 2** (推奨) | (a) UI label が ⭐-relative になった後で計算修正の動作確認が意味的に明確 (b) リスクが小さい順 (= 表示層 → 計算層) (c) 失敗テスト 3 件 + 3 件 で小刻み確認 | bothmode 計算結果は共通根 2 修正まで変わらない (= 観測点 C は残る) |
| 共通根 2 → 共通根 1 | 計算結果が先に正しくなる | (a) UI label が face-based のまま動作確認するため、 「2D 入力欄に何の値か」 が unclear (b) ユーザ視点で観測点 A・B が残ったまま |

### 依存関係 (= コード読解の事実)

- 共通根 1 修正範囲: `AutoLayoutModal.tsx:375-381` (= edges useMemo の bothmode 分岐内、 label 文字列のみ)
- 共通根 2 修正範囲: `AutoLayoutModal.tsx` 周辺で `normalizedDistances` 等の追加 (= データ層 key 解釈)
- **両者は修正範囲が重ならない**。 計算ロジックは共通根 2 が、 表示は共通根 1 が、 それぞれ独立に対象化
- どちらから着手しても、 もう片方の修正に支障はない

### 各 commit で確認する項目

#### 共通根 1 修正 commit
- tsc / lint / test 全 pass
- 失敗テスト 6 件のうち 3 件 (= 観測 A、 B-1、 B-2) が pass に転じることを確認
- 残り 3 件 (= 観測 C) は failing のまま (= 共通根 2 で解消予定)
- 既存 114 件は全 pass 維持
- 実機確認: 入力欄 / 「固定」 マーク label が ⭐-relative になっていること (各 ⭐ 位置で)

#### 共通根 2 修正 commit
- 同様に tsc / lint / test 全 pass
- 失敗テスト 残り 3 件 (= 観測 C-1、 C-2、 C-3) が pass に転じることを確認 → 全 6 件 pass、 計 120/120 pass
- 既存 114 件は全 pass 維持
- 実機確認: 凸型 1F + 矩形 2F + ⭐ at SE で 1800×6 候補が actualEnd=900 (= +12 ずれ解消) 表示

---

## 3. 共通根 1 の修正方向最終決定

### 推奨: **案 1A** (= relabelByFace2F + coord match)

### 案 1A vs 案 1B 比較

| 観点 | 案 1A | 案 1B |
|---|---|---|
| 修正規模 | 小 (1 ファイル / 数行) | 大 (UI 構造変更) |
| 入力欄数 | 不変 (= raw building 基準) | 増加 (= 凸型 1F + 矩形 2F で 4→6 入力欄) |
| UX 副作用 | label 表示が ⭐-relative に変化のみ | 「同じ wall を 3 分割した複数入力欄」 が出現 → UX 悪化 |
| 既存パターン整合 | 単一階モードの単純 relabel と同質 | 大改造、 新パターン |
| リスク | coord match logic で「raw 1 edge → normalized 複数 edges split」 の label 選択が必要 (= 設計判断ポイント) | 大規模変更で複数副作用の可能性 |
| 推奨 | ★ **推奨** | ✗ 非推奨 |

### 推奨理由

- 案 1A は最小修正で観測点 A・B が解消可能
- 案 1B の「入力欄数の増加」 は現場 UX で受け入れ難い (= 同じ壁を分割した複数入力欄)
- 計算ロジック (cascade) は label を読まないため、 表示層のみで完結

### 修正対象ファイル / 行番号

| 修正対象 | 内容 |
|---|---|
| `components/scaffold/AutoLayoutModal.tsx:375-381` (`edges` useMemo) | bothmode 分岐に「normalized 基準で `relabelByFace2F` を適用 + coord match で raw → normalized label 貼り直し」 を追加 |

### 修正案 (= 概念 diff、 実装で変動の可能性あり)

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

### 影響する既存テスト予測

| カテゴリ | 影響 | 根拠 |
|---|---|---|
| `labelUtils.test.ts` (16 件) | **影響なし** | `relabelByFace2F` 自体は変更しない、 呼び出し箇所追加のみ |
| `computeBothmode*Layout.test.ts` 等 (計算系) | **影響なし** | 計算層に label は伝搬しない (= edge.index で駆動、 grep で確認済) |
| 失敗テスト pass に転じる | A (1) + B-1 (1) + B-2 (1) = **3 件** | 観測 A・B の真因が共通根 1 |

---

## 4. 共通根 2 の修正方向最終決定

### 推奨: **案 2C** (= `normalizedDistances` re-keyed useMemo)

### 案 2A vs 案 2B vs 案 2C 比較

| 観点 | 案 2A (state を normalized キー化) | 案 2B (計算層入口で変換) | 案 2C (re-keyed useMemo) |
|---|---|---|---|
| 修正規模 | 大 (UI 連動必要) | 中 (計算層シグネチャ変更) | 小 (1 useMemo 追加) |
| UI 側変更 | 入力欄数増加 (= 案 1B と一体) | なし | なし |
| 計算層変更 | あり | あり (raw building 引数追加) | **なし** |
| 既存パターン整合 | なし | やや不純 (計算層が raw を意識) | **H-3d-5 の `normalizedScaffoldStart` パターンと完全対称** |
| 既存テスト影響 | UI / state テスト書き換え必要 | 計算層テストの引数変更 | 計算層テスト無変更 |
| 推奨 | ✗ | △ | ★ **推奨** |

### 推奨理由

- 案 2C は **H-3d-5 で導入された `normalizedScaffoldStart` パターンと完全対称**:
  - H-3d-5: `scaffoldStart` (raw key) → `normalizedScaffoldStart` (normalized key) を AutoLayoutModal で生成、 計算層に渡す
  - 案 2C: `distances` (raw key) → `normalizedDistances` (normalized key) を AutoLayoutModal で生成、 計算層に渡す
- 計算層は無変更で、 既存計算層テスト 約 5-7 件 (= computeBothmode2FLayout 系) への影響なし
- AutoLayoutModal で完結する最小修正

### 修正対象ファイル / 行番号

| 修正対象 | 内容 |
|---|---|
| `components/scaffold/AutoLayoutModal.tsx` (場所未確定、 `normalizedScaffoldStart` 付近 = `:323-336` の直後を想定) | `normalizedDistances` useMemo を新規追加 (= raw distances → normalized index にマッピング) |
| `AutoLayoutModal.tsx` 内の `computeBothmode2FLayout` / `computeBothmode1FLayout` 呼び出し箇所 (複数) | `distances` の代わりに `normalizedDistances` を渡す |

### 修正案 (= 概念 diff、 実装で変動の可能性あり)

```diff
+  // Phase H-3e: distances state は raw building の edge.index でキー保存されているが、
+  // computeBothmode2FLayout は normalized building 上の edge.index で読み出すため、
+  // re-keying が必要。 H-3d-5 の normalizedScaffoldStart と対称的なパターン。
+  const normalizedDistances = useMemo(() => {
+    if (targetFloor !== 'both' || !building2F || !normalizedBuilding2F) {
+      return distances;
+    }
+    const rawEdges = getBuildingEdgesClockwise(building2F);
+    const normalizedEdges = getBuildingEdgesClockwise(normalizedBuilding2F);
+    const result: Record<number, number> = {};
+    for (const ne of normalizedEdges) {
+      // normalized edge の p1 と一致する raw edge を探し、 その distances 値を引き継ぐ
+      const match = rawEdges.find(re =>
+        Math.abs(re.p1.x - ne.p1.x) < 0.001 && Math.abs(re.p1.y - ne.p1.y) < 0.001,
+      );
+      if (match !== undefined && distances[match.index] !== undefined) {
+        result[ne.index] = distances[match.index];
+      }
+    }
+    return result;
+  }, [distances, targetFloor, building2F, normalizedBuilding2F]);
```

呼び出し変更 (例):
```diff
-  computeBothmode2FLayout(
-    normalizedBuilding2F, normalizedBuilding1F, distances, distances1F,
-    normalizedScaffoldStart!, ...
-  );
+  computeBothmode2FLayout(
+    normalizedBuilding2F, normalizedBuilding1F, normalizedDistances, distances1F,
+    normalizedScaffoldStart!, ...
+  );
```

### 影響する既存テスト予測

| カテゴリ | 影響 | 根拠 |
|---|---|---|
| `computeBothmode2FLayout.test.ts` 等 (計算系) | **影響なし** | 計算層シグネチャ無変更、 既存テストは計算関数を直接呼び (UI を経由しない)、 distances は既に key 整合済の値を渡している前提 |
| `relabelByFace*` 系 | **影響なし** | label とは別レイヤ |
| 失敗テスト pass に転じる | C-1 (1) + C-2 (1) + C-3 (1) = **3 件** | 観測 C の真因が共通根 2 |

---

### 4-X. 1F 側との対比 (= 設計の歴史的経緯)

過去の修正経緯を踏まえると、 **共通根 2 の修正は「新規導入」ではなく「既存パターンへの追従」** と位置付けられる:

- **distances1F (1F 側)**: H-3d-3 / H-3d-6 の修正経緯で normalized 経由に統一済み (= 入力 UI / state / cascade すべて normalizedBuilding1F の edge.index で整合)
- **distances (2F 側)**: raw 経由のまま取り残されていた (= 観測点 C の真因)

→ 共通根 2 の案 2C (`normalizedDistances` re-keyed useMemo) は、 **1F 側の既存設計と対称な構造を 2F 側にも適用することで、 データ層の整合を揃える修正**である。 新しいパターンを導入するのではなく、 既存パターンへの追従。

#### 調査根拠 (= コード読解の事実)

| 経路 | 1F 側 (distances1F) | 2F 側 (distances) |
|---|---|---|
| 入力 UI ループ元 | `uncoveredEdges1F` (= `getEdgesNotCoveredBy(normalizedBuilding1F, ...)`)、 `AutoLayoutModal.tsx:1356-1360` | raw `edges` (= `getBuildingEdgesClockwise(building)`)、 `AutoLayoutModal.tsx:1295-1302` |
| state 初期化 | `AutoLayoutModal.tsx:417-425` (`uncoveredEdges1F.forEach(e => next[e.index] = ...)`) | `AutoLayoutModal.tsx:396-413` (`edges.forEach(e => d[e.index] = ...)`) |
| cascade 関数引数 building | `normalizedBuilding1F` (`autoLayoutUtils.ts:1488`、 `:1856-1866`) | `normalizedBuilding2F` を渡すが、 `distances` は **raw key で残ったまま** |
| cascade 内 distances1F 読み出し | `distances1F[edge.index]` (= normalized index、 `autoLayoutUtils.ts:1965-2023`) | `distances2F[edges2F[i].index]` (= normalized index 期待だが state は raw key) |
| computeBothmode2FLayout 内 pillar lookup | `distances1F[pillarEdge1FIdx]` (= normalized 1F index、 `autoLayoutUtils.ts:1556-1564`) | (該当なし) |

→ **1F 側は完全に normalized 一貫**、 **2F 側のみ raw vs normalized 不一致**。 共通根 2 修正は 1F 側のパターンを 2F 側に適用するもの。

---

## 5. 既存テスト影響の予測

### 既存 114 件のうち、 修正で値が変わる可能性のあるテスト

調査の結果、 **共通根 1・2 とも既存 114 件への影響なし** と判定:

| 修正 | 影響可能性のあるテスト | 影響根拠 |
|---|---|---|
| 共通根 1 (案 1A) | **なし** | label は表示層のみ、 計算層に伝搬しない (= grep で `edge.label` 参照箇所が計算層 0 件を確認) |
| 共通根 2 (案 2C) | **なし** | 計算層は無変更、 既存計算層テストは distances を直接渡している (= UI を経由しない、 既に key 整合済の値) |

### 失敗テスト 6 件のうち、 各修正で pass に転じるもの

| 修正 | pass に転じる件数 | 内訳 |
|---|---|---|
| 共通根 1 修正後 | 3 件 | 観測 A (1) + B-1 (1) + B-2 (1) |
| 共通根 2 修正後 (累積) | 6 件 (= 全件) | 上記 3 + 観測 C-1 (1) + C-2 (1) + C-3 (1) |

### 「pass に転じるべきだが転じない」 場合の対処方針

1. **diff を再確認**: 想定どおりの修正になっているか
2. **失敗テストの actual / expected を見て**、 修正前後で actual がどう変わったかを確認
3. **仕様前提 (仕様 b) の再確認**: `docs/bothmode-multi-bug-investigation.md` を読み直して仕様解釈を確認
4. **必要なら修正中断**: 師匠に確認、 ファイル状態は `git stash` 等で保全

---

## 6. 副作用評価

### UI 表示変化 (= 推測、 実装後に実機確認すべき)

| モード / 場面 | 共通根 1 修正で変化 | 共通根 2 修正で変化 |
|---|---|---|
| bothmode 入力欄ラベル | ⭐-relative に変化 | 変化なし |
| bothmode 「固定」 マーク表示 | ⭐-relative に変化 | 変化なし |
| bothmode 計算結果候補値 | 変化なし | +12 ずれ解消 (= split 発生形状) |
| 警告メッセージ希望離れ表示 | 変化なし | 正しい値に |
| 単一階モード | 影響なし (※) | 影響なし (※) |

(※) 単一階モードは bothmode 分岐の外、 `AutoLayoutModal.tsx:378` の `if (targetFloor === 'both') return rawEdges;` パスを通らない。 既に H-3d-6 で ⭐-relative 適用済 と **コード読解で確認済**。

### 既存挙動への影響

| 形状 / モード | 共通根 1 影響 | 共通根 2 影響 | 注意点 |
|---|---|---|---|
| 単一階モード | なし | なし | bothmode 分岐外 (= 確認済事実) |
| bothmode 矩形 + 矩形 (= split なし) | label 変化 | cascade 不変 | raw key と normalized key が一致するため (= 推測) |
| bothmode 凸型 1F + 矩形 2F (= split 発生) | label 変化 | cascade 変化 | 失敗テスト C のシナリオ |
| bothmode 凹型 / U 字 / 複雑形状 | label 変化 | cascade 変化 | 複数 split で同様 |
| その他モーダル (ScaffoldStart / BuildingTemplate / etc.) | なし | なし | 独立 (= grep で edges useMemo 参照箇所なしを確認可能) |

### エッジケース (= 推測、 実装中・実機確認で再評価)

| 形状 | split 発生 | 共通根 1 確認すべきこと | 共通根 2 確認すべきこと |
|---|---|---|---|
| 矩形 + 矩形 | なし | label 変化 (= 動作既知) | cascade 結果が変わらないこと |
| L 字 (1 凹) | あり | label 変化 + raw 1 edge → normalized 複数 edges の貼り直しが正しいか | cascade 結果が +12 ずれずに正しい値か |
| 凸型 (1 凸) | あり (= 失敗テスト C) | 同上 | 同上 (= 失敗テストで pass 確認) |
| U 字 / 凹型 | あり (複数) | 同上、 複数 split の場合 | 同上 |
| T 字 / 複雑 | あり (複数 + 複数 face) | 同上 | 同上 |

### 1F 側 distances1F は対象外 (= 修正不要、 第 4-X 章参照)

調査の結果、 1F 側 distances1F は既に normalized 経由に統一済 (= 観測点 C と同問題なし)。 共通根 2 の修正スコープは distances (2F) のみで完結する。 1F 側を巻き込む必要なし。

---

## 7. 修正後の確認手順

### 各 commit (= 共通根 1 / 共通根 2 各々) で実行する確認

1. **tsc**: `npx tsc --noEmit` → exit 0
2. **lint**: スキップ (= ESLint 未設定、 既存パターン)
3. **test**: `npm test` → 既存 114 件 + 失敗テスト の遷移を確認
   - 共通根 1 修正後: 117 pass / 3 fail (= 観測 C 残り)
   - 共通根 2 修正後: 120 pass / 0 fail (= 全 pass)
4. **diff 確認**: `git diff --stat` で変更ファイル数 / 行数を確認、 想定範囲内か
5. **実機確認** (= 下記)

### 実機確認チェックリスト (= 共通根 1 修正後)

| 項目 | ⭐ NW | ⭐ NE | ⭐ SE | ⭐ SW |
|---|---|---|---|---|
| bothmode 矩形 + 矩形: 入力欄ラベル | A=北/B=東/C=南/D=西 | A=東/B=南/C=西/D=北 | A=南/B=西/C=北/D=東 | A=西/B=北/C=東/D=南 |
| bothmode 矩形 + 矩形: 「固定」 マーク | 2A + 2D | 2A + 2D | 2A + 2D | 2A + 2D |
| bothmode 凸型 1F + 矩形 2F: 入力欄ラベル | (上記) + 同面分割 suffix | 同 | 同 | 同 |
| 単一階モード: 既存どおり | 影響なし | 影響なし | 影響なし | 影響なし |

### 実機確認チェックリスト (= 共通根 2 修正後)

| 項目 | 期待 |
|---|---|
| bothmode 凸型 1F + 矩形 2F + ⭐ at SE: 2A 1800×6 候補 | actualEnd = 900 (= +12 ずれ解消) |
| 同シナリオ: 1800×5+900+600+200 候補 | actualEnd = 800 |
| 同シナリオ: 警告メッセージ希望離れ | 888mm (= 西の入力値) |
| bothmode 矩形 + 矩形: cascade 結果 | 修正前と完全同一 (= split なしで影響なし) |
| 単一階モード: cascade 結果 | 修正前と完全同一 |

---

## 8. 不確実性 / 設計判断 (= 実装中に再確認すべき点)

### 共通根 1 (案 1A) 関連

#### (1) raw 1 edge → normalized 複数 edges split のときの label 貼り直し設計

凸型 1F + 矩形 2F のような split 発生形状で、 raw 2F の 1 edge が normalized で複数 edges に分かれる場合の label 選択。

**現案**: raw edge の `p1` と一致する normalized edge の label を採用 (= raw edge の出発点が normalized split の最初の edge)。

**懸念**: `p1` が一致するのは最初の split edge のみ。 split された残りの normalized edges (= 中間・最後) の label は raw 入力欄に表示されない (= 入力欄数 = raw edge 数なので、 split 後の middle/last は別の入力欄に対応しない)。 これは仕様上問題ないか?

**実装中の確認**:
- 凸型 1F + 矩形 2F で「raw 北辺 1 edge」 が「normalized 北辺 3 edges (左/中央/右)」 に split された場合
- raw 北辺の入力欄に表示される label は、 normalized 北辺の最初 (= 左部分) の label が選ばれる
- 北辺は ⭐-relative で同 face 連続 → suffix 付き (= "B1"/"B2"/"B3" 等)。 入力欄には "B1" が表示される想定
- これが UX 的に妥当か実機で確認

### 共通根 2 (案 2C) 関連

#### (2) `normalizedDistances` キー解釈の整合性確認

raw → normalized re-keying で、 raw 1 edge が normalized 複数 edges に split される場合、 同じ raw 値を複数 normalized key にコピーする (= 同じ wall の離れなので同値で自然)。

**現案**: normalized edge の `p1` と一致する raw edge を探し、 その distances 値を引き継ぐ。

**懸念**: split された normalized edges (= 同じ raw edge から派生した複数 edges) すべてに同じ raw 値がコピーされるが、 これは仕様 b と整合するか?

**整合性検証 (= 推測)**:
- 仕様 b: 「各入力欄 = その面の壁から足場までの離れ」
- 同じ wall の split された複数 normalized edges は **同じ wall (= 物理的に同じ壁、 同じ離れ)**
- → 同じ raw 値を割り当てるのは仕様 b と整合 ✓
- 実装中に各 split パターンで確認

### その他

#### (3) 修正中に新たなバグが発見された場合

- 修正中断、 `git stash` で状態保全
- 新規バグを `docs/` に調査 md として記録
- 失敗テストを追加 (= 同じパターンを踏襲)
- 師匠と相談して修正範囲再評価

#### (4) 1F 側 distances1F は修正不要 (= 確定事項)

第 4-X 章で確認済。 1F 側は normalized 経由に既に統一済。 修正中に「1F も直すべきか?」 と迷った場合、 本書第 4-X 章を参照して判断 (= 不要)。

---

## 9. 関連ドキュメント / commit

### 関連ドキュメント
- **引継ぎノート**: `docs/handoff-h-3e.md` (= 本仕様書のインプット、 全体俯瞰)
- **詳細調査**: `docs/bothmode-multi-bug-investigation.md` (= 観測点別の真因解析)
- **関連 archive**: `docs/h-3d-7-investigation-archived.md` (= 同じ raw vs normalized 構造問題のサブパターン)
- **過去ハンドオフ**: `docs/handoff-h-3d-6.md`, `docs/handoff-h-3d-5.md`

### 関連 commit
- `7e9afa6 docs: add handoff note for Phase H-3e (bothmode multi-bug)` (= 引継ぎノート)
- `c77208c docs+test: investigate bothmode multi-bug (label/lock-mark/12mm shift)` (= 本件調査スナップショット)
- `2afcbf5 docs: archive H-3d-7 investigation (bug not reproducible)` (= 関連 archive)
- `3ad0156 feat(autoLayout): replace face-based labeling with ⭐ origin CW labeling` (= 共通根 1 の発生源 = bothmode 適用漏れ)
- `4c57667 fix(autoLayout): map scaffoldStart to normalized vertex index in preview` (= 案 2C のパターン参照、 `normalizedScaffoldStart` 導入)

### コード経路
- **edges useMemo (共通根 1 修正対象)**: `components/scaffold/AutoLayoutModal.tsx:375-381`
- **入力欄レンダリング**: `components/scaffold/AutoLayoutModal.tsx:1295-1302`
- **lockedEdgeIndices**: `components/scaffold/AutoLayoutModal.tsx:384-392`
- **distances state**: `components/scaffold/AutoLayoutModal.tsx:396-413` (init), `:514-516` (setDistance)
- **normalizedScaffoldStart (案 2C パターン参照)**: `components/scaffold/AutoLayoutModal.tsx:323-336`
- **cascade prev/next lookup**: `lib/konva/autoLayoutUtils.ts:1562-1564` (next desired), `:1605-1607` (prev start)
- **split 関数**: `lib/konva/autoLayoutUtils.ts:1168-1252` (`splitBuildingAtVertices`)
- **relabelByFace2F**: `lib/konva/labelUtils.ts:43-`

### 失敗テスト
- `lib/konva/__tests__/bothmode-multi-bug.test.ts` (203 行、 6 件)
