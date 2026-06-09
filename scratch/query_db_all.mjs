import pg from "pg";
const { Client } = pg;

async function checkDb(dbName) {
  const connectionString = `postgresql://postgres:Gsecl%409988@127.0.0.1:5432/${dbName}`;
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const res = await client.query(
      "SELECT data FROM app_records WHERE collection = $1",
      ["subjectBooks"]
    );
    console.log(`\nDatabase: ${dbName}`);
    res.rows.forEach(row => {
      console.log(`- ID: ${row.data.id}, Title: ${row.data.title}, FileUrl: ${row.data.fileUrl}`);
    });
  } catch (err) {
    console.error(`Error on ${dbName}:`, err.message);
  } finally {
    await client.end();
  }
}

async function main() {
  await checkDb("coaching_saas");
  await checkDb("coaching_prod_backup");
}

main();
