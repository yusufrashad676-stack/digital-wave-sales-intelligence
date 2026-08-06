import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Argon2PasswordHasher } from './argon2-password-hasher.adapter.js';

describe('Argon2PasswordHasher', () => {
  it('hashes and verifies a password', async () => {
    const hasher = new Argon2PasswordHasher();
    const hash = await hasher.hash('super-secret-password');

    assert.notEqual(hash, 'super-secret-password');
    assert.match(hash, /^\$argon2/);
    assert.equal(await hasher.verify(hash, 'super-secret-password'), true);
  });

  it('rejects a wrong password', async () => {
    const hasher = new Argon2PasswordHasher();
    const hash = await hasher.hash('super-secret-password');

    assert.equal(await hasher.verify(hash, 'wrong-password'), false);
  });

  it('returns false when verifying a malformed hash', async () => {
    const hasher = new Argon2PasswordHasher();

    assert.equal(await hasher.verify('not-a-hash', 'anything'), false);
  });

  it('produces distinct hashes for the same password (random salt)', async () => {
    const hasher = new Argon2PasswordHasher();
    const first = await hasher.hash('same-password');
    const second = await hasher.hash('same-password');

    assert.notEqual(first, second);
  });
});
