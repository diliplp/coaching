import fs from "node:fs";

function isDuplicateQuestion(q1, q2) {
  const p1 = q1.prompt || "";
  const p2 = q2.prompt || "";

  const stopwords = new Set([
    "the", "of", "and", "to", "is", "in", "for", "on", "with", "at", "by", 
    "an", "was", "be", "which", "from", "that", "this", "these", "those",
    "are", "it", "its", "if", "then", "else", "what", "how", "why", "where",
    "when", "who", "whom", "whose", "will", "would", "should", "could",
    "can", "may", "might", "must", "shall", "about", "above", "after", "again",
    "against", "all", "any", "both", "each", "few", "more", "most", "other",
    "some", "such", "than", "too", "very"
  ]);

  const unicodeMap = {
    '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
    '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
    '⁻': '-'
  };

  const cleanPrompt = (str) => {
    let norm = str.split('').map(char => unicodeMap[char] || char).join('');
    return norm.toLowerCase()
      // Strip LaTeX formatting
      .replace(/\$\$/g, "")
      .replace(/\$/g, "")
      .replace(/\\text\s*\{([^}]+)\}/g, "$1")
      .replace(/\\mathrm\s*\{([^}]+)\}/g, "$1")
      .replace(/\\mathbf\s*\{([^}]+)\}/g, "$1")
      .replace(/\\vec\s*\{([^}]+)\}/g, "$1")
      .replace(/\\_[a-zA-Z0-9]/g, "")
      .replace(/\\^[a-zA-Z0-9]/g, "")
      .replace(/[\{\}\_\^]/g, "")
      .replace(/[^a-z0-9\s]/g, "");
  };

  const clean1 = cleanPrompt(p1);
  const clean2 = cleanPrompt(p2);
  
  const words1 = clean1.split(/\s+/).filter((w) => w.length > 2 && !stopwords.has(w));
  const words2 = clean2.split(/\s+/).filter((w) => w.length > 2 && !stopwords.has(w));
  
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
  
  if (similarity < 0.45) return false;
  
  // Normalize and extract numbers
  const normalizeNums = (str) => {
    let norm = str.split('').map(char => unicodeMap[char] || char).join('');
    const matches = norm.match(/-?\d+(\.\d+)?/g) || [];
    return matches.map(Number).filter(n => !isNaN(n)).sort((a, b) => a - b);
  };
  
  const nums1 = normalizeNums(p1);
  const nums2 = normalizeNums(p2);
  
  let numbersMatch = false;
  if (nums1.length === nums2.length && nums1.length > 0) {
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
  if (opts1.length > 0 && opts2.length > 0) {
    const vals1 = opts1.map((o) => (o.value || "").toLowerCase().replace(/[^a-z0-9]/g, ""));
    const vals2 = opts2.map((o) => (o.value || "").toLowerCase().replace(/[^a-z0-9]/g, ""));
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
    const minOptions = Math.min(opts1.length, opts2.length);
    optionsMatch = matchCount >= Math.max(2, Math.floor(minOptions * 0.75));
  }
  
  if (similarity >= 0.85) return true;
  if (similarity >= 0.45) {
    if (numbersMatch || optionsMatch) return true;
  }
  
  return false;
}

const allParsedQuestions = JSON.parse(fs.readFileSync("scratch/local_extracted_questions.json", "utf8"));
console.log(`Loaded ${allParsedQuestions.length} raw extracted questions.`);

const uniqueQuestions = [];
for (const q of allParsedQuestions) {
  let foundIndex = -1;
  for (let j = 0; j < uniqueQuestions.length; j++) {
    if (isDuplicateQuestion(uniqueQuestions[j], q)) {
      foundIndex = j;
      break;
    }
  }

  if (foundIndex !== -1) {
    const existing = uniqueQuestions[foundIndex];
    if (q.explanation && !existing.explanation) {
      existing.explanation = q.explanation;
    }
  } else {
    uniqueQuestions.push(q);
  }
}

console.log(`Deduplicated to ${uniqueQuestions.length} unique questions.`);
