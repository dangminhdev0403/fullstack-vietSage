const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

test('CLI passes image paths as argv instead of Python source', () => {
  const source = fs.readFileSync(require.resolve('./mrz.js'), 'utf8');
  assert.match(source, /ENGINE\.recognize_image\(sys\.argv\[1\]\)/);
  assert.match(source, /\['-c', pyCode, resolvedPath\]/);
  assert.doesNotMatch(source, /recognize_image\(r'''\$\{/);
});