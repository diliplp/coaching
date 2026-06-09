import pg from "pg";
const { Client } = pg;

const connectionString = "postgresql://postgres:Gsecl%409988@127.0.0.1:5432/postgres";

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const res = await client.query(
      "SELECT datname FROM pg_database WHERE datistemplate = false"
    );
    console.log("Databases:");
    res.rows.forEach(row => {
      console.log(`- ${row.datname}`);
    });
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

main();
