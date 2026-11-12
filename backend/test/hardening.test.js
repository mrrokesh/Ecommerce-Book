import test from 'node:test';
import assert from 'node:assert/strict';
import { safeLink } from '../src/utils/safeLink.js';

test('safeLink keeps same-site paths and http(s) URLs, rejects everything else', () => {
  assert.equal(safeLink('/shop/books'), '/shop/books');
  assert.equal(safeLink('https://www.bluedart.com/tracking/123'), 'https://www.bluedart.com/tracking/123');
  for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>alert(1)</script>', '//evil.example', '/\\evil.example', 'ftp://x.example', '', null, undefined]) {
    assert.equal(safeLink(bad), null, String(bad));
  }
  assert.equal(safeLink('/shop', { allowRelative: false }), null);
});
