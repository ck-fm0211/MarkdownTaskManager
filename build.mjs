// Build: concatenate src/ partials into a single self-contained task-manager.html.
// No runtime dependencies are produced — the output is one standalone HTML file that works
// offline (no CDN, no external fonts/scripts).
//   npm run build            -> minified task-manager.html
//   npm run build:dev        -> readable (unminified) task-manager.html
//   node build.mjs --out X   -> write to X instead (used by tests / restore checks)
//   npm run build:check      -> exit 1 if task-manager.html was not built from the current sources
//
// Safety: the JS is syntax-checked BEFORE minification (the minifier would otherwise keep broken
// code), the output is written to a temporary file and renamed only after every step succeeded,
// so a failed build never leaves a half-written or broken task-manager.html behind.
// Traceability: the HTML embeds BUILD_INFO {version, sourceHash}. sourceHash is a hash of the
// build inputs (line endings normalised), so the same sources always give the same HTML.
import { readFileSync, writeFileSync, readdirSync, renameSync, rmSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { computeSourceHash, embeddedBuildInfo as embeddedInfo, readText as read } from './scripts/lib/source-hash.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const dev = args.includes('--dev');
const check = args.includes('--check');
const outIdx = args.indexOf('--out');
const outFile = resolve(root, outIdx >= 0 ? args[outIdx + 1] : 'task-manager.html');

const pkg = JSON.parse(read(join(root, 'package.json')));
const sourceHash = computeSourceHash(root);

if (check) {
  const target = outFile;
  if (!existsSync(target)) {
    console.error(`NG: ${relative(root, target)} がありません。npm run build を実行してください。`);
    process.exit(1);
  }
  const info = embeddedInfo(readFileSync(target, 'utf8'));
  if (!info || info.sourceHash !== sourceHash) {
    console.error(`NG: ${relative(root, target)} は現在のソースからビルドされていません（埋め込み: ${info ? info.sourceHash : 'なし'} / 現在: ${sourceHash}）。npm run build を実行してください。`);
    process.exit(1);
  }
  console.log(`OK: ${relative(root, target)} は現在のソース（${sourceHash}）からビルドされています。`);
  process.exit(0);
}

// Concatenate every file of a given extension in a directory, sorted by name
// (file names are numbered, e.g. 00-...,01-..., to control order).
function concatDir(dir, ext) {
  return readdirSync(join(root, dir))
    .filter((f) => f.endsWith(ext))
    .sort()
    .map((f) => `/* ===== ${f} ===== */\n${read(join(root, dir, f)).trim()}`)
    .join('\n\n');
}

const buildInfo = { version: pkg.version, sourceHash };
const css = concatDir('src/styles', '.css');
const js = `const BUILD_INFO = ${JSON.stringify(buildInfo)};\n\n` + concatDir('src/scripts', '.js');

// Fail the build on a syntax error instead of shipping it.
try {
  new vm.Script(js, { filename: 'task-manager.js' });
} catch (e) {
  console.error('ビルド失敗: JavaScript の構文エラー / Build failed: JavaScript syntax error');
  console.error(e.stack || e.message);
  process.exit(1);
}

// Function replacers so $ / ${...} inside css/js are inserted literally.
let html = read(join(root, 'src/index.html'));
for (const marker of ['/* build:css */', '/* build:js */', '<!-- build:meta -->']) {
  if (!html.includes(marker)) {
    console.error(`ビルド失敗: src/index.html に ${marker} がありません`);
    process.exit(1);
  }
}
html = html
  .replace('/* build:css */', () => css)
  .replace('/* build:js */', () => js)
  .replace('<!-- build:meta -->', () => `<meta name="mtm-build" content="version=${buildInfo.version};source=${sourceHash}">`);

if (!dev) {
  const { minify } = await import('html-minifier-terser');
  html = await minify(html, {
    collapseWhitespace: true,
    conservativeCollapse: false,
    removeComments: true,
    minifyCSS: true,
    // Classic script (not a module): keep top-level names so inline on* handlers
    // and cross-file global calls keep working.
    minifyJS: {
      compress: true,
      mangle: { toplevel: false },
      format: { comments: false },
    },
  });
}

// Post-checks on the final document.
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
try {
  if (scripts.length !== 1) throw new Error(`expected 1 inline script, found ${scripts.length}`);
  new vm.Script(scripts[0], { filename: 'task-manager.min.js' });
  if (/\b(?:src|href)\s*=\s*["']?(?:https?:)?\/\//i.test(html.replace(/<script>[\s\S]*?<\/script>/g, ''))) {
    throw new Error('external resource reference found (the app must work offline)');
  }
  if (!embeddedInfo(html)) throw new Error('build info meta tag missing');
} catch (e) {
  console.error('ビルド失敗: 出力の検証に失敗 / Build failed: output check');
  console.error(e.message);
  process.exit(1);
}

const tmp = `${outFile}.tmp-${process.pid}`;
try {
  writeFileSync(tmp, html);
  renameSync(tmp, outFile);
} catch (e) {
  try { rmSync(tmp, { force: true }); } catch { /* ignore */ }
  console.error('ビルド失敗: 書き込みエラー / Build failed: write error');
  console.error(e.message);
  process.exit(1);
}
console.log(`Built ${relative(root, outFile) || outFile} (${dev ? 'dev/readable' : 'minified'}) — ${(html.length / 1024).toFixed(1)} KB — version ${buildInfo.version}, source ${sourceHash}`);
