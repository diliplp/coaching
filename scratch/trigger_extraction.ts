import { getAppState, upsertRecord, deleteRecord } from "../backend/src/data/database.js";
import { extractPdfDiagrams } from "../backend/src/utils/pdf.js";
import { extractQuestionsFromPdfText } from "../backend/src/utils/ai-generator.js";
import path from "node:path";
import fs from "node:fs/promises";

async function main() {
  try {
    const bookId = "book-1780973384487";
    const state = await getAppState();
    const book = state.subjectBooks.find((b) => b.id === bookId);
    
    if (!book) {
      console.error("Book not found in database!");
      return;
    }
    
    console.log(`Found book: ${book.title}`);
    if (!book.parsedText) {
      console.error("Book does not have parsedText!");
      return;
    }
    
    const booksUploadsRoot = "c:/Users/dell/Desktop/coaching/backend/uploads/books";
    const filename = book.fileUrl.split("/").pop() || "";
    const pdfPath = path.join(booksUploadsRoot, filename);
    
    console.log(`Extracting diagrams first at ${pdfPath}...`);
    const diagrams = await extractPdfDiagrams(pdfPath, book.id);
    console.log(`Found ${diagrams.length} diagrams.`);
    
    console.log("Starting MCQ extraction via Gemini...");
    const extracted = await extractQuestionsFromPdfText({
      text: book.parsedText,
      subjectId: book.subjectId,
      topicId: "top-gen-1780973384487", // dummy topic
      sourceType: "reference",
      bookId: book.id,
      diagrams
    });
    
    console.log(`Extracted ${extracted.length} questions from PDF.`);
    
    // Clear existing questions
    const existingBookQs = state.questions.filter(q => q.bookId === book.id);
    console.log(`Clearing ${existingBookQs.length} existing questions...`);
    for (const q of existingBookQs) {
      await deleteRecord("questions", q.id);
    }
    
    // Save new ones
    console.log(`Saving ${extracted.length} new questions...`);
    for (const q of extracted) {
      await upsertRecord("questions", q);
    }
    
    console.log("Success! Re-run of extraction completed.");
  } catch (err) {
    console.error("Error during extraction run:", err);
  }
}

main();
