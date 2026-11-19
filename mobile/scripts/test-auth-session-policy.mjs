import assert from 'node:assert/strict';
import { shouldClearAuthTokenOnError } from '../src/api/authSessionPolicy.mjs';

function test(name, fn) {
  try {
    fn();
    console.log(`PASS: ${name}`);
    return true;
  } catch (error) {
    console.error(`FAIL: ${name}`);
    console.error(error);
    return false;
  }
}

let passed = 0;
let failed = 0;

function run(name, fn) {
  if (test(name, fn)) passed += 1;
  else failed += 1;
}

run('does not clear when request is not authenticated', () => {
  assert.equal(shouldClearAuthTokenOnError({ auth: false, status: 401 }), false);
});

run('clears on 401 for authenticated requests', () => {
  assert.equal(
    shouldClearAuthTokenOnError({ auth: true, status: 401, responseBody: { message: 'Authentication token has expired' } }),
    true
  );
});

run('clears on 403 inactive account session', () => {
  assert.equal(
    shouldClearAuthTokenOnError({ auth: true, status: 403, responseBody: { message: 'Account is inactive. Access denied.' } }),
    true
  );
});

run('does not clear on 403 permission denied', () => {
  assert.equal(
    shouldClearAuthTokenOnError({
      auth: true,
      status: 403,
      responseBody: { message: 'You do not have permission to perform this action' },
    }),
    false
  );
});

run('does not clear on 403 with unrelated message', () => {
  assert.equal(
    shouldClearAuthTokenOnError({ auth: true, status: 403, responseBody: { message: 'Forbidden' } }),
    false
  );
});

run('does not clear on network-like/non-auth status codes', () => {
  assert.equal(shouldClearAuthTokenOnError({ auth: true, status: 0 }), false);
  assert.equal(shouldClearAuthTokenOnError({ auth: true, status: 500 }), false);
});

console.log(`\nSummary: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
