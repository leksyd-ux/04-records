# LinkedIn Post — Slice 4: Records, Access Control & Anti-Cascade Auditing

Most web applications get multi-tenancy wrong in one subtle way: they query a record by ID first, and then check `if (record.userId !== currentUser.id)` in application code.

That two-phase check is an accident waiting to happen. Forget the check in one endpoint, and you’ve leaked another user’s private data.

For **Assessment 4 of my Bootcamp (Records and Access Slice)**, I built a zero-leakage record management system focusing on structural data isolation, opaque identifiers, and permanent deletion auditing.

Here are the key takeaways:

### 1. Structural Query-Level Ownership
Never fetch first and check later. Ownership must be embedded directly inside the SQL query:
`WHERE public_id = ? AND user_id = ?`

By scoping the query structurally, PostgreSQL enforces tenant isolation at the query execution level. Even if an adversary modifies request parameters, replays payloads, or guesses IDs, other users' records do not exist from the query planner's perspective.

### 2. Opaque Public Identifiers (`rec_...`)
Internal database primary keys (UUIDs or autoincrement integers) should never be exposed in URLs or client payloads. We generate cryptographically random, domain-prefixed identifiers (`rec_a8f9c1e2...`) to prevent enumeration attacks and decouple public routing from internal table design.

### 3. Anti-Cascade Deletion Auditing
When an enterprise user deletes a record, compliance rules require capturing **who** deleted it, **what** was deleted, and **when**.

The trap? Creating a foreign-key relationship between the record and the audit log. If you do that with `ON DELETE CASCADE`, deleting the record automatically wipes the audit log! By transactionally inserting an independent audit snapshot before purging the underlying record, the audit log remains permanent forever.

### The Access-Control Matrix
We verified cross-tenant isolation against adversarial tests:
- User 2 attempting to view User 1's records → **403 Forbidden**
- Forged identifiers → **404 Not Found**
- Unauthenticated requests → **401 Unauthorized**
- Zero cross-tenant leakage in lists (genuine empty states).

Building secure multi-tenant architectures requires making security structural rather than situational.

How do you enforce tenant boundaries in your database queries?

#SoftwareEngineering #WebDevelopment #CyberSecurity #SystemDesign #Nextjs #TypeScript #PostgreSQL #Prisma
