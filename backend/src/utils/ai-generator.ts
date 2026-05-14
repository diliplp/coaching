import { Question, QuestionOption, QuestionType } from "../types.js";

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

  const prompt = `
You are an expert educator. Generate exactly ${questionCount} multiple-choice questions from the text below.

STRICT STEM RULES:
1. LaTeX: Use $...$ for inline and $$...$$ for blocks.
2. JSON ESCAPING: In the JSON, use FOUR backslashes for LaTeX (e.g., "\\\\frac").
3. Chemistry: Use [SMILES: notation]. ${isChemistry ? "IMPORTANT: This is a chemistry text. You MUST include chemical structures using [SMILES: notation] (e.g. [SMILES: CC(=O)O]) in at least 2 questions. NEVER use placeholders like [SMILES: ?] or empty tags." : ""}

JSON RULES:
1. NO markdown wrappers (no \`\`\`json).
2. NO trailing commas.
3. Use DOUBLE QUOTES only.
4. Output ONLY the JSON object.

JSON STRUCTURE:
{
  "questions": [
    {
      "prompt": "Which of the following is the structure of Ethanol? [SMILES: CCO]",
      "difficulty": "medium",
      "marks": 2,
      "negativeMarks": 0,
      "options": [
        { "label": "A", "value": "Ethanol", "isCorrect": true },
        { "label": "B", "value": "Methanol", "isCorrect": false },
        { "label": "C", "value": "Propanol", "isCorrect": false },
        { "label": "D", "value": "Butanol", "isCorrect": false }
      ],
      "explanation": "Ethanol has the formula C2H5OH, represented as CCO in SMILES."
    }
  ]
}

TEXT CONTENT:
---
${text.substring(0, 30000)}
---
  `;

  try {
    console.log(`Starting AI generation for topic ${topicId} in subject ${subjectId}...`);
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
      console.error(`OpenRouter API error (Status ${response.status}):`, errText);
      throw new Error(`OpenRouter API error (Status ${response.status}): ${errText}`);
    }

    const data = await response.json();
    console.log("AI generation response received successfully.");
    
    let rawResponse = data.choices?.[0]?.message?.content || '{"questions": []}';
    
    // Simple extraction: find the first { and last }
    const startIdx = rawResponse.indexOf("{");
    const endIdx = rawResponse.lastIndexOf("}");
    if (startIdx !== -1 && endIdx !== -1) {
      rawResponse = rawResponse.substring(startIdx, endIdx + 1);
    }

    let parsedObj: any;
    try {
      parsedObj = JSON.parse(rawResponse);
    } catch (parseError: any) {
      console.error("JSON PARSE ERROR. Raw Response:", rawResponse);
      // Try to remove potential markdown leftovers if any
      try {
        const cleaned = rawResponse.replace(/```json/g, "").replace(/```/g, "").trim();
        parsedObj = JSON.parse(cleaned);
      } catch (e) {
        throw new Error(`AI returned invalid JSON: ${parseError.message}. Content: ${rawResponse.substring(0, 100)}...`);
      }
    }

    let parsed = parsedObj.questions;
    if (!Array.isArray(parsed)) {
      if (Array.isArray(parsedObj)) {
        parsed = parsedObj;
      } else {
        console.error("Unexpected AI Response Structure:", parsedObj);
        throw new Error("AI output does not contain a valid 'questions' array.");
      }
    }

    console.log(`Successfully parsed ${parsed.length} questions.`);

    return parsed.map((item: any, index: number) => {
      const qId = `q-ai-${Date.now()}-${index}`;
      const correctOptionIds: string[] = [];
      const options: QuestionOption[] = (item.options || []).map((opt: any, optIndex: number) => {
        const oId = `opt-${Date.now()}-${index}-${optIndex}`;
        if (opt.isCorrect) {
          correctOptionIds.push(oId);
        }
        return {
          id: oId,
          label: opt.label || String.fromCharCode(65 + optIndex),
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
    console.error("AI Generation failed detailed log:", {
      message: error.message,
      stack: error.stack,
      topicId,
      subjectId
    });
    throw new Error(`AI Generation failed: ${error.message}`);
  }
}
