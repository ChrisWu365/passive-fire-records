# Passive Fire Installation Records

An offline-first proof of concept for recording firestopping work on a construction site. An installer
downloads the job's approved firestop systems, records each sealed opening with photos while there is no
network, and the records sync by themselves when the connection returns.

It is built as two services and a web app:

- **Register service** — Java 21 and Spring Boot. Owns projects and each project's approved firestop systems.
- **Inspection service** — Node.js and TypeScript. Owns inspection records, photos and AI-assisted drafts.
- **Web app** — React. Installable, opens with no network, and keeps its offline data in SQLite in the browser.

Both services store their data in PostgreSQL (Supabase in deployment), each in its own schema. One GitHub
Actions pipeline builds, tests and deploys all three.

> This is a personal proof of concept, not a compliance product. It models a simplified version of real
> practice (see [Known simplifications](#known-simplifications)), the seeded firestop systems are fictional,
> and an AI draft is a suggestion for a person to review, never a compliance decision.

## Contents

- [What it does](#what-it-does)
- [Architecture](#architecture)
- [Repository layout](#repository-layout)
- [Try the offline flow](#try-the-offline-flow)
- [Known simplifications](#known-simplifications)
- [Technology stack](#technology-stack)
- [Local development setup](#local-development-setup)
- [Configuration reference](#configuration-reference)
- [APIs](#apis)
- [Testing](#testing)
- [Deployment](#deployment)
- [GitHub Actions CI/CD](#github-actions-cicd)
- [Monitoring](#monitoring)
- [Troubleshooting](#troubleshooting)
- [Design documents](#design-documents)

## What it does

| Who | What they do |
| --- | --- |
| Admin (office) | Sets up projects and each project's approved firestop systems: a short code, the wall or floor type, the service passing through, the fire rating, the materials and the method |
| Installer (site) | Downloads the register to the device, then records each sealed opening: project, location, system code, photos, notes and an instruction for the AI |
| Viewer | Reads records; changes nothing |

The workflow:

1. **Office, online.** The admin adds a project's approved systems on the **Register** screen.
2. **Before going on site, online.** The installer presses **Download for offline**.
3. **On site, no network.** The installer creates records. Each is saved on the device as **Pending sync**.
4. **Network returns.** The app sends each record, uploads its photos and asks for the AI draft, with no
   user action. The record becomes **Synced**.
5. **Review, online.** The installer reads the AI draft, edits the record and sets its status.

Rules worth knowing:

- A record must use a system from its project's approved list. The inspection service checks this with the
  register service, and the record keeps its own copy of the system's details, so later edits to the
  register never change existing records.
- Projects and systems are deactivated, never deleted.
- If the server refuses a record at sync time (for example its system was deactivated meanwhile), the
  record stays on the device as **Sync failed** with the reason, until the installer retries or discards it.
- Sending is safe to interrupt: a record interrupted part-way is never created twice, and no photo is
  uploaded twice.
- The AI drafts text only. It never sets a record's status.

## Architecture

```mermaid
flowchart LR
    subgraph Device[Browser]
        UI[React app, installable]
        SW[Service worker: caches the app itself]
        DB[(SQLite: downloaded register + records waiting to sync)]
        UI --- DB
    end

    UI -->|one origin| GW[Nginx gateway]
    GW -->|/api/register/*| REG[Register service<br/>Java 21, Spring Boot]
    GW -->|/api/*, /uploads/*| INS[Inspection service<br/>Node.js, Express]
    INS -->|is this project and system valid?| REG
    INS -->|photos + instruction| AI[Google Gemini, optional]

    REG --> PG1[(PostgreSQL<br/>schema: register)]
    INS --> PG2[(PostgreSQL<br/>schema: inspection)]
    INS --> VOL[(Photo files)]

    CI[GitHub Actions] --> GHCR[GHCR images] --> K8s[Kubernetes on one VM]
```

| Component | Owns | Notes |
| --- | --- | --- |
| Register service | Projects, approved firestop systems, the snapshot the web app downloads | Verifies the sign-in token; reads need any role, writes need admin |
| Inspection service | Sign-in, inspection records, photos, AI drafts | Calls the register service when a record is created or its system changes |
| Web app | Screens, the offline copy of the register, the queue of records waiting to sync | Calls both services through one origin; never calls `fetch` outside its API client |
| Nginx gateway | Routing by path | In development the Vite dev server does the same routing |

How the pieces fit:

- **Sign-in.** The inspection service issues an HS256 JWT. The register service verifies the same token
  with the shared `JWT_SECRET`. Demo accounts are built in; there is no user database.
- **Service-to-service call.** A plain HTTP request inside the cluster, with the user's token forwarded and
  a 3 second timeout. "Not found" or "inactive" becomes a 422 with the reason; no answer becomes a 503 and
  nothing is stored.
- **Separate data.** Neither service reads the other's tables. The inspection service refers to a project
  and system by id and keeps a copy of what it needs.
- **Offline.** The browser reads the live register whenever it can be reached, and the downloaded copy only
  when it cannot. Records captured offline carry an id chosen by the device; the server keeps at most one
  record per id, which is what makes re-sending safe.

The full design is in [docs/02-system-design.md](docs/02-system-design.md).

## Try the offline flow

Offline features need HTTPS or `localhost`, and a service worker, which only the **built** web app has.
After the [local setup](#local-development-setup), with the register service and the inspection service
running:

```bash
cd apps/inspection-web
npm run build
npm run preview        # serves the built app on http://localhost:4173
```

Then, in Chrome or Edge at http://localhost:4173:

1. Sign in as `admin@example.com`. Open **Register**, select **DEMO**, and add a system, say `SYS-05`.
2. Sign out and sign in as `inspector@example.com`. Press **Download for offline**.
3. Switch the network off (DevTools → Network → Offline, or airplane mode) and reload. The app still opens
   and shows **Offline**.
4. Press **+ New inspection**. Pick the project and `SYS-05` from the list (they come from the device),
   type a location, attach a photo, write an AI instruction, and save. The record appears under
   **On this device** as **Pending sync**.
5. Switch the network back on. The record turns **Synced**, appears in the list, and opens with its photo
   and an AI draft labelled as unverified.

Without an AI key the draft is a clearly labelled mock text, so the whole flow works with no external
account.

## Known simplifications

Deliberate cuts, so that the flow stays small and can be run with one photo of anything.

| Real practice | In this project |
| --- | --- |
| Each opening gets a numbered physical label before it is photographed | No label numbers; a record has a location and a system code |
| Photos are taken before, during and at completion | Plain photos with no stage |
| Each opening is marked on a floor plan | Free-text location |
| Work is assigned by level and area | No work areas or assignment |
| A supervisor reviews records and sends defects back for rework | No review loop; a status field only |
| A register is exported at handover | No export |
| Users come from an identity provider | Three built-in demo accounts |

Other limits:

- Only **new** records can be captured offline. A record already on the server is edited online.
- A **Sync failed** record can be retried or discarded, not edited.
- Offline use works in **one browser tab** at a time. A second tab runs online-only.
- Offline behaviour is tested by automation in Chromium. The device database also opened in Firefox in a
  manual check; Safari has not been tried.

The reasoning and the sources behind the business model are in
[docs/01-business-logic.md](docs/01-business-logic.md).

## Repository layout

```
apps/
  register-api/      Register service: Java, Spring Boot (pom.xml, src/, Dockerfile)
  inspection-api/    Inspection service: Node.js, TypeScript, Express
  inspection-web/    Web app: React, Vite; its container's Nginx is also the gateway
e2e/                 Playwright suite that runs the web app and both services together
deployment/
  kubernetes/        register.yml, inspection.yml, gateway.yml, monitoring.yml
  compose/           local.yml and monitoring.yml, for running parts in Docker on one machine
  monitoring/        Prometheus rules and Grafana dashboards, used by both of the above
scripts/             Kubernetes install and deploy scripts, run on the VM
docs/                Business logic, system design, slice spec
```

Each folder under `apps/` builds, tests and ships on its own. A product of this size would normally start
as one modular service; it is split into two services here on purpose, to exercise a gateway, a call
between services and separate databases.

## Technology stack

**Register service**

- Java 21, Spring Boot 4.1, Spring Web, Spring Data JPA, Bean Validation
- Spring Security as an OAuth2 resource server (HS256 JWT)
- Flyway migrations on PostgreSQL in every environment; the tests start their own PostgreSQL with
  Testcontainers
- Springdoc OpenAPI, Actuator, Micrometer Prometheus
- JUnit, Mockito, MockMvc; Checkstyle, PMD and SpotBugs in the build

**Inspection service**

- Node.js 22, TypeScript, Express 5
- PostgreSQL through `pg`, with migrations applied on start
- JWT sign-in, Multer uploads, Swagger UI
- Google Gemini for AI drafts, optional
- Node's built-in test runner and Supertest

**Web app**

- React 19, TypeScript, Vite
- SQLite compiled to WebAssembly, running in a web worker, stored in the browser's private file system
- A service worker (Workbox, through `vite-plugin-pwa`) that caches the app's own files
- Vitest and React Testing Library; Playwright for end-to-end tests

**Delivery**

- GitHub Actions, GitHub Container Registry
- Kubernetes (kubeadm, containerd, Flannel) on one Azure VM; Nginx; Caddy for HTTPS
- Supabase PostgreSQL
- Prometheus and Grafana

## Local development setup

### Prerequisites

| Tool | Version | Needed for |
| --- | --- | --- |
| JDK | 21 | Register service |
| Maven | 3.6.3 or newer | Register service build and tests |
| Node.js | 22.9 or newer | Inspection service, web app, end-to-end tests |
| PostgreSQL | 15 or newer | Both services, and the inspection service's tests |
| Docker | Any recent version | The register service's tests, which start a throwaway PostgreSQL; also the easiest way to get a local PostgreSQL |

Both services use PostgreSQL locally, as they do when deployed. There is no in-memory database anywhere.

### 1. Clone

```bash
git clone <repository-url>
cd <repository-folder>
```

Copy the URL from the repository page's **Code** button.

### 2. Start a local PostgreSQL

Either of these works. Each service creates its own schema on first start: `register` and `inspection`.

```bash
# A plain PostgreSQL in Docker
docker run -d --name inspection-postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:17-alpine
# connection string: postgresql://postgres:postgres@127.0.0.1:5432/postgres

# or the local Supabase stack
supabase start
# connection string: postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

### 3. Run the register service

```bash
cd apps/register-api
mvn spring-boot:run
```

With nothing configured, the default `local` profile connects to the local Supabase stack on port `54322`.
For a different PostgreSQL, such as the plain Docker one above, copy `.env.example` to `.env` in
`apps/register-api` and set the three `REGISTER_DATABASE_*` values. The first start creates the tables and a
seeded demo project.

It listens on port `8080`. In the `local` profile:

- Swagger UI: http://localhost:8080/swagger-ui.html
- Health: http://localhost:8080/actuator/health

The register endpoints need a sign-in token, which the inspection service issues (next step).

### 4. Run the inspection service

```bash
cd apps/inspection-api
npm install
cp .env.example .env        # Windows PowerShell: Copy-Item .env.example .env
```

Edit `.env` so that `DATABASE_URL` and `TEST_DATABASE_URL` match the PostgreSQL from step 2, then:

```bash
npm run dev
```

It listens on port `4000` and loads `.env` by itself. Swagger UI is at http://localhost:4000/api-docs.
Leave `JWT_SECRET` unset locally: both services then use the same built-in development secret. The `AI_*`
variables are optional; without them AI drafts are labelled mock text.

### 5. Run the web app

```bash
cd apps/inspection-web
npm install
npm run dev
```

Open http://localhost:5173. The dev server routes `/api/register` to port `8080` and the rest of `/api`
to port `4000`.

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@example.com` | `Admin123!` |
| Inspector | `inspector@example.com` | `Inspector123!` |
| Viewer | `viewer@example.com` | `Viewer123!` |

These accounts are built into the inspection service in every environment. Do not put real data in a
deployment that still has them.

The dev server has no service worker, so the app cannot reopen offline there. For that, use the built app
as described in [Try the offline flow](#try-the-offline-flow).

### Running the register service against Supabase

Not needed for development. To run the register against a hosted database:

```bash
cd apps/register-api
cp .env.example .env        # fill in the three REGISTER_DATABASE_* values
mvn spring-boot:run "-Dspring-boot.run.profiles=dev"
```

Use the Supabase **Session pooler** connection details (port 5432).

## Configuration reference

| Variable | Service | Purpose |
| --- | --- | --- |
| `REGISTER_DATABASE_URL`, `REGISTER_DATABASE_USERNAME`, `REGISTER_DATABASE_PASSWORD` | Register | PostgreSQL JDBC connection. Required when deployed; the service refuses to start without them. The `local` profile defaults to the local Supabase stack, and the tests start their own PostgreSQL |
| `REGISTER_DATABASE_SCHEMA` | Register | Schema for the register tables; defaults to `register` |
| `JWT_SECRET` | Both | Shared token signing secret, at least 32 bytes. Required outside local development |
| `DATABASE_URL` | Inspection | PostgreSQL connection string. Required. For hosted Supabase use the session pooler with `sslmode=require&uselibpqcompat=true` |
| `DATABASE_SCHEMA` | Inspection | Schema for the inspection tables; defaults to `inspection` |
| `TEST_DATABASE_URL` | Inspection tests | A PostgreSQL the tests may create and drop throwaway schemas in |
| `REGISTER_SERVICE_URL` | Inspection | Address of the register service; defaults to `http://localhost:8080` |
| `REGISTER_TIMEOUT_MS` | Inspection | Timeout for each call to the register; defaults to `3000` |
| `AI_PROVIDER_URL`, `AI_API_KEY`, `AI_MODEL` | Inspection | Google Gemini settings, optional. Set the URL and key together |
| `UPLOAD_DIR` | Inspection | Where photo files are written; defaults to `data/uploads` |
| `WEB_ORIGIN` | Inspection | Comma-separated origins allowed by CORS; any origin when unset |
| `LOG_LEVEL` | Inspection | `debug`, `info`, `warn` or `error`; defaults to `info` |
| `VITE_API_URL` | Web (build time) | Origin of the API; empty for the page's own origin, which is the normal case |

Secrets never go in the web app or in Git. `.env` files are ignored by Git; `.env.example` files are templates.

## APIs

**Register service** — all under `/api/register`, all need a token.

| Method | Path | Role | Purpose |
| --- | --- | --- | --- |
| GET | `/projects` | any | List projects |
| POST | `/projects` | admin | Create a project |
| GET, PUT | `/projects/{id}` | any, admin | Read, update or deactivate a project |
| GET | `/projects/{id}/systems` | any | List a project's systems |
| POST | `/projects/{id}/systems` | admin | Add a system |
| GET, PUT | `/projects/{id}/systems/{systemId}` | any, admin | Read, update or deactivate a system |
| GET | `/snapshot` | any | Active projects with their active systems, for offline download |

There is no DELETE. Errors are `{ "error": "..." }`; validation errors add a `fields` object.

**Inspection service**

| Method | Path | Role | Purpose |
| --- | --- | --- | --- |
| POST | `/api/auth/login` | — | Sign in; returns a token |
| GET | `/api/inspections` | any | List records, most recently updated first |
| POST | `/api/inspections` | admin, inspector | Create a record. With a `clientId`, repeating the request returns the stored record |
| GET, PUT | `/api/inspections/{id}` | any; admin, inspector | Read or update a record |
| DELETE | `/api/inspections/{id}` | admin | Delete a record |
| POST | `/api/inspections/{id}/photos` | admin, inspector | Upload photos (JPEG, PNG, WebP; 10 MB each) |
| DELETE | `/api/inspections/{id}/photos/{index}` | admin, inspector | Remove a photo |
| POST | `/api/inspections/{id}/ai-summary` | admin, inspector | Request an AI draft |

Interactive documentation: `/swagger-ui.html` on the register service (local, dev and test profiles) and
`/api-docs` on the inspection service.

## Testing

| Suite | Command | Needs |
| --- | --- | --- |
| Register service | `mvn clean verify` in `apps/register-api` | Docker running; the tests start and remove their own PostgreSQL container |
| Inspection service | `npm test` in `apps/inspection-api` | `TEST_DATABASE_URL` in `.env` |
| Web app | `npm test` in `apps/inspection-web` | Nothing |
| End-to-end | `npm install && npx playwright install && npm test` in `e2e` | A local PostgreSQL; JDK and Maven |

What each level covers:

- **Unit** — one piece of logic with test doubles around it: the register's rules, the inspection
  service's rules, the sync engine, the React screens. The web app's SQLite stores are tested against the
  same SQLite WebAssembly build the browser runs, with an in-memory database.
- **Integration** — one service with its real HTTP layer and database: every register endpoint with role
  checks and migrations, against a real PostgreSQL started by Testcontainers; the inspection API; the
  PostgreSQL store against a real PostgreSQL.
- **End-to-end** — the web app and both services together in a real browser, with nothing stubbed between
  them. Playwright starts the register service, the inspection service, the dev server and the built app
  by itself. An `offline` project runs the offline tests against the built app in Chromium, switching the
  network off mid-test.

`mvn verify` also runs Checkstyle, PMD and SpotBugs, and fails the build on any finding.

The end-to-end run keeps its data in schemas of its own, `register_e2e` and `inspection_e2e`, so it never
mixes with development data. It uses the PostgreSQL in `E2E_DATABASE_URL`, or `TEST_DATABASE_URL`, or the
local Supabase default.

Every acceptance criterion in [docs/03-slice-spec.md](docs/03-slice-spec.md) has a label such as `AC-6.2`,
and the tests that prove it carry that label in their names. Tests were written and approved before the
code; see [AGENTS.md](AGENTS.md) for the rule.

## Deployment

The pipeline deploys three images to a single-node Kubernetes cluster on a VM: the register service,
the inspection service and the web app. Everything runs in the `passive-fire` namespace.

### What you must configure

In each GitHub Environment you deploy to (`development`, `staging`, `production`):

| Name | Kind | Purpose |
| --- | --- | --- |
| `K8S_VM_IP`, `K8S_VM_USER`, `K8S_VM_KEY` | Secret | SSH access to the VM |
| `K8S_GHCR_USERNAME`, `K8S_GHCR_TOKEN` | Secret | Image pull from GHCR; the token needs `read:packages` |
| `REGISTER_DATABASE_URL`, `REGISTER_DATABASE_USERNAME`, `REGISTER_DATABASE_PASSWORD` | Secret | The register's PostgreSQL, as a JDBC URL such as `jdbc:postgresql://<host>:5432/postgres?sslmode=require` |
| `INSPECTION_DATABASE_URL` | Secret | The inspection service's PostgreSQL connection string |
| `JWT_SECRET` | Secret | Token signing secret shared by both services, at least 32 bytes |
| `INSPECTION_AI_API_KEY`, `INSPECTION_AI_PROVIDER_URL`, `INSPECTION_AI_MODEL` | Secret | Optional Gemini settings |
| `GRAFANA_ADMIN_PASSWORD` | Secret | Grafana administrator password |
| `PUBLIC_HOSTNAME` | Variable | Optional. The hostname to serve over HTTPS; see below |

The deploy script stops with a message naming the setting if a required one is missing. Both services can
use the same Supabase project: the register uses the `register` schema and the inspection service the
`inspection` schema, and each creates its own.

### HTTPS

Installing the app and using it offline need HTTPS. Without it everything else still works.

Set the `PUBLIC_HOSTNAME` environment variable and the deployment adds a Caddy proxy that listens on ports
80 and 443, obtains a Let's Encrypt certificate for that hostname and renews it by itself. Before deploying:

1. Give the VM a hostname that resolves to its public IP. On Azure, set a **DNS name label** on the public
   IP address to get `<label>.<region>.cloudapp.azure.com` at no cost; or point your own domain at it.
2. Open TCP ports `80` and `443` in the Network Security Group and any host firewall.
3. Set `PUBLIC_HOSTNAME` to that hostname, with no scheme, port or path.

The app is then at `https://<PUBLIC_HOSTNAME>`. Certificates are kept on the VM under
`/var/lib/passive-fire/caddy-data`, so restarts do not request new ones.

Without `PUBLIC_HOSTNAME` the gateway is skipped and the web app is at `http://<K8S_VM_IP>:30173`.

### Ports

| Port | What |
| --- | --- |
| `80`, `443` | Web app over HTTPS, when `PUBLIC_HOSTNAME` is set |
| `30173` | Web app over plain HTTP |
| `30090`, `30030` | Prometheus and Grafana; restrict these to trusted networks |

Neither service is exposed directly; both are reached only through the web app's Nginx.

### The cluster

Kubernetes nodes use **containerd**; do not install Docker on the Kubernetes server. On a new Ubuntu VM
the deploy script installs kubeadm, kubelet, kubectl and Flannel and initialises a single-node cluster by
itself, provided the SSH user has passwordless `sudo`. To do it by hand:

```bash
sudo bash scripts/install-kubernetes-ubuntu.sh --init-control-plane
kubectl get nodes
```

Photo files are kept on the VM under `/var/lib/passive-fire/inspection-data`. Inspection records are in
PostgreSQL, not on the VM.

To deploy by hand, export the same settings as environment variables and run:

```bash
bash scripts/deploy-kubernetes.sh /home/<user>/app \
  ghcr.io/<owner>/<repo>-register-api:sha-<commit> prod \
  ghcr.io/<owner>/<repo>-inspection-api:sha-<commit> \
  ghcr.io/<owner>/<repo>-inspection-web:sha-<commit>
```

### Docker Compose, on one machine

These are local shortcuts, not a deployment target.

- `deployment/compose/local.yml` builds and runs the whole system in containers: PostgreSQL, the register
  service, the inspection service and the web app. It needs only `JWT_SECRET`:

  ```bash
  JWT_SECRET=<at least 32 characters> docker compose -f deployment/compose/local.yml up --build
  ```

  The app is then at http://localhost:8081, and because it is the built app on `localhost`, offline mode
  works there.
- `deployment/compose/monitoring.yml` runs Prometheus and Grafana against a register service on port 8080
  of the same machine. It needs `GRAFANA_ADMIN_PASSWORD`.

### Recommended hardware

| Usage | CPU | Memory | Storage |
| --- | --- | --- | --- |
| Minimum | 2 vCPU | 4 GB | 30 GB SSD |
| Comfortable | 4 vCPU | 8 GB | 80 GB SSD |

## GitHub Actions CI/CD

Build and test logic is defined once as reusable workflows and called by the trigger workflows.

| File | Trigger | Responsibility |
| --- | --- | --- |
| `ci-pr.yml` | Pull request to `staging` or `main` | Tests only. Never publishes or deploys |
| `ci-branch.yml` | Push to `dev`, `staging`, `main`; manual | Tests, publishes the three images, then deploys that exact tag |
| `cd-deploy.yml` | Tag `v*.*.*`; manual | Deploys images that already exist. Never rebuilds |
| `cron-security-scan.yml` | Nightly; manual | `npm audit` per app and a Trivy scan of the published images |
| `_reusable-ci-register-api.yml` | Called | `mvn verify` in `apps/register-api`: tests, Checkstyle, PMD, SpotBugs |
| `_reusable-ci-inspection.yml` | Called | TypeScript builds, unit tests with a PostgreSQL container, Playwright end-to-end tests |
| `_reusable-build-images.yml` | Called | Buildx build and GHCR push under an immutable `sha-<commit>` tag |
| `_reusable-deploy.yml` | Called | Kubernetes deployment over SSH, behind an environment gate |

| Event | Branch | GitHub Environment | Behaviour |
| --- | --- | --- | --- |
| Pull request | targets `staging`, `main` | none | Validate only |
| Push | `dev` | `development` | Validate, publish, deploy |
| Push | `staging` | `staging` | Validate, publish, deploy |
| Push | `main` | `production` | Validate, publish, wait for approval, deploy |
| Tag `v*.*.*` | — | `production` | Deploy the existing images of the tagged commit |

### Conventions the workflows follow

**Naming**

- Files are lowercase kebab-case with the `.yml` extension, prefixed by what starts them: `ci-` for
  validation and branch builds, `cd-` for deployments of existing images, `cron-` for scheduled work.
- Reusable workflows (`on: workflow_call`) start with `_reusable-`, so they sort apart from the workflows
  that have triggers of their own.
- Workflow names mirror the file name (`CI - Pull Request`, `CD - Deploy`). Trigger workflows set a
  `run-name` with the branch or pull request and the person, so the Actions tab can be scanned.
- Job ids are kebab-case (`build-images`, `e2e-test`); job and step names are sentences that start with a
  verb. Inputs and outputs are snake_case.
- Secrets and variables are SCREAMING_SNAKE_CASE, prefixed by what they belong to (`K8S_`, `REGISTER_`,
  `INSPECTION_`); `JWT_SECRET` has no prefix because both services share it.

**Structure**

- Each kind of work is defined once in a reusable workflow; trigger workflows only decide when it runs
  and with which inputs.
- Images are built once per commit and deployed by tag, so what passed the tests is what ships.
- Every job has a timeout. Every workflow has a concurrency group: superseded pull request runs are
  cancelled, builds and deployments are never cancelled midway.

**Caching**

- Maven and npm dependencies are cached by lock file through `setup-java` and `setup-node`.
- Image layers are cached per image with the Buildx GitHub Actions cache.
- Playwright browsers are cached by Playwright version.

**Security**

- Actions are pinned to commit SHAs; Dependabot bumps them with the Maven, npm and Docker dependencies.
- Every workflow starts from `contents: read` and adds only what a job needs.
- Deployment secrets live in GitHub Environments; `production` waits for approval.
- Pull requests from forks reach no secret.

## Monitoring

The Kubernetes deployment includes Prometheus (NodePort `30090`) and Grafana (NodePort `30030`), with a
provisioned dashboard for the register service: request rate, error ratio, p95 latency, JVM heap, CPU and
threads. Prometheus scrapes `register-api:8080/actuator/prometheus` inside the cluster and has alert rules
for an unavailable target, a high 5xx rate and high heap usage. There is no Alertmanager.

The health and metrics endpoints of the register service need no token, and are reachable only inside
the cluster. The inspection service logs one JSON object per line.

## Troubleshooting

**The register service stops with "Missing database settings".**
Outside the `local` and `test` profiles it needs `REGISTER_DATABASE_URL`, `REGISTER_DATABASE_USERNAME` and
`REGISTER_DATABASE_PASSWORD`. Locally, run without a profile, or fill in `.env`.

**The register service stops locally with "Connection to 127.0.0.1:54322 refused".**
The `local` profile expects the local Supabase stack. Start it with `supabase start`, or point
`REGISTER_DATABASE_*` in `.env` at another PostgreSQL.

**`docker compose ... up --build` fails with "additional privileges requested" or "failed to execute bake".**
Newer Docker versions ask for permission to read build folders outside the folder holding the compose file,
and a non-interactive shell cannot answer. Set `BUILDX_BAKE_ENTITLEMENTS_FS=0` for that command.

**`mvn verify` fails with "Could not find a valid Docker environment".**
The register tests start a PostgreSQL container. Start Docker and run the build again.

**The register service stops with "JWT_SECRET is not set" or "too short".**
It must be at least 32 bytes, and the same value the inspection service uses.

**The inspection service stops with "DATABASE_URL is not set".**
Create `apps/inspection-api/.env` from `.env.example` and point it at a running PostgreSQL.

**`npm test` in `apps/inspection-api` fails with "TEST_DATABASE_URL is not set".**
The store tests need a real PostgreSQL. They create and drop their own schema and touch nothing else.

**Signing in works, but the Register screen says "Invalid or expired token".**
The two services are using different `JWT_SECRET` values.

**Creating a record answers 503 "The register service is unavailable".**
The inspection service cannot reach the register service. Check `REGISTER_SERVICE_URL` and that the
register service is running.

**There is no "Download for offline" button.**
The browser could not open the device database. The usual cause is a second tab of the app: offline use
works in one tab at a time. Some browsers do not support it; the browser console says why.

**The app does not reopen with the network off.**
You are on the dev server, or on plain HTTP. Use the built app on `localhost`, or HTTPS.

**The HTTPS gateway does not get a certificate.**
The hostname must resolve to the VM and ports 80 and 443 must be reachable from the internet. Check with
`kubectl -n passive-fire logs deployment/web-gateway`.

**A hosted Supabase project stops answering.**
Free projects pause after a period of inactivity; resume the project in the Supabase dashboard.

**`ImagePullBackOff`.**
Check that the `ghcr-credentials` secret exists in the namespace, that the token has `read:packages`, and
that the image tag exists.

**A pod does not become ready.**

```bash
kubectl -n passive-fire get pods
kubectl -n passive-fire describe pod -l app=register-api
kubectl -n passive-fire logs -l app=register-api --tail=200
kubectl -n passive-fire logs -l app=inspection-api --tail=200
```

**Photo uploads fail with `EACCES` on the VM.**
The inspection pod's init container aligns the ownership of the photo directory on every start. To repair
a running pod, run `sudo chown -R 1000:1000 /var/lib/passive-fire/inspection-data` on the node.

## Design documents

1. [docs/01-business-logic.md](docs/01-business-logic.md) — who uses it, the workflow, the rules, and the
   evidence behind the model.
2. [docs/02-system-design.md](docs/02-system-design.md) — architecture, data model, APIs, the offline
   design, risks.
3. [docs/03-slice-spec.md](docs/03-slice-spec.md) — the build broken into slices, each with labelled
   acceptance criteria.
