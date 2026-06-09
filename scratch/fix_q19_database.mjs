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
    console.log(`Found ${res.rows.length} matching questions to fix.`);
    
    for (const row of res.rows) {
      const data = row.data;
      
      data.options = [
        { id: "opt-1", label: "A", value: "$x = \\left(\\frac{y}{v}\\right) \\frac{RT}{\\pi}$" },
        { id: "opt-2", label: "B", value: "$y = \\left(\\frac{x}{v}\\right) \\frac{RT}{\\pi}$" },
        { id: "opt-3", label: "C", value: "$x = \\left(\\frac{v}{y}\\right) \\frac{RT}{\\pi}$" },
        { id: "opt-4", label: "D", value: "$x = \\left(\\frac{y}{v}\\right) \\frac{R\\pi}{T}$" }
      ];
      data.correctOptionIds = ["opt-1"];
      data.explanation = "According to the osmotic pressure equation:\n\n$$\\pi = C R T = \\frac{n}{v} R T$$\n\nSince number of moles $n = \\frac{\\text{weight}}{\\text{molecular weight}} = \\frac{y}{x}$, substituting $n$ gives:\n\n$$\\pi = \\frac{y}{x \\cdot v} R T$$\n\nSolving for molecular weight ($x$):\n\n$$x = \\left(\\frac{y}{v}\\right) \\frac{R T}{\\pi}$$\n\nThus, Option A is the correct relation.";
      
      await client.query(
        "UPDATE app_records SET data = $1::jsonb, updated_at = NOW() WHERE collection = $2 AND id = $3",
        [JSON.stringify(data), "questions", row.id]
      );
      console.log(`Fixed question ID: ${row.id}`);
    }
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

main();
