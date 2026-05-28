// Adds UTF-8 BOM (EF BB BF) to all .md files in the spec dir if not already present.
// Why: files are stored as valid UTF-8, but Windows viewers defaulting to CP936/GBK
// mis-render Chinese as mojibake (e.g., "项目" → "椤圭洰"). BOM forces UTF-8 detection.
// SVG files keep the XML prolog `encoding="UTF-8"` and don't need BOM.

import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2] || '.kiro/specs/repo-system-reconnaissance-2026-05-28';
const BOM = Buffer.from([0xef, 0xbb, 0xbf]);

let added = 0;
let skipped = 0;
for (const f of fs.readdirSync(dir)) {
  if (!f.endsWith('.md')) continue;
  const p = path.join(dir, f);
  const buf = fs.readFileSync(p);
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    skipped++;
    continue;
  }
  fs.writeFileSync(p, Buffer.concat([BOM, buf]));
  added++;
  console.log('  + BOM:', f);
}
console.log(`done. added=${added}, already-had-bom=${skipped}`);
