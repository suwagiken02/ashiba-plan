# Phase H-3d-3, H-3d-4 完了 → H-3d-5 引き継ぎ note

## 完成状態 (2026-05-03)

Phase H-3d-3 (表示層整理) と H-3d-4 (リファクタ + 副次バグ修正) が完了。
表示層は edges2FAll / subEdgesRelabeled / edge.index 経由 lookup 方針で
完全統一されている。 動作確認は bothmode / 単一階 1F / 単一階 2F の
3 モードすべて済み。

## 完了済み

### Phase H-3d-3 (表示層整理)
- 設定画面プレビューで 2F の B 面分割表示
- modal preview に 1F 表示追加
- 1F 下屋ラベルの relabel (subEdgesRelabeled で uncovered のみ採番)
- 配置結果一覧の relabel 適用
- 2F prefix 追加 (2A/2B1/2B2/2C/2D)
- デバッグログ全削除

### Phase H-3d-4 (リファクタ + 副次バグ)
- 別 Phase デバッグログ 11 件削除 (DimLayer/PrintArea/exportToPdf)
- 配置結果一覧の 2F/1F セクション分割 (originFloor 分岐)
- bothmodeSegmentToEdgeLayout の死んだ charCode label 削除
- edges1FAll 変数削除 (subEdgesRelabeled で全置換)
- 単一階モード modal preview のラベル表示 (案 β: useBothmodePreview 分岐)
- 1F 下屋辺の離れ入力欄ラベル修正 (uncoveredEdges1F → subEdgesRelabeled)

### 副次バグ (H-3d-3 整理時の取りこぼしを H-3d-4 で全修正)
1. 配置結果一覧で 1F-origin entries が 2F セクションに混入
2. 単一階 1F モードで modal の nextFaceLabel が "?"
3. 単一階モードで modal preview にラベル表示されない
4. 1F 下屋辺の離れ入力欄が "1C/1D/1E"

## スキップ済み (Phase H-3d-4 ステップ 4)

### CornerType の enum 化
**判断: スキップ (リターン価値が低いと評価)**

調査結果:
- 現状は boolean (true=凸/直線継続, false=凹) で表現
- 「直線継続を凸扱い」が現場ロジックと一致しているため、
  boolean で十分表現できている
- enum 化は約 30 箇所のタッチが必要、 動作変更ゼロのリファクタ
- 必要になった時 (例: 「直線継続を別扱いしたい」要件が出た時) に
  実施すればよい

選択肢の整理 (将来の参考用):
- 案 C: 型だけ enum 化、 動作完全同じ
- 案 B: enum + Straight を独立保持 (現状の `|| isStraight` 合成を廃止)
- 案 A: 案 B + isConvexCorner の戻り値も enum 化

## 残課題候補 (H-3d-5+)

### 1. CornerType の enum 化 (上記、 スキップ済み)
将来必要になったら案 C から段階的に。

### 2. その他コードベース整理
必要に応じて grep で dead code 探索、 副次バグ発見時に対応。

### 3. 機能拡張
具体的な要件は未定。 師匠の現場ニーズで都度判断。

## 表示層の方針 (絶対忘れない、 H-3d-3 で確立)

### 中間データ層
- edge.index のみ保持
- ラベル文字列は生成しない (bothmodeSegmentToEdgeLayout の
  charCode label 削除済み)

### 表示層 (AutoLayoutModal.tsx)
- 2F: edges2FAll から edge.index 経由 lookup
- 1F 全周 (主建物 + 下屋): edges1FAll は削除済み、 必要なら再生成
- 1F 下屋のみ: subEdgesRelabeled (uncoveredEdges1F に relabelByFace)
- 単一階モード: edges (生の getBuildingEdgesClockwise 結果)

### bothmode と単一階の分岐
- useBothmodePreview / targetFloor === 'both' / activeEdge.floor で判定
- bothmode 時は normalizedBuilding* + relabel 後 edges を使う
- 単一階時は building.points + edges を使う

## 師匠の現場ロジック (絶対忘れない)

### 各面の rails 必要量
有効 = ±始点離れ + 壁長 ±終点離れ
- ±始点: 凸 = +前面の離れ / 凹 = -前面の離れ / 直線継続 = +前面の離れ (凸扱い)
- ±終点: 凸 = +次面の希望離れ / 凹 = -次面の希望離れ / 直線継続 = +次面の希望離れ (凸扱い)

### 「離れ」の決まり方
- NW固定面 (A面、 D面): ユーザー設定値で永久固定 (例 900)
- その他の面: 前の面の割付の選択結果で決まる

### 凸/凹判定
- 外積 cross > 0 → 凸
- 外積 cross < 0 → 凹
- 外積 cross = 0 → 直線継続 (現場では凸扱い、 +contribution)

### 1F-face-pillar (下屋に折れる/連動辺方向)
- 2F edge と 1F edge の外積で判定 (凸/凹両方ありえる)

### 順次決定の進行
A → B1 → B2 → C → D → 1A → 1B → 1C → ...
連動辺は edgeSegments に含めない (= 計算からスキップ)。

## Claude (引き継ぎ先) への注意

1. 検算は必ず数値で行う。 「直った」と判断する前に rails 合計と
   cursor span が一致しているか確認
2. 「人間なら一目瞭然」のロジックを複雑化しない
3. 師匠の現場感覚を信頼する
4. 一度の修正で複数の概念に手を出さない (モグラ叩きになる)
5. リファクタは別フェーズとして扱い、 表示と内部の修正を混ぜない
6. 表示層は edges2FAll / subEdgesRelabeled / edge.index 経由 lookup
   方針が確立済み。 中間データ層 (charCode label 等) は触らない
7. 単一階モード (1F のみ / 2F のみ) も師匠が使うので、 副次バグに注意
8. cmd 閉じても git は強い。 git status で状態確認、 焦らず再開
9. リファクタ提案は「リターン価値」を必ず評価する。 動いてるコードを
   壊すリスク > 改善メリット なら、 スキップ判断も大事
