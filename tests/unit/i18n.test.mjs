// Translation completeness: every key used by the code exists in English, and Japanese covers
// every English key (no silent English fallback in the Japanese UI).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = readFileSync(join(root, 'src', 'scripts', '02-i18n.js'), 'utf8');
const start = src.indexOf('const translations = {');
const end = src.indexOf('const priorityIconClasses');
const translations = vm.runInNewContext(`(${src.slice(start + 'const translations = '.length, src.lastIndexOf('};', end) + 1)})`);

test('Japanese covers every English key', () => {
  const missing = Object.keys(translations.en).filter((k) => !(k in translations.ja));
  assert.deepEqual(missing, []);
});

test('every t("key") used in the sources exists in English', () => {
  const code = readdirSync(join(root, 'src', 'scripts')).map((f) => readFileSync(join(root, 'src', 'scripts', f), 'utf8')).join('\n');
  const used = new Set([...code.matchAll(/\bt\(\s*'([a-zA-Z0-9_.-]+)'/g)].map((m) => m[1]).filter((k) => !k.endsWith('.')));
  // Keys built dynamically: integrity.<code>, sync.conflict.<kind>, sync.error.<kind>
  const dynamic = [
    'integrity.lossy-task', 'integrity.malformed-task-header', 'integrity.unknown-header-content', 'integrity.text-outside-task',
    'integrity.task-not-in-column', 'integrity.unknown-section', 'integrity.read-failed', 'integrity.duplicate-id', 'integrity.unknown-status', 'integrity.heading-in-tasks', 'integrity.unstable-task', 'integrity.unstable-header', 'integrity.subtasks-in-notes', 'integrity.unclosed-code-block', 'integrity.non-iso-date',
    'sync.conflict.conflict', 'sync.conflict.missing', 'sync.conflict.appeared', 'sync.conflict.uncertain',
    'sync.error.read-failed', 'sync.error.write-failed', 'sync.error.verify-failed', 'sync.error.blocked',
  ];
  const missing = [...used, ...dynamic].filter((k) => !(k in translations.en));
  assert.deepEqual(missing, []);
});

test('Markdown data keys are never produced from translations', () => {
  // Some locales translate the legacy markdown.config* labels, but the generator must write the fixed
  // English keys (**Columns**, **Status**, ...) whatever the UI language is.
  const others = readdirSync(join(root, 'src', 'scripts')).filter((f) => f !== '02-i18n.js')
    .map((f) => readFileSync(join(root, 'src', 'scripts', f), 'utf8')).join('\n');
  assert.doesNotMatch(others, /t\(\s*'markdown\.config/);
  const fmt = readFileSync(join(root, 'src', 'scripts', '04-format.js'), 'utf8');
  assert.doesNotMatch(fmt, /\bt\(/, 'the format module does not use translations at all');
});
