# Phase H-3e (= bothmode multi-bug): 引継ぎノート

## ⚠️ 現在のステータス

- **調査完了** (commit `c77208c`、 2026-05-04)
- **修正未着手**
- **失敗テスト 6 件記録済**: `lib/konva/__tests__/bothmode-multi-bug.test.ts` で 6 件 FAIL を確認。 修正フェーズで全 pass にする目標
- **既存テスト 114 件は全 pass を維持**: 本調査時点で `Tests 6 failed | 114 passed (120)` を確認済

---

## 1. 概要

bothmode 自動割付モーダル (= 1F+2F 同時モード) で 3 つの観測点で異常を確認:
- **観測点 A**: 入力欄ラベルの方角表記が誤っている (= 「2A=北」 等の face-based 表示)
- **観測点 B**: 「固定」 マークの対象辺ラベルが誤っている (= ⭐ 隣接 2 辺の物理対象は正しいがラベル表示が face-based)
- **観測点 C**: 2A 割付計算で +12mm のずれ + 警告メッセージの希望離れ表示が誤り

これらは 2 つの構造的な共通根に集約される:
- **共通根 1**: bothmode の入力欄 `edges` への `relabelByFace2F` 未適用 (= Phase H-3d-6 の実装漏れ) → 観測点 A・B
- **共通根 2**: `distances` state の key が raw building 基準だが cascade は normalized building 基準で読み出し → 観測点 C

---

## 2. 観測点別の真因まとめ

### 2-1. 観測点 A: 入力欄ラベル方角誤り

- **症状** (⭐ at SW のシナリオ): 入力欄表示「2A=北、 2B=東、 2C=南、 2D=西」 (= face-based 固定)、 プレビュー (= 正解、 ⭐-relative) 「2A=西、 2B=北、 2C=東、 2D=南」 と乖離
- **真因 (確定)**: `components/scaffold/AutoLayoutModal.tsx:375-381` の `edges` useMemo で bothmode 分岐に `relabelByFace2F` が適用されていない (= Phase H-3d-6 の oversight)
- **コード抜粋**:
  ```ts
  if (targetFloor === 'both') return rawEdges;  // ← ここ: bothmode は raw のまま
  ```
- **波及**: 入力欄 (`L1295-1302`) は `edges.label` を使うため、 ⭐ ≠ NW で常に face-based ラベルが表示される

### 2-2. 観測点 B: 固定マーク label 不整合

- **症状**: 固定マークが付く edge は正しい (= ⭐ adjacent の物理 edge) が、 表示されるラベルが face-based のため ⭐-relative 期待と乖離
  - ケース 1 (⭐ at SE): 期待「2A, 2D」 / 実際「2B, 2C」
  - ケース 2 (⭐ at SW): 期待「2A, 2D」 / 実際「2C, 2D」
- **真因 (確定)**: `lockedEdgeIndices` (`AutoLayoutModal.tsx:384-392`) は物理 index ベースで正しく ⭐ 隣接を判定。 表示が入力欄の `edge.label` (= raw face-based、 観測点 A と同経路) を流用するため乖離
- **観測点 A と同根** (= 共通根 1)

### 2-3. 観測点 C: distances key 不一致 (+12mm shift)

- **症状** (凸型 1F + 矩形 2F、 ⭐ at SE):
  - 候補 1: 1800×6=10800 → 2B 離れ **912** (期待 900、 +12 ずれ)
  - 候補 2: 1800×5+900+600+200=10700 → 2B 離れ **812** (期待 800、 +12 ずれ)
  - 警告メッセージ: 「2B 面を希望の離れ **900mm** にすることは不可能」 (期待は 888mm 表示)
- **真因 (推測 + コード検証済)**:
  - **データ層** (`AutoLayoutModal.tsx:514-516`): `distances` state は raw building の edge.index でキー保存 (= 矩形 2F なら 0..3)
  - **計算層** (`autoLayoutUtils.ts:1605-1607`): cascade は normalized building の edge.index で `distances2F` を読み出し
  - splitBuilding2FAt1FVertices で頂点挿入される建物形状 (= 凸型 1F + 矩形 2F) で raw 0..3 と normalized 0..5 の意味が乖離
- **数値検証**: cascade k=0 (south、 normalized i=4) で `distances2F[normalized 3=east]` = `distances2F[3]` = 888 (= raw key 3 = 西の値が east として読まれる) → `requiredRailsTotal = 888 + 9000 + targetEnd` で +12 ずれ

---

## 3. 共通根の整理

| 共通根 | 該当観測点 | 修正対象 |
|---|---|---|
| **共通根 1**: bothmode の `edges` への `relabelByFace2F` 未適用 | A・B | `AutoLayoutModal.tsx:375-381` |
| **共通根 2**: `distances` の key 解釈が raw / normalized で不一致 | C | `AutoLayoutModal.tsx` 周辺 + 計算層 lookup |

→ **共通根 1 と 共通根 2 は別の構造的バグ**。 修正は独立に進める必要がある。

両者とも上位概念で「raw building と normalized building の使い分けがコード全体で整合していない」 という共通の構造問題に属する (= 観測点 A・B は label 文字列、 観測点 C は数値 key の側面)。

---

## 4. Phase H-3d-7 (archived `2afcbf5`) との関連

H-3d-7 archive (`docs/h-3d-7-investigation-archived.md`) は「凸型 1F + 矩形 2F の bothmode で ⭐ marker 表示位置がずれる」 という報告で、 当時再現せずアーカイブされた。 当時の仮説:

> normalizedScaffoldStart の lookup で `building2F.points[oldIdx]` を使うが、 `oldIdx` は `getBuildingEdgesClockwise` 後の CW order なので、 raw が CCW なら index 不一致。

### 観測点 C との共通構造

| バグ | データ要素 | raw vs normalized 不一致点 | 解決 |
|---|---|---|---|
| H-3d-7 (archived) | `scaffoldStart.startVertexIndex` | raw points 上の vertex 番号 vs normalized points 上の vertex 番号 | `normalizedScaffoldStart` 再マッピング (= Phase H-3d-2 で導入) で対処済 |
| 観測点 C (本件) | `distances` state の key | raw edges 上の edge.index vs normalized edges 上の edge.index | **未対処** |

H-3d-7 は Phase H-3d-2 の `normalizedScaffoldStart` 再マッピング機構で scaffoldStart の index 不一致を解消したが、 **同等の機構を `distances` には適用していない**。 観測点 C は H-3d-7 と同じ構造問題のうち、 別のデータ要素に残存しているもの。

→ **共通根 2 修正実装フェーズで H-3d-7 との連動再発リスクを確認すべき** (= scaffoldStart マッピングと distances マッピングの整合)

---

## 5. 失敗テスト

- **ファイル**: `lib/konva/__tests__/bothmode-multi-bug.test.ts` (203 行、 6 件)
- **期待**: 修正完了後に全 6 件 pass
- **既存テスト 114 件は全 pass を維持**

### 各テストの actual / expected (調査時点 2026-05-04)

| # | 観測点 | テスト内容 | actual | expected |
|---|---|---|---|---|
| 1 | A | ⭐ at SW: 入力欄ラベル | `["A","B","C","D"]` | `["B","C","D","A"]` |
| 2 | B-1 | ⭐ at SE: locked labels | `["B","C"]` | `["A","D"]` |
| 3 | B-2 | ⭐ at SW: locked labels | `["C","D"]` | `["A","D"]` |
| 4 | C-1 | 1800×6 候補の actualEnd | 912 | 900 |
| 5 | C-2 | 1800×5+... 候補の actualEnd | 812 | 800 |
| 6 | C-3 | seg2A.desiredEndDistanceMm | 900 | 888 |

---

## 6. 修正フェーズ着手時の手順 (提案)

> **重要**: 修正実装に入る前に、 **必ず修正仕様書を別途作成して commit する**。 H-3d-6 のステップ 1 (= 仕様文書化先行) と同じ慎重ルートを踏襲する。
>
> **仕様書には以下を含める**:
> - 共通根 1 と 共通根 2 のどちらから着手するか
> - 修正方向の最終決定 (案 1A vs 1B、 案 2A vs 2B vs 2C のうちどれを採用するか)
> - 各修正で影響する既存テストの予測
> - 副作用 (= UX 変化、 既存挙動への影響) の評価
>
> **仕様書 commit 後、 別 commit で実装に入る**。 実装後に失敗テスト 6 件が pass に転じることを確認してから次の commit に進む。

その上で:
- **共通根 1 と 共通根 2 を別 commit で分割推奨**
- **各 commit で対応する failing test subset が passing に転じることを確認**:
  - 共通根 1 修正後 → 観測点 A・B のテスト (= 3 件) が pass
  - 共通根 2 修正後 → 観測点 C のテスト (= 3 件) が pass
- **既存 114 件は全 pass 維持** (= 修正で副作用が出ていないか各 commit で確認)

---

## 7. 修正方向の候補 (詳細は investigation md 参照)

### 共通根 1 (= 観測点 A・B)
- **案 1A**: bothmode の `edges` useMemo に「normalized 基準で `relabelByFace2F` を適用、 ただし raw edge と normalize 後 edge 数が異なる場合は coord match で raw → normalized label を貼り直す」 を追加
- **案 1B**: 入力欄を normalized edges ベースに切り替える (= 共通根 2 と一緒に解消、 大改造)

### 共通根 2 (= 観測点 C)
- **案 2A**: `distances` state を normalized building の edge.index でキー化 (= UI 大きく変化)
- **案 2B**: `computeBothmode2FLayout` 入口で `distances2F` を raw key → normalized key にマッピング (= 計算層変更)
- **案 2C**: AutoLayoutModal に `normalizedDistances` re-keyed useMemo を作り、 計算層に渡す (= H-3d-7 の `normalizedScaffoldStart` パターンに対称) ← **推奨**

### 推奨組合せ
**案 1A + 案 2C** (= 修正最小、 既存パターンと整合)。 ただし両方とも別フェーズで個別に検証すべき。

---

## 8. 関連ドキュメント / commit

### 関連ドキュメント
- **詳細調査**: `docs/bothmode-multi-bug-investigation.md` (336 行、 観測点別の真因解析 + 修正方向候補)
- **関連 archive**: `docs/h-3d-7-investigation-archived.md` (171 行、 同じ raw vs normalized 構造問題のサブパターン)
- **直前ハンドオフ**: `docs/handoff-h-3d-6.md` (= H-3d-6 完了時の仕様書)
- **その他過去ハンドオフ**: `docs/handoff-h-3d-5.md`

### 関連 commit
- `c77208c docs+test: investigate bothmode multi-bug (label/lock-mark/12mm shift)` (= **本件調査**)
- `2afcbf5 docs: archive H-3d-7 investigation (bug not reproducible)` (= 関連 archive、 共通根 2 と同根の構造問題)
- `31f4f1e chore(autoLayout): remove dead code from old face-based labeling` (= H-3d-6 cleanup)
- `3ad0156 feat(autoLayout): replace face-based labeling with ⭐ origin CW labeling` (= H-3d-6 本体実装。 本件観測点 A・B の発生源 = bothmode 適用漏れ)
- `f771cbe docs: add handoff note for Phase H-3d-6 (label re-implementation)` (= H-3d-6 仕様書)
- `4c57667 fix(autoLayout): map scaffoldStart to normalized vertex index in preview` (= Phase H-3d-5、 `normalizedScaffoldStart` 導入。 共通根 2 修正案 2C のパターン参照)

---

## 9. 次セッション (= 別 PC・ 別タイミング) への注意点

- **必ず `git pull` で最新化してから着手**: 本ノート以降に追加 commit がある可能性
- **修正コード書く前に読む順序**:
  1. 本ノート (`docs/handoff-h-3e.md`) ← 全体俯瞰
  2. `docs/bothmode-multi-bug-investigation.md` ← 詳細調査
  3. `lib/konva/__tests__/bothmode-multi-bug.test.ts` ← 失敗テストの assert 構造
  4. (必要なら) `docs/h-3d-7-investigation-archived.md` ← 関連 archive
- **本ノートに記載の修正方向 (= 案 1A、 案 2C 推奨) は調査時点での候補**。 実装着手前に必ず再評価し、 必要なら師匠と相談
- **既存 114 件破壊は禁止**: 修正フェーズで failing 6 件 → passing への遷移を細かく確認
- **デバッグログ追加禁止 (実装ファイル / 調査時)**: 必要なら新規テストファイルで再現する形で
- **第 6 章「仕様書先行」 ルートを必ず踏襲**: 直接実装に入らない
