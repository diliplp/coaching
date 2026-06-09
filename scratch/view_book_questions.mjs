import pg from "pg";
const { Client } = pg;

const connectionString = "postgresql://postgres:Gsecl%409988@127.0.0.1:5432/coaching_saas";

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const res = await client.query(
      "SELECT id, data FROM app_records WHERE collection = 'questions' AND (data->>'bookId') IS NOT NULL LIMIT 5"
    );
    console.log(`Found ${res.rows.length} questions with bookId:`);
    for (const row of res.rows) {
      console.log("ID:", row.id);
      console.log("bookId:", row.data.bookId);
      console.log("pageNumber:", row.data.pageNumber);
    }
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

main();
