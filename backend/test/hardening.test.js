import test from 'node:test';
import assert from 'node:assert/strict';
import { safeLink } from '../src/utils/safeLink.js';
import { checks, phoneDigits, firstError } from '../src/utils/validate.js';

test('safeLink keeps same-site paths and http(s) URLs, rejects everything else', () => {
  assert.equal(safeLink('/shop/books'), '/shop/books');
  assert.equal(safeLink('https://www.bluedart.com/tracking/123'), 'https://www.bluedart.com/tracking/123');
  for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>alert(1)</script>', '//evil.example', '/\\evil.example', 'ftp://x.example', '', null, undefined]) {
    assert.equal(safeLink(bad), null, String(bad));
  }
  assert.equal(safeLink('/shop', { allowRelative: false }), null);
});

test('field checks accept good values and reject bad ones', () => {
  assert.equal(checks.phone('+91 98765 43210'), '');
  assert.equal(checks.phone('09876543210'), '');
  for (const bad of ['12345', '5876543210', 'abcdefghij', '']) assert.notEqual(checks.phone(bad), '', bad);
  assert.equal(phoneDigits('+91 98765-43210'), '9876543210');
  assert.equal(checks.pincode('636001'), '');
  for (const bad of ['063600', '63600', '6360011', 'abcdef']) assert.notEqual(checks.pincode(bad), '', bad);
  assert.equal(checks.email('a@b.co'), '');
  for (const bad of ['a@b', 'a b@c.com', '@c.com', '']) assert.notEqual(checks.email(bad), '', bad);
  assert.equal(checks.name("Anne-Marie O'Neil"), '');
  assert.equal(checks.name('Ravi Kumar'), '');
  for (const bad of ['A', 'R2D2', '<b>x</b>', '']) assert.notEqual(checks.name(bad), '', bad);
  assert.equal(checks.password('abcdefg1'), '');
  for (const bad of ['short1', 'allletters', '12345678']) assert.notEqual(checks.password(bad), '', bad);
  assert.equal(firstError([['phone', '', 'Phone', { skipEmpty: true }], ['pincode', '636001', 'Pincode']]), '');
  assert.match(firstError([['pincode', '12', 'Pincode']]), /^Pincode:/);
});
