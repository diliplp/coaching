import { Pool } from "pg";
import fs from "node:fs";

const pool = new Pool({
  connectionString: "postgresql://postgres:Gsecl%409988@127.0.0.1:5432/coaching_saas"
});

async function main() {
  try {
    const res = await pool.query("SELECT data FROM app_records WHERE collection = 'questions'");
    const questions = res.rows.map(r => r.data).filter(q => q.bookId === 'book-1780973384487');
    
    const targetQuestions = questions.filter(q => q.prompt.toLowerCase().includes("fe(cn)"));
    let out = `Found ${targetQuestions.length} questions:\n`;
    targetQuestions.forEach((q, i) => {
      out += `\nQ${i + 1}: [Page ${q.pageNumber}] ${q.prompt}\n`;
      out += `Options: ${JSON.stringify(q.options, null, 2)}\n`;
    });
    fs.writeFileSync("scratch/output_ok.txt", out, "utf8");
    return;
    
    console.log("Q10 Prompt:", q10.prompt);
    console.log("Q10 Options:", q10.options);
    console.log("Q15 Prompt:", q15.prompt);
    console.log("Q15 Options:", q15.options);
    
    const getOptVal = (o) => typeof o === 'string' ? o : (o?.value || '');
    
    const vals1 = q10.options.map((o) => getOptVal(o).toLowerCase().replace(/[^a-z0-9]/g, ""));
    const vals2 = q15.options.map((o) => getOptVal(o).toLowerCase().replace(/[^a-z0-9]/g, ""));
    
    console.log("Cleaned Q10 options:", vals1);
    console.log("Cleaned Q15 options:", vals2);
    
    let matchCount = 0;
    for (const v1 of vals1) {
      if (!v1) continue;
      for (const v2 of vals2) {
        if (!v2) continue;
        if (v1 === v2 || v1.includes(v2) || v2.includes(v1)) {
          matchCount++;
          break;
        }
      }
    }
    
    console.log("Match count:", matchCount);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

main();
