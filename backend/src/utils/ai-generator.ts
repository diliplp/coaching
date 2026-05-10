import { Question, QuestionOption, QuestionType } from "../types.js";

// Initialize OpenRouter using native fetch
// Expects process.env.OPENROUTER_API_KEY to be set.

export async function generateQuestionsFromText(params: {
  text: string;
  topicId: string;
  subjectId: string;
  questionCount?: number;
}): Promise<Question[]> {
  const { text, topicId, subjectId, questionCount = 5 } = params;

  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is missing. Please set it in your .env file.");
  }

  const prompt = `
You are an expert educator creating multiple-choice exam questions based purely on the provided reference text.
Read the textbook content below. Then generate exactly ${questionCount} multiple-choice questions from it.

IMPORTANT STEM FORMATTING RULES:
1. For Mathematical and Physics equations, formulas, or symbols, you MUST use LaTeX formatting.
   - Use $...$ for inline equations (e.g., $E = mc^2$).
   - Use $$...$$ for block equations.
   - CRITICAL: Since you are outputting JSON, you MUST double-escape all LaTeX backslashes (e.g. use \\\\frac instead of \\frac).
2. For chemical structures and molecules, you MUST use SMILES strings enclosed in [SMILES: ... ].
   - Always use strict SMILES notation. Metals and complex ions must be enclosed in brackets.
   - Example: [SMILES: CC(=O)O] for acetic acid, [SMILES: [Ag]F] for silver fluoride.
   - NEVER put full chemical reaction equations inside a SMILES tag. Only use it for single molecules or compounds.

Do NOT include any markdown formatting like \`\`\`json. Output ONLY raw JSON.

Output format must be a single JSON object containing a "questions" array, with this exact structure for each question:
{
  "questions": [
    {
      "prompt": "The text of the question. What is the derivative of $x^2$?",
      "difficulty": "easy", // Must be "easy", "medium", or "hard"
      "marks": 2,
      "negativeMarks": 0,
      "options": [
        { "label": "A", "value": "Option A text", "isCorrect": true },
        { "label": "B", "value": "Option B text", "isCorrect": false },
        { "label": "C", "value": "Option C text", "isCorrect": false },
        { "label": "D", "value": "Option D text", "isCorrect": false }
      ],
      "explanation": "Brief explanation why the answer is correct."
    }
  ]
}

Textbook Content:
-------------------
${text.substring(0, 30000)}
-------------------
  `;

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        // The model can be changed here:
        model: "z-ai/glm-4.5-air:free", 
        messages: [{ role: "user", content: prompt }]
        // Note: response_format: { type: "json_object" } is omitted because the free LLaMA model rejects it
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`OpenRouter API error (${response.status}):`, errText);
      throw new Error(`OpenRouter API error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    let rawResponse = data.choices?.[0]?.message?.content || '{"questions": []}';
    
    // Safely strip any markdown wrappers that the AI might include
    rawResponse = rawResponse.replace(/```json/gi, "").replace(/```/g, "").trim();

    let parsedObj: any;
    try {
      parsedObj = JSON.parse(rawResponse);
    } catch (parseError) {
      console.error("CRITICAL JSON PARSE ERROR. Raw AI Response was:", rawResponse);
      throw parseError;
    }

    let parsed = parsedObj.questions;
    if (!Array.isArray(parsed)) {
      // Fallback if the AI just returned an array directly despite instructions
      if (Array.isArray(parsedObj)) parsed = parsedObj;
      else throw new Error("Output does not contain a valid 'questions' array.");
    }

    return parsed.map((item: any, index: number) => {
      const qId = `q-ai-${Date.now()}-${index}`;
      const correctOptionIds: string[] = [];
      const options: QuestionOption[] = item.options.map((opt: any, optIndex: number) => {
        const oId = `opt-${Date.now()}-${index}-${optIndex}`;
        if (opt.isCorrect) {
          correctOptionIds.push(oId);
        }
        return {
          id: oId,
          label: opt.label || String.fromCharCode(65 + optIndex), // Fallback to A, B, C, D
          value: opt.value,
        };
      });

      const type: QuestionType = correctOptionIds.length > 1 ? "multi_correct" : "single_correct";

      return {
        id: qId,
        subjectId,
        topicId,
        type,
        prompt: item.prompt,
        difficulty: item.difficulty,
        marks: item.marks || 2,
        negativeMarks: item.negativeMarks || 0,
        options,
        correctOptionIds,
        explanation: item.explanation,
      };
    });
  } catch (error: any) {
    console.error("AI Generation failed:", error);
    throw new Error(error.message || "Failed to generate AI questions.");
  }
}
