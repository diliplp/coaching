import fs from "node:fs";

const baseUrl = "https://coaching-saas-production-7fba.up.railway.app";

async function run() {
  try {
    console.log("Logging in...");
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "admin@coaching.local",
        password: "admin123"
      })
    });
    const loginData = await loginRes.json();
    const token = loginData.token;

    // Get questions in question bank
    const qBankRes = await fetch(`${baseUrl}/api/question-bank`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const qBankData = await qBankRes.json();
    const bookQuestions = (qBankData.questions || []).filter(q => q.bookId === "book-1780977181599");

    console.log(`Fetched ${bookQuestions.length} questions.`);

    function isDuplicateQuestionDebug(q1, q2) {
      const p1 = q1.prompt || "";
      const p2 = q2.prompt || "";
      
      const clean1 = p1.toLowerCase().replace(/[^a-z0-9\s]/g, "");
      const clean2 = p2.toLowerCase().replace(/[^a-z0-9\s]/g, "");
      
      const words1 = clean1.split(/\s+/).filter(w => w.length > 2);
      const words2 = clean2.split(/\s+/).filter(w => w.length > 2);
      
      if (words1.length === 0 || words2.length === 0) return { dup: false, reason: "empty words" };
      
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
      
      if (similarity < 0.5) return { dup: false, reason: `low similarity: ${similarity.toFixed(3)}` };
      
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
      
      if (similarity >= 0.85) return { dup: true, reason: `high similarity: ${similarity.toFixed(3)}` };
      if (similarity >= 0.5) {
        if (numbersMatch || optionsMatch) {
          return { dup: true, reason: `similarity: ${similarity.toFixed(3)} | numbersMatch: ${numbersMatch} | optionsMatch: ${optionsMatch}` };
        }
      }
      return { dup: false, reason: `similarity: ${similarity.toFixed(3)} but numbersMatch: ${numbersMatch}, optionsMatch: ${optionsMatch}` };
    }

    // Now check pairs we found to see what the debug output is
    for (let i = 0; i < bookQuestions.length; i++) {
      for (let j = i + 1; j < bookQuestions.length; j++) {
        const res = isDuplicateQuestionDebug(bookQuestions[i], bookQuestions[j]);
        if (res.dup || res.reason.includes("similarity")) {
          console.log(`\nPair (${i + 1}, ${j + 1}):`);
          console.log(`  Q1: ${bookQuestions[i].prompt}`);
          console.log(`  Q2: ${bookQuestions[j].prompt}`);
          console.log(`  Result: ${JSON.stringify(res)}`);
        }
      }
    }
  } catch (err) {
    console.error("Error:", err);
  }
}

run();
