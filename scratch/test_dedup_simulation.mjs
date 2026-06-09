import { Pool } from "pg";
import crypto from "crypto";

const pool = new Pool({
  connectionString: "postgresql://postgres:Gsecl%409988@127.0.0.1:5432/coaching_saas"
});

function getCharNgrams(str, n) {
  const ngrams = new Set();
  const clean = str.toLowerCase().replace(/[^a-z0-9]/g, "");
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

function isDuplicateQuestion(q1, q2) {
  const p1 = (q1.prompt || "").replace(/\[image:[^\]]+\]/gi, "").trim();
  const p2 = (q2.prompt || "").replace(/\[image:[^\]]+\]/gi, "").trim();

  const clean1 = p1.toLowerCase().replace(/[^a-z0-9]/g, "");
  const clean2 = p2.toLowerCase().replace(/[^a-z0-9]/g, "");

  // Substring check (if one prompt contains another and is long enough)
  if (clean1.length >= 20 && clean2.length >= 20) {
    if (clean1.includes(clean2) || clean2.includes(clean1)) {
      return true;
    }
  }

  // Trigram Jaccard similarity
  const similarity = charNgramSimilarity(p1, p2, 3);
  
  // Normalize and extract numbers
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
  if (nums1.length === nums2.length && nums1.length > 0) {
    numbersMatch = true;
    for (let i = 0; i < nums1.length; i++) {
      if (Math.abs(nums1[i] - nums2[i]) > 0.0001) {
        numbersMatch = false;
        break;
      }
    }
  }

  const getOptVal = (o) => typeof o === 'string' ? o : (o?.value || '');
  const opts1 = q1.options || [];
  const opts2 = q2.options || [];
  let optionsMatch = false;
  if (opts1.length > 0 && opts2.length > 0) {
    const vals1 = opts1.map((o) => getOptVal(o).toLowerCase().replace(/[^a-z0-9]/g, ""));
    const vals2 = opts2.map((o) => getOptVal(o).toLowerCase().replace(/[^a-z0-9]/g, ""));
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

async function main() {
  try {
    const res = await pool.query("SELECT data FROM app_records WHERE collection = 'questions'");
    const rawQuestions = res.rows.map(r => r.data).filter(q => q.bookId === 'book-1780973384487');
    
    console.log(`Original questions from DB: ${rawQuestions.length}`);
    
    const uniqueQuestions = [];
    
    for (const q of rawQuestions) {
      let foundIndex = -1;
      for (let j = 0; j < uniqueQuestions.length; j++) {
        if (isDuplicateQuestion(uniqueQuestions[j], q)) {
          foundIndex = j;
          break;
        }
      }

      if (foundIndex !== -1) {
        const existing = uniqueQuestions[foundIndex];
        // Merge page number (minimum)
        const p1 = existing.pageNumber || 1;
        const p2 = q.pageNumber || 1;
        existing.pageNumber = Math.min(p1, p2);
        
        // Find image tag in either prompt
        const imgMatchExisting = existing.prompt.match(/\[image:[^\]]+\]/i);
        const imgMatchNew = q.prompt.match(/\[image:[^\]]+\]/i);
        const imageTag = imgMatchExisting ? imgMatchExisting[0] : (imgMatchNew ? imgMatchNew[0] : null);

        // Strip image tags to select the best clean prompt
        const cleanPromptExisting = existing.prompt.replace(/\[image:[^\]]+\]/gi, "").trim();
        const cleanPromptNew = q.prompt.replace(/\[image:[^\]]+\]/gi, "").trim();

        // Keep the shorter clean prompt (e.g. if one has extra noise/answers appended)
        let bestPrompt = cleanPromptExisting;
        if (cleanPromptNew.length > 0 && cleanPromptNew.length < cleanPromptExisting.length) {
          bestPrompt = cleanPromptNew;
        }

        // Re-append the image tag if present
        if (imageTag) {
          existing.prompt = `${bestPrompt}\n${imageTag}`;
        } else {
          existing.prompt = bestPrompt;
        }
        
        if (!existing.explanation && q.explanation) {
          existing.explanation = q.explanation;
        }
      } else {
        // Deep copy
        uniqueQuestions.push({ ...q });
      }
    }
    
    console.log(`Deduplicated questions: ${uniqueQuestions.length}`);
    uniqueQuestions.forEach((q, idx) => {
      console.log(`${idx + 1}. [Page ${q.pageNumber}] Prompt: ${q.prompt.substring(0, 80).replace(/\n/g, " ")}`);
    });
    
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

main();
