const crypto = require('crypto');
const { verifySignature } = require('../webhook');

process.env.GITHUB_WEBHOOK_SECRET = 'test-webhook-secret';

describe('verifySignature', () => {
  const payload = { test: 'data' };
  const payloadString = JSON.stringify(payload);

  const generateSignature = (secret, bodyString) => {
    return 'sha256=' + crypto.createHmac('sha256', secret).update(bodyString).digest('hex');
  };

  test('valid signature returns true', () => {
    const signature = generateSignature(process.env.GITHUB_WEBHOOK_SECRET, payloadString);
    const req = {
      headers: { 'x-hub-signature-256': signature },
      body: payload
    };
    expect(verifySignature(req)).toBe(true);
  });

  test('wrong secret returns false', () => {
    const wrongSignature = generateSignature('wrong-secret', payloadString);
    const req = {
      headers: { 'x-hub-signature-256': wrongSignature },
      body: payload
    };
    expect(verifySignature(req)).toBe(false);
  });

  test('missing signature header returns false', () => {
    const req = {
      headers: {},
      body: payload
    };
    expect(verifySignature(req)).toBe(false);
  });

  test('empty body with valid signature returns true', () => {
    const emptyPayloadString = JSON.stringify({});
    const signature = generateSignature(process.env.GITHUB_WEBHOOK_SECRET, emptyPayloadString);
    const req = {
      headers: { 'x-hub-signature-256': signature },
      body: {}
    };
    expect(verifySignature(req)).toBe(true);
  });
});
