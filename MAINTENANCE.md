# kakeibo — 保守戦略

Vibe Coding(Claude Codeによる継続的な機能追加)で起きがちな劣化に対処するための方針。
「機能を追加するセッション」と「整理するセッション」を意図的に分ける。

## 1. 変数の4分類

すべての状態変数は、この4つのいずれかに分類し、prefixで明示する。
分類できない変数を新しく作らない。

| prefix | 寿命 | 用途 | 例 |
|---|---|---|---|
| `state.*` | 1ページ滞在中のみ | `go(page)` で丸ごと差し替わる | `state.page` |
| `pref.*` | localStorageに永続 | 端末ごとの表示設定 | `pref.chartMode` |
| `cache.*` | 明示的に無効化するまで | サーバーから取得したデータの保持 | `cache.txListRows` |
| `ui.*` | 数クリック程度 | 今この瞬間の操作中の状態 | `ui.recordSlot` |

既存の変数(`chartMode` / `nodeViewMode` / `hiddenNodeIds` / `netWorthHidden` /
`recordSlot` / `selectedFromNode` / `txPeriod` / `txListRows`)は、この分類に沿って
リネームする。リネームのみのタスクとして単独で実施し、機能変更と混ぜない。

上記8変数は2026-09-19の整理セッションで `pref.*` / `ui.*` / `cache.*` への
リネームを完了済み。ただしこのリスト自体はその時点のもので、その後の機能追加
(アーカイブ・ノード管理モーダル・CSV書き出し等)で増えた以下の変数は未分類の
ままになっている。次回の整理セッションで分類・リネームする:

- 明らかに `cache.*`(サーバー由来データの保持): `nodesById` / `linesById` /
  `chartData` / `txListOffset` / `txListDone` / `recordLeafNodeIds`
  (`txListOffset`/`txListDone` は `cache.txListRows` と同じ無効化サイクルに
  乗っているので、本来は同じ `cache` オブジェクトにまとめるべき)
- 分類に判断が必要: `nodeCardFilter`(pref.*寄りだがlocalStorage永続の確認要)、
  `expandedNodeIds` / `prevPage`(4分類のどれにも寿命がきれいに一致しない。
  4分類を拡張するか、変数の寿命設計自体を見直すか要判断)、`showArchivedNodes` /
  `selectedToNode` / `editingLineId` / `managerOpen` / `managerFrom` /
  `managerEditNode` / `managerPendingPromote`(ui.*寄りだが数クリックより長寿命)

## 2. UIパターンの重複排除

以下は、複数画面に実装が散っている疑いがある(UX.mdは削除済みのため、
一覧は常にコード側を `grep` して都度確認する。現状の確認結果は本ファイルの
変更履歴・コミットログを参照)。1つずつ、以下の手順で潰す。

- カード + `.card-head`
- マスクトグル(🐵/🙈)
- 折りたたみ式ツリー
- 期間セレクタ
- ページネーション

**手順(機能変更を混ぜない)**

1. 対象パターンについて `grep` で実装箇所を数え、報告のみ行う(コードは書かない)
2. 統一可能なら `components/` 配下に1関数として抽出する提案をする
3. 承認後、各画面の重複実装を削除して抽出した関数の呼び出しに置き換える

期間セレクタは3画面で非連動という既知の制限がある。統一するかどうかは
UXの判断が要るため、抽出だけ行い連動させるかは別途判断する。

## 3. ファイル分割

`apps/web/index.html` が肥大化し続けているため、ビルド不要のまま
ネイティブESモジュールで分割する。

```
apps/web/
├── index.html              骨組みとルーティングのみ
├── state.js                state定義、go()
├── views/
│   ├── dashboard.js / record.js / transactions.js
│   ├── nodes.js / nodeDetail.js
│   └── composition.js / settings.js
├── components/
│   ├── maskToggle.js / periodSelector.js
│   └── collapsibleTree.js / cardHead.js
└── lib/
    └── format.js
```

1画面・1コンポーネントにつき1ファイル。「取引一覧を直したい」という指示で
触るファイルが `views/transactions.js` 1つに絞られる状態を保つ。

## 4. 機械的なチェック

CLAUDE.mdの禁止事項を、実行して確認できるスクリプトにする。

```bash
#!/bin/bash
# scripts/check.sh
set -e
grep -rn "supabase\.from" apps/ && { echo "NG: apps/* から直接クエリしている"; exit 1; }
grep -rn "WITH RECURSIVE" packages/core apps/ && { echo "NG: 再帰がビュー外にある"; exit 1; }
echo "OK"
```

push前に実行する。CLAUDE.mdの禁止事項を追加・変更したら、このスクリプトにも
検出ルールを追加する。

## 5. データ整合性の自動検証

UIのテストは持たないが、以下は自動化する。財務データなので、
これだけは壊れたら即座に分かるようにしておく。

- 全ノードの残高合計が常に0であること(ゼロサム)
- 別ユーザーでログインすると他人のノードが0件であること(RLS)

`packages/core` に対する簡単なスクリプトとして実装し、スキーマ変更後に毎回実行する。

## 6. セッションの分離

奇数回・偶数回のように機械的に分けなくてよいが、**1セッションで
「機能追加」と「整理」を混ぜない**。整理セッションでは冒頭でこう指示する。

```
今回は新機能を追加しない。以下だけ行う:
- 変数の分類(1)とリネーム
- 重複パターンの抽出(2)
- 死んでいるコード(未実装ボタン、使われていない設定項目)の削除
- DESIGN.md を実装に合わせて更新
```

## 7. 死んでいる機能の扱い

「ボタンはあるが押すとアラートが出るだけ」「設定項目があるが変更できない」
という状態を放置しない(UX.mdは削除済みのため、都度コードを読んで洗い出す)。
整理セッションのたびに、
実装するか削除するかをその場で決める。見せかけのUIはコードを読む際の
ノイズであり、機能追加時に誤って前提にされる原因にもなる。
