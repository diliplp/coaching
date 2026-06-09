import pg from "pg";
const { Client } = pg;

const connectionString = "postgresql://postgres:Gsecl%409988@127.0.0.1:5432/coaching_saas";

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const res = await client.query(
      "SELECT DISTINCT collection FROM app_records"
    );
    console.log("Collections in app_records:");
    res.rows.forEach(row => {
      console.log(`- ${row.collection}`);
    });

    const tables = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
    );
    console.log("\nTables in public schema:");
    tables.rows.forEach(row => {
      console.log(`- ${row.table_name}`);
    });
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

main();
