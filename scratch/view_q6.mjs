import pg from "pg";
const { Client } = pg;

const connectionString = "postgresql://postgres:Gsecl%409988@127.0.0.1:5432/coaching_saas";

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const res = await client.query(
      "SELECT data FROM app_records WHERE collection = $1 AND (data->>'prompt' LIKE '%Figure%' OR data->>'prompt' LIKE '%piston%' OR data->>'prompt' LIKE '%Piston%')",
      ["questions"]
    );
    console.log("Matching Questions found:", res.rows.length);
    res.rows.forEach((row, i) => {
      console.log(`\n--- MATCH ${i+1} ---`);
      console.log("ID:", row.data.id);
      console.log("Prompt:", row.data.prompt);
      console.log("Options:", row.data.options);
      console.log("Explanation:", row.data.explanation);
    });
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

main();
