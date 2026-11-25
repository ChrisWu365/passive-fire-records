import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { ConfigError, loadConfig } from '../src/config.js';

const DATABASE_URL = 'postgresql://user:secret-password@db.example.com:5432/app';
const MINIMAL = { DATABASE_URL };

test('with only DATABASE_URL set, every other setting takes its default', () => {
  const config = loadConfig(MINIMAL);

  assert.equal(config.port, 4000);
  assert.equal(config.databaseUrl, DATABASE_URL);
  assert.equal(config.databaseSchema, 'inspection');
  assert.equal(config.registerServiceUrl, 'http://localhost:8080');
  assert.equal(config.registerTimeoutMs, 3000);
  assert.equal(config.uploadDirectory, path.resolve('data/uploads'));
  assert.equal(config.webOrigins, undefined);
  assert.equal(config.ai, undefined);
  assert.equal(config.logLevel, 'info');
});

test('every setting can be overridden from the environment', () => {
  const config = loadConfig({
    DATABASE_URL,
    PORT: '4100',
    DATABASE_SCHEMA: 'inspection_dev',
    REGISTER_SERVICE_URL: 'http://product-crud:8080/',
    REGISTER_TIMEOUT_MS: '500',
    UPLOAD_DIR: 'some/uploads',
    WEB_ORIGIN: 'https://a.example.com, https://b.example.com',
    AI_PROVIDER_URL: 'https://ai.example.com/v1',
    AI_API_KEY: 'key',
    AI_MODEL: 'model-x',
    LOG_LEVEL: 'DEBUG'
  });

  assert.equal(config.port, 4100);
  assert.equal(config.databaseSchema, 'inspection_dev');
  assert.equal(config.registerServiceUrl, 'http://product-crud:8080');
  assert.equal(config.registerTimeoutMs, 500);
  assert.equal(config.uploadDirectory, path.resolve('some/uploads'));
  assert.deepEqual(config.webOrigins, ['https://a.example.com', 'https://b.example.com']);
  assert.deepEqual(config.ai, { providerUrl: 'https://ai.example.com/v1', apiKey: 'key', model: 'model-x' });
  assert.equal(config.logLevel, 'debug');
});

test('empty values, as an unfilled .env file gives, count as unset', () => {
  const config = loadConfig({ DATABASE_URL, AI_PROVIDER_URL: '', AI_API_KEY: '', AI_MODEL: '', PORT: '  ' });

  assert.equal(config.ai, undefined);
  assert.equal(config.port, 4000);
});

test('a missing DATABASE_URL stops startup with a message naming the variable', () => {
  assert.throws(() => loadConfig({}), (error: unknown) => {
    assert.ok(error instanceof ConfigError);
    assert.match(error.message, /DATABASE_URL/);
    return true;
  });
});

const invalid: Array<[string, Record<string, string>]> = [
  ['a PORT that is not a number', { PORT: 'http' }],
  ['a PORT above 65535', { PORT: '70000' }],
  ['a zero REGISTER_TIMEOUT_MS', { REGISTER_TIMEOUT_MS: '0' }],
  ['a REGISTER_SERVICE_URL that is not a URL', { REGISTER_SERVICE_URL: 'product-crud' }],
  ['a REGISTER_SERVICE_URL that is not http', { REGISTER_SERVICE_URL: 'ftp://product-crud' }],
  ['a DATABASE_SCHEMA that is not a plain identifier', { DATABASE_SCHEMA: 'inspection; drop schema public' }],
  ['an AI key without a provider URL', { AI_API_KEY: 'key' }],
  ['an AI provider URL without a key', { AI_PROVIDER_URL: 'https://ai.example.com' }],
  ['an unknown LOG_LEVEL', { LOG_LEVEL: 'verbose' }]
];

for (const [description, overrides] of invalid) {
  test(`${description} stops startup with a ConfigError`, () => {
    assert.throws(() => loadConfig({ ...MINIMAL, ...overrides }), ConfigError);
  });
}

test('a configuration error never repeats a secret value', () => {
  const secrets = { DATABASE_URL, AI_API_KEY: 'super-secret-key', PORT: 'bad' };

  assert.throws(() => loadConfig(secrets), (error: unknown) => {
    assert.ok(error instanceof ConfigError);
    assert.ok(!error.message.includes('secret-password'));
    assert.ok(!error.message.includes('super-secret-key'));
    return true;
  });
});
