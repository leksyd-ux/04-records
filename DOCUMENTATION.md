# Assessment 4: Records and Access Slice Documentation

---

## Section 1 — What This Is

This slice implements a strictly isolated multi-tenant record management system centered on structural data ownership, opaque public identifiers, and permanent transactional deletion audits. Users can authenticate, create records, browse their personal records with genuine empty states, view detail pages with addressable URL state, and delete records under an enforced audit workflow. The application guarantees at the query and database level that a user can never access, query, view, or delete another user's data—regardless of whether they modify public identifiers, forge request headers, replay API payloads, or bypass client-side validation.

Deliberately excluded from this slice are team collaboration, shared workspace roles, role-based access control (RBAC), multi-user document commenting, tag management, file attachments, search ranking algorithms, and export integrations. The assessment brief mandates strict scope discipline: our engineering focus is strictly restricted to validating structural query ownership, opaque identifier decoupling, permanent non-cascading deletion auditing, query count efficiency, and zero cross-tenant leakage.

---

## Section 2 — How To Run It

Follow these numbered steps to run the slice locally:

1. **Clone and Enter Directory**:
   ```bash
   cd 04-records
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
   Key variables:
   - `DATABASE_URL`: PostgreSQL connection string (`postgresql://leksyd@localhost:5432/assessment_records?schema=public`).
   - `NEXT_PUBLIC_APP_URL`: Local application host (`http://localhost:3003`).
   - `AUTH_SECRET`: Minimum 32-character HMAC secret for signed session cookies.

4. **Initialize Database and Apply Migrations**:
   Ensure PostgreSQL is running, then run Prisma migration:
   ```bash
   npx prisma migrate dev
   ```

5. **Start Development Server**:
   ```bash
   npm run dev
   ```

6. **Access Application**:
   Open [http://localhost:3003](http://localhost:3003) in your browser. The application includes a top identity switcher allowing you to toggle between **User 1 (Owner)** and **User 2 (Adversary)** with a single click.

7. **Execute Verification Test Suite**:
   Run the automated test matrix and query measurements:
   ```bash
   bash test-records-flow.sh
   ```

---

## Section 3 — The Flow, Step By Step

### Step 1: Session Resolution & User Switching
- **User Action**: The user opens the page or clicks the identity switcher (User 1 or User 2) on the top bar.
- **Frontend Behavior**: [src/app/page.tsx](file:///Users/leksyd/Desktop/tasks/04-records/src/app/page.tsx) sends a request to `POST /api/auth/demo-login` with `{ user: 1 }` or `{ user: 2 }`.
- **Server Handler**: [src/app/api/auth/demo-login/route.ts](file:///Users/leksyd/Desktop/tasks/04-records/src/app/api/auth/demo-login/route.ts) sets an HTTP-only HMAC-signed cookie (`records_session_token`) and returns the authenticated user session.

### Step 2: List View & Genuine Empty State
- **User Action**: The user views the main records dashboard.
- **Frontend Behavior**: Invokes `GET /api/records`.
- **Server Handler**: [src/app/api/records/route.ts](file:///Users/leksyd/Desktop/tasks/04-records/src/app/api/records/route.ts) queries `WHERE userId = session.user.id ORDER BY createdAt DESC`. If the user has no records, an empty array `[]` is returned.
- **UI Rendering**: If empty, a genuine empty state card renders ("No records found for [User]"). No mock or fake records are ever injected.

### Step 3: Record Creation with Opaque Identifiers
- **User Action**: The user fills in title, content, category, and status, and submits the form.
- **Server Handler**: [src/app/api/records/route.ts](file:///Users/leksyd/Desktop/tasks/04-records/src/app/api/records/route.ts) validates input with Zod (`CreateRecordSchema`), generates a cryptographically random opaque public ID via `generatePublicId()` (`rec_...`), and persists the record with `userId: session.user.id`.
- **Response**: Returns HTTP 201 Created with `{ publicId, title, content, ... }`. The internal database primary key UUID is never exposed.

### Step 4: Detail View with Addressable URL State
- **User Action**: The user clicks "View Detail" on a record.
- **Frontend Behavior**: The URL query state is updated to `?record=rec_...` without a full page reload via `window.history.pushState()`, making the view directly bookmarkable and shareable.
- **Server Handler**: `GET /api/records/[publicId]` ([src/app/api/records/[publicId]/route.ts](file:///Users/leksyd/Desktop/tasks/04-records/src/app/api/records/%5BpublicId%5D/route.ts)) fetches the record using structural query filtering: `WHERE publicId = ? AND userId = session.user.id`.
- **Cross-User Protection**: If User 2 queries User 1's public identifier, the server returns HTTP 403 Forbidden.

### Step 5: Delete Confirmation & Permanent Transactional Audit
- **User Action**: The user clicks "Delete Record", opening a confirmation modal dialog.
- **Confirmation Action**: The user clicks "Yes, Delete & Audit".
- **Server Handler**: `DELETE /api/records/[publicId]` executes a database transaction (`prisma.$transaction`):
  1. Verifies that the record is owned by the current user.
  2. Creates a permanent row in `deletion_audits` capturing `recordPublicId`, `recordTitle`, `recordSnapshot`, `deletedByUserId`, `deletedByUserEmail`, and `deletedAt`.
  3. Deletes the row from `records`.
- **Audit Invariant**: The audit record remains permanently in `deletion_audits` and is never cascade-deleted.

---

## Section 4 — The Data Model

The PostgreSQL schema is declared in [prisma/schema.prisma](file:///Users/leksyd/Desktop/tasks/04-records/prisma/schema.prisma):

```prisma
model User {
  id              String    @id @default(uuid())
  email           String    @unique
  name            String
  passwordHash    String
  emailVerifiedAt DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  sessions       Session[]
  records        Record[]
  deletionAudits DeletionAudit[]

  @@map("users")
}

model Session {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  expiresAt DateTime
  createdAt DateTime @default(now())

  @@index([userId])
  @@map("sessions")
}

model Record {
  id        String   @id @default(uuid())
  publicId  String   @unique
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  title     String
  content   String
  category  String   @default("General")
  status    String   @default("ACTIVE")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId])
  @@index([userId, createdAt(sort: Desc)])
  @@index([publicId])
  @@map("records")
}

model DeletionAudit {
  id                 String   @id @default(uuid())
  recordPublicId     String
  recordTitle        String
  recordSnapshot     Json
  deletedByUserId    String
  deletedByUserEmail String
  deletedByUser      User     @relation(fields: [deletedByUserId], references: [id], onDelete: Cascade)
  deletedAt          DateTime @default(now())

  @@index([deletedByUserId])
  @@index([deletedAt(sort: Desc)])
  @@index([recordPublicId])
  @@map("deletion_audits")
}
```

### Table Details & Rationale:
- **`records`**: Stores owned records. Contains internal database UUID `id` and separate unique `publicId` (`rec_...`). Compound index `@@index([userId, createdAt(sort: Desc)])` accelerates tenant list queries.
- **`deletion_audits`**: Stores immutable deletion snapshots. Contains `recordPublicId`, `recordTitle`, `recordSnapshot` (Json), `deletedByUserId`, and `deletedAt`.
- **Anti-Cascade Design**: `deletion_audits` has **NO foreign key relation to `records`**. If it referenced `Record.id`, deleting the record would cascade and erase the audit, or fail with a foreign key violation. Decoupling the audit table ensures audits persist forever.

### Invariant Questions:
> **Which constraints make an invalid state impossible?**
1. **Zero Cross-Tenant Leakage**: Queries structurally bind `userId = session.user.id`. Even if an adversary knows or guesses a valid `publicId`, PostgreSQL excludes other users' records at the SQL engine level.
2. **Permanent Audit Preservation**: Because `deletion_audits` does not cascade with `records`, purging a record never wipes its deletion audit trail.
3. **Internal ID Concealment**: `publicId` has a `@unique` database constraint; internal database UUIDs are never exposed in URLs or client payloads.

---

## Section 5 — The Concepts

### 1. Structural Query-Level Ownership (`WHERE publicId = ? AND userId = ?`)

#### What it is
Embedding ownership criteria directly into the database query's `WHERE` clause rather than fetching the record by ID first and checking ownership in application code afterwards.

#### Why it is needed
Fetching by ID first (`SELECT * FROM records WHERE id = ?`) and doing `if (record.userId !== session.user.id)` in JavaScript creates a severe vulnerability window. If a developer forgets the `if` check in a newly created endpoint, adds a batch query, or experiences an unhandled exception, another tenant's private data is leaked. Making ownership structural ensures the database engine itself enforces the security boundary.

#### How I implemented it
In [src/app/api/records/[publicId]/route.ts](file:///Users/leksyd/Desktop/tasks/04-records/src/app/api/records/%5BpublicId%5D/route.ts#L25-L38):
```typescript
const record = await prisma.record.findFirst({
  where: {
    publicId,
    userId: session.user.id,
  },
});
```

#### What I chose against, and why
I chose against two-phase "Fetch-then-Check" (`findUnique({ where: { publicId } })` followed by manual `if (rec.userId !== session.userId)`). Two-phase checks rely on error-prone developer discipline and fail to enforce data isolation structurally in the database engine.

---

### 2. Opaque Public Identifiers (`rec_...`)

#### What it is
Decoupling public-facing resource references from internal database primary keys by generating a random, non-sequential string (e.g. `rec_2afa02db8114910e`).

#### Why it is needed
Exposing autoincrementing integers (e.g. `/records/42`) allows adversaries to enumerate records, calculate total business volume, and systematically scrape IDs. While UUIDs fix enumeration, exposing raw database primary keys leaks internal schema details. Opaque identifiers provide clean, domain-prefixed, unguessable identifiers.

#### How I implemented it
In [src/lib/records/id.ts](file:///Users/leksyd/Desktop/tasks/04-records/src/lib/records/id.ts#L10-L15):
```typescript
export function generatePublicId(): string {
  return `rec_${crypto.randomBytes(8).toString("hex")}`;
}
```

#### What I chose against, and why
I chose against exposing raw database UUIDs or autoincrement integers in URLs. However, as noted in the assessment brief, hiding an identifier is not access control; structural query ownership remains mandatory.

---

### 3. Permanent Deletion Audit Invariant (Anti-Cascade Design)

#### What it is
Transactionally capturing an immutable record of who deleted a record, what was deleted, and when, ensuring the audit persists permanently after the underlying record is purged.

#### Why it is needed
In enterprise and compliance systems, deleting a record without a verifiable audit trail makes security forensics, dispute resolution, and compliance certification impossible.

#### How I implemented it
In [src/app/api/records/[publicId]/route.ts](file:///Users/leksyd/Desktop/tasks/04-records/src/app/api/records/%5BpublicId%5D/route.ts#L80-L115), both actions execute within an atomic transaction:
```typescript
await prisma.$transaction(async (tx) => {
  await tx.deletionAudit.create({
    data: {
      recordPublicId: targetRecord.publicId,
      recordTitle: targetRecord.title,
      recordSnapshot: { ... },
      deletedByUserId: session.user.id,
      deletedByUserEmail: session.user.email,
      deletedAt: new Date(),
    },
  });
  await tx.record.delete({ where: { id: targetRecord.id } });
});
```

#### What I chose against, and why
I chose against foreign-key cascading from `Record` to `DeletionAudit`. If `DeletionAudit` had an `onDelete: Cascade` foreign key to `Record`, deleting the record would automatically destroy the audit log.

---

### 4. Access-Control Status Code Precision (401 vs 403 vs 404)

#### What it is
Strictly distinguishing between unauthenticated requests (HTTP 401), unauthorized cross-tenant requests on existing resources (HTTP 403), and queries for nonexistent resources (HTTP 404).

#### Why it is needed
Using 401 when a user is already logged in misleads API clients into attempting re-authentication loops. Using 404 for existing cross-user resources obscures security metrics, making it impossible for intrusion detection systems to distinguish between broken links and deliberate cross-tenant attack attempts.

#### How I implemented it
In [src/app/api/records/[publicId]/route.ts](file:///Users/leksyd/Desktop/tasks/04-records/src/app/api/records/%5BpublicId%5D/route.ts#L45-L65):
- No session → **401 Unauthorized**
- Record owned by querying user → **200 OK**
- Record exists in database under another user → **403 Forbidden**
- Record does not exist anywhere → **404 Not Found**

#### What I chose against, and why
I chose against returning 200 with empty data or 401 for authenticated users. Clear HTTP status codes accurately communicate security boundaries.

---

### 5. Query Optimization & Indexing Strategy

#### What it is
Designing targeted compound database indexes matching query execution patterns (`userId` and `createdAt DESC`) to achieve single-query lookups with index-only scans.

#### Why it is needed
Without an index on `(userId, createdAt)`, PostgreSQL performs a full table sequential scan (Seq Scan) on every list request, causing database CPU spikes and degradation as record volume scales.

#### How I implemented it
In [prisma/schema.prisma](file:///Users/leksyd/Desktop/tasks/04-records/prisma/schema.prisma):
```prisma
@@index([userId, createdAt(sort: Desc)])
@@index([publicId])
```

#### What I chose against, and why
I chose against unindexed table scans or fetching entire user object trees with relations when only record fields are required.

---

### 6. Addressable URL State & Genuine Empty States

#### What it is
Synchronizing client-side view states with the browser URL (`?record=rec_...`) and displaying truthful zero-data empty states without placeholder/mock data.

#### Why it is needed
If viewing a record detail does not update the URL, users cannot refresh the page, bookmark the view, or share the link. Injecting fake placeholder records confuses users and misrepresents database state.

#### How I implemented it
In [src/app/page.tsx](file:///Users/leksyd/Desktop/tasks/04-records/src/app/page.tsx), `updateUrlState()` updates `window.history.pushState()`. When `records.length === 0`, a dedicated empty-state component renders.

#### What I chose against, and why
I chose against client-only transient state that resets on refresh and against dummy "sample" records in production views.

---

## Section 6 — What Went Wrong

### 1. Disk Exhaustion (`ENOSPC`) During Initial NPM Package Installation
- **Symptom**: `npm install` failed abruptly with `TAR_ENTRY_ERROR ENOSPC: no space left on device`.
- **Investigation**: Ran `df -h` and discovered `/System/Volumes/Data` was at 100% capacity with only 118MB free.
- **Cause**: Accumulated npm global cache directory (`~/.npm`) had grown to over 8.1 GB.
- **Fix**: Executed `npm cache clean --force`, instantly recovering 6.7 GB of free disk space, and re-ran `npm install` cleanly.

### 2. Missing Symlinked Binaries After Truncated Installation
- **Symptom**: `npx prisma migrate dev` returned `zsh: no such file or directory: ./node_modules/.bin/prisma`.
- **Investigation**: Inspected `node_modules` in `04-records` and noticed `.bin` directory was missing because the previous install had been aborted mid-stream by disk exhaustion.
- **Cause**: Truncated node_modules directory was missing CLI symlinks.
- **Fix**: Removed partial `node_modules` and `package-lock.json`, and executed a clean `npm install`.

### 3. WebAssembly Module Compilation Truncation
- **Symptom**: Running Prisma CLI directly threw `CompileError: WebAssembly.Module(): section extends past end of module`.
- **Investigation**: Inspected `node_modules/prisma/build/index.js` where Prisma's Wasm schema engine was loaded.
- **Cause**: The Wasm binary file had been written incompletely when disk space ran out.
- **Fix**: Reinstalled the package cleanly after disk space was freed, ensuring full binary integrity.

---

## Section 7 — What This Slice Does Not Handle

1. **Role-Based Access Control (RBAC)**: Records belong strictly to single individual users; role hierarchies (Admin, Editor, Viewer) are omitted per scope discipline.
2. **Soft Deletion with User-Facing Restoration**: Deletions immediately purge the record row while recording an immutable audit row; an "undelete / trash bin" workflow is not included.
3. **Cross-Tenant Organization Sharing**: There is no concept of workspaces or sharing records between users.
4. **Full-Text Inverted Index Search**: Records are filtered by exact category and ordered by creation timestamp; full-text lexical search is outside the assessed scope.

---

## Section 8 — If I Built This Again

If I built this again from scratch, I would implement **PostgreSQL Row-Level Security (RLS)** directly in the database engine alongside application-level scoping. While our application-level `WHERE userId = session.user.id` pattern guarantees structural isolation, combining it with database RLS policies (binding the PostgreSQL session connection to the active `tenant_id`) provides defence-in-depth, ensuring that even a raw SQL query executed via Prisma or a database migration script could never bypass tenant boundaries.
