/**
 * One-shot admin restore script.
 * Run against production:  railway run node backend/scripts/restore-admin.mjs
 * Run locally:             DATABASE_URL=<url> node backend/scripts/restore-admin.mjs
 *
 * Edit ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME below before running.
 */

import bcrypt from "bcryptjs";
import pg from "pg";

// ── CONFIGURE THESE ──────────────────────────────────────────────
const ADMIN_EMAIL    = "admin@brainwave.in";   // change to your real email
const ADMIN_PASSWORD = "Admin@1234";            // temporary password (you'll be forced to change it on login)
const ADMIN_NAME     = "Administrator";
// ─────────────────────────────────────────────────────────────────

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

  const user = {
    id: `usr-admin-restored-${Date.now()}`,
    name: ADMIN_NAME,
    email: ADMIN_EMAIL,
    role: "super_admin",
    passwordHash,
    mustChangePassword: true
  };

  await pool.query(
    `INSERT INTO app_records (collection, id, data, updated_at)
     VALUES ($1, $2, $3::jsonb, NOW())
     ON CONFLICT (collection, id)
     DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
    ["users", user.id, JSON.stringify(user)]
  );

  console.log("✅ Admin user restored successfully.");
  console.log(`   Email:    ${ADMIN_EMAIL}`);
  console.log(`   Password: ${ADMIN_PASSWORD}`);
  console.log(`   You will be prompted to change your password on first login.`);
  await pool.end();
}

run().catch(err => { console.error("❌ Failed:", err.message); process.exit(1); });
