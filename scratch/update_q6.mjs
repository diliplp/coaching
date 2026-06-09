import pg from "pg";
const { Client } = pg;

const connectionString = "postgresql://postgres:Gsecl%409988@127.0.0.1:5432/coaching_saas";

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const res = await client.query(
      "SELECT id, data FROM app_records WHERE collection = $1 AND (data->>'prompt' LIKE '%Figure%' OR data->>'prompt' LIKE '%piston%' OR data->>'prompt' LIKE '%Piston%')",
      ["questions"]
    );
    if (res.rows.length === 0) {
      console.log("Question 6 not found in database.");
      return;
    }
    
    const row = res.rows[0];
    const data = row.data;
    data.prompt = "Consider the Figure and mark the correct option.\n[IMAGE: /uploads/q6_diagram.png]";
    
    await client.query(
      "UPDATE app_records SET data = $1::jsonb, updated_at = NOW() WHERE collection = $2 AND id = $3",
      [JSON.stringify(data), "questions", row.id]
    );
    console.log("Successfully updated Question 6 with the cropped diagram image!");
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

main();
