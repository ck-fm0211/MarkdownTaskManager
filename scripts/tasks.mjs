// Read-only helper for AI assistants / humans working on the REAL task data (dataDir).
// It never writes. Edit kanban.md / archive.md with your editor or AI tool, then run `check`.
//   npm run tasks -- where                 データフォルダーと各ファイルの有無
//   npm run tasks -- check                 形式チェック（保存で失われる行・重複ID・不明な Status）
//   npm run tasks -- next-id               次に使うべきタスク ID（現役＋アーカイブの最大値 + 1）
//   npm run tasks -- show TASK-042         そのタスクのブロックを表示（現役 / アーカイブ）
//   --dir <folder>                         dataDir の代わりに指定フォルダーを使う
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadConfig, howToConfigure } from './lib/config.mjs';
import { loadFormat } from './lib/format.mjs';

const args = process.argv.slice(2);
const cmd = args[0] || 'check';
const di = args.indexOf('--dir');
let dir = di >= 0 ? resolve(args[di + 1]) : null;
if (!dir) {
  let cfg;
  try { cfg = loadConfig(); } catch (e) { console.error(e.message); process.exit(2); }
  if (!cfg.dataDir) { console.error(howToConfigure('dataDir')); process.exit(2); }
  dir = cfg.dataDir;
}
const F = loadFormat();
const kanbanPath = join(dir, 'kanban.md');
const archivePath = join(dir, 'archive.md');
// Strict UTF-8 like the browser: a Shift_JIS file (e.g. written by Windows PowerShell 5.1
// Set-Content / Add-Content) is reported, not read as replacement characters.
const notUtf8 = [];
const read = (p, label) => {
  if (!existsSync(p)) return null;
  const d = F.decodeUtf8(readFileSync(p));
  if (!d.valid) notUtf8.push(label);
  return d.text;
};
const kanbanText = read(kanbanPath, 'kanban.md');
const archiveText = read(archivePath, 'archive.md');
// Same rule as the browser (04-io.js loadProblems): the NULs of a file that is not UTF-8 (UTF-16)
// are part of "not UTF-8"; a NUL in UTF-8 text is its own problem ('nul-char', with its line).
const parsed = (text, label, parse) => {
  if (text === null) return null;
  const r = parse(text);
  if (notUtf8.includes(label)) r.problems = r.problems.filter((p) => p.code !== 'nul-char');
  return r;
};
const k = parsed(kanbanText, 'kanban.md', F.parseKanbanContent);
const a = parsed(archiveText, 'archive.md', F.parseArchiveContent);
const withNul = [['kanban.md', k], ['archive.md', a]].filter(([, r]) => r && r.problems.some((p) => p.code === 'nul-char')).map(([label]) => label);
const active = k ? k.tasks : [];
const archived = a ? a.tasks : [];

function printProblems(label, list) {
  for (const p of list) {
    if (p.code === 'nul-char') {
      // Valid UTF-8 with a NUL (U+0000): saving again as UTF-8 does not remove it — say where it is.
      console.log(`  ✗ ${label}: NUL 文字（U+0000。見えない制御文字。下では ␀ と表示）が ${p.line} 行目にあります（全 ${p.count} 個）。エディターで削除してください（UTF-8 で保存し直しても消えません）。周りの文章が欠けている場合は OneDrive のバージョン履歴から戻してください。`);
      (p.lines || []).forEach((l) => console.log(`      ${l}`));
      continue;
    }
    console.log(`  ✗ ${label}: ${p.code}${p.id ? ' ' + p.id : ''}${p.section ? ' [' + p.section + ']' : ''}`);
    // NULs (e.g. of a UTF-16 file read as UTF-8) are shown as "␀", not written to the terminal.
    (p.lines || []).slice(0, 8).forEach((l) => console.log(`      ${String(l).replace(/\0/g, '\u2400')}`));
  }
}

if (cmd === 'where') {
  console.log(`dataDir: ${dir}`);
  console.log(`kanban.md : ${kanbanText !== null ? 'あり' : 'なし'}`);
  console.log(`archive.md: ${archiveText !== null ? 'あり' : 'なし'}`);
} else if (cmd === 'next-id') {
  // Same rule as the browser: above the counter, every parsed id and every "### TASK-<n>" line
  // (even in blocks that could not be parsed) of BOTH files. A file that is not UTF-8 may hide
  // its ids completely (UTF-16 puts a NUL between the characters): no id is handed out then.
  if (notUtf8.length) {
    console.error(`[停止] ${notUtf8.join(' / ')} が UTF-8 ではないため、使用済みの ID を確実に読めません。新しい ID は出しません。UTF-8（BOM なし）で保存し直してから実行してください（確認: npm run tasks -- check）。`);
    process.exit(1);
  }
  // Same rule as the browser: a NUL is often what a damaged file leaves (a run of NULs over the end
  // of the file, where the newest ids are), so no id is handed out until it is repaired.
  if (withNul.length) {
    console.error(`[停止] ${withNul.join(' / ')} に NUL 文字があります（ファイルが壊れている可能性があり、使用済みの ID を確実に読めません）。新しい ID は出しません。NUL 文字を削除し、周りの文章が欠けていれば OneDrive のバージョン履歴から戻してから実行してください（確認: npm run tasks -- check）。`);
    process.exit(1);
  }
  if ((k && k.problems.length) || (a && a.problems.length)) {
    console.error('[注意] 解析できない内容があります（npm run tasks -- check）。ID はファイル内のすべての「### TASK-<番号>」行を考慮して決めています。');
  }
  const rawMax = Math.max(F.maxIdInText(kanbanText || ''), F.maxIdInText(archiveText || ''));
  const n = F.nextTaskNumber(Math.max(k ? k.config.lastTaskId : 0, rawMax), active, archived);
  console.log(F.formatTaskId(n));
} else if (cmd === 'show') {
  const q = F.formatTaskId(F.taskNumber(args[1] || ''));
  let found = 0;
  for (const [label, list] of [['kanban.md', active], ['archive.md', archived]]) {
    list.filter((t) => t.id === q).forEach((t) => { found++; console.log(`--- ${label}\n${F.serializeTask(t)}`); });
  }
  if (!found) { console.error(`${q} は見つかりません`); process.exit(1); }
} else if (cmd === 'check') {
  // bad      = the browser opens the file READ-ONLY (saving would lose or garble something)
  // toFix    = the browser opens it normally with a warning, but it must be fixed (duplicate ids:
  //            a drag-and-drop finds the task by id and may move the other one)
  let bad = 0;
  let toFix = 0;
  console.log(`dataDir: ${dir}`);
  for (const f of notUtf8) { console.log(`  ✗ ${f}: UTF-8 ではありません（Shift_JIS、UTF-16（BOM の有無を問わず）など）。UTF-8（BOM なし）で保存し直してください。`); bad++; }
  if (!k) { console.log('  kanban.md がありません'); bad++; } else {
    console.log(`kanban.md : ${active.length} タスク（V2=${k.formatV2}）`);
    printProblems('kanban.md', k.problems); bad += k.problems.length;
    k.warnings.forEach((w) => {
      console.log(`  ⚠ ${w.code}: ${(w.ids || w.lines || []).join(', ')}`);
      if (w.code === 'duplicate-id') toFix++;
    });
  }
  if (a) {
    console.log(`archive.md: ${archived.length} タスク`);
    printProblems('archive.md', a.problems); bad += a.problems.length;
    a.warnings.forEach((w) => {
      console.log(`  ⚠ archive.md ${w.code}: ${(w.ids || w.lines || []).join(', ')}`);
      if (w.code === 'duplicate-id') toFix++;
    });
  }
  const dups = F.findDuplicateIds(active, archived);
  if (dups.length) { console.log(`  ⚠ 現役・アーカイブを通して重複した ID: ${dups.join(', ')}`); toFix++; }
  const maxId = F.nextTaskNumber(0, active, archived) - 1;
  if (k && k.config.lastTaskId < maxId) console.log(`  ⚠ <!-- Config: Last Task ID: ${k.config.lastTaskId} --> が最大 ID ${maxId} より小さい（ブラウザーは自動で回避します）`);
  const rawMax = Math.max(F.maxIdInText(kanbanText || ''), F.maxIdInText(archiveText || ''));
  if (notUtf8.length) console.log('次の ID: （UTF-8 でないファイルがあるため決められません）');
  else if (withNul.length) console.log('次の ID: （NUL 文字のあるファイルがあるため決められません）');
  else console.log(`次の ID: ${F.formatTaskId(F.nextTaskNumber(Math.max(k ? k.config.lastTaskId : 0, rawMax), active, archived))}`);
  if (bad) console.log(`\n[NG] ${bad} 件の問題。ブラウザーはこのファイルを読み取り専用で開きます（保存すると失われる・化ける内容や NUL 文字があるため）。`);
  if (toFix) console.log(`${bad ? '' : '\n'}[NG] 重複した ID が ${toFix} 件あります。ブラウザーは警告を表示して通常どおり開きますが、ドラッグ移動などが別のタスクに作用するおそれがあるため、片方を修正してください。`);
  if (!bad && !toFix) console.log('\n[OK] ブラウザーで安全に読み書きできる形式です。');
  process.exit(bad || toFix ? 1 : 0);
} else {
  console.error(`不明なコマンド: ${cmd}（where | check | next-id | show <ID>）`);
  process.exit(2);
}
