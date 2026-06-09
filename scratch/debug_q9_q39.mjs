const unicodeMap = {
  '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
  '⁻': '-'
};

const stripLaTeX = (str) => {
  let norm = str.split('').map(char => unicodeMap[char] || char).join('');
  return norm.toLowerCase()
    .replace(/\\text\s*\{([^}]+)\}/g, "$1")
    .replace(/\\mathrm\s*\{([^}]+)\}/g, "$1")
    .replace(/\\mathbf\s*\{([^}]+)\}/g, "$1")
    .replace(/\\vec\s*\{([^}]+)\}/g, "$1")
    .replace(/\\bold\s*\{([^}]+)\}/g, "$1")
    .replace(/\\text/g, "")
    .replace(/\\mathrm/g, "")
    .replace(/\$\$/g, "")
    .replace(/\$/g, "")
    .replace(/[\{\}\_\^\\]/g, "")
    .replace(/[^a-z0-9]/g, "");
};

function getCharNgrams(str, n) {
  const ngrams = new Set();
  const clean = stripLaTeX(str);
  console.log(`  Cleaned string: "${clean}"`);
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
  console.log(`  Set1 size: ${set1.size}, Set2 size: ${set2.size}, Intersection: ${intersection}`);
  return intersection / (set1.size + set2.size - intersection);
}

const p1 = "What is the molality of $2.05\\ \\text{M}$ aqueous solution of acetic acid ($\\text{CH}_3\\text{COOH}$)? The density of chemical solution is $1.02\\ \\text{g}\\ \\text{mL}^{-1}$.";
const p2 = "What is the molality of a 2.05 molar aqueous solution of acetic acid?";

console.log("Q10:");
console.log(`Raw: "${p1}"`);
const cleanP1 = p1.replace(/\[image:[^\]]+\]/gi, "").trim();

console.log("\nQ15:");
console.log(`Raw: "${p2}"`);
const cleanP2 = p2.replace(/\[image:[^\]]+\]/gi, "").trim();

const sim = charNgramSimilarity(cleanP1, cleanP2, 3);
console.log(`\nJaccard trigram similarity: ${sim.toFixed(3)}`);

