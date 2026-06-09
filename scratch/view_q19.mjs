import pg from "pg";
const { Client } = pg;

const connectionString = "postgresql://postgres:Gsecl%409988@127.0.0.1:5432/coaching_saas";

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const res = await client.query(
      "SELECT id, data FROM app_records WHERE collection = 'questions' AND data->>'prompt' LIKE '%molecular weight of solute%'"
    );
    console.log(`Found ${res.rows.length} matching questions:`);
    for (const row of res.rows) {
      console.log("ID:", row.id);
      console.log("Prompt:", row.data.prompt);
      console.log("Options:", row.data.options);
      console.log("CorrectOptionIds:", row.data.correctOptionIds);
      console.log("Explanation:", row.data.explanation);
    }
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

main();
