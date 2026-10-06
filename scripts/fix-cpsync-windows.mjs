// Node 22's native fs.cpSync crashes (0xC0000409) on Windows when the path contains non-ASCII
// characters, e.g. this project's folder name. The Vercel adapter calls cpSync at the end of
// `astro build`, so on Windows we swap in a plain JavaScript copy. Elsewhere this file does nothing.
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform === 'win32') {
  const toPath = (p) => (p instanceof URL ? fileURLToPath(p) : String(p));

  const copy = (src, dest, opts) => {
    if (opts.filter && !opts.filter(src, dest)) return;
    const stat = opts.dereference ? fs.statSync(src) : fs.lstatSync(src);
    if (stat.isDirectory()) {
      if (!opts.recursive) {
        throw Object.assign(new Error(`Recursive option is required to copy a directory: ${src}`), { code: 'ERR_FS_EISDIR' });
      }
      fs.mkdirSync(dest, { recursive: true });
      for (const name of fs.readdirSync(src)) copy(path.join(src, name), path.join(dest, name), opts);
    } else if (stat.isSymbolicLink()) {
      fs.rmSync(dest, { force: true });
      fs.symlinkSync(fs.readlinkSync(src), dest);
    } else {
      if (fs.existsSync(dest) && opts.force === false) {
        if (opts.errorOnExist) throw Object.assign(new Error(`Target already exists: ${dest}`), { code: 'ERR_FS_CP_EEXIST' });
        return;
      }
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
      if (opts.preserveTimestamps) fs.utimesSync(dest, stat.atime, stat.mtime);
    }
  };

  fs.cpSync = (src, dest, opts = {}) => copy(toPath(src), toPath(dest), opts);
  // Make `import { cpSync } from 'node:fs'` see the replacement too.
  syncBuiltinESMExports();
}
