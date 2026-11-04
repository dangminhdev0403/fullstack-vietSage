import assert from 'node:assert/strict';
import test from 'node:test';
import { readFinancialAmount } from './booking-detail-finance.ts';

test('server zero remains a known amount', () => {
  assert.equal(readFinancialAmount(0), 0);
  assert.equal(readFinancialAmount('0'), 0);
});

test('missing or invalid payment evidence remains unknown', () => {
  for (const value of [undefined, null, '', ' ', 'unknown', NaN, Infinity, -Infinity, 'Infinity', false, [], {}]) {
    assert.equal(readFinancialAmount(value), null);
  }
});

test('server decimal and credit amounts are preserved without deriving debt', () => {
  assert.equal(readFinancialAmount('120000.50'), 120000.5);
  assert.equal(readFinancialAmount(-50000), -50000);
});
