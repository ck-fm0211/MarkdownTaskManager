# AGENTS.md — AI コーディングツール向け指示（Codex / Claude Code / Copilot など共通）

このリポジトリは [ioniks/MarkdownTaskManager](https://github.com/ioniks/MarkdownTaskManager) v2.0 の fork です。
単一 HTML（`task-manager.html`）＋ローカル Markdown（`kanban.md` / `archive.md`）のカンバンを、
日本語で、AI による Markdown 直接編集と併用して使うための改修版です。
タスクの書式は **`AI_WORKFLOW.md`**（必読）、詳しい運用は `docs/ja/` を参照してください。

## 1. フォルダーの役割（取り違えないこと）

| | 役割 | 場所 | AI が書き込んでよいもの |
|---|---|---|---|
| A 開発 | このリポジトリ。ソース・ビルド・スクリプト・AI 指示 | OneDrive **同期対象外** | ソース、ドキュメント、テスト |
| B 運用アプリ | 配備済み `task-manager.html` だけ | OneDrive | **書かない**（`npm run deploy` だけが更新） |
| C 運用データ | 実際の `kanban.md` / `archive.md` | OneDrive | 利用者に頼まれたタスク編集のみ |
| D バックアップ | ソース ZIP、旧 HTML、配備ログ | OneDrive | **書かない**（`npm run backup` / `deploy` だけ） |

- B/C/D の実パスは `local.config.json`（Git 管理外）にあります。確認: `npm run config:check`
- リポジトリ直下の `kanban.md` / `archive.md` と `examples/` は**公開用のダミーデータ**です。実務のタスクを書かないでください。
- 実パス・個人名・会社名・実業務データ・認証情報・トークンを、コミットするファイルに書かないでください。

## 2. アプリを改修するとき

- 編集するのは `src/`（`src/index.html`、`src/scripts/*.js`、`src/styles/*.css`）と `build.mjs`。
  **`task-manager.html` は生成物なので直接編集しない**。修正後に `npm run build` で再生成する。
- Markdown の解析・生成は `src/scripts/04-format.js`（DOM なしの純粋関数。Node のテストと CLI でも使用）。
  保存・競合検知は `src/scripts/14-sync.js`、読込は `04-io.js`、アーカイブは `10-archive.js`。
- UI 文言は `src/scripts/02-i18n.js` の翻訳キーで追加（`en` と `ja` は必須）。Markdown のキー
  （`**Status**`、`## Tasks` など）は**翻訳しない**。
- 確認コマンド:
  - `npm run build` → `npm test`（`npm run check` で両方）
  - ブラウザーテストが動かない環境では `npm run test:unit`
- 依存の追加・フレームワーク移行はしない（通常利用は単一 HTML・オフラインで完結させる）。外部 CDN を使わない。

## 3. 反映とバックアップ（利用者の指示があったとき）

- 運用 HTML へ反映: `npm run build-deploy`（ビルド成功時のみ配備。事前確認は `npm run deploy:dry`）
- 作業途中 / 作業終了時のソース退避: `npm run backup`（ラベル付き: `npm run backup -- --label 作業前`）。
  `package.json` を編集中で npm 自体が動かないときは `node scripts/backup.mjs`（同じオプション）。
- バックアップの復元確認: `npm run restore:verify -- <ZIPのパス>`（npm のレジストリにもキャッシュにも
  届かない PC では `-- <ZIPのパス> --reuse-node-modules`）
- push・PR 作成・リリース公開は、利用者の明示的な指示があるまで行わない。

## 4. 実タスク（運用データ C）を編集するとき

1. 対象フォルダーを確認: `npm run tasks -- where`（`local.config.json` の `dataDir`）。
   利用者が別フォルダーを指定した場合はそれに従い、`--dir <フォルダー>` を付ける。
2. **ブラウザーとの同時編集を避ける**: 編集前に利用者へ「ブラウザーで編集中の内容を保存し終えて、
   編集操作を止めてください（タブは閉じてもよい）」と伝える。ブラウザーは保存前にファイルを読み直し、
   内容が変わっていれば上書きせず「競合」として止まるが、ミリ秒単位の同時書き込みまでは防げない。
3. 新しい ID は `npm run tasks -- next-id` で取得する（現役＋アーカイブを通した最大値＋1）。
   既存 ID を再利用・変更しない。ID は `TASK-` ＋3 桁以上の数字。解析できない内容があると `next-id` が
   注意を表示するので、`npm run tasks -- check` で確認して修正する。UTF-8 でないファイル（Shift_JIS、UTF-16（BOM の
   有無を問わず）など）や NUL 文字のあるファイルがあると、`next-id` は ID を出さずに終了コード 1 で止まる（使用済みの ID を
   確実に読めないため）。UTF-8 で保存し直す／NUL 文字を削除してから取り直す。
4. 書式は `AI_WORKFLOW.md` のとおり（V2: `## Tasks` 1 セクション、列は `**Status**: <列ID>`、
   タスク内に `##` / `###` 見出しを書かない。ブロック内の順序は メタデータ → 説明 → `**Subtasks**:` →
   `**Notes**:`（最後。以降はすべてメモ）。コードブロックはそのタスクの中で閉じる）。日本語のタイトル・説明・タグ（`#経理` など）は可。
   `**Status**` には `## ⚙️ Configuration` の `**Columns**` にある **列 ID**（括弧内）を書く。
   日付は `YYYY-MM-DD` のみ（`2026-1-5` などは保持されるが警告になり、ブラウザーのフォームの日付欄に表示できない）。
   **文字コードは UTF-8（BOM なし）**。Windows PowerShell 5.1 の `Set-Content` / `Add-Content` / `Out-File` /
   リダイレクト（`>` / `>>`）では書かない（既定で Shift_JIS や UTF-16 になり、ブラウザーはそのファイルを
   読み取り専用で開く）。編集ツール自体の書き込み、または PowerShell 7（`pwsh`）を使う。
5. 列の移動は `**Status**:` の 1 行だけを書き換える。ブロックを移動しない。
6. アーカイブは利用者の依頼時のみ。`kanban.md` から `archive.md` へ移すときは、**先に archive.md に
   追加 → その後 kanban.md から削除**の順で行い、`**Status**` は元の列 ID のまま残す。
   同じ ID が既にアーカイブにある場合は、内容を比べて利用者に確認する（黙って統合しない）。
7. 編集後に `npm run tasks -- check` を実行し、`[OK]` を確認する。`[NG]` は 2 種類あり、どちらも修正する。
   - 「読み取り専用で開きます」: 保存すると失われる・化ける内容がある（形式の誤り、UTF-8 以外の文字コードなど）。
     `NUL 文字（U+0000…）が N 行目にあります` は、見えない制御文字が混ざった状態（壊れたファイルの跡のこともある）。
     その文字を削除する（UTF-8 で保存し直しても消えない）。`check` の表示で `␀` のすぐ隣に `�` があれば、NUL で切れた
     文字の残りなので、そのバイトも削除する（NUL のバイトだけを消すと壊れた文字が残り、次は「UTF-8 ではありません」になる）。
     周りの文章が欠けていれば利用者に伝える。
     タスクの文章に NUL 文字（`\0`）を書かない。
   - 「重複した ID」: ブラウザーは警告を出して通常どおり開くが、ドラッグ移動などが別のタスクに作用し得る。
   `[OK]` でも `⚠` の行（`non-iso-date` = YYYY-MM-DD でない日付、`unknown-status` = 列 ID でない Status など）は直す。
8. ブラウザーに戻ったら、画面の 🔄（ディスクから再読込）または画面の切り替えで最新を読み込む。

## 5. 将来の拡張について

- Teams メッセージの取得・自動起票、月次・経過日数による自動アーカイブは**未実装**です（`docs/ja/OPERATIONS.md` の「将来拡張」）。
  実装する場合も、スキルは `.claude/skills/<名前>/SKILL.md` 等に置き、書き込み先は `dataDir`、
  ID は `npm run tasks -- next-id`、書き込み後は `npm run tasks -- check` という上記の手順に従うこと。
  実在しない連携やスキルを「ある」と説明しないこと。
