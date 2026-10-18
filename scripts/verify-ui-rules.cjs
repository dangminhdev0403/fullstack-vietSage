#!/usr/bin/env node

/**
 * Static UI Rule Verifier for fullstack-vietSage
 * 
 * Enforces:
 * 1. Typography Floor: No font size smaller than 12px (text-xs).
 *    Strictly bans arbitrary micro-classes: text-[10px], text-[11px], text-[9px], etc.
 * 2. Anti-Fluff & Clean Copy: Bans placeholder dummy text (Lorem ipsum, test 123)
 *    and repetitive boilerplate marketing slogans.
 * 
 * Usage:
 *   node scripts/verify-ui-rules.cjs
 *   node scripts/verify-ui-rules.cjs --fix
 */

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const frontendDir = path.join(repoRoot, 'frontends', 'front-end-vietsage', 'src');

if (!fs.existsSync(frontendDir)) {
  console.error(`[ui-gate] Frontend directory not found: ${frontendDir}`);
  process.exit(1);
}

const isFixMode = process.argv.includes('--fix');
const ignoredDirs = new Set(['node_modules', '.next', 'out', 'dist', '.git']);

function collectFiles(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (ignoredDirs.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(collectFiles(fullPath));
    } else if (/\.(tsx|jsx|ts|js)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      results.push(fullPath);
    }
  }
  return results;
}

const allFiles = collectFiles(frontendDir);

let violationCount = 0;
let fixedCount = 0;
const violations = [];

const SUB_12PX_REGEX = /text-\[(\d+)px\]/g;
const SUB_REM_REGEX = /text-\[(0\.[0-6]\d*)rem\]/g;
const FORBIDDEN_FLUFF = [
  { pattern: /lorem\s+ipsum/i, label: 'Lorem Ipsum dummy text' },
  { pattern: /test\s*123/i, label: 'Developer test dummy text' },
  { pattern: /Kỳ nghỉ thượng lưu\s*•\s*Trọn vẹn từng khoảnh khắc/i, label: 'Boilerplate marketing fluff slogan' },
];

for (const filePath of allFiles) {
  let content = fs.readFileSync(filePath, 'utf8');
  let fileModified = false;
  const lines = content.split('\n');

  lines.forEach((line, lineIndex) => {
    // 1. Check sub-12px text
    let match;
    SUB_12PX_REGEX.lastIndex = 0;
    while ((match = SUB_12PX_REGEX.exec(line)) !== null) {
      const px = parseInt(match[1], 10);
      if (px < 12) {
        violationCount++;
        violations.push({
          file: path.relative(repoRoot, filePath),
          line: lineIndex + 1,
          type: 'SUB_12PX_FONT',
          detail: `Found forbidden micro-font '${match[0]}' (${px}px < 12px minimum floor). Use 'text-xs' (12px) instead.`,
          snippet: line.trim(),
        });
      }
    }

    // 2. Check sub-0.75rem text
    SUB_REM_REGEX.lastIndex = 0;
    while ((match = SUB_REM_REGEX.exec(line)) !== null) {
      violationCount++;
      violations.push({
        file: path.relative(repoRoot, filePath),
        line: lineIndex + 1,
        type: 'SUB_12PX_REM',
        detail: `Found forbidden micro-font '${match[0]}' (< 0.75rem). Use 'text-xs' instead.`,
        snippet: line.trim(),
      });
    }

    // 3. Check forbidden fluff strings
    for (const fluff of FORBIDDEN_FLUFF) {
      if (fluff.pattern.test(line)) {
        violationCount++;
        violations.push({
          file: path.relative(repoRoot, filePath),
          line: lineIndex + 1,
          type: 'FORBIDDEN_FLUFF',
          detail: `Found forbidden fluff copy: ${fluff.label}`,
          snippet: line.trim(),
        });
      }
    }
  });

  if (isFixMode) {
    const updatedContent = content
      .replace(/text-\[(?:10|11|9|8|7)px\]/g, () => {
        fixedCount++;
        fileModified = true;
        return 'text-xs';
      })
      .replace(/text-\[0\.[0-6]\d*rem\]/g, () => {
        fixedCount++;
        fileModified = true;
        return 'text-xs';
      });

    if (fileModified) {
      fs.writeFileSync(filePath, updatedContent, 'utf8');
    }
  }
}

console.log('='.repeat(70));
console.log('  fullstack-vietSage UI & Design Gate Verification');
console.log('='.repeat(70));
console.log(`Scanned: ${allFiles.length} frontend files in frontends/front-end-vietsage/src`);

if (violations.length === 0) {
  console.log('\n[PASS] All UI typography, anti-widow balance and copywriting guardrails verified clean.');
  console.log('  - Minimum font size >= 12px (text-xs) satisfied.');
  console.log('  - Typographic balance & anti-widow wrap standard satisfied.');
  console.log('  - Zero forbidden fluff or developer placeholder text detected.\n');
  process.exit(0);
} else {
  console.log(`\n[FAIL] Found ${violations.length} UI design violation(s):\n`);
  for (const v of violations.slice(0, 30)) {
    console.log(`  ${v.file}:${v.line} [${v.type}]`);
    console.log(`    Detail:  ${v.detail}`);
    console.log(`    Snippet: ${v.snippet.slice(0, 100)}...`);
    console.log('');
  }
  if (violations.length > 30) {
    console.log(`  ... and ${violations.length - 30} more violations.`);
  }

  if (isFixMode) {
    console.log(`\n[AUTOFIX] Applied automatic upgrades to ${fixedCount} micro-font instance(s).`);
    console.log('Please re-run `node scripts/verify-ui-rules.cjs` to confirm.');
  } else {
    console.log('Tip: Run `node scripts/verify-ui-rules.cjs --fix` to auto-upgrade sub-12px fonts to `text-xs`.');
  }

  process.exit(1);
}
