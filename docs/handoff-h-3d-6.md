# Phase H-3d-6: ラベル付けロジック修正

## 背景

Phase H-3d-3 で `relabelByFace` を実装したが、 ラベル付け基準が
「方角固定 (北=A, 東=B, 南=C, 西=D)」 になっていた。 これは
師匠の現場ルールと異なる。

師匠の現場ルール: 「⭐ (足場開始位置) を起点に時計回り (CW) で
A, B, C, D, ... と採番」

⭐ 位置によって正しいラベルが変わる:
- ⭐ = NW: A=北, B=東, C=南, D=西 (現状と一致)
- ⭐ = NE: A=東, B=南, C=西, D=北
- ⭐ = SE: A=南, B=西, C=北, D=東
- ⭐ = SW: A=西, B=北, C=東, D=南

## 計算層は不変

Claude Code の調査により、 計算層 (autoLayoutUtils.ts) は
splitBuilding2FAt1FVertices の事前分割により正しく動いている。
H-3d-6 はラベル層 (AutoLayoutModal.tsx の relabelByFace) のみ修正。

## 仕様詳細

### 共通起点 ⭐ の決定
- `scaffoldStart2F ?? scaffoldStart1F` で取得
- 設定されてる方を共通起点として使う
- 師匠の現場運用: 通常 1 つだけ設定。 両方設定はバグ
  (Phase H-3d-7 以降で「他方リセット」機能追加予定)

### 2F ラベル
- 共通起点 ⭐ の頂点から CW 順に採番
- 基本: 2A, 2B, 2C, 2D
- 同面分割 (2F 単独で 1 つの面が、 1F の頂点で分割される場合):
  2B1, 2B2, 2B3 形式 (同アルファベット + suffix)

### 1F ラベル
- 下屋部分 (= 2F に覆われてない 1F の辺、 uncoveredEdges1F) のみ対象
- 共通起点 ⭐ に最も近い下屋辺を 1A
- そこから CW 順に 1A, 1B, 1C, 1D, ... と独立アルファベット
  (suffix なし)

### Z 超えの場合
- AA, AB, AC, ... と 2 文字化 (Excel の列番号と同じ)
- 関数: `numberToAlpha(n)`
  - n = 0 → 'A'
  - n = 25 → 'Z'
  - n = 26 → 'AA'
  - n = 27 → 'AB'

## 連動辺の判定式 (参考、 計算層で使用済み)

2F 辺 i と 1F 辺 j が連動辺 ⟺
  方向ベクトル一致 + 端点座標一致
  (= 1F だけの平面図で 1 本の連続した辺になる)

## 計算スキップの判定基準 (参考、 既存実装は近道判定だが等価)

「両端点が確定済 = スキップ」 が本来の判定基準。
現状実装は「連動辺ならスキップ」 だが、 splitBuilding2FAt1FVertices
の事前分割により等価。

## 実装計画

### ステップ 1: 仕様文書化 (今これ)

### ステップ 2: relabelByFace の書き換え
- AutoLayoutModal.tsx 内の `relabelByFace` を新ロジックに置換
- 引数に scaffoldStart 追加
- 「⭐ 起点 CW 順」 のアルゴリズム実装
- 同面分割の suffix 付与 (2F のみ)
- 1F は独立アルファベット連番
- numberToAlpha ヘルパー関数を追加 (Z 超え対応)

### ステップ 3: 呼び出し元更新
- edges2FAll, subEdgesRelabeled の useMemo に scaffoldStart 依存追加
- normalizedScaffoldStart を経由する点に注意 (= 既に H-3d-2 で正規化)

### ステップ 4: 単体テスト追加
- relabelByFace の単体テスト 5-10 件
- ⭐ = NW/NE/SE/SW 各位置で正しいラベルが返るか
- 凹型/凸型/U字 各形状で

### ステップ 5: 実機確認
- 各 ⭐ 位置で計算 → ラベルが正しいか
- 計算結果は不変か (既存テスト 98 件は通るはず)

## H-3d-6 でやらない (将来課題)

- scaffoldStart1F と scaffoldStart2F の二重設定リセット機能
  (Phase H-3d-7+)
- 計算層の「連動辺スキップ → 両端確定スキップ」 統一リファクタ
  (現状動作で問題なし、 リターン価値低)
