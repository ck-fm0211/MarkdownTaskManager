// Show and check the per-PC configuration (local.config.json / MTM_* env vars).
//   npm run config:check
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig, ROOT, samePath, isInside, howToConfigure } from './lib/config.mjs';

let cfg;
try { cfg = loadConfig(); } catch (e) { console.error(`[NG] ${e.message}`); process.exit(1); }
console.log(`開発フォルダー (A): ${ROOT}`);
console.log(`設定ファイル     : ${cfg.file}${cfg.fileExists ? '' : '（なし — 環境変数のみ）'}`);
let ok = true;
const labels = { appDir: 'B 運用アプリ   appDir', dataDir: 'C 運用データ   dataDir', backupDir: 'D バックアップ backupDir' };
for (const k of ['appDir', 'dataDir', 'backupDir']) {
  const v = cfg[k];
  if (!v) { console.log(`${labels[k]}: 未設定`); ok = false; continue; }
  const exists = existsSync(v) && statSync(v).isDirectory();
  console.log(`${labels[k]}: ${v} ${exists ? '✓' : '✗ フォルダーがありません'}`);
  if (!exists) ok = false;
  if (isInside(v, ROOT)) { console.log(`  ⚠ 開発フォルダー内です。${k === 'dataDir' ? '運用データは開発フォルダーの外（OneDrive）に置いてください。' : 'OneDrive 同期対象のフォルダーを推奨します。'}`); }
}
if (cfg.appDir && cfg.dataDir && samePath(cfg.appDir, cfg.dataDir)) { console.log('⚠ appDir と dataDir が同じです。分けてください。'); ok = false; }
if (cfg.dataDir) {
  for (const f of ['kanban.md', 'archive.md']) console.log(`  ${f}: ${existsSync(join(cfg.dataDir, f)) ? 'あり' : 'なし'}`);
}
if (!ok) {
  console.log('');
  for (const k of ['appDir', 'dataDir', 'backupDir']) if (!cfg[k]) console.log(howToConfigure(k) + '\n');
  process.exit(1);
}
console.log('\n[OK] 設定は有効です。');
