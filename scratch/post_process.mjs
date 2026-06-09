import fs from "node:fs";

const answerKey = [
  "B", "A", "B", "A", "D", "B", "B", "B", "A", "A",
  "C", "D", "B", "C", "A", "C", "C", "C", "B", "A",
  "D", "D", "A", "D", "C", "A", "B", "D", "C", "B",
  "C", "C", "C", "D", "A", "D", "B", "D", "C", "B"
];

function main() {
  try {
    const questions = JSON.parse(fs.readFileSync("scratch/full_generated_output.json", "utf8"));
    console.log(`Loaded ${questions.length} questions.`);
    
    if (questions.length !== 40) {
      console.warn(`Warning: Expected 40 questions, but found ${questions.length}`);
    }
    
    questions.forEach((q, idx) => {
      const correctLetter = answerKey[idx];
      if (!correctLetter) {
        console.warn(`No correct letter mapped for index ${idx}`);
        return;
      }
      
      const correctOpt = q.options?.find(o => o.label?.toUpperCase() === correctLetter);
      if (correctOpt) {
        q.correctOptionIds = [correctOpt.id];
        console.log(`Q${idx + 1}: Mapped correct option to ${correctLetter} (${correctOpt.value})`);
      } else {
        console.warn(`Q${idx + 1}: Option with label ${correctLetter} not found!`);
      }
    });
    
    fs.writeFileSync("scratch/full_generated_output.json", JSON.stringify(questions, null, 2), "utf8");
    console.log("Updated scratch/full_generated_output.json successfully.");
  } catch (err) {
    console.error(err);
  }
}

main();
