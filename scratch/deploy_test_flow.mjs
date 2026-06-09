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
    if (!loginRes.ok) {
      throw new Error(`Login failed with status ${loginRes.status}: ${await loginRes.text()}`);
    }
    const loginData = await loginRes.json();
    const token = loginData.token;
    console.log("Logged in successfully.");

    // Fetch existing books to get the active one
    console.log("Fetching books...");
    const bookRes = await fetch(`${baseUrl}/api/subject-books`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const booksData = await bookRes.json();
    const books = booksData.books || [];
    
    // Find the uploaded Chemistry MCQ Live Test book
    const activeBook = books.find(b => b.title === "Chemistry MCQ Live Test");
    if (!activeBook) {
      console.error("Chemistry MCQ Live Test book not found! Please run the upload flow first or verify the upload.");
      return;
    }
    console.log(`Found active book. ID: ${activeBook.id} | Status: ${activeBook.extractionStatus}`);

    // Poll for question extraction completion
    console.log("Waiting for question extraction...");
    let attempts = 0;
    while (attempts < 100) {
      attempts++;
      
      // Get latest status of the book
      const getBooksRes = await fetch(`${baseUrl}/api/subject-books`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      const getBooksData = await getBooksRes.json();
      const currentBook = (getBooksData.books || []).find(b => b.id === activeBook.id);
      
      // Get questions in question bank
      const qBankRes = await fetch(`${baseUrl}/api/question-bank`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      const qBankData = await qBankRes.json();
      const bookQuestions = (qBankData.questions || []).filter(q => q.bookId === activeBook.id);
      
      console.log(`[${attempts}] Extraction status: ${currentBook?.extractionStatus || "unknown"} | Questions count: ${bookQuestions.length}`);
      
      if (currentBook?.extractionStatus === "completed" || currentBook?.extractionStatus === "failed") {
        console.log(`Extraction finished with status: ${currentBook.extractionStatus}`);
        console.log(`Final Questions Count: ${bookQuestions.length}`);
        
        // Print prompts of the first few questions
        console.log("\nSample extracted questions:");
        bookQuestions.slice(0, 5).forEach((q, index) => {
          console.log(`[${index + 1}] ${q.prompt}`);
        });
        break;
      }
      
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  } catch (err) {
    console.error("Error in flow:", err);
  }
}

run();
