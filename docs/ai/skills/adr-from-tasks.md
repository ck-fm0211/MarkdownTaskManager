# adr-from-tasks

## 目的・位置づけ

選択済みチケットから意思決定の背景・選択肢・結論を整理し、MADR 4.0.0 形式の ADR を
開発リポジトリに作成するスキルの SSOT。本文は日本語、MADR のセクション見出しは英語のままとする。
ADR に元の TASK-ID を記載し、既定では元チケットの `**Notes**:` に ADR への参照も追記する。
この追記は**運用タスクデータへの書き込み**であり、下記の共同編集手順に従う。
共通選択工程は読み取り専用で、その後の Notes 追記だけが本スキルのタスクデータへの書き込みとなる。

タスク形式は [AI_WORKFLOW.md](../../../AI_WORKFLOW.md)、フォルダーの役割・公開情報の制約は
[AGENTS.md](../../../AGENTS.md) に従う。実データは `dataDir` にあり、リポジトリ直下や `examples/` の
ダミーデータを代用しない。Markdown データキー・コード識別子・ファイル名は翻訳しない。
コミット対象の ADR に実パス・個人名・会社名・実業務データ・認証情報を含めず、必要な内容は匿名化する。

## 対象の選択（共通 SSOT に委譲）

入力軸は **category / tag / TASK-ID / 期間**。
選択工程は [_shared-task-selection.md](_shared-task-selection.md) に委譲し、本書では重複定義しない。
以降は共通手順で確定した TASK-ID と所在（`kanban.md` / `archive.md`）の一覧を受け取る。

## 保存先・連番

```text
docs/adr/<category>/NNNN-title.md
```

- `<category>` は元チケットの `**Category**` の slug。
  [task-history-explorer](task-history-explorer.md) の `docs/history/<category>/` と同じ規則で、
  日本語はそのまま、空白は `-`、ASCII 英字は小文字、パス区切り文字は `-` にする。
  例: `Backend` → `backend`、`Backend API` → `backend-api`、`経理` → `経理`。
  複数カテゴリや未設定で保存先が定まらない場合は利用者に確認する。
- `NNNN` は**カテゴリごとに独立した4桁連番**。その `docs/adr/<category>/` 内にある
  `NNNN-*.md` の最大番号 + 1 を使い、該当ファイルがなければ `0001` とする。
  例: `backend/0007-*.md` があっても、空の `frontend/` は `0001` から始める。
- `title` は判断内容を表す短い kebab-case（例: `retry-policy`）。既存 ADR は上書きしない。
  書き込み直前にも一覧と保存先の空きを確認する。4桁を超える場合は採番方法を利用者に確認する。

リポジトリルートでの一覧・採番例（固定の `backend` は決定した slug に置き換える）:

```bash
# そのカテゴリの既存 ADR だけを一覧化する。未作成なら出力なし。
ls -1 docs/adr/backend/ 2>/dev/null | grep -E '^[0-9]{4}-.+\.md$'

# 先頭の番号の最大値 + 1。空なら 0001。先頭ゼロは10進数として扱う。
ls -1 docs/adr/backend/ 2>/dev/null | grep -E '^[0-9]{4}-.+\.md$' |
  awk -F- '$1 + 0 > max { max = $1 + 0 } END { printf "%04d\n", max + 1 }'
```

## MADR 4.0.0 本文

確定したチケットのブロック全文（説明・サブタスク・Notes を含む）と必要な根拠を読み、
次のテンプレートを埋める。英語の見出し・定型句を保ち、内容は日本語で記述する。
関係者・合意・採用状態を推測しない。未確認の決定は `proposed` とし、不明点を明記する。
関係者のリストは公開可能な役割名を使い、未確認なら空のリストと本文の注記で示す。

```markdown
---
status: "{proposed | rejected | accepted | deprecated | superseded by ADR-XXXX}"
date: {YYYY-MM-DD}
decision-makers: {list}
consulted: {list}
informed: {list}
---

# {short title of the solved problem and its solution}

## Context and Problem Statement

{2-3 sentences or an illustrative story.}

## Decision Drivers

* {driver 1}
* {driver 2}

## Considered Options

* {option 1}
* {option 2}

## Decision Outcome

Chosen option: "{option 1}", because {justification}.

### Consequences

* Good, because {positive consequence}
* Bad, because {negative consequence}

### Confirmation

{How compliance/implementation is confirmed.}

## Pros and Cons of the Options

### {option 1}

* Good, because {argument}
* Neutral, because {argument}
* Bad, because {argument}

## More Information

{evidence, team agreement, when to revisit, related ADRs, and the SOURCE TICKETS.}
```

`date` は判断日（未確定の提案なら提案日）を `YYYY-MM-DD` で記す。
`Pros and Cons of the Options` は必要に応じて選択肢ごとに同じ小見出し形式を繰り返す。
`superseded by ADR-XXXX` や関連 ADR を記す場合、番号はカテゴリ内でしか一意でないため、
`More Information` に相手のカテゴリを含むパスも記載する。

## ADR ↔ TASK-ID の相互リンク

ADR の `More Information` に `関連チケット: TASK-042（kanban.md）, TASK-039（archive.md）`
のように**すべての元 TASK-ID と所在**を記載する。運用データの実パスは公開文書に載せない。
元チケット側には次節の `**ADR**:` を置き、両方向からたどれるようにする。
利用者が追記を断った場合も ADR 内の元 TASK-ID は残し、逆向き参照は未追記と報告する。

## 元チケットの Notes への自動追記（既定 ON）

利用者が辞退した場合は追記をスキップする。それ以外は、ADR を保存してから各元チケットの
`**Notes**:` 内に、次の**通常の Notes 小項目**を追記する。

```markdown
**ADR**: docs/adr/<category>/NNNN-title.md
```

1. `npm run tasks -- where` で編集先の `dataDir` を確認する。別フォルダーの指定時はそれを優先し、
   CLI に `--dir <フォルダー>` を付ける。確認コマンドも同じ編集先を使う。
2. 書き込み前に利用者へ「ブラウザーで編集中の内容を保存し終えて、編集操作を止めてください
   （タブは閉じてもよい）」と伝え、編集停止を確認する。ミリ秒単位の同時書き込みは防げない。
3. 編集前の `npm run tasks -- check` で状態を確認する。既存の `[NG]` や警告があれば追記を止め、
   問題を報告する。対象ブロックを読み直して、追記を戻せるよう編集直前の内容を保持する。
4. **1チケットの Notes ずつ**編集する。既存の Notes とその `**Subtitle**:` 小項目を保持し、
   閉じたコードブロックの外、次のタスク見出しより前に上記の1行を追加する。
   `**Notes**:` がなければ、説明や `**Subtasks**:` などの後、タスク末尾に追加する。
   **Notes は最後のセクション**であり、それ以降はすべてメモとなる。
   同一パスの `**ADR**:` が既にあれば重複追記しない。別 ADR の参照は残す。
5. **round-trip-safe を必須条件とする**。アプリの serialize が生成する通常の Notes 小項目の
   追記と同等の編集にし、再読込・再保存でも ADR 参照と既存内容が同じ意味・内容で保持されること。
   タスク内に `##` / `###` 見出しを追加せず、厳密な書式と既存のメタデータ・順序を保つ。
   UTF-8（BOM なし）で保存し、NUL は絶対に書かない。Windows PowerShell 5.1 の
   `Set-Content` / `Add-Content` / `Out-File` / `>` / `>>` は使わない。
6. 各編集後に `npm run tasks -- check` を実行し、**`[OK]` かつ警告なし**を確認する。
   形式・文字コードなどの不整合ではアプリが読み取り専用で開く。重複 ID なども放置しない。
   check に失敗したら今回の追記を編集直前の内容へ戻し、再検査して報告する。
   ファイル全体を古い内容で上書きして並行変更を消さない。解決するまで残りの追記は止める。
7. 複数チケットなら同じ ADR パスを各チケットへ追記し、最後にも check する。
   新規タスクは作らないので新しい ID の取得は不要。既存 ID・Status は変更せず、移動・アーカイブもしない。
   完了後は作成パス、元 TASK-ID、追記済み／辞退／失敗の結果を報告し、ブラウザーの 🔄 で
   ディスクから再読込するよう案内する。失敗時も ADR は残し、逆向き参照の未完了を明記する。

## 手順例（架空データ）

以下は手順を示す例であり、実データへの実行結果ではない。
共通選択手順から `TASK-042 | kanban.md`（`**Category**: Backend`）を受け取ったとする。
チケットの Notes には「再試行は最大3回・指数バックオフを提案中」と記録されているものとする。

1. `Backend` → `backend` に正規化する。上記の `ls` / `grep` / `awk` を
   `docs/adr/backend/` に適用し、既存 ADR なし → 次番号 `0001` を確認する。
2. 保存先が未使用であることを再確認し、必要なディレクトリを作って
   `docs/adr/backend/0001-retry-policy.md` を次の内容で保存する。

```markdown
---
status: "proposed"
date: 2026-11-23
decision-makers: []
consulted: []
informed: []
---

# 再試行を最大3回の指数バックオフに制限する

## Context and Problem Statement

一時的な通信失敗の際、無制限の再試行は負荷を増やす。
TASK-042 では、回復の機会を残しつつ試行回数を制限する案を検討している。

## Decision Drivers

* 障害中の負荷を抑える
* 一時的な失敗からの回復を可能にする

## Considered Options

* 最大3回の指数バックオフ
* 再試行しない

## Decision Outcome

Chosen option: "最大3回の指数バックオフ", because 負荷と回復機会を両立できると考えられるため。

### Consequences

* Good, because 連続したリクエストを抑えられる
* Bad, because 最終的な失敗の通知まで待ち時間が増える

### Confirmation

採用後に、連続失敗時の再試行が3回以内で、待ち時間が増加することをテストで確認する。

## Pros and Cons of the Options

### 最大3回の指数バックオフ

* Good, because 一時障害から回復する機会がある
* Neutral, because 最大試行回数を設定として管理する
* Bad, because 待ち時間の調整が必要になる

### 再試行しない

* Good, because 追加の通信負荷が発生しない
* Neutral, because 再実行は呼び出し側の判断になる
* Bad, because 一時障害でも即座に失敗する

## More Information

関連チケット: TASK-042（kanban.md）。根拠は同チケットの Notes にある提案。
関係者・チーム合意は未確認であり、現時点では提案。承認後に status と関係者を更新する。
回復率または待ち時間が要件を満たさない場合に見直す。関連 ADR は確認できていない。
```

3. Notes 追記は既定 ON。`npm run tasks -- where` で実データの所在を確認し、利用者の
   ブラウザー編集停止を確認する。編集前 check が `[OK]`・警告なしの状態から、
   **dataDir の TASK-042 だけ**を編集する。既存 Notes の最後に次を追記する
   （Notes がなければ `**Notes**:` ごと末尾に追加する）。

```markdown
**Notes**:
再試行は最大3回・指数バックオフを提案中。

**ADR**: docs/adr/backend/0001-retry-policy.md
```

4. `npm run tasks -- check` → `[OK]`・警告なしを確認する。
   ADR → `TASK-042` と TASK-042 → ADR の両方向を確認し、🔄 で再読込するよう案内する。

## 完了条件（DoD）・注意

- MADR 4.0.0 の見出し・frontmatter を持つ ADR が、カテゴリ別連番と slug 規則に従って保存されている。
- 元 TASK-ID をすべて ADR に記載し、追記を辞退されていなければ各チケットに `**ADR**:` がある。
- Notes 追記は **round-trip-safe**。再読込・serialize 後も内容が保持される通常の Notes 小項目であり、
  UTF-8（BOM なし）・NUL なし・Notes 最終の書式を守り、check が `[OK]`・警告なしである。
- 根拠のない合意・実装済み機能・テスト結果は作らない。実在しないスキル・連携・ADR を
  「ある」「利用できる」と説明しない。上の架空例を実績として報告しない。
