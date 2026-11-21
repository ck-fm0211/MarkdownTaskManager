# Markdown タスクマネージャー（日本語・AI 併用版）

単一の HTML ファイル（`task-manager.html`）をブラウザーで開き、ローカルの Markdown ファイル
（`kanban.md` / `archive.md`）をカンバンとして操作するツールです。
[本家 ioniks/MarkdownTaskManager](https://github.com/ioniks/MarkdownTaskManager) v2.0 を土台に、次を追加しています。

- 日本語 UI（ブラウザーの言語が日本語なら初回から日本語）
- AI・エディターとの併用で**外部の変更を上書きしない**保存方式（競合の検知・退避・再読込）
- プロジェクト切替・アーカイブ／復元でのデータ消失対策
- 優先度・日本語タグなどの読み書き修正、タスク ID 検索
- 会社 PC（OneDrive）で使うための配備・ソース ZIP バックアップ・復元確認の仕組み

| ドキュメント | 内容 |
|---|---|
| [COMPANY_PC_SETUP.md](COMPANY_PC_SETUP.md) | GitHub から clone できない会社 PC での初回セットアップ（Windows・WSL・macOS、OneDrive・Google Drive） |
| [SETUP_PROMPT.md](SETUP_PROMPT.md) | Codex などに初回セットアップを任せるための指示 |
| [USER_GUIDE.md](USER_GUIDE.md) | 利用ガイド（画面の使い方、競合が出たとき、AI と併用するときのルール） |
| [OPERATIONS.md](OPERATIONS.md) | 運用ガイド（フォルダー構成、初期設定、配備、バックアップ、復元、会社 PC への持ち込み、将来拡張） |
| [DEVELOPMENT.md](DEVELOPMENT.md) | 開発ガイド（ソース構成、ビルド、テスト、翻訳の追加） |
| [SAFETY.md](SAFETY.md) | 保存・競合対策の仕組み、残る制約、Markdown 形式の制限 |
| [TESTING.md](TESTING.md) | 自動テストの範囲と、実機（Edge / OneDrive）での手動確認手順 |
| [../../AGENTS.md](../../AGENTS.md) | AI コーディングツール向けの指示 |
| [../../CHANGELOG.md](../../CHANGELOG.md) | 本家からの変更履歴 |

## 最短の始め方（個人 PC で試す）

1. `task-manager.html` を Microsoft Edge か Google Chrome で開く（ダブルクリック）。
2. 「📁 フォルダーを選択して開始」で、タスクを置く空のフォルダーを選ぶ → `kanban.md` / `archive.md` を作成するか確認されるので「OK」。
3. 「➕ タスク」でタスクを作成。変更は自動で Markdown に保存されます（右上の表示が「✓ 保存済み」）。

会社 PC にソースを持ち込んで使う場合は [会社 PC でのセットアップ](COMPANY_PC_SETUP.md) を見てください。

## ライセンス

MPL-2.0（[LICENSE](../../LICENSE)）。本家の著作権表示・ライセンスを保持しています。この fork での追加・変更も同じ MPL-2.0 で扱います。
