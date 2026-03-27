const test = require('node:test');
const assert = require('node:assert/strict');

const { sanitize, sanitizeText } = require('../middleware/sanitize');

test('sanitizeText sanitizes plain strings without Express middleware args', () => {
  assert.equal(
    sanitizeText('<script>alert(1)</script><b>ok</b>'),
    '&lt;script&gt;alert(1)&lt;/script&gt;<b>ok</b>'
  );
});

test('sanitize middleware deep-sanitizes req.body and calls next once', () => {
  const req = {
    body: {
      title: '<script>alert(1)</script>',
      nested: ['<script>x</script>', 1],
    },
  };

  let nextCalls = 0;
  sanitize(req, {}, () => {
    nextCalls += 1;
  });

  assert.equal(nextCalls, 1);
  assert.deepEqual(req.body, {
    title: '&lt;script&gt;alert(1)&lt;/script&gt;',
    nested: ['&lt;script&gt;x&lt;/script&gt;', 1],
  });
});
