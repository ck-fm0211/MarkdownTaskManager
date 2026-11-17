// Per-PC configuration (NOT in Git): which folders the dev folder talks to.
//   appDir     B. 運用アプリフォルダ  (OneDrive) — receives task-manager.html only
//   dataDir    C. 運用データフォルダ  (OneDrive) — kanban.md / archive.md (never written by scripts)
//   backupDir  D. バックアップフォルダ (OneDrive) — source ZIPs, previous HTML versions
// Source: local.config.json in the project root (or the file named by MTM_CONFIG), overridden by
// the environment variables MTM_APP_DIR / MTM_DATA_DIR / MTM_BACKUP_DIR.
// Values may use %VAR% / ${VAR} / ~, e.g. "%OneDriveCommercial%\\TaskManager\\app", so the file
// does not have to contain a user name or company name.
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve, dirname, isAbsolute, sep, relative } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CONFIG_NAME = 'local.config.json';
export const KEYS = ['appDir', 'dataDir', 'backupDir'];

export function expandVars(value) {
  if (typeof value !== 'string') return value;
  let v = value.replace(/%([A-Za-z0-9_()]+)%/g, (m, name) => {
    const hit = Object.keys(process.env).find((k) => k.toLowerCase() === name.toLowerCase());
    if (hit === undefined) throw new Error(`環境変数 ${name} が定義されていません（${value}）`);
    return process.env[hit];
  });
  v = v.replace(/\$\{([A-Za-z0-9_]+)\}/g, (m, name) => {
    if (process.env[name] === undefined) throw new Error(`環境変数 ${name} が定義されていません（${value}）`);
    return process.env[name];
  });
  if (v === '~' || v.startsWith('~/') || v.startsWith('~\\')) v = join(homedir(), v.slice(1));
  return v;
}

// Where JSON.parse failed ("3 行目 15 列目"), or null. Taken from the position in the engine's
// message only: the message itself may quote the file ("Unexpected token 'D', "DUMMY…" is not
// valid JSON"), and the file may hold values that must not be copied anywhere (e.g. into a ZIP).
export function jsonErrorWhere(error, text) {
  const m = /\bposition (\d+)/.exec(String(error && error.message));
  if (!m) return /Unexpected end of JSON input/i.test(String(error && error.message)) ? '途中で終わっています' : null;
  const lines = String(text ?? '').slice(0, Number(m[1])).split('\n');
  return `${lines.length} 行目 ${lines[lines.length - 1].length + 1} 列目`;
}

// lenient: a configuration file that cannot be read, or a value that cannot be resolved, does not
// stop the whole configuration: that part is null and the error is listed in cfg.errors (each with
// kind 'read' | 'json' | 'value', key, where). The environment variables are still applied. Used by
// the backup, which must keep the data folders given by MTM_DATA_DIR etc. out of the ZIP.
export function loadConfig({ root = ROOT, env = process.env, lenient = false } = {}) {
  const file = env.MTM_CONFIG ? resolve(env.MTM_CONFIG) : join(root, CONFIG_NAME);
  let raw = {};
  let fileExists = false;
  const errors = [];
  const problem = (err) => { if (!lenient) throw err; errors.push(err); };
  if (existsSync(file)) {
    fileExists = true;
    let text = null;
    try {
      text = readFileSync(file, 'utf8').replace(/^﻿/, '');
    } catch (e) {
      problem(Object.assign(new Error(`${file} を読めません: ${e.message}`), { kind: 'read' }));
    }
    if (text !== null) {
      try {
        raw = JSON.parse(text);
      } catch (e) {
        problem(Object.assign(new Error(`${file} を JSON として読めません: ${e.message}`), { kind: 'json', where: jsonErrorWhere(e, text) }));
      }
    }
  }
  if (!raw || typeof raw !== 'object') raw = {};
  const envMap = { appDir: 'MTM_APP_DIR', dataDir: 'MTM_DATA_DIR', backupDir: 'MTM_BACKUP_DIR' };
  const cfg = { file, fileExists, errors };
  for (const k of KEYS) {
    cfg[k] = null;
    try {
      let v = env[envMap[k]] || raw[k] || '';
      if (typeof v !== 'string') throw new Error(`${k} は文字列で指定してください`);
      v = v.trim();
      if (v) {
        v = expandVars(v);
        if (!isAbsolute(v)) v = resolve(dirname(file), v);
        v = resolve(v);
      }
      cfg[k] = v || null;
    } catch (e) {
      problem(Object.assign(e, { kind: 'value', key: k }));
    }
  }
  return cfg;
}

export function isInside(child, parent) {
  if (!child || !parent) return false;
  const rel = relative(resolve(parent), resolve(child));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

export function samePath(a, b) {
  if (!a || !b) return false;
  const norm = (p) => (process.platform === 'win32' ? resolve(p).toLowerCase() : resolve(p));
  return norm(a) === norm(b);
}

export function howToConfigure(key) {
  return [
    `設定 ${key} がありません。次のどちらかで指定してください:`,
    `  1) ${CONFIG_NAME.replace(/\.json$/, '')}.example.json を ${CONFIG_NAME} にコピーして編集`,
    `     （例: "${key}": "%OneDriveCommercial%${sep}TaskManager${sep}${{ appDir: 'app', dataDir: 'data', backupDir: 'backup' }[key]}"）`,
    `  2) 環境変数 ${{ appDir: 'MTM_APP_DIR', dataDir: 'MTM_DATA_DIR', backupDir: 'MTM_BACKUP_DIR' }[key]} を設定`,
    `確認: npm run config:check`,
  ].join('\n');
}

export function timestamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
