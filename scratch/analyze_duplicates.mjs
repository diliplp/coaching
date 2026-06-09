import fs from "node:fs";

function getJaccardSimilarity(p1, p2) {
  const clean1 = p1.toLowerCase().replace(/[^a-z0-9\s]/g, "");
  const clean2 = p2.toLowerCase().replace(/[^a-z0-9\s]/g, "");
  
  const words1 = clean1.split(/\s+/).filter(w => w.length > 2);
  const words2 = clean2.split(/\s+/).filter(w => w.length > 2);
  
  if (words1.length === 0 || words2.length === 0) return 0;
  
  const set1 = new Set(words1);
  const set2 = new Set(words2);
  
  let intersection = 0;
  for (const w of set1) {
    if (set2.has(w)) {
      intersection++;
    }
  }
  const union = set1.size + set2.size - intersection;
  return intersection / union;
}

function getNumbers(p) {
  const numMatches = p.match(/\d+(\.\d+)?/g) || [];
  return numMatches.map(Number).filter(n => !isNaN(n)).sort((a, b) => a - b);
}

async function run() {
  try {
    const questions = JSON.parse(fs.readFileSync("scratch/full_generated_output.json", "utf8"));
    console.log(`Analyzing ${questions.length} questions...`);

    const pairs = [];
    for (let i = 0; i < questions.length; i++) {
      for (let j = i + 1; j < questions.length; j++) {
        const q1 = questions[i];
        const q2 = questions[j];
        const sim = getJaccardSimilarity(q1.prompt, q2.prompt);
        if (sim >= 0.5) {
          pairs.push({ i, j, q1, q2, sim });
        }
      }
    }

    console.log(`\nFound ${pairs.length} pairs with Jaccard similarity >= 50%:`);
    pairs.forEach(({ i, j, q1, q2, sim }) => {
      console.log(`\n--- Pair (${i + 1}, ${j + 1}) - Sim: ${(sim * 100).toFixed(1)}% ---`);
      console.log(`[${i + 1}] Numbers: [${getNumbers(q1.prompt).join(", ")}]`);
      console.log(`     Prompt: ${q1.prompt}`);
      console.log(`[${j + 1}] Numbers: [${getNumbers(q2.prompt).join(", ")}]`);
      console.log(`     Prompt: ${q2.prompt}`);
    });
  } catch (err) {
    console.error(err);
  }
}

run();
