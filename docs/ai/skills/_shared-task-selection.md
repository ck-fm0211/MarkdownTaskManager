# 共通タスク選択手順

## 目的・位置づけ

`task-history-explorer` と `adr-from-tasks` が共用する、チケット選択の SSOT。
両スキルの選択工程は本書を参照する。製品の動作は変更せず、運用データと Git 履歴は
**読み取り専用**で扱う（タスクの編集・移動・アーカイブは行わない）。
本書は共通手順の定義であり、各スキルの実装・提供状況は実ファイルで確認する。

タスク形式は [AI_WORKFLOW.md](../../../AI_WORKFLOW.md) に従う。
`**Status**`、`**Category**`、`**Tags**`、`## Tasks`、`### TASK-NNN` などの Markdown データキーは翻訳しない。

## 入力軸

| 軸 | 対象・使い方 |
| --- | --- |
| category | `**Category**:` の値を完全一致で選ぶ。例: `Backend`。 |
| tag | `**Tags**:` の `#tag` をタグ単位で照合する。例: `#bug`（`#bugfix` は別）。 |
| TASK-ID | 明示された `TASK-NNN` を検索する。複数指定可。数字は3桁以上で、既存 ID をそのまま使う。 |
| 期間 | `from` / `to` を `YYYY-MM-DD` で指定し、両端を含む日付範囲で照合する。 |

期間は `**Created**` / `**Started**` / `**Finished**` のどの日付を使うかを受け取り、
作業実績を探す場合は `**Worklog**` 内の記録日も対象にする。
未指定なら上記3項目のいずれかが期間内のタスクを候補にし、採用した日付を表示する。
空欄は一致扱いにせず、日付を推測しない。`from <= to` を確認する。
異なる軸は AND、同じ軸の複数値は OR を既定とし、別の意図があれば利用者に確認する。

## 参照対象

- リポジトリで `npm run tasks -- where` を実行し、`dataDir` を確認する。
  以降の `grep` / `sed` はそのフォルダーで実行する。別フォルダーの指定があればそれを優先する。
- `kanban.md`（現役）と `archive.md`（アーカイブ）の**両方**を読む。
  リポジトリ直下と `examples/` のファイルは公開用ダミーで、実タスクの検索には使わない。
- 関連する Git リポジトリの `git log` を、履歴・コミットの文脈確認に使う。
  データフォルダーが Git 管理外ならデータの履歴は取得できないと明記し、開発リポジトリで
  TASK-ID に言及するコミットや関連ソースの履歴を確認する。サンプルの履歴で代用しない。

## 手順

### 1. 入力軸を受け取る

呼び出し元から category / tag / TASK-ID / 期間と対象フォルダーを受け取り、条件を短く提示する。
条件がない、または日付の意味が曖昧な場合は必要な点を質問する。

### 2. grep で候補を生成する

必要な索引とメタデータ行だけを読み、一致行の直前にあるタスク見出しへ対応付ける。
以下は固定の例示値。実際の値に置き換え、正規表現の特殊文字はエスケープする。

```bash
# 必要なときだけボード索引を作る（既存の省トークン手順）
grep -nE "^### TASK-|^\*\*Status\*\*:" kanban.md
grep -nE "^### TASK-|^\*\*Status\*\*:" archive.md

# category: 他のメタデータと同じ行にもある
grep -nHE '^### TASK-|\*\*Category\*\*: Backend([[:space:]]*\||[[:space:]]*$)' kanban.md archive.md

# tag: タグ行を絞る（値の完全一致はブロックでも確認）
grep -nHE '^### TASK-|^\*\*Tags\*\*:.*#bug([[:space:],]|$)' kanban.md archive.md

# TASK-ID: 位置を特定してそのタスクだけ読む
grep -n "^### TASK-042 " kanban.md
sed -n '/^### TASK-042 /,/^### TASK-/p' kanban.md
grep -n "^### TASK-042 " archive.md
sed -n '/^### TASK-042 /,/^### TASK-/p' archive.md

# 期間: 見出しと日付行を抽出してから from / to と比較する
grep -nHE '^### TASK-|\*\*(Created|Started|Finished)\*\*:|^\*\*Worklog\*\*:|^[[:space:]]*- [0-9]{4}-[0-9]{2}-[0-9]{2} ' kanban.md archive.md
```

`sed` の範囲には次のタスクの見出しも含まれるため、その見出しは対象から除く。
grep は候補抽出であり、説明・コード例・設定の一致をタスクの属性と誤認しないよう、
候補のブロックで実メタデータを照合する。期間は各日付の値を取り出して範囲と比較し、
`**Worklog**` を使う場合は同セクション内の記録日だけを数える。

Git の例（該当リポジトリで実行。`<path>` は実際の関連ファイルのパスに置き換える）:

```bash
git log --oneline -- <path>
git log --oneline --extended-regexp --grep='TASK-042([^0-9]|$)'
```

複数 ID はそれぞれ検索し、必要なコミットだけ `git show <commit> -- <path>` で読む。
コミット日時はタスクの日付条件の代わりにしない。履歴だけにある ID は所在未確認として分け、
現役・アーカイブのタスクと混同しない。

### 3. 対話的に多選択する

- 番号付き候補一覧を提示する。各行は **TASK-ID + タイトル + category / tags / 日付 + 所在**。
  期間検索では一致した項目名・日付も示す。空欄は「未設定」とする。
- 利用者に番号または ID で複数選択してもらう（例: `1, 3`）。条件変更・再検索も受け付ける。
- 選ばれた ID と所在を復唱し、利用者の明示的な確定を受けるまで呼び出し元へ渡さない。
  候補0件なら条件を見直す。同じ ID が両ファイルにある場合は内容と所在を示して確認し、黙って統合しない。

### 4. 確定する

出力は、利用者が確定した **TASK-ID と所在（`kanban.md` / `archive.md`）の一覧**。
呼び出し元スキルへこの一覧を渡し、以後の履歴整理・ADR 作成などはそのスキルの SSOT に従う。
データは書き換えない。

## ドライラン（架空データ）

入力: category=`Backend`、tag=`#bug`、期間=`2026-01-01`〜`2026-01-31`、対象日付=`Finished`。
category 検索の出力例（抜粋）:

```text
kanban.md:20:### TASK-042 | 通知の重複を修正
kanban.md:23:**Priority**: High | **Category**: Backend
archive.md:10:### TASK-039 | 再試行処理を修正
archive.md:13:**Priority**: Medium | **Category**: Backend
```

各ブロックの tags / dates も照合し、候補を提示する:

1. TASK-042 | 通知の重複を修正 | Backend / #bug | Finished: 2026-01-20 | kanban.md
2. TASK-039 | 再試行処理を修正 | Backend / #bug #retry | Finished: 2026-01-12 | archive.md

利用者: `1, 2` → 復唱:「TASK-042（kanban.md）、TASK-039（archive.md）を確定しますか」
→ 利用者:「確定」→ 呼び出し元へ渡す一覧:

```text
TASK-042 | kanban.md
TASK-039 | archive.md
```

## ラッパ参照方式

- 各スキルの `.claude/skills/<name>/SKILL.md` は薄いラッパとする。
  既存の `markdown-task-manager` と同じく、frontmatter は `name:` と `description:` の2項目、
  その後は人が読める本文とする。
- 本文はリポジトリルート基準の `docs/ai/skills/<name>.md` を SSOT として案内する。
  ラッパに手順を複製せず、各スキルの詳細はその SSOT に集約する。
- 各スキルの SSOT は、選択工程で本書 `docs/ai/skills/_shared-task-selection.md`
  （同じディレクトリからは `[_shared-task-selection.md](_shared-task-selection.md)`）を参照し、手順を重複させない。
- `AGENTS.md` / `GEMINI.md.exemple` から各 SSOT への参照追加は後続タスクで行う。
  本タスクではラッパや他スキルを作成しない（T006 / T007 / T008 の範囲）。
- 実在しないスキル・連携を「利用できる」と説明しない。ラッパと SSOT の存在を確認して案内する。
