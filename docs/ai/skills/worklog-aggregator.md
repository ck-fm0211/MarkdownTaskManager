# worklog-aggregator

## 目的・位置づけ

CLI を実行し、Estimate（見積時間）と Worklog の実績時間を集計してチャットに提示するスキルの SSOT。
**AI は手計算せず、CLI の出力をそのまま提示する。** 合計・小計・差分を独自に再計算しない。
データは読み取り専用で扱い、タスクの編集・移動・アーカイブは行わない。

タスク形式は [AI_WORKFLOW.md](../../../AI_WORKFLOW.md)、フォルダーの役割と公開情報の制約は
[AGENTS.md](../../../AGENTS.md) に従う。Markdown データキーやファイル名は翻訳しない。

## 使うコマンド

開発リポジトリのルートで実行する。

```text
npm run tasks -- worklog [--by category|user|tag|period] [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--csv] [--dir <folder>]
```

- 既定の軸は `category`、日付範囲は全期間。指定した範囲は両端を含む。
- 対象は `kanban.md` + `archive.md`。アーカイブ済みの実績も集計する。
- `npm run tasks -- worklog --help` で条件の説明を確認できる。
- データフォルダーは `npm run tasks -- where` で確認する。実データは `dataDir` にあり、
  リポジトリ直下や `examples/` のダミーデータで代用しない。
  利用者が別フォルダーを指定した場合は `--dir <folder>` を付ける（空白を含むパスは引用符で囲む）。

利用者の希望する軸・期間・出力形式で CLI を実行し、実行コマンドと出力を提示する。
脚注も省略しない。失敗した場合はエラーを伝え、手計算で結果を補わない。

## 集計軸

| `--by` | グループ |
|---|---|
| `category` | `**Category**` |
| `user` | `**Assigned**` の各担当者 |
| `tag` | `**Tags**` の各タグ |
| `period` | 実績日の月別（`YYYY-MM`） |

`user` / `tag` は、複数所属のタスクを各グループに全量計上する。
`TOTAL` は各タスクを1回だけ数えるため、小計の合計が `TOTAL` を超えることがある。
CLI は Markdown 出力の脚注でこの挙動を明示する。未設定のグループは `(none)` と表示する。

`period` は実績日を基準にする。Estimate 自体には日付がないため、Estimate と Diff は表示しない。

## 指標・期間フィルタ

- Estimate 合計: `**Estimate**` を「数値＋任意の `h`」（例: `8`、`8h`）として解釈する。
  解析できない値は合計から除外し、Markdown 出力の脚注に件数を表示する。
- Actual 合計: Worklog の実績時間の合計。
- Diff: `Actual − Estimate`。

`--from` / `--to` は `YYYY-MM-DD` で指定し、Worklog の記録日を両端含む範囲で絞る。
片方だけの指定もでき、省略した側には制限を設けない。
日付指定時は範囲内の記録があるタスクだけが対象となり、そのタスクの Estimate は全量を計上する。
Estimate を期間に応じて按分しない。CLI の挙動と出力をそのまま使う。

## 出力形式

既定は Markdown 表。`--csv` では CSV を出力する。
カンマ・引用符・改行を含む値は RFC4180 に従って二重引用符で囲み、値内の二重引用符を二重化する。
CSV には Markdown の見出し・脚注は付かない。

## 実行例とサンプル出力

以下は架空データによる代表例（npm 自体の実行案内は省略）。実際の依頼では CLI を実行し、
得られた出力を提示する。サンプルの数値・担当者名を実データの結果として使わない。

### 既定（category 別・全期間）

```text
$ npm run tasks -- worklog
Worklog — category (開始指定なし ～ 終了指定なし)

| Group | Estimate(h) | Actual(h) | Diff(h) |
| --- | --- | --- | --- |
| Backend | 8 | 7 | -1 |
| Frontend | 4 | 5 | 1 |
| TOTAL | 12 | 12 | 0 |

注: 解析できない Estimate が 1 件あります（合計から除外）
```

### 担当者別

```text
$ npm run tasks -- worklog --by user
Worklog — user (開始指定なし ～ 終了指定なし)

| Group | Estimate(h) | Actual(h) | Diff(h) |
| --- | --- | --- | --- |
| (none) | 4 | 6.5 | 2.5 |
| 佐藤 | 8 | 5.5 | -2.5 |
| 田中 | 8 | 5.5 | -2.5 |
| TOTAL | 12 | 12 | 0 |

注: 複数所属のタスクは各グループに全量を計上するため、小計の合計が TOTAL を超える場合があります。
```

### 月別 + CSV

```text
$ npm run tasks -- worklog --by period --from 2026-11-01 --csv
Period,Actual(h)
2026-11,10.5
TOTAL,10.5
```
