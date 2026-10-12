/**
 * Reset Test User (RTU) - Slice 4 Records and Access
 * ---------------------------------------------------
 * Deletes a user by email from the database.
 * Cascades delete sessions and records.
 * Deletion audits for that user are also cleaned up for a fresh slate.
 *
 * Usage:
 *   npm run rtu -- test@example.com
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();

  if (!email) {
    console.error("❌  No email provided.");
    console.error("    Usage: npm run rtu -- your@email.com");
    process.exit(1);
  }

  if (!email.includes("@")) {
    console.error(`❌  "${email}" doesn't look like a valid email address.`);
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    console.log(`ℹ️   No user found with email: ${email}`);
    console.log("    Nothing to delete — you're already at a clean slate.");
    process.exit(0);
  }

  console.log(`\n🔍  Found user:`);
  console.log(`    ID     : ${user.id}`);
  console.log(`    Email  : ${user.email}`);
  console.log(`    Name   : ${user.name}`);
  console.log(`    Created: ${user.createdAt.toISOString()}\n`);

  await prisma.$transaction([
    prisma.deletionAudit.deleteMany({ where: { deletedByUserId: user.id } }),
    prisma.user.delete({ where: { email } }),
  ]);

  console.log("✅  User deleted. Cascaded:");
  console.log("    - sessions");
  console.log("    - records");
  console.log("    - deletion_audits");
  console.log("\n🧹  Clean slate. You can now start fresh testing the records & access flow.");
}

main()
  .catch((e) => {
    console.error("❌  Script error:", e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
