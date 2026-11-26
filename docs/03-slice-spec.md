# Slice spec

Status: Slices 1 to 6 are built and their criteria have passing tests. Slice 7 is in place; its two
criteria are manual checks on a deployed environment. Slice 8 is specified and its tests are written;
it is not implemented until those tests are approved.
Related documents: [01-business-logic.md](./01-business-logic.md) (rules and terms)
and [02-system-design.md](./02-system-design.md) (architecture, data model, APIs).

Each slice leaves the system working and deployable. Build them in order; a
slice is done when every one of its acceptance criteria has a passing test in
CI.

## How every slice is built

Each acceptance criterion has a label such as `AC-3.2` (slice 3, criterion 2).
The label is the link between this spec, the tests and the review.

1. **Contracts first.** Add only what the tests need in order to compile:
   interfaces, request and response types, error types, empty method bodies.
2. **Tests before implementation.** Write the tests for every criterion in the
   slice. Each test's name or display name starts with the label of the
   criterion it proves, for example `AC-1.2 duplicate system code in the same
   project returns 409`. A criterion may have several tests; no criterion may
   have none.
3. **See them fail.** Run the tests and confirm each fails because the
   behaviour is missing, not because of a mistake in the test.
4. **Approval.** The project owner reviews the tests. They are committed on
   their own, separate from any implementation.
5. **Implement** until the approved tests pass, without touching them.

**Approved tests are frozen.** Without the project owner's explicit approval,
do not:

- edit, delete, rename, skip or disable an approved test;
- weaken an assertion, widen an expected value, or lengthen a timeout to make
  a test pass;
- change build, coverage or CI settings so that a test no longer runs or no
  longer counts;
- add logic to production code that recognises test inputs.

If an approved test looks wrong, stop, explain why, and wait for a decision.
An approved change to a test goes in its own commit with the reason in the
message. Adding new tests is always allowed.

A reviewer can check this rule with one command: the diff of the test
directories between the approved-tests commit and the slice's final commit
should contain additions only.

Criteria marked *(manual)* cannot be automated in this repository and are
checked by hand on the deployed environment.

## The end-to-end demo these slices add up to

1. Online, as admin: add system `SYS-05` to a project.
2. Online, as installer: press "Download for offline".
3. Switch the network off.
4. Offline: create a record, pick the project, type a location, pick `SYS-05`,
   attach one photo, write an AI instruction, save. It shows "Pending sync".
5. Switch the network on. The record syncs, and the AI draft appears labelled
   as requiring human review.
6. Optional: show the rows in both Supabase schemas.

## Slice 1: Register service (Java)

Projects and their approved firestop systems, stored in
Supabase PostgreSQL.

**In scope**

- `Project` and `FirestopSystem` entities, repositories, services, controllers
  under `/api/register`.
- Create, read, update, deactivate for both. No hard delete.
- A snapshot endpoint returning all active projects with their active systems.
- Flyway migrations, including fictional seed data for one project.
- Remove the `product` package and its tests; update Swagger metadata.

**Acceptance**

- **AC-1.1** An admin can create a project, add a system, edit it, and deactivate it
  through Swagger.
- **AC-1.2** Adding a second system with the same code to the same project returns 409.
- **AC-1.3** The same code in two different projects is accepted.
- **AC-1.4** Validation errors return 400 with a field-level message.
- **AC-1.5** *(manual)* Data survives a restart when pointed at Supabase.
- **AC-1.6** *(build gate, no test of its own)* `mvn clean verify` passes, including Checkstyle, PMD and SpotBugs.
- **AC-1.7** The snapshot returns every active project with its active systems
  and a generation time; inactive projects and inactive systems are left out.
- **AC-1.8** An unknown project or system id, or a system requested under a
  different project, returns 404 with an error message.
- **AC-1.9** A second project with an existing project code returns 409.

**Tests:** service unit tests for the uniqueness and deactivation rules;
MockMvc integration tests for each endpoint and error case.

**Not in this slice:** authentication (Slice 2), any Node or web change.

## Slice 2: Shared sign-in

The Java service accepts the JWT that the Node service already issues.

**In scope**

- Spring Security resource server validating the HS256 token with the shared
  `JWT_SECRET`.
- Role rules: all signed-in roles can read; only `ADMIN` can write.
- Health and metrics endpoints stay open.

**Acceptance**

- **AC-2.1** No token: 401. Installer or viewer token on a write: 403. Admin token on a
  write: success.
- **AC-2.2** A token issued by the Node login works against the Java service unchanged.
- **AC-2.3** Prometheus still scrapes `/actuator/prometheus`, and the health
  endpoints used by the Kubernetes probes stay open, without a token.
- **AC-2.4** The service rejects a signing secret that is missing, blank or
  shorter than 32 bytes, with a message that names `JWT_SECRET` and never
  contains the secret.
- **AC-2.5** An expired, unsigned, altered or wrongly signed token returns 401.

Error messages match the inspection service: 401 without a token is
"Authentication required", 401 with a bad token is "Invalid or expired token",
and 403 is "Insufficient permissions". A valid token whose role is missing or
unknown gets 403 on every register endpoint.

**Tests:** MockMvc tests for 401, 403 and success per role.

## Slice 3: Inspection service on PostgreSQL, linked to the register

Move the Node service off the JSON file and make it depend on the register.

**In scope**

- Replace `store.ts` with a PostgreSQL store in an `inspection` schema, with SQL
  migrations.
- Replace the `building` field with `projectId`; add `systemId`, the copied
  system details, `clientId`, `capturedAt`, `aiInstruction` and `aiStatus`.
- On create, and on any update that changes the project or system, call the
  register service to confirm the system exists, is active, and belongs to the
  project; copy its details onto the record.
- `clientId` makes create idempotent: a repeat with the same `clientId` returns
  the existing record.
- Update the seed record and Swagger schemas.

**Acceptance**

- **AC-3.1** Creating a record with a valid project and system returns 201 and the copied
  system details.
- **AC-3.2** An unknown or inactive system, or a system from another project, returns 422
  with a readable reason.
- **AC-3.3** If the register service is down or slow, create returns 503 and no record is
  stored.
- **AC-3.4** Posting the same `clientId` twice returns the same record and stores one row.
- **AC-3.5** Editing a system in the register afterwards does not change existing records.
- **AC-3.6** Records and photo references survive a restart. The schema is
  created and migrated on start, safely when several instances start at once.
- **AC-3.7** Invalid input (missing or malformed ids, blank location, unknown
  status, over-long notes, bad capture time or `clientId`) returns 400 with a
  message, without asking the register and without storing anything.
- **AC-3.8** Role rules are unchanged: no token gives 401; a viewer can read
  but not create or update; only an admin can delete; unknown records give 404.
- **AC-3.9** Requesting an AI draft stores the instruction and the draft and
  sets the AI status to `DONE`. If the provider fails, the answer is 502, the
  AI status is `FAILED`, and the rest of the record is untouched. A draft
  never changes the record's status.
- **AC-3.10** Photo upload, download and removal keep working, with the photo
  references stored on the record.

An update that keeps the same project and system does not call the register,
so records stay editable while the register is down. A repeated `clientId` is
answered from the stored record before the register is asked. The 422 reasons
are "Project not found", "Project is inactive", "Firestop system not found in
this project" and "Firestop system is inactive"; the 503 message is "The
register service is unavailable. Try again later."

**Tests:** API tests with the register call stubbed for the success, 404,
inactive, timeout and duplicate-`clientId` cases; store tests against a real
PostgreSQL in CI.

## Slice 4: Online web flow through the gateway

**In scope**

- Nginx routes `/api/register/` to the Java service and the rest of `/api/` to
  the Node service; the Vite dev proxy does the same.
- Admin page: list, add, edit and deactivate projects and systems.
- Inspection form: project picker and system picker replace the free-text
  building field; the picked system's details are shown read-only.
- AI instruction field on the form.

**Acceptance**

- **AC-4.1** An admin adds a system, and an installer sees it in the picker without a
  redeploy.
- **AC-4.2** Installer and viewer do not see admin controls, and the server refuses them
  even if called directly.
- **AC-4.3** The whole online flow (create, upload photo, AI draft, edit, print) works
  through one origin.

**Tests:** React component tests for the admin page and pickers; Playwright
test for admin-adds-system then installer-uses-it.

## Slice 5: Offline download

**In scope**

- Make the web app installable and able to start with no network (service
  worker caching the app shell).
- SQLite in the browser, holding downloaded projects and systems.
- "Download for offline" button, with the time of the last download shown.
- An online/offline indicator.

**Acceptance**

- **AC-5.1** After one download, with the network off, the app opens and the project and
  system pickers are populated from the device.
- **AC-5.2** Reloading the page while offline keeps the data.
- **AC-5.3** Downloading again replaces the local copy, including removing systems that
  were deactivated.
- **AC-5.4** Offline, pages that need the network say so plainly; they do not show a
  generic error.

The pickers read the register whenever it can be reached, and the device's
downloaded copy only when it cannot (no connection, or a 502, 503 or 504 from
the gateway). Other failures, such as an expired sign-in, are shown as errors
and never hidden behind the downloaded copy. When the downloaded copy is in
use, the form says so and shows when it was downloaded. A download that fails
leaves the earlier copy untouched.

**Tests:** unit tests for the local store; Playwright test using the browser's
offline mode.

## Slice 6: Offline capture and sync

**In scope**

- Create a record offline: project, location, system, notes, photos, AI
  instruction. Saved to SQLite with status "Pending sync".
- A sync queue that runs when the network returns, when the app starts, and
  from a "Sync now" button.
- Per record: create on the server, upload photos, request the AI draft. Each
  step is remembered, so a retry resumes where it stopped.
- Visible states per record: Pending sync, Syncing, Synced, Sync failed (with
  the reason and Retry / Discard).

**Acceptance**

- **AC-6.1** A record with one photo created offline appears on the server, with its photo
  and an AI draft, shortly after the network returns, with no user action.
- **AC-6.2** Cutting the network mid-sync and restoring it yields exactly one server
  record with each photo once.
- **AC-6.3** A record whose system was deactivated in the meantime ends in "Sync failed"
  with that reason, and stays on the device.
- **AC-6.4** An AI failure leaves the record synced, with the AI draft marked failed and
  a retry action.
- **AC-6.5** An expired sign-in at sync time prompts for sign-in and keeps the queue.
- **AC-6.6** The device time of capture is stored on the server record.

How a record is sent. Each run starts every waiting record from the create
step. The server stores at most one record per `clientId`, so repeating the
create returns the stored record, and its photo list and AI status say how far
an earlier run got. Photos are uploaded one per request, in order, and only the
ones the server does not have yet. This is what makes an interrupted run safe
to repeat.

How failures are sorted:

- **Unreachable** (no connection, or 502, 503 or 504): the record stays
  "Pending sync" and the run stops. The next run continues.
- **Sign-in rejected** (401): the run stops, a prompt asks the user to sign in
  again, and nothing in the queue changes.
- **Anything else the server answers** (for example 400, 403, 422, 500): the
  record becomes "Sync failed" with the server's message, and the run carries
  on with the next record. A failed record is sent again only when the user
  chooses Retry.
- **AI provider failure:** the record is "Synced" with the AI draft marked
  failed; the user retries the draft on the record. It is not retried
  automatically.

Other rules:

- A new record is saved on the device when the browser is offline, or when the
  save cannot reach the server. A record the server refuses while online is not
  saved on the device; the refusal is shown.
- Only new records can be captured offline. A record already on the server can
  be changed only while online.
- Only the signed-in user's records are sent. Records captured by someone else
  on the same device wait for that person's sign-in.
- Synced records stay listed on the device, without their photo files, until
  the user clears them.
- A "Sync failed" record can be retried or discarded, not edited.

**Tests:** unit tests for the queue state machine (success, network failure,
rejection, resume); Playwright test for the full demo script above.

## Slice 7: Delivery and documentation

**In scope**

- CI: updated Java and Node jobs; PostgreSQL available to the Node store tests.
- Kubernetes: database and register-URL secrets and environment variables;
  remove the inspection JSON data from the volume's purpose (photos remain).
- HTTPS for the deployed web app, which offline mode requires (see
  02-system-design.md, "Risks").
- Grafana dashboard and Prometheus job names if the service is renamed.
- README rewrite: one system, service responsibilities, architecture diagram,
  demo script, known simplifications. The Chinese README was removed, so that the repository has one
  accurate README.

**Acceptance**

- **AC-7.1** *(manual)* A push to `dev` builds, tests, publishes and deploys all three images, and
  the demo script works on the deployed environment.
- **AC-7.2** *(manual)* The README's description matches what is implemented and tested.

## Slice 8: Screens that stay usable as the lists grow

**In scope**

- Register screen: the forms move out of the page into dialogs opened from a button in each panel's
  heading, so that adding never depends on scrolling past a list. This replaces the in-page forms of
  slice 4; the wording of the fields and of the submit buttons does not change.
- Register screen: search the project list, hide inactive projects by default, and edit a project's
  code, name and address.
- Inspections screen: search the list, filter it by status, and show it a page at a time.
- Searching, filtering and paging work on the list the browser has already loaded. Asking the services
  for one page at a time is out of scope.

**Acceptance**

- **AC-8.1** The project form is shown only in a "New project" dialog. Adding a project closes the
  dialog and opens the new project; Cancel closes it and adds nothing; a refusal from the register
  keeps the dialog open with the register's messages and what was typed.
- **AC-8.2** The system form is shown only in a dialog: "New system" opens it empty, Edit opens it
  filled in. Saving closes it and the list shows the result; Cancel closes it and changes nothing; a
  refusal keeps it open with the register's messages and what was typed.
- **AC-8.3** The project list can be searched by code or name, in any letter case. Inactive projects
  are listed only while "Show inactive" is ticked, except the project that is open, which stays
  listed. When nothing matches, the list says so.
- **AC-8.4** An admin can change a project's code, name and address in a dialog. The project keeps
  its active state. A refusal keeps the dialog open with the register's messages.
- **AC-8.5** Opening a register dialog moves the keyboard focus to its first field, and Escape closes
  it without saving.
- **AC-8.6** The inspections list can be searched by project name or location, in any letter case,
  and filtered by status. While it is narrowed it says how many of the records are shown, and says so
  when nothing matches. The count tiles always count every record.
- **AC-8.7** The inspections list shows 25 records a page, with Previous and Next and the page
  number. Narrowing the list returns to the first page. A list that fits on one page shows no pager.

**Tests:** React component tests for the register dialogs, the project list and the inspections
list. The existing tests of slice 4 that filled the in-page forms gain the step that opens the dialog.

## Out of scope for all slices

Label numbers, photo stages, floor-plan marking, work areas, supervisor review
and defects, register export, offline editing of existing records, offline
sign-in, multi-tenant data separation, and any automatic compliance result.
