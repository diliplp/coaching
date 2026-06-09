import pg from "pg";
const { Client } = pg;

const connectionString = "postgresql://postgres:Gsecl%409988@127.0.0.1:5432/coaching_saas";

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const res = await client.query(
      "SELECT data FROM app_records WHERE collection = $1",
      ["subjectBooks"]
    );
    console.log("Subject Books:");
    res.rows.forEach(row => {
      console.log(`- ID: ${row.data.id}, Title: ${row.data.title}, FileUrl: ${row.data.fileUrl}`);
    });
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

main();
