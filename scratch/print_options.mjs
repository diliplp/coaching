import fs from "node:fs";

async function main() {
  try {
    const questions = JSON.parse(fs.readFileSync("scratch/full_generated_output.json", "utf8"));
    
    questions.forEach((q, idx) => {
      const correctId = q.correctOptionIds?.[0];
      const correctOpt = q.options?.find(o => o.id === correctId);
      console.log(`Q${idx + 1}: Prompt: "${q.prompt.substring(0, 80)}..."`);
      console.log(`    Correct: ${correctOpt ? `${correctOpt.label}: ${correctOpt.value}` : "NONE"}`);
    });
  } catch (err) {
    console.error(err);
  }
}

main();
