const q1 = {
  prompt: "4 L of 0.02 M aqueous solution of NaCl was diluted by adding one litre of water. The molarity of the resultant solution is?",
  options: [
    { label: "A", value: "0.004" },
    { label: "B", value: "0.008" },
    { label: "C", value: "0.012" },
    { label: "D", value: "0.016" }
  ]
};

const q2 = {
  prompt: "1 L of 0.02 M aqueous solution of NaCl was diluted by adding one litre of water. The molarity of the resultant solution is:",
  options: [
    { label: "A", value: "0.004" },
    { label: "B", value: "0.008" },
    { label: "C", value: "0.012" },
    { label: "D", value: "0.016" }
  ]
};

function isDuplicateQuestion(q1, q2) {
  const p1 = q1.prompt || "";
  const p2 = q2.prompt || "";

  const clean1 = p1.toLowerCase().replace(/[^a-z0-9\s]/g, "");
  const clean2 = p2.toLowerCase().replace(/[^a-z0-9\s]/g, "");
  
  const words1 = clean1.split(/\s+/).filter((w) => w.length > 2);
  const words2 = clean2.split(/\s+/).filter((w) => w.length > 2);
  
  console.log("words1:", words1);
  console.log("words2:", words2);
  
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
  
  console.log("intersection:", intersection);
  console.log("union:", union);
  console.log("similarity:", similarity);
  
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
  
  console.log("nums1:", nums1);
  console.log("nums2:", nums2);
  
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
  
  console.log("numbersMatch:", numbersMatch);
  
  const opts1 = q1.options || [];
  const opts2 = q2.options || [];
  let optionsMatch = false;
  if (opts1.length > 0 && opts1.length === opts2.length) {
    const vals1 = opts1.map((o) => (o.value || "").toLowerCase().replace(/[^a-z0-9]/g, "")).sort();
    const vals2 = opts2.map((o) => (o.value || "").toLowerCase().replace(/[^a-z0-9]/g, "")).sort();
    let matchCount = 0;
    for (let i = 0; i < vals1.length; i++) {
      if (vals1[i] === vals2[i] || vals1[i].includes(vals2[i]) || vals2[i].includes(vals1[i])) {
        matchCount++;
      }
    }
    optionsMatch = matchCount >= 3;
  }
  
  console.log("optionsMatch:", optionsMatch);
  
  if (similarity >= 0.85) return true;
  if (similarity >= 0.5) {
    if (numbersMatch || optionsMatch) return true;
  }
  
  return false;
}

console.log("Result:", isDuplicateQuestion(q1, q2));
