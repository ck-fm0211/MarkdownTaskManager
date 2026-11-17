// Browser test helpers: run the BUILT task-manager.html in Chromium/Edge with an in-memory mock of
// the File System Access API (with fault injection), so data-safety behaviour can be tested
// without real folders. Real-browser + real-OneDrive checks are manual (see docs/ja/TESTING.md).
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const HTML_URL = pathToFileURL(join(root, 'task-manager.html')).href;

// Normal use opens the HTML from disk (file://). Some locked-down environments refuse file:// in
// automated browsers: then (or with MTM_TEST_HTTP=1) the same file is served from 127.0.0.1.
let httpUrl = null;
async function serveOverHttp() {
  if (httpUrl) return httpUrl;
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(readFileSync(join(root, 'task-manager.html')));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  server.unref();
  httpUrl = `http://127.0.0.1:${server.address().port}/task-manager.html`;
  return httpUrl;
}

async function gotoApp(page, forceHttp = false) {
  if (!process.env.MTM_TEST_HTTP && !forceHttp) {
    try { await page.goto(HTML_URL); return; } catch (e) { console.warn(`[e2e] file:// を開けないため localhost で配信します: ${e.message.split('\n')[0]}`); }
  }
  await page.goto(await serveOverHttp());
}

// Find Playwright: the project devDependency (playwright-core) or a global "playwright".
async function loadPlaywright() {
  const req = createRequire(join(root, 'package.json'));
  for (const name of ['playwright', 'playwright-core']) {
    try { return { mod: req(name), name }; } catch { /* next */ }
    try { return { mod: await import(name), name }; } catch { /* next */ }
  }
  try {
    // Globally installed playwright (e.g. preinstalled in CI images)
    const { execSync } = await import('node:child_process');
    const g = execSync('npm root -g', { encoding: 'utf8' }).trim();
    for (const name of ['playwright', 'playwright-core']) {
      const p = join(g, name);
      if (existsSync(p)) return { mod: createRequire(join(g, 'x.js'))(name), name };
    }
  } catch { /* none */ }
  return null;
}

// Launch order: MTM_BROWSER_PATH → MTM_BROWSER_CHANNEL → Playwright's bundled Chromium →
// installed Microsoft Edge → installed Google Chrome. Returns null if nothing works.
export async function launchBrowser() {
  const pw = await loadPlaywright();
  if (!pw) return { browser: null, reason: 'playwright / playwright-core が見つかりません（npm ci を実行してください）' };
  const chromium = pw.mod.chromium;
  const attempts = [];
  if (process.env.MTM_BROWSER_PATH) attempts.push({ executablePath: process.env.MTM_BROWSER_PATH });
  if (process.env.MTM_BROWSER_CHANNEL) attempts.push({ channel: process.env.MTM_BROWSER_CHANNEL });
  attempts.push({}, { channel: 'msedge' }, { channel: 'chrome' });
  if (existsSync('/opt/pw-browsers/chromium')) attempts.push({ executablePath: '/opt/pw-browsers/chromium' });
  const errors = [];
  for (const opt of attempts) {
    try {
      const browser = await chromium.launch({ headless: true, ...opt });
      return { browser, how: JSON.stringify(opt) };
    } catch (e) { errors.push(`${JSON.stringify(opt)}: ${e.message.split('\n')[0]}`); }
  }
  return { browser: null, reason: `ブラウザーを起動できません:\n${errors.join('\n')}` };
}

// Injected before the app's scripts run.
function mockFsInit() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const dom = (name, msg) => new DOMException(msg || name, name);
  const dirs = new Map();
  const faults = {}; // key "dir/file" → { readFail, contentFail, writeFail, closeFail, readDelay, writeDelay }
  const writeLog = [];
  const fault = (d, f) => faults[`${d}/${f}`] || {};

  class MockFileHandle {
    constructor(dir, name) { this.kind = 'file'; this.name = name; this._dir = dir; }
    async isSameEntry(o) { return !!o && o._dir === this._dir && o.name === this.name; }
    async getFile() {
      const fl = fault(this._dir.name, this.name);
      if (fl.readDelay) await sleep(fl.readDelay);
      if (fl.readFail) throw dom(fl.readFail === true ? 'NotAllowedError' : fl.readFail, 'mock read failure');
      // The file can be opened but its content cannot be read (e.g. NotReadableError while another
      // program — OneDrive, an editor — is writing it).
      if (fl.contentFail) {
        const fail = async () => { throw dom('NotReadableError', 'mock content read failure'); };
        return { name: this.name, size: 0, lastModified: Date.now(), text: fail, arrayBuffer: fail };
      }
      const entry = this._dir._files.get(this.name);
      if (!entry) throw dom('NotFoundError', 'mock: file missing');
      // entry.bytes: raw bytes written by a test (e.g. Shift_JIS); otherwise the text as UTF-8.
      return new File([entry.bytes || entry.text], this.name, { lastModified: entry.mtime });
    }
    async createWritable() {
      const fl = fault(this._dir.name, this.name);
      if (fl.writeFail) throw dom('NotAllowedError', 'mock write failure');
      let buf = '';
      const self = this;
      return {
        async write(data) { buf += typeof data === 'string' ? data : await new Blob([data]).text(); },
        async close() {
          const f2 = fault(self._dir.name, self.name);
          if (f2.writeDelay) await sleep(f2.writeDelay);
          if (f2.closeFail) throw dom('InvalidStateError', 'mock close failure');
          // Like Chromium: content becomes visible only on close (swap file).
          self._dir._files.set(self.name, { text: buf, mtime: Date.now() });
          writeLog.push({ dir: self._dir.name, file: self.name, text: buf });
        },
        async abort() { buf = ''; },
      };
    }
  }

  class MockDirHandle {
    constructor(name) { this.kind = 'directory'; this.name = name; this._files = new Map(); }
    async isSameEntry(o) { return o === this; }
    async queryPermission() { return 'granted'; }
    async requestPermission() { return 'granted'; }
    async getFileHandle(name, opts = {}) {
      if (!this._files.has(name)) {
        if (!opts.create) throw dom('NotFoundError', 'mock: not found');
        this._files.set(name, { text: '', mtime: Date.now() });
      }
      return new MockFileHandle(this, name);
    }
  }

  window.__mockFS = {
    createDir(name, files = {}) {
      const d = new MockDirHandle(name);
      for (const [f, text] of Object.entries(files)) d._files.set(f, { text, mtime: Date.now() });
      dirs.set(name, d);
      return d;
    },
    dir: (name) => dirs.get(name),
    read: (d, f) => { const e = dirs.get(d)._files.get(f); return e ? e.text : null; },
    write: (d, f, text) => { dirs.get(d)._files.set(f, { text, mtime: Date.now() }); },
    // Raw bytes (array of numbers) — a file in another encoding than UTF-8.
    writeBytes: (d, f, bytes) => { dirs.get(d)._files.set(f, { text: null, bytes: Uint8Array.from(bytes), mtime: Date.now() }); },
    readBytes: (d, f) => {
      const e = dirs.get(d)._files.get(f);
      if (!e) return null;
      return Array.from(e.bytes || new TextEncoder().encode(e.text));
    },
    remove: (d, f) => { dirs.get(d)._files.delete(f); },
    files: (d) => [...dirs.get(d)._files.keys()].sort(),
    setFault: (d, f, v) => { faults[`${d}/${f}`] = v || {}; },
    writeLog,
    nextPick: null,
  };
  window.showDirectoryPicker = async () => {
    if (!window.__mockFS.nextPick) throw dom('AbortError', 'no pick');
    return window.__mockFS.nextPick;
  };
}

export async function newPage(browser, { locale = 'en-US', language = null, http = false } = {}) {
  const context = await browser.newContext({ locale, acceptDownloads: true });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  const page = await context.newPage();
  const errors = [];
  const requests = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith('file:') && !u.startsWith('blob:') && !u.startsWith('data:') && !(httpUrl && u === httpUrl)) requests.push(u);
  });
  const dialogs = { queue: [], seen: [] };
  page.on('dialog', async (d) => {
    dialogs.seen.push({ type: d.type(), message: d.message() });
    const next = dialogs.queue.length ? dialogs.queue.shift() : (d.type() === 'prompt' ? null : true);
    if (next === false || next === null) await d.dismiss();
    else if (typeof next === 'string') await d.accept(next);
    else await d.accept();
  });
  await page.addInitScript(mockFsInit);
  if (language) {
    await page.addInitScript((lang) => { localStorage.setItem('preferredLanguage', lang); }, language);
  }
  await gotoApp(page, http);
  // Recent-projects list lives in IndexedDB, which cannot store mock handles: keep it in memory.
  // The real functions stay available as window.__realStorage (tested with real handles).
  await page.evaluate(() => {
    window.__realStorage = { loadRecentProjects, saveDirectoryHandle };
    window.__projects = [];
    window.loadRecentProjects = async () => window.__projects;
    window.saveDirectoryHandle = async (handle) => {
      const i = window.__projects.findIndex((p) => p.handle === handle);
      const entry = { handle, name: handle.name, customName: '', lastAccessed: Date.now() };
      if (i >= 0) window.__projects.splice(i, 1);
      window.__projects.unshift(entry);
      await updateProjectSelector();
    };
  });
  return { page, context, errors, requests, dialogs };
}

export async function createDir(page, name, files) {
  await page.evaluate(([n, f]) => { window.__mockFS.createDir(n, f); }, [name, files]);
}

export async function openFolder(page, name) {
  await page.evaluate((n) => { window.__mockFS.nextPick = window.__mockFS.dir(n); }, name);
  await page.click('#selectFolderBtn');
  await page.waitForFunction((n) => typeof session !== 'undefined' && session && session.dir.name === n, name);
  await waitIdle(page);
}

export async function waitIdle(page) {
  await page.waitForFunction(() => pendingWrites === 0 && !busyOperation);
}

export const readFile = (page, d, f) => page.evaluate(([a, b]) => window.__mockFS.read(a, b), [d, f]);
export const writeFile = (page, d, f, text) => page.evaluate(([a, b, c]) => window.__mockFS.write(a, b, c), [d, f, text]);
export const writeBytes = (page, d, f, bytes) => page.evaluate(([a, b, c]) => window.__mockFS.writeBytes(a, b, c), [d, f, Array.from(bytes)]);
export const readBytes = (page, d, f) => page.evaluate(([a, b]) => window.__mockFS.readBytes(a, b), [d, f]);
export const setFault = (page, d, f, v) => page.evaluate(([a, b, c]) => window.__mockFS.setFault(a, b, c), [d, f, v]);
export const syncState = (page) => page.evaluate(() => document.getElementById('syncStatus').dataset.state);
export const notificationText = (page) => page.evaluate(() => document.getElementById('notificationText').textContent);

export function board(tasksMd, { columns = '📝 To Do (todo) | 🚀 In Progress (in-progress) | ✅ Done (done)', lastId = 0, title = 'Kanban Board' } = {}) {
  return `# ${title}

<!-- Config: Last Task ID: ${lastId} -->
<!-- Format: v2 -->

## ⚙️ Configuration

**Columns**: ${columns}

**Categories**: Frontend, Backend

**Users**: @alice

**Priorities**: 🔴 Critical | 🟠 High | 🟡 Medium | 🟢 Low

**Tags**: #bug #feature

---

## Tasks

${tasksMd}`;
}

export function archive(tasksMd) {
  return `# Task Archive
<!-- Format: v2 -->

> Archived tasks

## ✅ Archives

${tasksMd}`;
}

export const task = (n, title, extra = '', status = 'todo') =>
  `### TASK-${String(n).padStart(3, '0')} | ${title}\n**Status**: ${status}\n${extra}\n`;
