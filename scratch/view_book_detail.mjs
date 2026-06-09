import pg from "pg";
const { Client } = pg;

const connectionString = "postgresql://postgres:Gsecl%409988@127.0.0.1:5432/coaching_saas";

async function main() {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const res = await client.query(
      "SELECT data FROM app_records WHERE collection = $1 AND id = $2",
      ["subjectBooks", "book-1780830483502"]
    );
    if (res.rows.length === 0) {
      console.log("Book not found.");
      return;
    }
    const book = res.rows[0].data;
    console.log("Title:", book.title);
    console.log("Page Count:", book.pageCount);
    console.log("Parsed Text Length:", book.parsedText ? book.parsedText.length : 0);
    console.log("Preview text:\n", book.previewText);
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

main();
