import test from 'node:test';
import assert from 'node:assert/strict';
import { mailConfigured, notifyConfigured, smtpConfigured } from '../src/mailer.js';

const KEYS = ['ROKESH_NOTIFY_API_URL', 'ROKESH_NOTIFY_API_KEY', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'];

test('mail provider detection: Notify needs URL and key, SMTP needs host/user/pass', () => {
  const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  try {
    for (const k of KEYS) delete process.env[k];
    assert.equal(mailConfigured(), false);
    process.env.ROKESH_NOTIFY_API_URL = 'https://notify.invalid/v1/send';
    assert.equal(notifyConfigured(), false, 'URL alone is not enough');
    process.env.ROKESH_NOTIFY_API_KEY = 'k';
    assert.equal(notifyConfigured(), true);
    assert.equal(mailConfigured(), true);
    delete process.env.ROKESH_NOTIFY_API_URL;
    delete process.env.ROKESH_NOTIFY_API_KEY;
    Object.assign(process.env, { SMTP_HOST: 'h', SMTP_USER: 'u', SMTP_PASS: 'p' });
    assert.equal(smtpConfigured(), true);
    assert.equal(mailConfigured(), true);
  } finally {
    for (const k of KEYS) saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]);
  }
});
