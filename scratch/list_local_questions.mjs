import { Pool } from "pg";

const pool = new Pool({
  connectionString: "postgresql://postgres:Gsecl%409988@127.0.0.1:5432/coaching_saas"
});

async function main() {
  try {
    const res = await pool.query("SELECT data FROM app_records WHERE collection = 'questions'");
    const questions = res.rows.map(r => r.data);
    
    const booksRes = await pool.query("SELECT data FROM app_records WHERE collection = 'subjectBooks'");
    const books = booksRes.rows.map(r => r.data);
    console.log("Local books:");
    books.forEach(b => console.log(`- ${b.id}: ${b.title} (${b.fileName})`));
    
    // Group questions by bookId
    const grouped = {};
    questions.forEach(q => {
      if (!grouped[q.bookId]) grouped[q.bookId] = [];
      grouped[q.bookId].push(q);
    });
    
    for (const bookId in grouped) {
      console.log(`\nBook: ${bookId} | Questions count: ${grouped[bookId].length}`);
      grouped[bookId].forEach((q, idx) => {
        console.log(`  ${idx + 1}. Prompt: ${q.prompt.substring(0, 100).replace(/\n/g, " ")}`);
        if (q.prompt.includes("[IMAGE:")) {
          console.log(`     IMAGE: ${q.prompt.match(/\[IMAGE:\s*([^\]]+)\]/)?.[1]}`);
        }
      });
    }
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

main();
