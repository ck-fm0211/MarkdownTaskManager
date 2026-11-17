// Load the browser-side pure format module (src/scripts/04-format.js) into a Node VM context,
// so the exact code that ships in task-manager.html is what the unit tests and scripts/tasks.mjs run.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..'); // project root

export function loadFormat(rootDir = root) {
  const code = readFileSync(join(rootDir, 'src', 'scripts', '04-format.js'), 'utf8');
  const exportsList = [
    'parseKanbanContent', 'parseArchiveContent', 'parseTask', 'parseTaskBlocks', 'serializeTask',
    'generateKanbanContent', 'generateArchiveContent', 'findLostLines', 'sameTask', 'clean',
    'legacyClean', 'getFirstEmoji', 'findPriorityLabel', 'resolveStatus', 'taskNumber',
    'formatTaskId', 'nextTaskNumber', 'maxIdInText', 'findDuplicateIds', 'matchesTaskId', 'taskMatchesSearch',
    'normalizeForSearch', 'normalizeEol', 'detectEol', 'legacySlug', 'defaultArchivePreamble',
    'decodeUtf8', 'taskWriteProblems', 'parseTasksFromSection',
  ];
  // TextDecoder is a Web API (not a JavaScript built-in), so it is passed in explicitly.
  const ctx = vm.createContext({ console, TextDecoder });
  vm.runInContext(`${code}\n;globalThis.__fmt = { ${exportsList.join(', ')} };`, ctx, { filename: '04-format.js' });
  return ctx.__fmt;
}
