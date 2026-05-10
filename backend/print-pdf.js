import puppeteer from 'puppeteer';
import path from 'path';

(async () => {
  try {
    console.log("Launching browser...");
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    const filePath = `file:///${path.resolve('sme_questions.html').replace(/\\/g, '/')}`;
    
    console.log(`Loading HTML from ${filePath}...`);
    await page.goto(filePath, { waitUntil: 'networkidle0' });
    
    console.log("Waiting for SMILES rendering to complete...");
    // Wait until our script appends the 'render-complete' div
    await page.waitForSelector('#render-complete', { timeout: 10000 });
    
    // Give it an extra second just to make sure canvases are painted
    await new Promise(r => setTimeout(r, 1000));
    
    console.log("Generating PDF...");
    const pdfPath = path.resolve('SME_Questions.pdf');
    await page.pdf({ path: pdfPath, format: 'A4', margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' } });
    
    await browser.close();
    console.log(`PDF successfully generated at ${pdfPath}`);
  } catch (err) {
    console.error("Error generating PDF:", err);
    process.exit(1);
  }
})();
