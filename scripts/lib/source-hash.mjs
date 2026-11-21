// Hash of every build input (src/**, build.mjs, package.json, package-lock.json), with line
// endings normalised (a Windows checkout with CRLF gives the same hash). Embedded in
// task-manager.html by build.mjs so a built HTML can always be traced back to its sources.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';

export const readText = (p) => readFileSync(p, 'utf8').replace(/\r\n?/g, '\n');

function listFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listFiles(p));
    else out.push(p);
  }
  return out;
}

export function computeSourceHash(base) {
  const files = [...listFiles(join(base, 'src')), join(base, 'build.mjs'), join(base, 'package.json'), join(base, 'package-lock.json')]
    .filter((p) => existsSync(p));
  const h = createHash('sha256');
  for (const p of files) {
    h.update(relative(base, p).split('\\').join('/'));
    h.update('\0');
    h.update(readText(p));
    h.update('\0');
  }
  return h.digest('hex').slice(0, 12);
}

// { version, sourceHash } embedded in a built HTML, or null.
export function embeddedBuildInfo(html) {
  const m = String(html).match(/<meta name="mtm-build" content="version=([^;"]+);source=([0-9a-f]+)">/);
  return m ? { version: m[1], sourceHash: m[2] } : null;
}
