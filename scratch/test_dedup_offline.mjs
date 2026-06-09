import fs from "node:fs";

function isDuplicateQuestion(q1, q2) {
  const p1 = q1.prompt || "";
  const p2 = q2.prompt || "";
  
  const clean1 = p1.toLowerCase().replace(/[^a-z0-9\s]/g, "");
  const clean2 = p2.toLowerCase().replace(/[^a-z0-9\s]/g, "");
  
  const words1 = clean1.split(/\s+/).filter(w => w.length > 2);
  const words2 = clean2.split(/\s+/).filter(w => w.length > 2);
  
  if (words1.length === 0 || words2.length === 0) return false;
  
  const set1 = new Set(words1);
  const set2 = new Set(words2);
  
  let intersection = 0;
  for (const w of set1) {
    if (set2.has(w)) {
      intersection++;
    }
  }
  const union = set1.size + set2.size - intersection;
  const similarity = intersection / union;
  
  if (similarity < 0.5) return false;
  
  const unicodeMap = {
    '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
    '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
    '⁻': '-'
  };
  const normalizeNums = (str) => {
    let norm = str.split('').map(char => unicodeMap[char] || char).join('');
    const matches = norm.match(/-?\d+(\.\d+)?/g) || [];
    return matches.map(Number).filter(n => !isNaN(n)).sort((a, b) => a - b);
  };
  
  const nums1 = normalizeNums(p1);
  const nums2 = normalizeNums(p2);
  
  let numbersMatch = false;
  if (nums1.length === nums2.length) {
    numbersMatch = true;
    for (let i = 0; i < nums1.length; i++) {
      if (Math.abs(nums1[i] - nums2[i]) > 0.0001) {
        numbersMatch = false;
        break;
      }
    }
  }
  
  const opts1 = q1.options || [];
  const opts2 = q2.options || [];
  let optionsMatch = false;
  if (opts1.length > 0 && opts1.length === opts2.length) {
    const vals1 = opts1.map(o => (o.value || "").toLowerCase().replace(/[^a-z0-9]/g, "")).sort();
    const vals2 = opts2.map(o => (o.value || "").toLowerCase().replace(/[^a-z0-9]/g, "")).sort();
    let matchCount = 0;
    for (let i = 0; i < vals1.length; i++) {
      if (vals1[i] === vals2[i] || vals1[i].includes(vals2[i]) || vals2[i].includes(vals1[i])) {
        matchCount++;
      }
    }
    optionsMatch = matchCount >= 3;
  }
  
  if (similarity >= 0.85) return true;
  if (similarity >= 0.5) {
    if (numbersMatch || optionsMatch) return true;
  }
  return false;
}

async function run() {
  try {
    const questions = JSON.parse(fs.readFileSync("scratch/local_extracted_questions.json", "utf8"));
    console.log(`Original questions count: ${questions.length}`);
    
    const uniqueQuestions = [];
    for (const q of questions) {
      let foundIndex = -1;
      for (let j = 0; j < uniqueQuestions.length; j++) {
        if (isDuplicateQuestion(uniqueQuestions[j], q)) {
          foundIndex = j;
          break;
        }
      }
      if (foundIndex !== -1) {
        // Merge
        const existing = uniqueQuestions[foundIndex];
        if (!existing.explanation && q.explanation) {
          existing.explanation = q.explanation;
        }
      } else {
        uniqueQuestions.push(q);
      }
    }
    
    console.log(`Deduplicated questions count: ${uniqueQuestions.length}`);
  } catch (err) {
    console.error(err);
  }
}

run();
