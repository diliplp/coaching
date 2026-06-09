import pg from "pg";
import { extractQuestionsFromPdfText } from "../backend/dist/utils/ai-generator.js";
import { upsertRecord, getRecord, listRecords } from "../backend/dist/data/database.js";

async function run() {
  try {
    const bookId = "book-1780830483502";
    const book = await getRecord("subjectBooks", bookId);
    if (!book) {
      console.error("Book not found in database.");
      return;
    }
    
    const topics = await listRecords("topics");
    const chemTopic = topics.find(t => t.subjectId === book.subjectId) || topics[0];
    console.log("Using topic:", chemTopic ? chemTopic.name : "None", "ID:", chemTopic ? chemTopic.id : "None");
    
    console.log("Running MCQ extraction via Gemini...");
    const questions = await extractQuestionsFromPdfText({
      text: book.parsedText,
      subjectId: book.subjectId,
      topicId: chemTopic.id,
      sourceType: "reference"
    });
    
    console.log(`Extracted ${questions.length} questions.`);
    for (const q of questions) {
      await upsertRecord("questions", q);
      console.log(`- Saved question: "${q.prompt.substring(0, 60)}..."`);
    }
    console.log("All questions imported successfully!");
  } catch (err) {
    console.error("Error:", err);
  } finally {
    process.exit(0);
  }
}

run();
