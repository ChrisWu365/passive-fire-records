import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;

const REGISTER_URL = 'http://localhost:8080';
const INSPECTION_API_URL = 'http://localhost:4000';
const WEB_URL = 'http://localhost:5173';
// The built web app, served by "vite preview". Only the build has the service worker that lets the app
// open with no network, so the offline tests run against it instead of the dev server.
const BUILT_WEB_URL = 'http://localhost:4173';
const OFFLINE_TESTS = '**/*.offline.spec.ts';

// PostgreSQL for both services. Locally this defaults to the local Supabase stack; CI sets E2E_DATABASE_URL
// to its service container. The end-to-end run keeps each service's data in a schema of its own, so it never
// mixes with development data.
const DATABASE_URL = process.env.E2E_DATABASE_URL
  ?? process.env.TEST_DATABASE_URL
  ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const E2E_SCHEMA = 'inspection_e2e';
const REGISTER_E2E_SCHEMA = 'register_e2e';

// The register service is given the same database in the form its JDBC driver expects: a "jdbc:" URL
// without credentials, and the username and password as settings of their own.
const database = new URL(DATABASE_URL);
const REGISTER_DATABASE_ENV = {
  REGISTER_DATABASE_URL: `jdbc:postgresql://${database.host}${database.pathname}${database.search}`,
  REGISTER_DATABASE_USERNAME: decodeURIComponent(database.username),
  REGISTER_DATABASE_PASSWORD: decodeURIComponent(database.password),
  REGISTER_DATABASE_SCHEMA: REGISTER_E2E_SCHEMA,
};

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 1,
  workers: isCI ? 1 : 4,
  reporter: 'html',
  use: {
    baseURL: WEB_URL,
    trace: 'on-first-retry',
  },

  // Playwright starts all three parts itself and waits for each URL, so neither CI nor a developer needs a
  // separate start step. Nothing between them is stubbed: the web app calls the inspection service and the
  // register service through the Vite dev server, and the inspection service calls the register service.
  webServer: [
    {
      // The register service on its "local" profile. Its migrations create the schema and the seeded demo
      // project on first start.
      command: 'mvn -q -f ../apps/register-api/pom.xml spring-boot:run -Dspring-boot.run.profiles=local',
      url: `${REGISTER_URL}/actuator/health`,
      reuseExistingServer: !isCI,
      timeout: 300_000,
      env: REGISTER_DATABASE_ENV,
    },
    {
      command: 'npm --prefix ../apps/inspection-api run dev',
      url: `${INSPECTION_API_URL}/health`,
      reuseExistingServer: !isCI,
      timeout: 120_000,
      env: {
        PORT: '4000',
        DATABASE_URL,
        DATABASE_SCHEMA: E2E_SCHEMA,
        REGISTER_SERVICE_URL: REGISTER_URL,
      },
    },
    {
      command: 'npm --prefix ../apps/inspection-web run dev',
      url: WEB_URL,
      reuseExistingServer: !isCI,
      timeout: 120_000,
    },
    {
      command: 'npm --prefix ../apps/inspection-web run build && npm --prefix ../apps/inspection-web run preview -- --port 4173 --strictPort',
      url: BUILT_WEB_URL,
      reuseExistingServer: !isCI,
      timeout: 180_000,
    },
  ],

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: OFFLINE_TESTS,
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      testMatch: '**/*.spec.ts',
      testIgnore: OFFLINE_TESTS,
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      testIgnore: OFFLINE_TESTS,
    },
    {
      // Offline behaviour: the built app with its service worker, with the network switched off mid-test.
      // Chromium only: Playwright's support for service workers and offline emulation is complete there,
      // and not in its Firefox and WebKit builds.
      name: 'offline',
      use: { ...devices['Desktop Chrome'], baseURL: BUILT_WEB_URL },
      testMatch: OFFLINE_TESTS,
    },
  ],
});
