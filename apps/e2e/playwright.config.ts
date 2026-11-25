import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;

const REGISTER_URL = 'http://localhost:8080';
const INSPECTION_API_URL = 'http://localhost:4000';
const WEB_URL = 'http://localhost:5173';

// PostgreSQL for the inspection service. Locally this defaults to the local Supabase stack; CI sets
// E2E_DATABASE_URL to its service container. The end-to-end run keeps its records in a schema of its own,
// so it never mixes with development data.
const DATABASE_URL = process.env.E2E_DATABASE_URL
  ?? process.env.TEST_DATABASE_URL
  ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const E2E_SCHEMA = 'inspection_e2e';

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
      // The register service on its "local" profile: in-memory database with the seeded demo project.
      command: 'mvn -q -f ../../pom.xml spring-boot:run -Dspring-boot.run.profiles=local',
      url: `${REGISTER_URL}/actuator/health`,
      reuseExistingServer: !isCI,
      timeout: 300_000,
    },
    {
      command: 'npm --prefix ../inspection-api run dev',
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
      command: 'npm --prefix ../inspection-web run dev',
      url: WEB_URL,
      reuseExistingServer: !isCI,
      timeout: 120_000,
    },
  ],

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      testMatch: '**/*.spec.ts',
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
});
