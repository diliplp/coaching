import pg from "pg";
const { Client } = pg;

const connectionString = "postgresql://postgres:Gsecl%409988@127.0.0.1:5432/coaching_saas";
const targetBookId = "book-1780823999725";

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const res = await client.query(
      "SELECT data FROM app_records WHERE collection = 'subjectBooks' AND id = $1",
      [targetBookId]
    );
    if (res.rows.length === 0) {
      console.log("Book not found.");
      return;
    }
    const book = res.rows[0].data;
    const text = book.parsedText || "";
    console.log("Parsed text length:", text.length);
    
    // Search for "Which relation is true" or similar phrases
    const index = text.toLowerCase().indexOf("which relation is true");
    if (index !== -1) {
      console.log("Found match at index:", index);
      console.log("Snippet:\n", text.substring(index - 200, index + 800));
    } else {
      console.log("Could not find the exact phrase in parsedText.");
      // Search for "molecular weight"
      const index2 = text.toLowerCase().indexOf("molecular weight");
      if (index2 !== -1) {
        console.log("Found molecular weight at index:", index2);
        console.log("Snippet:\n", text.substring(index2 - 200, index2 + 800));
      }
    }
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

main();
