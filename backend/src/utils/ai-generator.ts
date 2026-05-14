import { Question, QuestionOption, QuestionType } from "../types.js";
import { listRecords } from "../data/database.js";

// Initialize OpenRouter using native fetch
// Expects process.env.OPENROUTER_API_KEY to be set.

export async function generateQuestionsFromText(params: {
  text: string;
  topicId: string;
  subjectId: string;
  subject?: string;
  questionCount?: number;
}): Promise<Question[]> {
  const { text, topicId, subjectId, subject, questionCount = 5 } = params;

  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is missing. Please set it in your .env file.");
  }

  const chemKeywords = ["chemistry", "molecule", "reaction", "bond", "acid", "organic", "compound", "structure", "formula", "chemical"];
  const isChemistry = subject?.toLowerCase().includes("chemistry") || chemKeywords.some(k => text.toLowerCase().includes(k));

  // Fetch verified questions to use as examples
  const allQuestionsInDb = await listRecords<Question>("questions");
  const verifiedExamples = allQuestionsInDb
    .filter(q => q.isVerified && q.topicId === topicId)
    .slice(0, 3)
    .map(q => ({
      prompt: q.prompt,
      difficulty: q.difficulty,
      marks: q.marks,
      options: q.options.map(o => ({
        label: o.label,
        value: o.value,
        isCorrect: q.correctOptionIds.includes(o.id)
      })),
      explanation: q.explanation
    }));

  const exampleInstruction = verifiedExamples.length > 0
    ? `\nHere are some examples of high-quality questions for this topic. Follow their style and formatting:\n${JSON.stringify(verifiedExamples, null, 2)}\n`
    : "";

  const allQuestions: Question[] = [];
  const batchSize = 10;
  const numBatches = Math.ceil(questionCount / batchSize);

  console.log(`Starting AI generation for topic ${topicId}. Total requested: ${questionCount}. Batches: ${numBatches}`);

  for (let b = 0; b < numBatches; b++) {
    const currentBatchCount = Math.min(batchSize, questionCount - allQuestions.length);
    if (currentBatchCount <= 0) break;

    const previousPrompts = allQuestions.slice(-20).map(q => q.prompt).join("\n- ");
    const avoidanceInstruction = b > 0 
      ? `\nIMPORTANT: Do NOT repeat these questions or topics which were already generated:\n- ${previousPrompts}\n` 
      : "";

    const prompt = `
You are an expert educator. Generate exactly ${currentBatchCount} multiple-choice questions from the text below.
${exampleInstruction}
${avoidanceInstruction}

STRICT STEM RULES:
1. LaTeX: Use $...$ for inline and $$...$$ for blocks.
2. JSON ESCAPING: In the JSON, use FOUR backslashes for LaTeX (e.g., "\\\\frac").
3. Chemistry: Use [SMILES: notation] for chemical structures. 
   IMPORTANT: A SMILES string is NOT a chemical formula. 
   - WRONG: [SMILES: CH3COOH], [SMILES: H2O], [SMILES: C2H5OH]
   - CORRECT: [SMILES: CC(=O)O], [SMILES: O], [SMILES: CCO]
   - Examples for your reference:
     * Acetic Acid: CC(=O)O
     * Ethanol: CCO
     * Methane: C
     * Glucose: OC[C@H]1OC(O)[C@H](O)[C@@H](O)[C@H]1O
     * Benzene: c1ccccc1
   NEVER use placeholders like '?' or chemical formulas inside [SMILES: ] tags.

JSON RULES:
1. NO markdown wrappers (no \`\`\`json).
2. NO trailing commas.
3. Use DOUBLE QUOTES only.
4. Output ONLY the JSON object.

JSON STRUCTURE:
{
  "questions": [
    {
      "prompt": "Question text here",
      "difficulty": "medium",
      "marks": 2,
      "negativeMarks": 0,
      "options": [
        { "label": "A", "value": "Option 1", "isCorrect": true },
        { "label": "B", "value": "Option 2", "isCorrect": false },
        { "label": "C", "value": "Option 3", "isCorrect": false },
        { "label": "D", "value": "Option 4", "isCorrect": false }
      ],
      "explanation": "Explanation text here"
    }
  ]
}

TEXT CONTENT:
---
${text.substring(0, 30000)}
---
    `;

    try {
      console.log(`Generating batch ${b + 1}/${numBatches} (${currentBatchCount} questions)...`);
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://railway.app", 
          "X-Title": "Coaching Portal Exam Gen"
        },
        body: JSON.stringify({
          model: "openai/gpt-4o-mini", 
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" }
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`OpenRouter API error: ${errText}`);
      }

      const data = await response.json();
      let rawResponse = data.choices?.[0]?.message?.content || '{"questions": []}';
      
      const startIdx = rawResponse.indexOf("{");
      const endIdx = rawResponse.lastIndexOf("}");
      if (startIdx !== -1 && endIdx !== -1) {
        rawResponse = rawResponse.substring(startIdx, endIdx + 1);
      }

      let parsedObj = JSON.parse(rawResponse);
      let parsedArr = parsedObj.questions || (Array.isArray(parsedObj) ? parsedObj : []);

      const mappedQuestions = parsedArr.map((item: any, index: number) => {
        const qId = `q-ai-${Date.now()}-${allQuestions.length + index}`;
        const correctOptionIds: string[] = [];
        const options: QuestionOption[] = (item.options || []).map((opt: any, optIndex: number) => {
          const oId = `opt-${Date.now()}-${allQuestions.length + index}-${optIndex}`;
          if (opt.isCorrect) correctOptionIds.push(oId);
          return { id: oId, label: opt.label || String.fromCharCode(65 + optIndex), value: opt.value };
        });

        return {
          id: qId,
          subjectId,
          topicId,
          type: correctOptionIds.length > 1 ? "multi_correct" : "single_correct",
          prompt: item.prompt,
          difficulty: item.difficulty,
          marks: item.marks || 2,
          negativeMarks: item.negativeMarks || 0,
          options,
          correctOptionIds,
          explanation: item.explanation,
        };
      });

      allQuestions.push(...mappedQuestions);
      console.log(`Batch ${b + 1} complete. Total now: ${allQuestions.length}`);

    } catch (error: any) {
      console.error(`Batch ${b + 1} failed:`, error.message);
      // If one batch fails, we still return the ones we have so far
      if (allQuestions.length === 0) throw error;
      break;
    }
  }

  return allQuestions;
}
