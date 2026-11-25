import path from 'node:path';
import { assertValidSchemaName } from './database/schema-name.js';
import { LOG_LEVELS, type LogLevel } from './logger.js';

export interface AiProviderConfig {
  providerUrl: string;
  apiKey: string;
  model: string | undefined;
}

export interface AppConfig {
  port: number;
  databaseUrl: string;
  databaseSchema: string;
  registerServiceUrl: string;
  registerTimeoutMs: number;
  uploadDirectory: string;
  /** Origins allowed by CORS; undefined allows any origin, which suits local development only. */
  webOrigins: string[] | undefined;
  /** Undefined when no AI provider is configured; the service then returns its labelled mock draft. */
  ai: AiProviderConfig | undefined;
  logLevel: LogLevel;
}

const DEFAULT_PORT = 4000;
const DEFAULT_SCHEMA = 'inspection';
const DEFAULT_REGISTER_SERVICE_URL = 'http://localhost:8080';
const DEFAULT_REGISTER_TIMEOUT_MS = 3000;
const DEFAULT_UPLOAD_DIRECTORY = 'data/uploads';
const DEFAULT_LOG_LEVEL: LogLevel = 'info';
const MAX_PORT = 65535;

/**
 * Thrown at startup when the environment does not describe a runnable service.
 * The message names the variable and says what is expected; it never repeats a secret value.
 */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

type Environment = Record<string, string | undefined>;

/**
 * Reads the service's settings from environment variables, applying defaults and failing fast on
 * anything missing or malformed. This is the only place that reads the environment.
 */
export function loadConfig(env: Environment): AppConfig {
  return {
    port: positiveInteger(env, 'PORT', DEFAULT_PORT, MAX_PORT),
    databaseUrl: required(env, 'DATABASE_URL', 'a PostgreSQL connection string, e.g. postgresql://user:pass@host:5432/db'),
    databaseSchema: schemaName(env),
    registerServiceUrl: httpUrl(env, 'REGISTER_SERVICE_URL', DEFAULT_REGISTER_SERVICE_URL),
    registerTimeoutMs: positiveInteger(env, 'REGISTER_TIMEOUT_MS', DEFAULT_REGISTER_TIMEOUT_MS),
    uploadDirectory: path.resolve(optional(env, 'UPLOAD_DIR') ?? DEFAULT_UPLOAD_DIRECTORY),
    webOrigins: optional(env, 'WEB_ORIGIN')?.split(',').map((origin) => origin.trim()).filter(Boolean),
    ai: aiProvider(env),
    logLevel: logLevel(env)
  };
}

function optional(env: Environment, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

function required(env: Environment, name: string, expectation: string): string {
  const value = optional(env, name);
  if (!value) throw new ConfigError(`${name} is not set. It must be ${expectation}.`);
  return value;
}

function positiveInteger(env: Environment, name: string, fallback: number, max = Number.MAX_SAFE_INTEGER): number {
  const raw = optional(env, name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0 || value > max) {
    throw new ConfigError(`${name} must be a whole number between 1 and ${max}.`);
  }
  return value;
}

function httpUrl(env: Environment, name: string, fallback: string): string {
  const raw = optional(env, name) ?? fallback;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ConfigError(`${name} must be an http or https URL, e.g. ${fallback}.`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ConfigError(`${name} must be an http or https URL, e.g. ${fallback}.`);
  }
  return raw.replace(/\/+$/, '');
}

function schemaName(env: Environment): string {
  const raw = optional(env, 'DATABASE_SCHEMA') ?? DEFAULT_SCHEMA;
  try {
    return assertValidSchemaName(raw);
  } catch {
    throw new ConfigError('DATABASE_SCHEMA must use lower-case letters, digits and underscores only.');
  }
}

function aiProvider(env: Environment): AiProviderConfig | undefined {
  const providerUrl = optional(env, 'AI_PROVIDER_URL');
  const apiKey = optional(env, 'AI_API_KEY');
  if (!providerUrl && !apiKey) return undefined;
  if (!providerUrl || !apiKey) {
    throw new ConfigError('AI_PROVIDER_URL and AI_API_KEY must be set together, or both left empty.');
  }
  return { providerUrl, apiKey, model: optional(env, 'AI_MODEL') };
}

function logLevel(env: Environment): LogLevel {
  const raw = optional(env, 'LOG_LEVEL')?.toLowerCase();
  if (raw === undefined) return DEFAULT_LOG_LEVEL;
  if (!LOG_LEVELS.includes(raw as LogLevel)) {
    throw new ConfigError(`LOG_LEVEL must be one of ${LOG_LEVELS.join(', ')}.`);
  }
  return raw as LogLevel;
}
