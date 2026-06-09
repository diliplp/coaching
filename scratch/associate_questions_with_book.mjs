import pg from "pg";
const { Client } = pg;

const connectionString = "postgresql://postgres:Gsecl%409988@127.0.0.1:5432/coaching_saas";
const targetBookId = "book-1780830483502";

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    // Fetch all questions in the questions collection
    const res = await client.query("SELECT id, data FROM app_records WHERE collection = 'questions'");
    console.log(`Found ${res.rows.length} total questions.`);
    
    let updatedCount = 0;
    // We sort rows by ID or created order to have a deterministic sequence
    const sortedRows = res.rows.sort((a, b) => a.id.localeCompare(b.id));
    
    for (let index = 0; index < sortedRows.length; index++) {
      const row = sortedRows[index];
      const data = row.data;
      
      // Let's identify the 40 questions from UnitTest_D07-Jun-2026.pdf
      // We can check if they are chemistry solutions questions:
      const promptLower = (data.prompt || "").toLowerCase();
      const isChemSolution = 
        promptLower.includes("solute") || 
        promptLower.includes("solution") || 
        promptLower.includes("solvent") || 
        promptLower.includes("molality") || 
        promptLower.includes("molarity") || 
        promptLower.includes("osmotic") || 
        promptLower.includes("colligative") || 
        promptLower.includes("dissociation") || 
        promptLower.includes("vapour") || 
        promptLower.includes("boiling point") || 
        promptLower.includes("freezing point") ||
        promptLower.includes("piston") ||
        promptLower.includes("figure") ||
        promptLower.includes("henry's") ||
        promptLower.includes("raoult's");
        
      if (isChemSolution) {
        data.bookId = targetBookId;
        
        // Estimate page numbers based on order, but ensure Q6 is specifically on Page 1
        if (promptLower.includes("piston") || promptLower.includes("consider the figure")) {
          data.pageNumber = 1;
        } else {
          // Spread them across page 1 to 14
          data.pageNumber = Math.min(14, Math.floor(index / 3) + 1);
        }
        
        await client.query(
          "UPDATE app_records SET data = $1::jsonb, updated_at = NOW() WHERE collection = $2 AND id = $3",
          [JSON.stringify(data), "questions", row.id]
        );
        updatedCount++;
      }
    }
    console.log(`Associated ${updatedCount} Chemistry questions with book ID '${targetBookId}'.`);
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

main();
