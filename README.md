# Assessment 4 — Records and Access Slice

Production-grade record management and strict access-control system built with Next.js (App Router), TypeScript, PostgreSQL, and Prisma ORM.

## Core Features
- **Structural Query-Level Ownership**: All queries and mutations bind `WHERE publicId = ? AND userId = ?`.
- **Opaque Public Identifiers**: Secure `rec_<hex>` identifiers decouple routing from internal database primary keys.
- **Permanent Anti-Cascade Deletion Auditing**: Transactional audit snapshots preserved permanently in PostgreSQL after records are deleted.
- **Access-Control Matrix Enforcement**: Explicit distinction between 401 (unauthenticated), 403 (unauthorized cross-user access), and 404 (non-existent).
- **Addressable URL State & Genuine Empty States**: Synchronized URL state with zero fake/placeholder records.
- **Interactive Dual-User Evaluation Switcher**: One-click toggle between User 1 (Owner) and User 2 (Adversary) in the UI.

## Quick Start
```bash
# Install dependencies
npm install

# Setup environment
cp .env.example .env

# Run database migrations
npx prisma migrate dev

# Start local server on port 3003
npm run dev

# Run automated verification suite
bash test-records-flow.sh
```

## Documentation
See [DOCUMENTATION.md](./DOCUMENTATION.md) for the complete 8-section architecture breakdown and query measurements.
