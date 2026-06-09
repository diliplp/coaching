import fs from "node:fs";

const filePath = "scratch/full_generated_output.json";
const data = JSON.parse(fs.readFileSync(filePath, "utf8"));

let errors = [];

if (!Array.isArray(data)) {
  errors.push(`Root JSON is not an array (found ${typeof data})`);
} else {
  data.forEach((q, idx) => {
    const qNum = idx + 1;
    if (!q.id) errors.push(`Q${qNum}: missing id`);
    if (!q.prompt) errors.push(`Q${qNum}: missing prompt`);
    if (!Array.isArray(q.options) || q.options.length === 0) {
      errors.push(`Q${qNum}: options missing or empty`);
    } else {
      const labels = new Set();
      q.options.forEach((opt, i) => {
        if (!opt.id) errors.push(`Q${qNum} option ${i+1}: missing id`);
        if (!opt.label) errors.push(`Q${qNum} option ${i+1}: missing label`);
        if (!opt.value) errors.push(`Q${qNum} option ${i+1}: missing value`);
        if (labels.has(opt.label)) errors.push(`Q${qNum}: duplicate option label ${opt.label}`);
        labels.add(opt.label);
      });
      // verify correctOptionIds
      if (!Array.isArray(q.correctOptionIds) || q.correctOptionIds.length === 0) {
        errors.push(`Q${qNum}: correctOptionIds missing`);
      } else {
        q.correctOptionIds.forEach((cid) => {
          if (!q.options.some(o => o.id === cid)) {
            errors.push(`Q${qNum}: correctOptionId ${cid} not found among options`);
          }
        });
      }
    }
    // optional fields sanity
    if (typeof q.isVerified !== "boolean") {
      errors.push(`Q${qNum}: isVerified missing or not boolean`);
    }
    if (!q.pageNumber) errors.push(`Q${qNum}: missing pageNumber`);
  });
}

if (errors.length === 0) {
  console.log(`✅ Validation passed: ${data.length} questions all look good.`);
} else {
  console.error(`❌ Validation failed with ${errors.length} issues:`);
  errors.forEach(e => console.error(e));
}
