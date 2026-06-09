import { Pool } from "pg";

const pool = new Pool({
  connectionString: "postgresql://postgres:Gsecl%409988@127.0.0.1:5432/coaching_saas"
});

function getCharNgrams(str, n) {
  const ngrams = new Set();
  const clean = str.toLowerCase().replace(/\[image:[^\]]+\]/gi, "").replace(/[^a-z0-9]/g, "");
  for (let i = 0; i <= clean.length - n; i++) {
    ngrams.add(clean.substring(i, i + n));
  }
  return ngrams;
}

function charNgramSimilarity(str1, str2, n = 3) {
  const set1 = getCharNgrams(str1, n);
  const set2 = getCharNgrams(str2, n);
  if (set1.size === 0 || set2.size === 0) return 0;
  let intersection = 0;
  for (const item of set1) {
    if (set2.has(item)) {
      intersection++;
    }
  }
  return intersection / (set1.size + set2.size - intersection);
}

async function main() {
  try {
    const res = await pool.query("SELECT data FROM app_records WHERE collection = 'questions'");
    const questions = res.rows.map(r => r.data).filter(q => q.bookId === 'book-1780973384487');
    
    console.log(`Analyzing ${questions.length} questions...`);
    const list = [];
    
    for (let i = 0; i < questions.length; i++) {
      for (let j = i + 1; j < questions.length; j++) {
        const q1 = questions[i];
        const q2 = questions[j];
        
        const clean1 = q1.prompt.toLowerCase().replace(/\[image:[^\]]+\]/gi, "").replace(/[^a-z0-9]/g, "");
        const clean2 = q2.prompt.toLowerCase().replace(/\[image:[^\]]+\]/gi, "").replace(/[^a-z0-9]/g, "");
        
        const isSub = clean1.length >= 15 && clean2.length >= 15 && (clean1.includes(clean2) || clean2.includes(clean1));
        const sim = charNgramSimilarity(q1.prompt, q2.prompt);
        
        if ((sim >= 0.28 && sim <= 0.45) || isSub) {
          list.push({
            q1: q1.prompt.substring(0, 100),
            q2: q2.prompt.substring(0, 100),
            sim,
            isSub
          });
        }
      }
    }
    
    list.sort((a, b) => b.sim - a.sim);
    list.forEach(d => {
      console.log(`- Sim: ${d.sim.toFixed(3)} | isSub: ${d.isSub}`);
      console.log(`  Q1: ${d.q1}`);
      console.log(`  Q2: ${d.q2}`);
    });
    
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

main();
