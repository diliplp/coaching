import fs from 'node:fs/promises';
import { getAppState } from './src/data/database.js';

async function generateHTML() {
  const state = await getAppState();
  
  // Find the 25 dummy questions we seeded. We used ids starting with 'q-smiles-test-'
  const questions = state.questions.filter(q => q.id.startsWith('q-smiles-test-'));
  
  if (questions.length === 0) {
    console.log("No test questions found.");
    return;
  }

  let htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>SME Verification - Chemistry Questions</title>
  <script src="https://unpkg.com/smiles-drawer@2.0.1/dist/smiles-drawer.min.js"></script>
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; }
    h1 { text-align: center; }
    .question { margin-bottom: 40px; page-break-inside: avoid; border-bottom: 1px solid #ccc; padding-bottom: 20px; }
    .options { display: flex; flex-wrap: wrap; gap: 20px; margin-top: 15px; }
    .option { border: 1px solid #eee; padding: 10px; border-radius: 8px; text-align: center; min-width: 150px; }
    canvas { display: block; margin: 0 auto; }
    .smiles-text { font-size: 10px; color: #888; font-family: monospace; display: block; text-align: center; margin-top: 5px; }
  </style>
</head>
<body>
  <h1>Chemistry Structure Questions for SME Verification</h1>
`;

  questions.forEach((q, index) => {
    // Extract SMILES from prompt using regex
    const promptSmilesMatch = q.prompt.match(/\[SMILES:\s*(.*?)\s*\]/);
    const promptSmiles = promptSmilesMatch ? promptSmilesMatch[1] : '';

    htmlContent += `
  <div class="question">
    <h3>Question ${index + 1}</h3>
    <p>Identify the structure or match the property for:</p>
    ${promptSmiles ? `<div>
        <canvas data-smiles="${promptSmiles}"></canvas>
        <span class="smiles-text">${promptSmiles}</span>
    </div>` : `<p>${q.prompt}</p>`}
    
    <div class="options">
`;

    q.options.forEach(opt => {
      const optSmilesMatch = opt.value.match(/\[SMILES:\s*(.*?)\s*\]/);
      const optSmiles = optSmilesMatch ? optSmilesMatch[1] : opt.value;
      
      htmlContent += `
      <div class="option">
        <strong>Option ${opt.label}</strong>
        ${optSmilesMatch ? `
        <canvas data-smiles="${optSmiles}" width="150" height="150"></canvas>
        <span class="smiles-text">${optSmiles}</span>
        ` : `<p>${opt.value}</p>`}
      </div>`;
    });

    htmlContent += `
    </div>
  </div>`;
  });

  htmlContent += `
  <script>
    document.addEventListener("DOMContentLoaded", () => {
      const options = { width: 150, height: 150, terminalCarbons: true };
      const drawer = new SmilesDrawer.Drawer(options);
      
      document.querySelectorAll('canvas[data-smiles]').forEach((canvas) => {
        const smiles = canvas.getAttribute('data-smiles');
        SmilesDrawer.parse(smiles, (tree) => {
          drawer.draw(tree, canvas, 'light', false);
        }, (err) => {
          console.error('Error drawing smiles', smiles, err);
        });
      });
      
      // Let puppeteer know we are done rendering
      const readyDiv = document.createElement('div');
      readyDiv.id = 'render-complete';
      document.body.appendChild(readyDiv);
    });
  </script>
</body>
</html>
`;

  await fs.writeFile('sme_questions.html', htmlContent);
  console.log("Generated sme_questions.html");
}

generateHTML().catch(console.error);
