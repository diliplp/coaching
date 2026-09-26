import { GoogleGenAI } from "@google/genai";
import { jsonrepair } from "jsonrepair";
import { Question, QuestionOption, QuestionType, QuestionSource } from "../types.js";
import { listRecords } from "../data/database.js";
import crypto from "node:crypto";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { uploadsRoot } from "./paths.js";
import { extractPdfDiagrams } from "./pdf.js";

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const RENDER_PAGE_SCRIPT = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "../../scripts/render_page.py");

// --- OpenRouter model catalog validation ---
// OpenRouter retires models without notice; a hardcoded model name eventually 404s on
// every request. Configured models are checked against the live catalog so retired
// ones are dropped up front, with an auto-picked replacement as the last resort.

// flash-lite leads, back to its original position: pro-preview was tried as primary
// after flash-lite missed 3 questions in one book, but a controlled re-test (8 repeated
// isolated calls against the exact page/model that missed them, 4 at default
// temperature and 4 at temperature=0.1) got all 4 questions right every single time —
// the actual bug was a prompt-hash id collision silently overwriting rows on save (now
// fixed separately), not model quality. flash-lite is ~8x cheaper and ~2x faster than
// pro-preview with no measured accuracy difference, so there's no reason to pay the
// premium. Capped at 3 entries: OpenRouter's `models` fallback-routing array rejects
// anything longer than that with HTTP 400 ("'models' array must have 3 items or
// fewer") — a 4-entry list (from an earlier attempt at this same swap) silently broke
// every OpenRouter vision call for the time it was live, falling back to the Gemini SDK
// path on every single request without any visible error.
const DEFAULT_VISION_MODELS = [
  "google/gemini-3.1-flash-lite",
  "qwen/qwen2.5-vl-72b-instruct",
  "openai/gpt-4o-mini"
];

interface OpenRouterCatalogModel {
  id: string;
  architecture?: { input_modalities?: string[] };
  pricing?: { prompt?: string };
}

let catalogCache: { models: Map<string, OpenRouterCatalogModel>; fetchedAt: number } | null = null;
const CATALOG_TTL_MS = 6 * 60 * 60 * 1000;

async function getOpenRouterCatalog(): Promise<Map<string, OpenRouterCatalogModel> | null> {
  if (catalogCache && Date.now() - catalogCache.fetchedAt < CATALOG_TTL_MS) return catalogCache.models;
  try {
    const response = await fetch("https://openrouter.ai/api/v1/models");
    if (!response.ok) return catalogCache?.models ?? null;
    const data = await response.json();
    const models = new Map<string, OpenRouterCatalogModel>(
      (data.data ?? []).map((m: OpenRouterCatalogModel) => [m.id, m] as const)
    );
    if (models.size > 0) catalogCache = { models, fetchedAt: Date.now() };
    return catalogCache?.models ?? null;
  } catch {
    return catalogCache?.models ?? null;
  }
}

function supportsImageInput(model: OpenRouterCatalogModel): boolean {
  return (model.architecture?.input_modalities ?? []).includes("image");
}

// Free tiers are excluded — they are heavily rate-limited and get retired the most often.
function cheapestPaidVisionModel(catalog: Map<string, OpenRouterCatalogModel>): string | null {
  let best: { id: string; price: number } | null = null;
  for (const model of catalog.values()) {
    if (!supportsImageInput(model)) continue;
    const price = Number(model.pricing?.prompt);
    if (!Number.isFinite(price) || price <= 0) continue;
    if (!best || price < best.price) best = { id: model.id, price };
  }
  return best?.id ?? null;
}

/**
 * Vision model preference list: OPENROUTER_VISION_MODELS (comma-separated) followed by
 * defaults, validated against the live catalog. Falls back to the cheapest paid
 * vision-capable model when nothing configured is still available.
 */
// OpenRouter's `models` fallback-routing array rejects anything longer than this with a
// flat HTTP 400 ("'models' array must have 3 items or fewer") — enforced here, once, so
// no future change to DEFAULT_VISION_MODELS or OPENROUTER_VISION_MODELS can silently
// break every vision call again the way a 4-entry list did earlier (every request
// failed on OpenRouter and fell back to the Gemini SDK path with no visible error).
const MAX_OPENROUTER_MODELS = 3;

export async function resolveVisionModels(): Promise<{ models: string[]; warnings: string[] }> {
  const configured = (process.env.OPENROUTER_VISION_MODELS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const candidates = [...configured, ...DEFAULT_VISION_MODELS].filter((v, i, a) => a.indexOf(v) === i);

  const warnings: string[] = [];
  const catalog = await getOpenRouterCatalog();
  if (!catalog) {
    warnings.push("OpenRouter catalog unreachable — using configured vision models unvalidated");
    return { models: capModelList(candidates, warnings), warnings };
  }

  const models = candidates.filter((id) => {
    const model = catalog.get(id);
    if (!model) {
      warnings.push(`vision model "${id}" no longer exists on OpenRouter — dropped`);
      return false;
    }
    if (!supportsImageInput(model)) {
      warnings.push(`model "${id}" does not accept image input — dropped`);
      return false;
    }
    return true;
  });

  if (models.length === 0) {
    const fallback = cheapestPaidVisionModel(catalog);
    if (fallback) {
      warnings.push(`no configured vision model is available — auto-selected ${fallback}`);
      return { models: [fallback], warnings };
    }
    warnings.push("no vision-capable model found on OpenRouter");
  }
  return { models: capModelList(models, warnings), warnings };
}

function capModelList(models: string[], warnings: string[]): string[] {
  if (models.length <= MAX_OPENROUTER_MODELS) return models;
  warnings.push(`${models.length} vision models configured, OpenRouter allows at most ${MAX_OPENROUTER_MODELS} — dropped: ${models.slice(MAX_OPENROUTER_MODELS).join(", ")}`);
  return models.slice(0, MAX_OPENROUTER_MODELS);
}

/** Validates the text + vision model configuration; used at startup and by /api/health/ai. */
export async function checkAiModelHealth(): Promise<{
  ok: boolean;
  visionModels: string[];
  textModel: string;
  warnings: string[];
}> {
  const { models: visionModels, warnings } = await resolveVisionModels();
  const textModel = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
  const catalog = await getOpenRouterCatalog();
  if (catalog && !catalog.has(textModel)) {
    warnings.push(`text model "${textModel}" no longer exists on OpenRouter`);
  }
  for (const warning of warnings) console.warn(`[AI health] ${warning}`);
  const ok = visionModels.length > 0 && (!catalog || catalog.has(textModel));
  return { ok, visionModels, textModel, warnings };
}

/** Renders a single PDF page (0-based index) to a base64 PNG using PyMuPDF. */
function renderPageToBase64(pdfPath: string, pageIndex: number): string | null {
  const pythonPath = process.env.PDF_PYTHON_PATH || "python";
  try {
    const result = spawnSync(pythonPath, [RENDER_PAGE_SCRIPT, pdfPath, String(pageIndex)], {
      timeout: 30000,
      maxBuffer: 20 * 1024 * 1024  // 20 MB — enough for a high-res page
    });
    if (result.status !== 0) return null;
    const payload = JSON.parse(result.stdout.toString());
    if (payload.error || !payload.base64) return null;
    return payload.base64 as string;
  } catch {
    return null;
  }
}

// Adaptive per-page delay: stay fast in the normal case, back off only when the
// provider actually rate-limits us (HTTP 429), instead of a flat worst-case sleep
// on every single page regardless of need.
let consecutiveVisionRateLimitHits = 0;

function recordVisionRateLimitOutcome(rateLimited: boolean) {
  consecutiveVisionRateLimitHits = rateLimited ? consecutiveVisionRateLimitHits + 1 : 0;
}

function nextVisionDelayMs(): number {
  const base = Number(process.env.VISION_PAGE_DELAY_MS || 2000);
  if (consecutiveVisionRateLimitHits === 0) return base;
  const backoff = Number(process.env.VISION_RATE_LIMIT_BACKOFF_MS || 20000);
  return Math.min(backoff * Math.pow(2, consecutiveVisionRateLimitHits - 1), 120000);
}

async function generateVisionContent(textPrompt: string, imageBase64: string): Promise<string | null> {
  if (process.env.OPENROUTER_API_KEY) {
    // `models` is OpenRouter's server-side fallback routing: it tries each listed
    // model in order within a single request, so a retired model costs nothing.
    const { models } = await resolveVisionModels();
    if (models.length > 0) {
      try {
        console.log(`[Vision] OpenRouter routing across: ${models.join(", ")}`);
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://railway.app",
            "X-Title": "Coaching Portal Exam Gen"
          },
          body: JSON.stringify({
            model: models[0],
            models,
            messages: [{ role: "user", content: [
              { type: "image_url", image_url: { url: `data:image/png;base64,${imageBase64}`, detail: "high" } },
              { type: "text", text: textPrompt }
            ]}],
            response_format: { type: "json_object" },
            // Faithful transcription, not creative generation — no temperature was ever
            // set here before, meaning every extraction call ran at each provider's
            // default (commonly ~1.0), so the exact same page image could yield a
            // slightly different (and occasionally incomplete) transcription from one
            // call to the next. Low temperature makes "read exactly what's on the page"
            // far more repeatable.
            temperature: 0.1,
            max_tokens: 8000
          })
        });
        if (response.ok) {
          recordVisionRateLimitOutcome(false);
          const data = await response.json();
          const text = data.choices?.[0]?.message?.content;
          if (text) { console.log(`[Vision] OpenRouter succeeded via ${data.model ?? models[0]}.`); return text; }
        } else {
          recordVisionRateLimitOutcome(response.status === 429);
          console.warn(`[Vision] OpenRouter failed (${response.status}): ${(await response.text()).slice(0, 200)}`);
        }
      } catch (e: any) {
        console.warn(`[Vision] OpenRouter threw:`, e.message);
      }
    } else {
      console.warn("[Vision] No usable OpenRouter vision models — skipping to Gemini fallback.");
    }
  }

  // Gemini vision fallback (skipped when SKIP_GEMINI=true)
  if (process.env.SKIP_GEMINI === "true") {
    console.warn("[Vision] SKIP_GEMINI=true — Gemini vision skipped, no further fallback available.");
    return null;
  }
  const clients = getGeminiClients();
  for (const { client, name } of clients) {
    try {
      console.log(`[Vision] Gemini ${name} fallback...`);
      const result = await client.models.generateContent({
        model: GEMINI_MODEL,
        contents: [{ parts: [
          { inlineData: { mimeType: "image/png", data: imageBase64 } },
          { text: textPrompt }
        ]}],
        config: { responseMimeType: "application/json", maxOutputTokens: 8192, temperature: 0.1 }
      });
      const text = result.text;
      if (text) { console.log(`[Vision] Gemini ${name} fallback succeeded.`); return text; }
    } catch (e: any) {
      console.warn(`[Vision] Gemini ${name} fallback failed:`, e?.message ?? e);
    }
  }

  console.warn("[Vision] All vision attempts exhausted — page will use text-only extraction.");
  return null;
}

function repairJsonString(raw: string): string {
  const CONTROL_ESCAPES: Record<number, string> = {
    8: '\\b', 9: '\\t', 10: '\\n', 12: '\\f', 13: '\\r'
  };

  let inString = false;
  let result = "";
  let i = 0;

  while (i < raw.length) {
    const char = raw[i];
    const code = char.charCodeAt(0);

    if (char === '"') {
      // Count preceding backslashes to determine if this quote is escaped
      let backslashCount = 0;
      let j = i - 1;
      while (j >= 0 && raw[j] === '\\') { backslashCount++; j--; }
      if (backslashCount % 2 === 0) inString = !inString;
      result += char;
      i++;
    } else if (inString && char === '\\') {
      const nextChar = raw[i + 1] || "";

      // \n is the only control escape we keep — it's genuinely used for newlines in question text.
      // \b, \f, \r, \t are NEVER intentional in MCQ text — they're almost always LaTeX command
      // prefixes written with only one backslash (\begin, \frac, \right, \text).
      // Doubling the backslash makes JSON.parse produce the correct single \ for KaTeX.
      const keepAsJsonEscape =
        nextChar === '"' || nextChar === '\\' || nextChar === '/' || nextChar === 'n' ||
        (nextChar === 'u' && /^[0-9a-fA-F]{4}$/.test(raw.substring(i + 2, i + 6)));

      if (keepAsJsonEscape) {
        result += char + nextChar;
        i += 2;
      } else {
        // Stray backslash (including LaTeX \text, \frac, \begin, \right) — double it
        result += '\\\\';
        i++;
      }
    } else if (inString && code < 0x20) {
      // Literal control character inside a JSON string — must be escaped
      result += CONTROL_ESCAPES[code] ?? `\\u${code.toString(16).padStart(4, '0')}`;
      i++;
    } else {
      result += char;
      i++;
    }
  }

  // Remove trailing commas before ] or } (common in AI-generated JSON)
  return result.replace(/,\s*([\]}])/g, '$1');
}

/**
 * Last-resort fallback: extract individual question objects from broken/truncated JSON.
 * Locates the "questions" array then walks it extracting each balanced {...} object
 * independently, so one corrupt question doesn't block the rest.
 */
function extractQuestionsFromBrokenJson(raw: string): any[] {
  const questions: any[] = [];

  // Find the opening bracket of the questions array
  const qKeyIdx = raw.indexOf('"questions"');
  const arrayStart = qKeyIdx !== -1
    ? raw.indexOf('[', qKeyIdx)
    : raw.indexOf('[');
  if (arrayStart === -1) return questions;

  let depth = 0;
  let objStart = -1;
  let inString = false;
  let escape = false;

  for (let i = arrayStart + 1; i < raw.length; i++) {
    const c = raw[i];

    // Track escape sequences so \" inside strings don't toggle inString
    if (escape) { escape = false; continue; }
    if (c === '\\' && inString) { escape = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;

    if (c === '{') {
      if (depth === 0) objStart = i;
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0 && objStart !== -1) {
        const fragment = raw.substring(objStart, i + 1);
        try {
          const obj = JSON.parse(repairJsonString(fragment));
          if (obj.prompt || obj.options) questions.push(obj);
        } catch { /* this individual question is too corrupt to recover */ }
        objStart = -1;
      }
    } else if (c === ']' && depth === 0) {
      break; // end of questions array
    }
  }

  return questions;
}

function makeGeminiClient(apiKey: string) {
  return new GoogleGenAI({ apiKey });
}

/** Returns list of configured Gemini clients (primary key first, backup second). */
function getGeminiClients(): Array<{ client: GoogleGenAI; name: string }> {
  return [
    { key: process.env.GEMINI_API_KEY, name: "Primary" },
    { key: process.env.GEMINI_API_KEY_BACKUP, name: "Backup" },
  ]
    .filter(k => !!k.key)
    .map(k => ({ client: makeGeminiClient(k.key!), name: k.name }));
}

/** Text generation: OpenRouter primary, Gemini fallback. */
async function generateContentWithFallback(prompt: string, fallbackJson: string = "{}"): Promise<string> {
  // 1. Primary paid OpenRouter model (best for long structured outputs)
  if (process.env.OPENROUTER_API_KEY) {
    const primaryModel = process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
    try {
      console.log(`[OpenRouter] Trying ${primaryModel}...`);
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://railway.app",
          "X-Title": "Coaching Portal Exam Gen"
        },
        body: JSON.stringify({
          model: primaryModel,
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
          max_tokens: 8000
        })
      });
      if (response.ok) {
        const data = await response.json();
        const text = data.choices?.[0]?.message?.content;
        if (text) { console.log(`[OpenRouter] ${primaryModel} succeeded.`); return text; }
      } else {
        console.warn(`[OpenRouter] ${primaryModel} failed (${response.status}): ${(await response.text()).slice(0, 200)}`);
      }
    } catch (e: any) {
      console.warn(`[OpenRouter] ${primaryModel} threw:`, e.message);
    }
  }

  // 2. Gemini — capable STEM model, preferred over free 8B fallbacks (skipped when SKIP_GEMINI=true)
  if (process.env.SKIP_GEMINI !== "true") {
    const clients = getGeminiClients();
    for (const { client, name } of clients) {
      try {
        console.log(`[Gemini] ${name} trying...`);
        const result = await client.models.generateContent({
          model: GEMINI_MODEL,
          contents: prompt,
          config: { responseMimeType: "application/json" }
        });
        const text = result.text;
        if (text) { console.log(`[Gemini] ${name} succeeded.`); return text; }
      } catch (e: any) {
        console.warn(`[Gemini] ${name} failed:`, e?.message ?? e);
      }
    }
  }

  // 3. Free fallback models — last resort only; accuracy will be lower for STEM
  if (process.env.OPENROUTER_API_KEY) {
    const freeModels = ["meta-llama/llama-3.3-70b-instruct:free", "nvidia/nemotron-3-super-120b-a12b:free"];
    for (const model of freeModels) {
      try {
        console.warn(`[OpenRouter] WARNING: falling back to free model ${model} — STEM accuracy may be reduced.`);
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://railway.app",
            "X-Title": "Coaching Portal Exam Gen"
          },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
            max_tokens: 8000
          })
        });
        if (response.ok) {
          const data = await response.json();
          const text = data.choices?.[0]?.message?.content;
          if (text) return text;
        }
      } catch (e: any) {
        console.warn(`[OpenRouter] ${model} threw:`, e.message);
      }
    }
  }

  throw new Error("All AI providers failed. Check OPENROUTER_API_KEY in .env");
}

/**
 * Extracts the first complete JSON object/array from a free-model response.
 * Handles markdown code fences, preamble text, and trailing content by using
 * bracket-depth counting rather than lastIndexOf (which breaks on nested JSON).
 */
function cleanJson(raw: string): string {
  // Strip markdown fences (multiline — free models put them on their own lines)
  let s = raw.replace(/```(?:json|JSON)?\s*/g, "").replace(/```/g, "").trim();

  // Skip any preamble before the first { or [
  const start = s.search(/[{[]/);
  if (start === -1) return raw;
  s = s.slice(start);

  // Walk forward counting brackets to find the exact closing bracket
  const openChar = s[0] as "{" | "[";
  const closeChar = openChar === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (escape)             { escape = false; continue; }
    if (c === "\\" && inString) { escape = true;  continue; }
    if (c === '"')          { inString = !inString; continue; }
    if (inString)           continue;
    if (c === openChar)     depth++;
    else if (c === closeChar) {
      depth--;
      if (depth === 0) return s.slice(0, i + 1);
    }
  }

  return s; // best-effort if brackets never balanced
}

/**
 * Free-only generator — used for non-question tasks (curriculum detection,
 * topic extraction) where paid model quality is not needed.
 * Tries Gemini first (free tier), then free OpenRouter models.
 * Does NOT touch the question generation pipeline.
 */
async function generateContentFreeOnly(prompt: string, fallbackJson: string = "{}"): Promise<string> {
  // Prepend a hard JSON-only instruction that models attend to before the main prompt
  const jsonPrompt = `IMPORTANT: Respond with ONLY a valid JSON object. No explanation, no markdown, no text before or after the JSON.\n\n${prompt}`;

  const tryClean = (raw: string, source: string): string | null => {
    const cleaned = cleanJson(raw);
    if (!cleaned.startsWith("{") && !cleaned.startsWith("[")) {
      console.warn(`[FreeGen] ${source} returned non-JSON text, skipping. Preview: "${raw.slice(0, 80)}"`);
      return null;
    }
    return cleaned;
  };

  // 1. Gemini Flash — free tier, handles text extraction well
  if (process.env.SKIP_GEMINI !== "true") {
    const clients = getGeminiClients();
    for (const { client, name } of clients) {
      try {
        console.log(`[FreeGen] Gemini ${name} trying...`);
        const result = await client.models.generateContent({
          model: GEMINI_MODEL,
          contents: jsonPrompt,
          config: { responseMimeType: "application/json" }
        });
        const text = result.text;
        if (text) {
          const cleaned = tryClean(text, `Gemini ${name}`);
          if (cleaned) { console.log(`[FreeGen] Gemini ${name} succeeded.`); return cleaned; }
        }
      } catch (e: any) {
        console.warn(`[FreeGen] Gemini ${name} failed:`, e?.message ?? e);
      }
    }
  }

  // 2. DeepSeek V4 Flash — cheap, reliable JSON, same key used for question generation
  if (process.env.OPENROUTER_API_KEY) {
    const model = "deepseek/deepseek-v4-flash";
    try {
      console.log(`[FreeGen] Trying ${model}...`);
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://railway.app",
          "X-Title": "Coaching Portal"
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: "You are a JSON-only API. Always respond with valid JSON. Never include any text outside the JSON object." },
            { role: "user", content: jsonPrompt }
          ],
          response_format: { type: "json_object" },
          max_tokens: 4000
        })
      });
      if (response.ok) {
        const data = await response.json();
        const text = data.choices?.[0]?.message?.content;
        if (text) {
          const cleaned = tryClean(text, model);
          if (cleaned) { console.log(`[FreeGen] ${model} succeeded.`); return cleaned; }
        }
      } else {
        console.warn(`[FreeGen] ${model} failed (${response.status})`);
      }
    } catch (e: any) {
      console.warn(`[FreeGen] ${model} threw:`, e.message);
    }
  }

  console.warn("[FreeGen] All providers failed, returning fallback.");
  return fallbackJson;
}

function findChapterStart(text: string, chapterName: string): number {
  const lower = text.toLowerCase();
  const nameLower = chapterName.toLowerCase().trim();

  // Strategy 1: exact "chapter N: <name>" or "chapter: <name>" heading
  const chapterHeadingRegex = new RegExp(`chapter[^\\n]{0,20}${nameLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
  const headingMatch = chapterHeadingRegex.exec(text);
  if (headingMatch) return headingMatch.index;

  // Strategy 2: chapter name appears as a standalone line (likely a heading)
  const escapedName = nameLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const standaloneRegex = new RegExp(`(^|\\n)\\s*${escapedName}\\s*($|\\n)`, 'i');
  const standaloneMatch = standaloneRegex.exec(text);
  if (standaloneMatch) return standaloneMatch.index;

  // Strategy 3: simple substring match (case insensitive)
  const idx = lower.indexOf(nameLower);
  return idx;
}

// Maps a section-header keyword (as captured by detectPageSections' regexes) to the
// substring expected in that subject's name — same subject-name convention used by
// generateQuestionsFromText's isChemistry/isPhysics/isBiology checks below
// (subjectLower.includes("chemistry"), .includes("physics"), .includes("bio")).
const SECTION_KEYWORD_TO_SUBJECT_NAME_FRAGMENT: Record<string, string> = {
  chemistry: "chemistry",
  physics: "physics",
  biology: "bio",
  botany: "bio",
  zoology: "bio",
};

/**
 * Detects internal Physics/Chemistry/Biology section boundaries within a single combined
 * PDF (e.g. a NEET paper with three subject sections back to back) by looking for section
 * header lines ("PART A — PHYSICS", "SECTION 2: CHEMISTRY", a standalone "Biology" line,
 * etc.) on each page. Returns a map of 1-indexed page number -> subjectId, covering every
 * page from the first detected header onward (a page with no header inherits the most
 * recently seen section, since a section spans until the next header appears).
 *
 * Only meaningful when the book's own subject has sibling Physics/Chemistry/Biology
 * subjects to choose between (checked by the caller before invoking this) — for the
 * overwhelming majority of single-subject books, callers should skip this entirely so
 * behavior for those books is unchanged.
 */
export function detectPageSections(
  pages: string[],
  candidateSubjects: { id: string; name: string }[]
): Map<number, string> {
  const sectionMap = new Map<number, string>();
  if (candidateSubjects.length < 2) return sectionMap;

  // Three header conventions seen across generated/compiled papers, tried in order:
  //  1. "*  Physics  [180]" — bullet + subject + bracketed marks total (no newline
  //     reliably separating it from the text that follows, so this can't require the
  //     subject to be alone on its own line).
  //  2. "PART A — PHYSICS" / "SECTION 2: CHEMISTRY" — explicit part/section marker.
  //  3. A bare "Biology" standalone line with nothing else on it.
  const bulletMarksRe = /[*•]\s*(physics|chemistry|biology|botany|zoology)\s*\[\s*\d+\s*\]/i;
  const headerRe = /\b(?:part|section)\s*[-:.]?\s*[a-c1-3]\b[^\n]{0,40}?\b(physics|chemistry|biology|botany|zoology)\b/i;
  const standaloneRe = /^[ \t]*(physics|chemistry|biology|botany|zoology)[ \t]*(section)?[ \t]*$/im;

  let current: string | null = null;
  pages.forEach((pageText, i) => {
    const match = bulletMarksRe.exec(pageText) || headerRe.exec(pageText) || standaloneRe.exec(pageText);
    if (match) {
      const keyword = match[1].toLowerCase();
      const nameFragment = SECTION_KEYWORD_TO_SUBJECT_NAME_FRAGMENT[keyword];
      const subject = nameFragment ? candidateSubjects.find(s => s.name.toLowerCase().includes(nameFragment)) : undefined;
      if (subject) current = subject.id;
    }
    if (current) sectionMap.set(i + 1, current);
  });

  return sectionMap;
}

/**
 * Vision extraction via Gemini SDK (primary) — retries on 429 instead of falling back
 * to a lower-quality model.
 */

export async function generateQuestionsFromText(params: {
  text: string;
  topicId: string;
  subjectId: string;
  subject?: string;
  questionCount?: number;
  chapterName?: string;
  topicNames?: string[];
  onProgress?: (message: string) => void;
}): Promise<Question[]> {
  const { text, topicId, subjectId, subject, questionCount = 5, chapterName, topicNames, onProgress } = params;

  if (!process.env.GEMINI_API_KEY && !process.env.OPENROUTER_API_KEY) {
    throw new Error("Neither GEMINI_API_KEY nor OPENROUTER_API_KEY is configured.");
  }

  const textLower = text.toLowerCase();
  const subjectLower = (subject ?? "").toLowerCase();

  const chemKeywords = ["chemistry", "molecule", "reaction", "bond", "acid", "organic", "compound", "structure", "formula", "chemical"];
  const isChemistry = subjectLower.includes("chemistry") || chemKeywords.some(k => textLower.includes(k));

  // Narrower than isChemistry — only true when the SOURCE TEXT itself names organic
  // compounds/structures. isChemistry alone (e.g. "reaction", "formula") also matches
  // purely inorganic/physical chemistry text (equilibrium, kinetics, thermodynamics),
  // which has no structures to draw and must never trigger SMILES questions.
  const organicKeywords = [
    "organic chemistry", "hydrocarbon", "alkane", "alkene", "alkyne", "benzene", "phenol",
    "alcohol", "aldehyde", "ketone", "carboxylic", "ester", "amine", "amide", "aromatic",
    "functional group", "haloalkane", "grignard", "structural isomer", "stereochemistry",
    "smiles"
  ];
  const isOrganicChemistry = isChemistry && organicKeywords.some(k => textLower.includes(k));

  const physicsKeywords = ["physics", "force", "velocity", "acceleration", "momentum", "energy", "wave", "optics", "electric", "magnetic", "thermodynamic", "motion", "kinematics", "gravitation", "pressure", "current", "resistance"];
  const isPhysics = subjectLower.includes("physics") || physicsKeywords.some(k => textLower.includes(k));

  const mathKeywords = ["mathematics", "calculus", "algebra", "geometry", "trigonometry", "integration", "differentiation", "probability", "matrix", "determinant", "vector", "coordinate", "parabola", "ellipse"];
  const isMath = subjectLower.includes("math") || mathKeywords.some(k => textLower.includes(k));

  const bioKeywords = ["biology", "cell", "organism", "photosynthesis", "respiration", "genetics", "dna", "rna", "enzyme", "ecosystem", "evolution", "hormone", "neuron", "mitosis", "meiosis"];
  const isBiology = subjectLower.includes("bio") || bioKeywords.some(k => textLower.includes(k));

  // Detect target competitive exam from subject name / topic names / text
  const topicStr = (topicNames ?? []).join(" ").toLowerCase();
  const isJEE = subjectLower.includes("jee") || topicStr.includes("jee") || textLower.includes("jee") || textLower.includes("iit");
  const isNEET = subjectLower.includes("neet") || topicStr.includes("neet") || textLower.includes("neet") || textLower.includes("aiims");

  // Hard topics require Pro model even in draft phase — cheap models produce wrong answers here
  const hardTopicKeywords = [
    // Organic chemistry mechanisms
    "organic", "mechanism", "named reaction", "carbonyl", "nucleophilic", "electrophilic",
    "sn1", "sn2", "elimination", "aldol", "cannizzaro", "grignard", "beckmann",
    "rearrangement", "addition reaction", "substitution reaction", "stereochemistry",
    "chirality", "enantiomer", "diastereomer",
    // Complex physics
    "rotational mechanics", "moment of inertia", "electromagnetic induction",
    "alternating current", "ac circuit", "lcr", "kirchhoff", "wheatstone",
    // Complex maths
    "complex number", "differential equation", "integration by parts",
    "triple integral", "vector calculus", "fourier",
  ];
  const isHardTopic = isChemistry
    ? hardTopicKeywords.some(k => topicStr.includes(k) || subjectLower.includes(k))
    : hardTopicKeywords.some(k => topicStr.includes(k));

  const draftGenerator = isHardTopic
    ? (p: string) => { console.log("[Draft] Hard topic detected — routing to Pro model."); return generateContentWithFallback(p, '{"questions": []}'); }
    : generateContentForDraft;

  const needsGraph = isPhysics || isMath || isBiology;

  // Fetch existing questions for this topic to avoid duplication
  const allQuestionsInDb = await listRecords<Question>("questions");
  const existingTopicQuestions = allQuestionsInDb.filter(q => q.topicId === topicId);
  
  const verifiedExamples = existingTopicQuestions
    .filter(q => q.isVerified)
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
  let attempts = 0;
  const maxAttempts = 3; // Retry up to 3 rounds of generations to fill gap of rejected questions

  while (allQuestions.length < questionCount && attempts < maxAttempts) {
    attempts++;
    const needed = questionCount - allQuestions.length;
    const batchSize = 10;
    const numBatches = Math.ceil(needed / batchSize);

    console.log(`Generation round ${attempts}: Need ${needed} questions. Launching ${numBatches} parallel batches.`);
    onProgress?.(`Round ${attempts}: generating ${needed} question(s) across ${numBatches} parallel batch(es)...`);

    const batchPromises = Array.from({ length: numBatches }).map(async (_, batchIndex) => {
      const currentBatchCount = batchIndex === numBatches - 1
        ? needed - batchIndex * batchSize
        : batchSize;

      if (currentBatchCount <= 0) return [];

      const allKnownPrompts = [...existingTopicQuestions.map(q => q.prompt), ...allQuestions.map(q => q.prompt)];
      const shuffledPrompts = allKnownPrompts.sort(() => 0.5 - Math.random());
      const previousPrompts = shuffledPrompts.slice(0, 40).join("\n- ");
      
      const avoidanceInstruction = allKnownPrompts.length > 0 
        ? `\nIMPORTANT: Do NOT repeat, rephrase, or generate questions similar to these existing ones:\n- ${previousPrompts}\n\nGenerate COMPLETELY NEW and UNIQUE questions that cover different concepts or use different values.` 
        : "";

      const maxChunkSize = 30000;
      let textChunk = text;
      if (chapterName) {
        // Find where this chapter starts in the book text
        const chapterStart = findChapterStart(text, chapterName);
        if (chapterStart !== -1) {
          console.log(`[Generate] Found chapter "${chapterName}" at position ${chapterStart} in book text`);
          textChunk = text.substring(chapterStart, chapterStart + maxChunkSize);
        } else if (text.length > maxChunkSize) {
          // Chapter not found by name — fall back to random chunk
          const maxStart = text.length - maxChunkSize;
          const startIdx = Math.floor(Math.random() * maxStart);
          textChunk = text.substring(startIdx, startIdx + maxChunkSize);
        }
      } else if (text.length > maxChunkSize) {
        const maxStart = text.length - maxChunkSize;
        const startIdx = Math.floor(Math.random() * maxStart);
        textChunk = text.substring(startIdx, startIdx + maxChunkSize);
      }

      const chapterFocusInstruction = chapterName
        ? `\nFOCUS: Generate questions EXCLUSIVELY about the chapter "${chapterName}"${topicNames?.length ? `, covering these topics: ${topicNames.join(', ')}` : ''}. Do NOT generate questions about any other chapter or unrelated content.\n`
        : "";

      // Exam-type specific syllabus enforcement block
      const examScopeInstruction = (() => {
        if (isJEE) return `
EXAM SCOPE — JEE (Joint Entrance Examination):
- ALL questions MUST be within the official JEE Main/Advanced syllabus. Do NOT ask about topics not covered in JEE syllabus.
- Physics: Mechanics, Thermodynamics, Electrostatics, Magnetism, Optics, Modern Physics, Waves, SHM, Rotation, Gravitation, Fluid Mechanics. NOT general science trivia.
- Chemistry: Physical (Equilibrium, Electrochemistry, Kinetics, Thermodynamics), Inorganic (Periodicity, Coordination, p/d-block elements), Organic (Named reactions, Mechanisms, Functional groups, Polymers, Biomolecules). Do NOT go outside the JEE chemistry syllabus.
- Mathematics: Calculus, Coordinate Geometry, Algebra (Complex numbers, Matrices, Sequences), Trigonometry, Vectors, 3D Geometry, Probability, Permutations & Combinations. NOT topics outside JEE scope.
- Style: Application-based, multi-step numerical problems. No straight-recall trivia. Marks: 4 per question, negative: -1.
`;
        if (isNEET) return `
EXAM SCOPE — NEET (National Eligibility cum Entrance Test):
- ALL questions MUST be within the official NEET syllabus (Classes XI and XII NCERT topics). Do NOT ask about topics beyond NEET scope.
- Physics: Laws of Motion, Work-Energy, Thermal Properties, Electrostatics, Current Electricity, Magnetic Effects, Optics, Dual Nature, Atoms and Nuclei. NCERT-aligned only.
- Chemistry: Physical (Mole concept, Equilibrium, Electrochemistry), Inorganic (Periodic table, Chemical bonding, p-block, d-block), Organic (Biomolecules, Polymers, Mechanisms). NCERT-aligned only.
- Biology: Cell Biology, Genetics, Ecology, Plant Physiology, Human Physiology, Reproduction, Evolution, Biotechnology. STRICTLY based on NCERT XI–XII content.
- Style: Concept-based MCQs, NCERT level. 1–2 mark per question, negative: -1/4.
`;
        return "";
      })();

      const topicScopeInstruction = topicNames?.length
        ? `TOPIC SCOPE — Generate questions ONLY from these specific topics: ${topicNames.join(", ")}. Questions about ANY other topic, even from the same subject, must NOT be generated.`
        : "";

      const prompt = `
You are an expert educator creating exam questions STRICTLY from the provided textbook content. Generate exactly ${currentBatchCount} NEW multiple-choice questions.

SYLLABUS ENFORCEMENT (HIGHEST PRIORITY — OVERRIDE EVERYTHING ELSE):
1. ONLY use concepts, facts, and formulas that APPEAR IN THE TEXT BELOW or are direct implications of it. Do NOT use general knowledge or anything not in the text.
2. If the text does not contain enough material for ${currentBatchCount} questions on the topic, generate fewer high-quality on-topic questions rather than inventing off-topic ones.
3. Every question must be traceable to a specific sentence, formula, or concept in the provided text.
${topicScopeInstruction}
${examScopeInstruction}
${chapterFocusInstruction}
${exampleInstruction}
${avoidanceInstruction}

STRICT STEM AND MATHEMATICAL RULES:
1. LaTeX: Use $...$ for inline math and $$...$$ for display/block math.
2. JSON ESCAPING: Inside a JSON string, every LaTeX backslash must be written as TWO backslashes. Examples:
   - \\frac{1}{2}   (renders as \frac)
   - \\sqrt{x}      (renders as \sqrt)
   - \\text{H}_2\\text{O}  (renders as \text{H}_2\text{O})
   - \\alpha, \\beta, \\theta, \\Delta, \\omega, \\lambda, \\mu, \\sigma, \\pi
   - \\begin{cases} ... \\end{cases}
   - \\vec{F}, \\hat{n}, \\times, \\cdot  (for vectors and cross/dot products)
2a. Physics Notation Rules:
   - Vectors: always use $\\vec{F}$, $\\vec{v}$, $\\vec{E}$, $\\vec{B}$ — never plain F, v, E, B for vector quantities.
   - Unit vectors: $\\hat{i}$, $\\hat{j}$, $\\hat{k}$, $\\hat{n}$
   - SI Units: write inside \\text{}: $10 \\ \\text{m/s}$, $9.8 \\ \\text{ms}^{-2}$, $1.6 \\times 10^{-19} \\ \\text{C}$
   - Scientific notation: $6.022 \\times 10^{23}$, $3 \\times 10^8 \\ \\text{m/s}$
   - Derived formulas: $F = \\frac{mv^2}{r}$, $E = \\frac{1}{2}mv^2$, $P = \\frac{W}{t}$
2b. Mathematics Notation Rules:
   - Calculus: $\\frac{dy}{dx}$, $\\frac{d^2y}{dx^2}$, $\\int_a^b f(x)\\,dx$, $\\lim_{x \\to 0}$
   - Sets and logic: $\\in$, $\\subset$, $\\cup$, $\\cap$, $\\forall$, $\\exists$
   - Matrices: use \\begin{pmatrix}...\\end{pmatrix} or \\begin{vmatrix}...\\end{vmatrix}
   - Trigonometry: $\\sin\\theta$, $\\cos\\theta$, $\\tan\\theta$ — never write sin(x) without LaTeX.
3. Chemistry structures: Use [SMILES: notation] for any drawn chemical structure (e.g. [SMILES: CC(=O)O] for acetic acid, [SMILES: c1ccccc1] for benzene).
   IMPORTANT: SMILES notation is NOT a chemical formula. Never put atomic symbols like H2O inside [SMILES:].
3a. ${isOrganicChemistry ? `Structure-Identification Questions (only if the TEXT below names specific organic compounds): Generate at most 1 question per batch where:
   - The compound in the question stem is one that is EXPLICITLY named or discussed in the TEXT below — never invent a compound absent from the text.
   - The question stem shows that compound's structure using [SMILES: ...] and asks the student to identify it, name it, or select a matching property.
   - Each of the 4 options is ALSO a [SMILES: ...] value showing a different structure, with only one matching the question.
   - Use only valid, complete SMILES strings. Never leave a SMILES string truncated or unclosed.
   - If the text does not name any specific organic compound, skip this rule entirely — do not fabricate one.` : "Do NOT generate any [SMILES: ...] or structure-identification questions — the provided text is not about organic structures."}
4. Chemical Formulas and Equations: Format ALL chemical formulas using mhchem $\\ce{formula}$ notation:
   - $\\ce{H2O}$, $\\ce{CO2}$, $\\ce{K2SO4}$, $\\ce{Al2(SO4)3}$, $\\ce{NaCl}$, $\\ce{CaCl2}$
   - For ionic equations: $\\ce{Al4C3 + 12H2O -> 4Al(OH)3 + 3CH4}$
   - For ions: $\\ce{Al^{3+}}$, $\\ce{Cl^{-}}$, $\\ce{SO4^{2-}}$, $\\ce{NH4^{+}}$
   - ALWAYS wrap \\ce inside $...$. Never write bare \\ce without $ delimiters.
   - Never write plain text like H2O or K2SO4 — always use $\\ce{...}$.
5. Colligative Properties & van't Hoff Factor (i):
   - For questions on colligative properties (freezing point depression, boiling point elevation, vapour pressure lowering, osmotic pressure) of electrolytes (e.g. NaCl, KCl, CaCl2, Na2SO4, etc.), you MUST calculate and include the van't Hoff factor (i) assuming complete dissociation (unless degree of dissociation is given).
   - E.g., for NaCl, i = 2; for KCl, i = 2; for Na2SO4, i = 3; for MgSO4, i = 2.
   - Do not ignore/neglect dissociation for strong/weak electrolytes.
6. Absolute Self-Containment:
   - Do NOT say "refer to the figure", "see the graph above", "from the table provided", "from the given text", or "as shown above". Never reference anything outside the question itself.
   - Every number, formula, and diagram a student needs MUST be written directly inside the question prompt.
   - For graph-based questions: embed the graph using [GRAPH: ...] DIRECTLY in the prompt (see rule 7 below). Never say "the graph shows X" without including the actual [GRAPH: ...] token.
7. ${needsGraph ? `Graphs (REQUIRED — you MUST generate these for this subject):
   For any question involving a graph (v-t, x-t, F-x, P-V, sine wave, parabola, distance-time, growth curve, population graph, etc.), embed the graph DIRECTLY inside the prompt string using this exact format:
   [GRAPH: line;x=<values>;y=<values>;xl=<x label>;yl=<y label>;title=<title>]
   CRITICAL FORMAT RULES:
   - Separate fields with semicolons (;). Separate numbers with spaces. No quotes. No extra brackets inside the spec.
   - x and y must have the same count of values (3–10 points).
   - For two traces use y1= and y2= (plus optional n1= n2= for names).
   EXAMPLES (copy this style exactly):
   - v-t graph:  [GRAPH: line;x=0 1 2 3 4 5;y=0 4 8 12 12 8;xl=Time (s);yl=Velocity (m/s);title=v-t Graph]
   - P-V diagram: [GRAPH: line;x=1 2 3 4 5;y=10 5 3.3 2.5 2;xl=Volume (L);yl=Pressure (atm);title=Isothermal Process]
   - Sine wave: [GRAPH: line;x=0 1 2 3 4 5 6;y=0 1 0 -1 0 1 0;xl=t (s);yl=y (m);title=Simple Harmonic Motion]
   - Math parabola: [GRAPH: line;x=-3 -2 -1 0 1 2 3;y=9 4 1 0 1 4 9;xl=x;yl=y;title=y = x^2]
   - Biology growth: [GRAPH: line;x=0 1 2 3 4 5;y=10 20 40 80 160 320;xl=Time (hours);yl=Population;title=Bacterial Growth Curve]
   - Two-trace: [GRAPH: line;x=0 1 2 3;y1=0 5 10 15;y2=0 2 4 6;n1=Body A;n2=Body B;xl=Time (s);yl=Velocity (m/s);title=Comparison]
   YOU MUST generate at least 1 graph-based question per batch for chapters involving motion, waves, thermodynamics, coordinate geometry, calculus, or biological processes.` : "Graphs: Not applicable for this subject — do not use [GRAPH: ...]."}

STRICT QUESTION LOGIC RULES:
1. Unique Option Values: All option values MUST be completely unique. Never generate duplicate options.
2. Correct Answer Consistency: The option marked "isCorrect": true MUST be the mathematically correct value derived from your scratchpad calculation.
3. Mandatory Calculation Scratchpad: You MUST fill in "calculation_scratchpad" FIRST before writing the options or explanation. Use it to:
   ${isPhysics ? `- State the law/formula used (e.g. F = ma, v² = u² + 2as, E = ½mv²).
   - Substitute values WITH UNITS at every step.
   - Verify the unit of the final answer matches what the question asks for.
   - For vector quantities, track direction/sign explicitly.` : ""}
   ${isMath ? `- Write out every algebraic or calculus step.
   - Verify the result by substituting back or using a sanity check.` : ""}
   ${isChemistry ? `- Apply the van't Hoff factor (i) for electrolytes.
   - Balance equations before computing stoichiometry.` : ""}
   - Only AFTER the scratchpad is correct, write the prompt, options, and explanation.
4. RANDOMIZE CORRECT ANSWER POSITION: The correct option must NOT always be "A". Vary the position — sometimes A, sometimes B, sometimes C, sometimes D. Aim for roughly equal distribution across a batch.

JSON RULES:
1. NO markdown wrappers (no \`\`\`json).
2. NO trailing commas.
3. Use DOUBLE QUOTES only.
4. Output ONLY the JSON object.

JSON STRUCTURE:
{
  "questions": [
    {
      "calculation_scratchpad": "Step-by-step workings here. For physics: state the formula, substitute values with units, verify units in final answer. For chemistry: apply i factor for electrolytes, balance equations.",
      "prompt": "${needsGraph ? `The velocity-time graph of a body is shown below. [GRAPH: line;x=0 1 2 3 4 5;y=0 4 8 8 4 0;xl=Time (s);yl=Velocity (m/s);title=v-t Graph] What is the total distance covered by the body?` : `A ball is thrown vertically upward with a speed of $20 \\ \\text{m/s}$. What is the maximum height reached? (Take $g = 10 \\ \\text{m/s}^2$)`}",
      "difficulty": "medium",
      "marks": 2,
      "negativeMarks": 0,
      "options": [
        { "label": "A", "value": "${needsGraph ? `24 m` : `10 m`}", "isCorrect": false },
        { "label": "B", "value": "${needsGraph ? `28 m` : `20 m`}", "isCorrect": true },
        { "label": "C", "value": "${needsGraph ? `32 m` : `30 m`}", "isCorrect": false },
        { "label": "D", "value": "${needsGraph ? `20 m` : `40 m`}", "isCorrect": false }
      ],
      "explanation": "${needsGraph ? `Area under v-t graph = distance. Triangle (0–2s): ½×2×8=8m. Rectangle (2–3s): 1×8=8m. Triangle (3–5s): ½×2×8=8m. Wait—re-check: trapezoid (0–3s): area=½×(0+8)×2 + 8×1 = 8+8=16m? No: from graph: (0,0)→(2,8) triangle=8m; (2,8)→(3,8) rect=8m; (3,8)→(5,0) triangle=8m. Total=24m.` : `Using v²=u²-2gh at max height v=0: 0=400-20h → h=20 m.`}"
    }
  ]
}

TEXT CONTENT:
---
${textChunk}
---
      `;

      let batchAttempts = 0;
      while (batchAttempts < 2) {
        batchAttempts++;
        try {
          console.log(`Generating batch ${batchIndex + 1} (attempt ${batchAttempts}, count: ${currentBatchCount})...`);
          let rawResponse = await draftGenerator(prompt);
          
          const startIdx = rawResponse.indexOf("{");
          const endIdx = rawResponse.lastIndexOf("}");
          if (startIdx !== -1 && endIdx !== -1) {
            rawResponse = rawResponse.substring(startIdx, endIdx + 1);
          }

          const repaired = repairJsonString(rawResponse);
          let parsedArr: any[];
          try {
            const parsedObj = JSON.parse(repaired);
            parsedArr = parsedObj.questions || (Array.isArray(parsedObj) ? parsedObj : []);
          } catch (parseErr: any) {
            // Full parse failed (e.g. truncated response) — extract individual question objects
            parsedArr = extractQuestionsFromBrokenJson(rawResponse);
            if (parsedArr.length === 0) {
              console.warn(`Batch ${batchIndex + 1}: full JSON parse failed and fragment extraction found nothing. Parse error: ${parseErr.message}`);
              console.warn(`Raw response preview (first 500 chars): ${rawResponse.substring(0, 500)}`);
            } else {
              console.warn(`Batch ${batchIndex + 1}: full JSON parse failed, recovered ${parsedArr.length} questions via fragment extraction`);
            }
          }

          const mappedQuestions = parsedArr.map((item: any, idx: number): Question => {
            const qId = `q-ai-${Date.now()}-${batchIndex}-${idx}`;

            // Assign IDs first, preserving isCorrect flag, then shuffle to randomize answer position
            const rawOptions: Array<{ id: string; value: any; isCorrect: boolean }> =
              (item.options || []).map((opt: any, optIndex: number) => ({
                id: `opt-${Date.now()}-${batchIndex}-${idx}-${optIndex}`,
                value: opt.value,
                isCorrect: !!opt.isCorrect,
              }));

            // Fisher-Yates shuffle — prevents AI's bias of always placing the answer in position A
            for (let si = rawOptions.length - 1; si > 0; si--) {
              const sj = Math.floor(Math.random() * (si + 1));
              [rawOptions[si], rawOptions[sj]] = [rawOptions[sj], rawOptions[si]];
            }

            const correctOptionIds: string[] = [];
            const options: QuestionOption[] = rawOptions.map((opt, optIndex) => {
              if (opt.isCorrect) correctOptionIds.push(opt.id);
              return { id: opt.id, label: String.fromCharCode(65 + optIndex), value: ensureMathDelimited(String(opt.value ?? "")) };
            });

            const promptText = ensureMathDelimited(String(item.prompt ?? ""), false);
            const explanationText = ensureMathDelimited(String(item.explanation ?? ""), false);
            const qaFlags: string[] = [];
            if (hasUndelimitedLatex(promptText) || hasUndelimitedLatex(explanationText)) {
              qaFlags.push("undelimited_latex");
            }

            return {
              id: qId,
              subjectId,
              topicId,
              type: (correctOptionIds.length > 1 ? "multi_correct" : "single_correct") as "multi_correct" | "single_correct",
              prompt: promptText,
              difficulty: item.difficulty,
              marks: item.marks || 2,
              negativeMarks: item.negativeMarks || 0,
              options,
              correctOptionIds,
              explanation: explanationText,
              qaFlags,
              qaStatus: qaFlags.length > 0 ? "flagged" : "unreviewed",
              qaCheckedAt: new Date().toISOString(),
            };
          });

          // Hard grounding guard: drop any question the model generated about a chemical
          // structure when the source text isn't organic chemistry. This does not depend
          // on the model following the prompt instruction — it is enforced in code.
          const groundedQuestions = isOrganicChemistry
            ? mappedQuestions
            : mappedQuestions.filter((q) => {
                const containsSmiles = q.prompt.includes("[SMILES:")
                  || q.options.some((o) => String(o.value).includes("[SMILES:"));
                if (containsSmiles) {
                  console.warn(`[Generate] Dropped ungrounded SMILES question (source text is not organic chemistry): "${q.prompt.slice(0, 80)}"`);
                }
                return !containsSmiles;
              });

          // Run Critic validation on this batch
          onProgress?.(`Batch ${batchIndex + 1}: ${groundedQuestions.length} question(s) generated — running critic validation...`);
          const validatedQuestions = await validateQuestionsBatch(groundedQuestions, subject);

          if (validatedQuestions.length > 0) {
            console.log(`Batch ${batchIndex + 1} succeeded and verified on attempt ${batchAttempts}. Yielded ${validatedQuestions.length}/${currentBatchCount} valid questions.`);
            onProgress?.(`Batch ${batchIndex + 1}: ${validatedQuestions.length}/${currentBatchCount} question(s) passed critic ✓`);
            return validatedQuestions;
          }
        } catch (error: any) {
          console.error(`Batch ${batchIndex + 1} attempt ${batchAttempts} failed:`, error.message);
        }
      }
      return [];
    });

    const results = await Promise.all(batchPromises);
    for (const qList of results) {
      allQuestions.push(...qList);
    }
    console.log(`Round ${attempts} finished. Total accumulated valid questions: ${allQuestions.length}/${questionCount}`);
  }

  return allQuestions.slice(0, questionCount);
}

/**
 * Cheap draft generator for question generation batches.
 * Uses QUESTION_GEN_MODEL (e.g. deepseek/deepseek-v4-flash or qwen/qwen3-max).
 * Falls back to the primary OPENROUTER_MODEL if the draft model fails.
 */
async function generateContentForDraft(prompt: string): Promise<string> {
  const draftModel = process.env.QUESTION_GEN_MODEL || "deepseek/deepseek-v4-flash";

  if (process.env.OPENROUTER_API_KEY) {
    try {
      console.log(`[Draft] Trying ${draftModel}...`);
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://railway.app",
          "X-Title": "Coaching Portal Question Draft"
        },
        body: JSON.stringify({
          model: draftModel,
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
          max_tokens: 8000
        }),
        signal: AbortSignal.timeout(90_000)
      });
      if (response.ok) {
        const data = await response.json();
        const text = data.choices?.[0]?.message?.content;
        if (text) { console.log(`[Draft] ${draftModel} succeeded.`); return text; }
      } else {
        console.warn(`[Draft] ${draftModel} failed (${response.status}) — falling back to primary model.`);
      }
    } catch (e: any) {
      console.warn(`[Draft] ${draftModel} threw: ${e.message} — falling back to primary model.`);
    }
  }

  // Fall back to the standard primary model (Pro) if draft model fails
  console.log("[Draft] Falling back to generateContentWithFallback (primary model)...");
  return generateContentWithFallback(prompt, '{"questions": []}');
}

async function generateContentForCritic(prompt: string): Promise<string> {
  const skipGemini = process.env.SKIP_GEMINI === "true";

  // 1. Gemini — best at STEM math reasoning (skipped when SKIP_GEMINI=true)
  if (!skipGemini) {
    const geminiClients = getGeminiClients();
    for (const { client, name } of geminiClients) {
      try {
        console.log(`[Critic] Using Gemini ${name}...`);
        const result = await client.models.generateContent({
          model: GEMINI_MODEL,
          contents: prompt,
          config: { responseMimeType: "application/json", maxOutputTokens: 16384 }
        });
        const text = result.text;
        if (text) { console.log(`[Critic] Gemini ${name} responded.`); return text; }
      } catch (e: any) {
        console.warn(`[Critic] Gemini ${name} failed:`, e?.message ?? e);
      }
    }
  } else {
    console.log("[Critic] SKIP_GEMINI=true — skipping Gemini, using OpenRouter only.");
  }

  // 2. OpenRouter paid model
  if (process.env.OPENROUTER_API_KEY) {
    const criticModel = process.env.OPENROUTER_CRITIC_MODEL || process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
    try {
      console.log(`[Critic] Using OpenRouter ${criticModel}...`);
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://railway.app",
          "X-Title": "Coaching Portal Critic"
        },
        body: JSON.stringify({
          model: criticModel,
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
          max_tokens: 16384
        })
      });
      if (response.ok) {
        const data = await response.json();
        const text = data.choices?.[0]?.message?.content;
        if (text) return text;
      } else {
        console.warn(`[Critic] OpenRouter ${criticModel} failed (${response.status})`);
      }
    } catch (e: any) {
      console.warn(`[Critic] OpenRouter threw:`, e.message);
    }
  }

  throw new Error("[Critic] No capable AI model available for validation (need GEMINI_API_KEY or OPENROUTER_API_KEY with a paid model)");
}

async function validateQuestionsBatch(
  questions: Question[],
  subjectName?: string
): Promise<Question[]> {
  if (questions.length === 0) return [];

  const isPhysicsCritic = subjectName?.toLowerCase().includes("physics") ?? false;
  const isChemistryCritic = subjectName?.toLowerCase().includes("chemistry") ?? false;
  const isMathCritic = subjectName?.toLowerCase().includes("math") ?? false;

  const criticPrompt = `
You are an elite academic validator for JEE/NEET ${subjectName ? `${subjectName} ` : "STEM "}questions. Your job is to CATCH ERRORS that the generator made. Be strict — a wrong answer reaching a student is a serious failure.

VALIDATION RULES (check ALL of these):
1. Recalculate the answer independently from scratch. Do NOT trust the generator's answer — derive it yourself and verify the option marked isCorrect matches YOUR derivation.
2. Check units at every step. A velocity answer in m/s is wrong if the question works in km/h without conversion.
3. Ensure no two options have the same value (even if formatted differently, e.g. "2 m/s" vs "2.0 m/s" are duplicates).
4. Ensure the question is fully standalone — no "from the graph above", "as shown", "from the table", etc.
${isPhysicsCritic ? `
PHYSICS-SPECIFIC CHECKS:
- Verify kinematic equations are applied correctly (v=u+at, s=ut+½at², v²=u²+2as).
- Verify energy/work: KE=½mv², PE=mgh, W=Fd·cosθ.
- For circuits: verify Ohm's law, series/parallel resistance formulas.
- For waves: verify v=fλ, correct use of n for harmonics.
- Check sign conventions for direction-dependent quantities (displacement, velocity, force).
- Verify Newton's laws: net force = ma (don't forget to subtract friction, tension, etc.).
- For rotational motion: verify τ=Iα, L=Iω.
- Check projectile motion: horizontal and vertical components must be solved independently.` : ""}
${isChemistryCritic ? `
CHEMISTRY-SPECIFIC CHECKS:
- Verify van't Hoff factor (i) for ALL electrolytes in colligative property questions.
  NaCl→i=2, KCl→i=2, BaCl2→i=3, Na2SO4→i=3, AlCl3→i=4, CaCl2→i=3.
- Balance chemical equations before computing molar ratios.
- Verify oxidation states in redox reactions.
- For pH calculations: verify Ka/Kb expressions and equilibrium setup.` : ""}
${isMathCritic ? `
MATHEMATICS-SPECIFIC CHECKS:
- Verify algebraic manipulation step by step.
- For calculus: verify differentiation/integration rules and limits.
- For coordinate geometry: verify distance, slope, and intersection formulas.
- For probability: verify sample space and event definitions.` : ""}
5. If a question is wrong AND you can correct it, provide the correctedQuestion. If you cannot derive the correct answer with certainty, set isValid=false with no correctedQuestion (it will be dropped).

Input Questions:
${JSON.stringify(questions.map((q, idx) => ({
    index: idx,
    prompt: q.prompt,
    options: q.options.map(o => ({ id: o.id, label: o.label, value: o.value, isCorrect: q.correctOptionIds.includes(o.id) })),
    explanation: q.explanation
  })), null, 2)}

Output JSON ONLY:
{
  "evaluations": [
    {
      "index": 0,
      "isValid": true,
      "reason": "Looks good"
    },
    {
      "index": 1,
      "isValid": false,
      "reason": "Van't Hoff factor was omitted for KCl (i=2).",
      "correctedQuestion": {
        "prompt": "Corrected prompt here",
        "options": [
          { "label": "A", "value": "Distractor 1", "isCorrect": false },
          { "label": "B", "value": "Correct value", "isCorrect": true },
          { "label": "C", "value": "Distractor 2", "isCorrect": false },
          { "label": "D", "value": "Distractor 3", "isCorrect": false }
        ],
        "explanation": "Corrected explanation here"
      }
    }
  ]
}
`;

  try {
    console.log(`[Critic] Reviewing ${questions.length} questions with capable model...`);
    const rawResponse = await generateContentForCritic(criticPrompt);
    const startIdx = rawResponse.indexOf("{");
    const endIdx = rawResponse.lastIndexOf("}");
    if (startIdx === -1 || endIdx === -1) {
      console.warn("[Critic] Response had no valid JSON — passing questions unchanged.");
      return questions;
    }

    const parsed = JSON.parse(rawResponse.substring(startIdx, endIdx + 1));
    const evaluations: any[] = parsed.evaluations || [];

    let validCount = 0, correctedCount = 0, rejectedCount = 0;
    const finalQuestions: Question[] = [];

    for (const q of questions) {
      const idx = questions.indexOf(q);
      const evalItem = evaluations.find((e: any) => e.index === idx);

      if (!evalItem) {
        // Critic didn't cover this question — keep it but log
        console.warn(`[Critic] No evaluation returned for question ${idx} — keeping as-is.`);
        finalQuestions.push(q);
        continue;
      }

      if (evalItem.isValid) {
        validCount++;
        finalQuestions.push(q);
      } else if (evalItem.correctedQuestion) {
        correctedCount++;
        console.log(`[Critic] Corrected Q${idx}: ${evalItem.reason}`);
        const cq = evalItem.correctedQuestion;

        // Assign IDs then shuffle, same as generator — prevents critic answer-position bias
        const rawCorrected: Array<{ id: string; value: any; isCorrect: boolean }> =
          (cq.options || []).map((opt: any, optIndex: number) => ({
            id: `opt-${Date.now()}-corrected-${idx}-${optIndex}`,
            value: opt.value,
            isCorrect: !!opt.isCorrect,
          }));
        for (let si = rawCorrected.length - 1; si > 0; si--) {
          const sj = Math.floor(Math.random() * (si + 1));
          [rawCorrected[si], rawCorrected[sj]] = [rawCorrected[sj], rawCorrected[si]];
        }
        const correctOptionIds: string[] = [];
        const options = rawCorrected.map((opt, optIndex) => {
          if (opt.isCorrect) correctOptionIds.push(opt.id);
          return { id: opt.id, label: String.fromCharCode(65 + optIndex), value: opt.value };
        });
        finalQuestions.push({
          ...q,
          prompt: cq.prompt || q.prompt,
          options,
          correctOptionIds,
          type: correctOptionIds.length > 1 ? "multi_correct" : "single_correct",
          explanation: cq.explanation || q.explanation
        });
      } else {
        rejectedCount++;
        console.warn(`[Critic] Rejected Q${idx} (no correction provided): ${evalItem.reason}`);
        // Drop this question — it's wrong and couldn't be auto-corrected
      }
    }

    console.log(`[Critic] Summary: ${validCount} valid, ${correctedCount} corrected, ${rejectedCount} rejected out of ${questions.length}.`);
    return finalQuestions;
  } catch (error: any) {
    console.error("[Critic] SKIPPED — validation unavailable:", error.message);
    console.warn("[Critic] All questions from this batch pass unvalidated. Check GEMINI_API_KEY on Railway.");
    return questions;
  }
}

export async function parseExamPrompt(promptText: string): Promise<{
  examName: string;
  batchName: string;
  subjectName: string;
  topicKeywords: string[];
  questionCount: number;
  difficulty: string;
  durationMinutes: number;
}> {
  if (!process.env.GEMINI_API_KEY && !process.env.OPENROUTER_API_KEY) {
    throw new Error("Neither GEMINI_API_KEY nor OPENROUTER_API_KEY is configured.");
  }

  const prompt = `
    Analyze the teacher's request for an exam and extract the following details in JSON format.
    Request: "${promptText}"

    JSON STRUCTURE:
    {
      "examName": "A descriptive title for the exam",
      "batchName": "The name of the batch or class group (e.g. 'Batch A', 'Class 10')",
      "subjectName": "The subject (e.g. 'Physics', 'Maths')",
      "topicKeywords": ["list", "of", "topic", "keywords"],
      "questionCount": 10,
      "difficulty": "medium",
      "durationMinutes": 30
    }

    Rules:
    1. If a value is not mentioned, provide a reasonable default.
    2. Output ONLY the JSON.
  `;

  const rawResponse = await generateContentWithFallback(prompt, "{}");

  return JSON.parse(rawResponse);
}

export async function ensureEnoughQuestions(params: {
  topicIds: string[];
  subjectId: string;
  targetCount: number;
  state: any;
}): Promise<number> {
  const { topicIds, subjectId, targetCount, state } = params;
  
  const existingQuestions = state.questions.filter((q: any) => topicIds.includes(q.topicId));
  if (existingQuestions.length >= targetCount) {
    return existingQuestions.length;
  }

  const needed = targetCount - existingQuestions.length;
  const book = state.subjectBooks.find((b: any) => b.subjectId === subjectId && b.parsedText);
  
  if (!book) {
    return existingQuestions.length;
  }

  console.log(`Auto-generating ${needed} missing questions for subject ${subjectId}...`);
  try {
    const subject = state.subjects.find((s: any) => s.id === subjectId);
    const generated = await generateQuestionsFromText({
      text: book.parsedText!,
      topicId: topicIds[0],
      subjectId: subjectId,
      subject: subject?.name,
      questionCount: needed,
    });

    const finalizedQuestions = generated.map((q, i) => ({
      ...q,
      topicId: topicIds[i % topicIds.length],
      sourceType: "ai_generated" as any
    }));

    const { upsertRecord } = await import("../data/database.js");
    for (const q of finalizedQuestions) {
      await upsertRecord("questions", q);
      state.questions.push(q); 
    }
    
    return existingQuestions.length + finalizedQuestions.length;
  } catch (err) {
    console.error("Auto-generation failed:", err);
    return existingQuestions.length;
  }
}

function isMcqPaper(text: string): boolean {
  // pdfjs joins text items with spaces, so (A) may become "( A )" or "A )" — be lenient
  const optionPattern = /\(\s*[AaBbCcDd]\s*\)|\b[AaBbCcDd]\s*\)\s/g;
  const optionHits = (text.match(optionPattern) ?? []).length;
  // Also count numbered questions: "1." or "1)" at start of a word boundary
  const questionHits = (text.match(/\b\d{1,2}[.)]\s/g) ?? []).length;
  const detected = optionHits >= 8 || (questionHits >= 10 && optionHits >= 4);
  console.log(`[CurriculumDetect] optionHits=${optionHits} questionHits=${questionHits} isMcq=${detected}`);
  return detected;
}

export async function detectCurriculumFromText(text: string): Promise<{
  chapters: { name: string; topics: string[] }[];
}> {
  if (!process.env.GEMINI_API_KEY && !process.env.OPENROUTER_API_KEY) {
    throw new Error("Neither GEMINI_API_KEY nor OPENROUTER_API_KEY is configured.");
  }

  const mcq = isMcqPaper(text);

  const prompt = mcq
    ? `
You are an expert academic analyst. The text below is an MCQ exam paper (multiple-choice questions with options A/B/C/D).

Your task: read every question, identify the specific concept or sub-topic each question is testing, then group those concepts into broad chapter-level categories.

Return ONLY valid JSON in this exact structure:
{
  "chapters": [
    {
      "name": "Broad Chapter / Unit Name",
      "topics": ["Specific concept 1", "Specific concept 2", "Specific concept 3"]
    }
  ]
}

Rules:
1. Each topic must name the specific concept tested (e.g. "Markovnikov's Rule", "Free Radical Substitution", "Hückel's Rule") — NOT the question number.
2. Group related concepts under one chapter. A single chapter may cover 3–10 topics.
3. Do NOT include option text or answer choices in topic names.
4. Do NOT create a topic called "General" or "Miscellaneous" — always be specific.
5. Output ONLY the JSON.

MCQ PAPER TEXT:
---
${text.substring(0, 20000)}
---
`
    : `
    Analyze the educational text provided below and extract the academic structure (Chapters and their respective Topics).
    Return the result in JSON format.

    JSON STRUCTURE:
    {
      "chapters": [
        {
          "name": "Chapter Title",
          "topics": ["Topic A", "Topic B", "Topic C"]
        }
      ]
    }

    Rules:
    1. Focus on educational/curriculum structure.
    2. Be concise but academic.
    3. EXCLUDE non-academic structural elements like "Exercise", "Summary", "Glossary", "Questions", "Answers", "Bibliography", "Index", etc. from both chapters and topics.
    4. Output ONLY the JSON.

    TEXT CONTENT:
    ---
    ${text.substring(0, 20000)}
    ---
  `;

  try {
    const rawResponse = await generateContentFreeOnly(prompt, '{"chapters": []}');
    return JSON.parse(rawResponse);
  } catch (error) {
    console.error("Curriculum detection failed:", error);
    return { chapters: [] };
  }
}

export async function generateOfflineBoardPaper(params: {
  className: string;
  subjectName: string;
  topics: string[];
}): Promise<any> {
  const { className, subjectName, topics } = params;

  if (!process.env.GEMINI_API_KEY && !process.env.OPENROUTER_API_KEY) {
    throw new Error("Neither GEMINI_API_KEY nor OPENROUTER_API_KEY is configured.");
  }

  const prompt = `
You are an expert CBSE examiner. Generate a complete, realistic Class ${className} ${subjectName} Board Question Paper.
The paper should cover the following topics: ${topics.join(", ")}.

STRICT STEM AND MATHEMATICAL RULES:
1. LaTeX: Use $...$ for inline math/physics and $$...$$ for blocks. Use FOUR backslashes in JSON (e.g. \\\\frac).
2. Chemistry: Use [SMILES: notation] for chemical structures (e.g., [SMILES: c1ccccc1]).
3. Colligative Properties & van't Hoff Factor (i):
   - For questions on colligative properties (freezing point depression, boiling point elevation, vapour pressure lowering, osmotic pressure) of electrolytes (e.g. NaCl, KCl, CaCl2, Na2SO4, etc.), you MUST calculate and include the van't Hoff factor (i) assuming complete dissociation (unless degree of dissociation is given).
   - E.g., for NaCl, i = 2; for KCl, i = 2; for Na2SO4, i = 3; for MgSO4, i = 2.
   - Do not ignore/neglect dissociation for strong/weak electrolytes.
4. Absolute Self-Containment:
   - Do NOT refer to external figures, tables, graphs, "above calculations", "provided text", or "given table". Each question must contain all the numerical parameters and context required to solve it, and be completely standalone.

STRICT QUESTION LOGIC RULES:
1. Structure: Emulate exactly the standard CBSE blueprint for this subject (e.g., Sections A, B, C, D, E with appropriate typologies like MCQs, Assertion-Reason, Short Answer, Long Answer, and Case Study).
2. Mathematical Verification: Perform step-by-step mathematical calculations for any numerical question first to ensure accuracy. Make sure the correct option exists in the options list and is mathematically correct.
3. Output ONLY valid JSON, no markdown wrappers.

JSON STRUCTURE:
{
  "title": "Class ${className} ${subjectName} Pre-Board Examination",
  "timeAllowed": "3 Hours",
  "maximumMarks": 70,
  "generalInstructions": [
    "List of standard CBSE instructions (e.g., All questions are compulsory)"
  ],
  "sections": [
    {
      "sectionName": "SECTION A: MULTIPLE CHOICE QUESTIONS",
      "instructions": "This section contains 16 multiple choice questions of 1 mark each.",
      "questions": [
        {
          "qNumber": 1,
          "text": "Question text here.",
          "marks": 1,
          "options": ["(a) First option", "(b) Second option", "(c) Third option", "(d) Fourth option"],
          "hasOrChoice": false,
          "orText": ""
        }
      ]
    },
    {
      "sectionName": "SECTION B: ASSERTION-REASONING",
      "instructions": "This section contains 4 Assertion-Reason questions of 1 mark each.",
      "questions": [
        {
          "qNumber": 17,
          "text": "Assertion (A): ... \\nReason (R): ...",
          "marks": 1,
          "options": ["(a) Both A and R are true and R is the correct explanation of A.", "(b) Both A and R are true but R is NOT the correct explanation of A.", "(c) A is true but R is false.", "(d) A is false but R is true."],
          "hasOrChoice": false,
          "orText": ""
        }
      ]
    },
    {
      "sectionName": "SECTION C (And so on...)",
      "instructions": "Ensure all sections are completely filled with questions. Do not leave any section empty.",
      "questions": []
    }
  ]
}
  `;

  try {
    const rawResponse = await generateOfflinePaperContent(prompt);
    console.log("[OfflinePaper] Raw response preview:", rawResponse.slice(0, 300));

    // Strip markdown fences and any leading prose before the JSON object
    const stripped = rawResponse
      .replace(/^```(?:json)?\s*/im, "")
      .replace(/\s*```\s*$/im, "")
      .trim();

    // Find the JSON object — prefer the last top-level { so reasoning preamble is skipped
    // Look for {"  (object starting a key) rather than bare { which may appear in prose
    let start = stripped.lastIndexOf('{"');
    if (start === -1) start = stripped.indexOf("{");
    const end = stripped.lastIndexOf("}");
    if (start === -1 || end === -1 || end < start)
      throw new Error("No JSON object found in model response");

    const jsonSlice = stripped.slice(start, end + 1);

    // Try strict parse first
    try {
      return JSON.parse(jsonSlice);
    } catch { /* fall through to repair */ }

    // Apply layered repairs for common free-model issues
    const repaired = jsonSlice
      // unquoted property keys: {title: → {"title":
      .replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":')
      // single-quoted strings → double-quoted
      .replace(/'([^'\\]*(\\.[^'\\]*)*)'/g, '"$1"')
      // trailing commas before } or ]
      .replace(/,\s*([}\]])/g, '$1');

    try {
      return JSON.parse(repaired);
    } catch { /* fall through to repairJsonString */ }

    // Try our character-level repair (handles LaTeX backslashes, control chars)
    console.warn("[OfflinePaper] Basic repair failed — trying repairJsonString...");
    try {
      return JSON.parse(repairJsonString(repaired));
    } catch { /* fall through */ }

    // Last resort: jsonrepair handles unescaped quotes, missing commas, etc.
    console.warn("[OfflinePaper] repairJsonString failed — trying jsonrepair...");
    return JSON.parse(jsonrepair(jsonSlice));

  } catch (error) {
    console.error("Offline Paper Generation failed:", error);
    throw error;
  }
}

/**
 * Dedicated content generator for offline paper generation.
 * Completely isolated from the online exam generation pipeline:
 *
 *   1. OFFLINE_OPENROUTER_API_KEY + OFFLINE_PAPER_MODEL  (dedicated separate account)
 *   2. Gemini direct  (GEMINI_API_KEY — separate quota from OpenRouter entirely)
 *   3. Main OPENROUTER_API_KEY free models  (last resort only, to avoid touching online quota)
 */
async function generateOfflinePaperContent(prompt: string): Promise<string> {
  const errors: string[] = [];

  // ── 1. Dedicated offline OpenRouter account ──────────────────────────────
  const offlineKey = process.env.OFFLINE_OPENROUTER_API_KEY;
  const offlineModel = process.env.OFFLINE_PAPER_MODEL || "nvidia/nemotron-3-ultra-550b-a55b:free";
  if (offlineKey) {
    console.log(`[OfflinePaper] Using dedicated OFFLINE_OPENROUTER_API_KEY with ${offlineModel}`);
    const result = await callOpenRouter(offlineKey, offlineModel, prompt, errors);
    if (result) return result;
  }

  // ── 2. Gemini direct (free tier, fully separate from OpenRouter) ─────────
  const geminiClients = getGeminiClients();
  if (geminiClients.length === 0) {
    console.warn("[OfflinePaper] Gemini skipped — GEMINI_API_KEY not set.");
  }
  if (geminiClients.length > 0) {
    for (const { client, name } of geminiClients) {
      try {
        console.log(`[OfflinePaper] Trying Gemini (${name})...`);
        const result = await client.models.generateContent({
          model: GEMINI_MODEL,
          contents: prompt,
          config: { responseMimeType: "application/json" }
        });
        const text = result.text;
        if (text && text.trim().length > 0) {
          console.log(`[OfflinePaper] Gemini (${name}) succeeded (${text.length} chars).`);
          return text;
        }
        console.warn(`[OfflinePaper] Gemini (${name}) returned empty content.`);
        errors.push(`Gemini (${name}): empty content`);
      } catch (e: any) {
        console.warn(`[OfflinePaper] Gemini (${name}) failed: ${e?.message ?? e}`);
        errors.push(`Gemini (${name}): ${e?.message ?? e}`);
      }
    }
  }

  // ── 3. Main OpenRouter key — free models only, last resort ───────────────
  const mainKey = process.env.OPENROUTER_API_KEY;
  if (mainKey) {
    console.warn("[OfflinePaper] Falling back to main OPENROUTER_API_KEY (last resort).");
    // Instruction-tuned models first — reasoning models (Nemotron) burn tokens on thinking text
    const freeModels = [
      "meta-llama/llama-3.3-70b-instruct:free",        // fast, instruction-tuned, good JSON
      "google/gemma-4-31b-it:free",                    // instruction-tuned Gemma 4
      "nousresearch/hermes-3-llama-3.1-405b:free",     // Hermes — strong JSON output
      "openai/gpt-oss-120b:free",                      // OpenAI OSS 120B
      "nvidia/nemotron-3-ultra-550b-a55b:free",        // large but reasoning model — last resort
    ];
    for (const model of freeModels) {
      const result = await callOpenRouter(mainKey, model, prompt, errors);
      if (result) return result;
    }
  }

  console.error("[OfflinePaper] All providers failed:\n" + errors.join("\n"));
  throw new Error(
    "Could not generate the paper — all providers failed.\n" +
    errors.map(e => `• ${e}`).join("\n")
  );
}

/** Single OpenRouter call with 90s timeout. Pushes failure reason into errors[] and returns null on failure. */
async function callOpenRouter(
  apiKey: string,
  model: string,
  prompt: string,
  errors: string[]
): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  try {
    console.log(`[OfflinePaper] Trying OpenRouter model: ${model}`);
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://railway.app",
        "X-Title": "Coaching Portal Offline Paper"
      },
      body: JSON.stringify({
        model,
        messages: [
          // System message suppresses chain-of-thought reasoning preamble
          { role: "system", content: "You are a CBSE exam paper generator. Output ONLY a valid JSON object. No reasoning, no explanation, no markdown. Start your response with { and end with }." },
          { role: "user", content: prompt }
        ],
        max_tokens: 7000,
      })
    });
    clearTimeout(timeout);

    const rawBody = await response.text();
    if (!response.ok) {
      const reason = rawBody.slice(0, 400);
      console.warn(`[OfflinePaper] ${model} HTTP ${response.status}: ${reason}`);
      errors.push(`${model}: HTTP ${response.status} — ${reason}`);
      return null;
    }

    let data: any;
    try { data = JSON.parse(rawBody); } catch {
      errors.push(`${model}: non-JSON response`);
      return null;
    }

    const text: string | undefined = data.choices?.[0]?.message?.content;
    if (text && text.trim().length > 0) {
      console.log(`[OfflinePaper] ${model} succeeded (${text.length} chars).`);
      return text;
    }
    const finishReason = data.choices?.[0]?.finish_reason ?? "unknown";
    errors.push(`${model}: empty content (finish_reason=${finishReason})`);
    return null;

  } catch (e: any) {
    clearTimeout(timeout);
    const msg = e.name === "AbortError" ? "timed out after 90s" : e.message;
    console.warn(`[OfflinePaper] ${model} threw: ${msg}`);
    errors.push(`${model}: ${msg}`);
    return null;
  }
}

function shouldSkipPage(pageText: string): boolean {
  const lower = pageText.toLowerCase();
  
  // Skip OMR / bubble sheet templates
  if (
    lower.includes("omr answer sheet") || 
    lower.includes("omr sheet") || 
    lower.includes("answer sheet") ||
    lower.includes("bubble sheet") ||
    lower.includes("student name:") ||
    lower.includes("rollnumber:") ||
    (lower.includes("abcd") && lower.includes("oooo"))
  ) {
    return true;
  }

  // Skip page number list / metadata mapping tables
  if (
    lower.includes("universal_queid") || 
    lower.includes("universal_queld") ||
    (lower.match(/qp26/g) || []).length > 5 ||
    (lower.match(/qp25/g) || []).length > 5
  ) {
    return true;
  }

  // Skip pages that are purely explanation/solution pages with no question text.
  // "Sol." alone is NOT enough — two-column PDFs have "Sol." in the right column on
  // every question page. Only skip if "explanation" appears AND there are no question
  // number patterns (meaning the page is a solution-only page).
  const hasExplanationHeader = lower.includes("explanation :") || lower.includes("explanation:");
  const hasQuestionNumbers = /\b[1-9]\d?\s*[.\)]\s/.test(pageText);
  if (hasExplanationHeader && !hasQuestionNumbers) {
    return true;
  }

  if (pageText.trim().length < 100) {
    return true;
  }
  return false;
}

/**
 * Scans all PDF page texts for a compact answer key.
 * Supports three strategies (tried in order):
 *   Strategy 1 — numbered text:   "1. A  2. C  3. B"
 *   Strategy 2 — positional text: "C B C D A B D A …"  (dense bare-letter run)
 *   Strategy 3 — vision fallback: render answer-key page as image, ask vision AI to read
 *                                  the table (used when OCR scrambles column layout)
 * Returns a map of questionNumber → option label ("A"|"B"|"C"|"D").
 * Works even if the answer key page was skipped by shouldSkipPage.
 */
/**
 * Public entry point for deriving a question-number → answer-letter map from an
 * already-parsed book's text (e.g. a separately-uploaded solution/answer-key PDF
 * for a bare question paper that has no answers of its own). Splits on the same
 * "--- PAGE N ---" delimiter used throughout parsedText, then reuses extractAnswerKey.
 */
export async function extractAnswerKeyFromText(text: string): Promise<Map<number, string>> {
  const parts = text.split(/--- PAGE \d+ ---/gi);
  const pages = parts.map((p) => p.trim()).filter(Boolean);
  return extractAnswerKey(pages.length > 0 ? pages : [text]);
}

async function extractAnswerKey(pages: string[], pdfPath?: string): Promise<Map<number, string>> {
  const answerMap = new Map<number, string>();

  // ── Strategy 0: "Ans.: X" positional (two-column solution booklets) ──
  // Chemistry, Maths, and Biology PDFs have a two-column layout where pdfjs reads
  // the right column (answers + explanations) before the left column (questions).
  // Every "Ans.: d" marker appears in the same order as the questions across all pages,
  // so the first occurrence = Q1, second = Q2, and so on.
  // This must run BEFORE the numbered strategy because the numbered strategy would
  // falsely match option labels like "1. (A) …" from question text.
  {
    // \(?\s* handles both "Ans.: (D)" (no space) and "Ans . : ( D )" (OCR spaces inside parens)
    const ansKeyPattern = /Ans\s*\.\s*:\s*\(?\s*([A-Da-d])\s*\)?/gi;
    const collected: string[] = [];
    for (const pageText of pages) {
      for (const m of pageText.matchAll(ansKeyPattern)) {
        collected.push(m[1].toUpperCase());
      }
    }
    if (collected.length >= 5) {
      console.log(`[AnswerKey] Strategy 0 (Ans.: X positional): ${collected.length} answers collected`);
      for (let i = 0; i < collected.length; i++) {
        answerMap.set(i + 1, collected[i]);
      }
    }
  }

  // ── Strategy 1: numbered format  "1. A", "1.(A)", "1) B", "1-C" ──
  // Only runs when Strategy 0 found nothing, because this pattern also matches
  // question option labels ("1. (A) Kingdom…") which would produce wrong answers.
  if (answerMap.size === 0) {
    const pattern = /\b(\d{1,3})\s*[.\-\)]\s*\(?([A-Da-d])\)?(?:\s|$)/g;

    for (const pageText of pages) {
      const matches = [...pageText.matchAll(pattern)];
      if (matches.length < 3) continue;

      const candidates = new Map<number, string>();
      for (const m of matches) {
        const n = parseInt(m[1]);
        const opt = m[2].toUpperCase();
        if (n >= 1 && n <= 200) candidates.set(n, opt);
      }

      if (candidates.size >= 5) {
        for (const [n, opt] of candidates) {
          if (!answerMap.has(n)) answerMap.set(n, opt);
        }
      }
    }
  }

  // ── Strategy 2: positional bare-letter sequence "C B C D A B D A …" ──
  // Triggered only if Strategy 1 found nothing (the numbered format takes precedence).
  if (answerMap.size === 0) {
    // Returns the single-letter A-D value if the token reduces to exactly one such letter,
    // otherwise null. Strips surrounding punctuation like ( ) [ ] . but not internal chars.
    const singleAnswerLetter = (token: string): string | null => {
      const letters = token.replace(/[^A-Za-z]/g, "");
      if (letters.length === 1 && /^[A-Da-d]$/.test(letters)) {
        return letters.toUpperCase();
      }
      return null;
    };

    for (const pageText of pages) {
      const tokens = pageText.split(/\s+/).filter(t => t.trim().length > 0);
      if (tokens.length < 15) continue;

      // Find the 30-token window with the highest count of single A-D tokens.
      const windowSize = 30;
      let bestStart = -1;
      let bestCount = 0;
      for (let i = 0; i + windowSize <= tokens.length; i++) {
        let count = 0;
        for (let j = i; j < i + windowSize; j++) {
          if (singleAnswerLetter(tokens[j]) !== null) count++;
        }
        if (count > bestCount) { bestCount = count; bestStart = i; }
      }

      // Need ≥20/30 to be answer letters (question pages max out around 13/30).
      if (bestCount < 20 || bestStart === -1) continue;

      // Find the first actual A-D token inside the best window
      // (the window start index may be a few non-answer tokens before the cluster begins).
      let seqStart = bestStart;
      while (seqStart < bestStart + windowSize && singleAnswerLetter(tokens[seqStart]) === null) seqStart++;
      if (seqStart >= bestStart + windowSize) continue;

      // Walk backwards to include answer letters that come just before the window.
      while (seqStart > 0 && singleAnswerLetter(tokens[seqStart - 1]) !== null) seqStart--;

      // Walk forward collecting letters, tolerating gaps of exactly 1 non-letter token
      // (handles one OCR noise token like "14" inserted mid-sequence, but stops before
      // a stray isolated letter that appears 2+ positions after the real sequence ends).
      const answerLetters: string[] = [];
      let gapCount = 0;
      for (let i = seqStart; i < tokens.length; i++) {
        const letter = singleAnswerLetter(tokens[i]);
        if (letter !== null) {
          answerLetters.push(letter);
          gapCount = 0;
        } else {
          gapCount++;
          if (gapCount > 1) break; // End of the dense cluster
        }
      }

      if (answerLetters.length >= 15) {
        console.log(`[AnswerKey] Found positional sequential key: ${answerLetters.length} answers`);
        for (let i = 0; i < answerLetters.length; i++) {
          if (!answerMap.has(i + 1)) answerMap.set(i + 1, answerLetters[i]);
        }
        break; // First qualifying page wins
      }
    }
  }

  // ── Strategy 3: vision fallback — render the answer-key page and ask AI ──
  // Triggered when OCR scrambles the table layout (columns get reordered or lost).
  // Identifies answer-key pages by their characteristic header text, then reads
  // the table directly from the rendered page image.
  if (answerMap.size === 0 && pdfPath) {
    for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
      const lower = pages[pageIndex].toLowerCase();
      // Answer key pages from these exam systems have a Universal_QueId column header
      const looksLikeKeyPage = (
        lower.includes("universal_queid") ||
        lower.includes("universal_queld") ||
        (lower.includes("ans") && lower.includes("chap") && lower.includes("sec") && lower.includes("que"))
      );
      if (!looksLikeKeyPage) continue;

      console.log(`[AnswerKey] Text extraction failed — trying vision on page ${pageIndex + 1}...`);
      const imageBase64 = renderPageToBase64(pdfPath, pageIndex);
      if (!imageBase64) continue;

      const visionPrompt = `This page shows an answer key table from an exam paper.
The table has columns like: No (question number) | Ans (correct answer A/B/C/D) | Chap | Sec | Que | ...

Extract EVERY row from the table. Return JSON only:
{
  "answers": [
    {"questionNumber": 1, "answer": "C"},
    {"questionNumber": 2, "answer": "B"}
  ]
}

Rules:
- "answer" must be exactly one of: A, B, C, D (uppercase)
- Include every row you can read
- If a row is unclear, skip it
- Return only valid JSON, no markdown`;

      const visionResult = await generateVisionContent(visionPrompt, imageBase64);
      if (!visionResult) continue;

      try {
        const startIdx = visionResult.indexOf("{");
        const endIdx = visionResult.lastIndexOf("}");
        if (startIdx === -1 || endIdx === -1) continue;
        const parsed = JSON.parse(visionResult.substring(startIdx, endIdx + 1));
        const answers: Array<{ questionNumber: number; answer: string }> = parsed.answers || [];
        let added = 0;
        for (const a of answers) {
          if (typeof a.questionNumber === "number" && a.questionNumber >= 1 && a.questionNumber <= 200) {
            const letter = String(a.answer || "").toUpperCase().trim();
            if (/^[A-D]$/.test(letter) && !answerMap.has(a.questionNumber)) {
              answerMap.set(a.questionNumber, letter);
              added++;
            }
          }
        }
        if (added > 0) {
          console.log(`[AnswerKey] Vision extracted ${added} answers from page ${pageIndex + 1}`);
          break; // Stop after first successful page
        }
      } catch (e) {
        console.warn(`[AnswerKey] Vision parse failed for page ${pageIndex + 1}:`, e);
      }
    }
  }

  if (answerMap.size > 0) {
    console.log(`[AnswerKey] Final key has ${answerMap.size} answers: ${[...answerMap.entries()].slice(0, 10).map(([k,v])=>`${k}:${v}`).join(", ")}...`);
  } else {
    console.log("[AnswerKey] No answer key found in any page — AI domain knowledge will be used for all questions.");
  }

  return answerMap;
}

const VISION_PROMPT = `You are reading an exam paper image (JEE/NEET style). Extract EVERY multiple-choice question visible in this page.

RULES:
- If the page has two columns (questions left, solutions/answers right) — extract ONLY the left column questions.
- If the page is single-column — extract all questions on the page.
- Extract each question with its exact number, full text, and all 4 options (A, B, C, D) exactly as written.
- LaTeX math: use $...$ for inline, $$...$$ for block. In JSON strings write EVERY backslash as TWO backslashes: \\frac, \\sqrt, \\text, \\alpha, \\begin, \\right, \\left.
- Chemical formulas: use LaTeX with subscripts/superscripts — $\\text{H}_2\\text{O}$, $\\text{K}_2\\text{SO}_4$, $\\text{CO}_2$.
- Chemical structures drawn as diagrams: output [SMILES: ...] notation (e.g. [SMILES: c1ccccc1] for benzene, [SMILES: CC(=O)O] for acetic acid).
- Graphs and geometric figures: describe the axes and key features concisely in the question text (e.g. "The graph shows concentration on y-axis vs time on x-axis, with an exponential decay curve.").
- Set hasDiagram: true if ANY drawn structural formula, graph, geometric figure, or chemical structure image appears in the question stem OR in the options.
- Do NOT invent questions. If a page has no MCQ questions, return {"questions": []}.
- A question is cut off at the page/crop boundary when you cannot see its number, full stem, and all 4 options within this image. Do NOT guess or fill in missing options with placeholder text like "Not provided", "Not fully provided", "N/A", or similar — OMIT that entire question from the output instead. It is far better to skip a question than to return one with fabricated or incomplete options.
- Every option value must be real text transcribed from the image. Never leave an option value empty AND never invent one — if you can't read it, the question must be omitted entirely.
- Output ONLY valid JSON, no markdown fences.

JSON FORMAT:
{
  "questions": [
    {
      "questionNumber": 1,
      "prompt": "Full question text with LaTeX math",
      "hasDiagram": false,
      "difficulty": "medium",
      "marks": 4,
      "negativeMarks": 1,
      "options": [
        { "label": "A", "value": "option text", "isCorrect": false },
        { "label": "B", "value": "option text", "isCorrect": false },
        { "label": "C", "value": "option text", "isCorrect": false },
        { "label": "D", "value": "option text", "isCorrect": false }
      ],
      "explanation": ""
    }
  ]
}

Set isCorrect: true only if there is an explicit answer marker on this page (circled option, asterisk, bold). Otherwise leave all options as isCorrect: false — the answer key will be applied separately.`;


const TEXT_PROMPT = (chunk: string, topicNames?: string[]) => {
  const topicLine = topicNames && topicNames.length > 0
    ? `\nAVAILABLE TOPICS: ${topicNames.join(" | ")}\nFor each question, set "topicName" to the single best matching topic from the list above.`
    : "";
  const topicField = topicNames && topicNames.length > 0
    ? `"topicName": "matching topic name",` : "";
  return `You are extracting MCQ questions from exam paper text. Extract EVERY multiple-choice question present.

RULES:
- The text may be from a two-column PDF and can appear scrambled — use question numbers to identify boundaries.
- Do NOT invent questions. If no MCQs are present return {"questions": []}.
- Format math in LaTeX ($...$ for inline, $$...$$ for block). In JSON strings write EVERY backslash as TWO backslashes: \\frac, \\sqrt, \\text, \\alpha, \\begin, \\right.
- Chemical formulas: $\\text{H}_2\\text{O}$, $\\text{CO}_2$, $\\text{K}_2\\text{SO}_4$.
- Chemical structures (SMILES or structural): output [SMILES: ...] notation.
- Leave isCorrect: false for all options — the answer key is applied separately.
- Output ONLY valid JSON.${topicLine}

JSON FORMAT: { "questions": [{ "questionNumber": 1, ${topicField}"prompt": "...", "difficulty": "medium", "marks": 4, "negativeMarks": 1, "options": [{"label":"A","value":"...","isCorrect":false},{"label":"B","value":"...","isCorrect":false},{"label":"C","value":"...","isCorrect":false},{"label":"D","value":"...","isCorrect":false}], "explanation": "" }] }

TEXT:
---
${chunk}
---`;
};

/** Fuzzy-match an AI-returned topic name to an actual topic ID. */
function matchTopicId(name: string | undefined, topics: { id: string; name: string }[]): string | null {
  if (!name || topics.length === 0) return null;
  const n = name.toLowerCase().trim();
  const exact = topics.find(t => t.name.toLowerCase().trim() === n);
  if (exact) return exact.id;
  const partial = topics.find(t => t.name.toLowerCase().includes(n) || n.includes(t.name.toLowerCase()));
  return partial?.id ?? null;
}

async function extractFromChunkText(chunkText: string, pageImageBase64?: string, topicNames?: string[]): Promise<any[]> {
  let rawResponse = "";
  let repaired = "";
  try {
    if (pageImageBase64) {
      // Vision-only path: send the page image with NO OCR text.
      // Two-column OCR text confuses the model — the image is always cleaner.
      console.log("[Extract] Using vision-only extraction (image sent, OCR text discarded).");
      const visionResult = await generateVisionContent(VISION_PROMPT, pageImageBase64);
      if (visionResult) {
        rawResponse = visionResult;
      } else {
        console.warn("[Extract] Vision failed, falling back to text-only.");
        rawResponse = await generateContentWithFallback(TEXT_PROMPT(chunkText, topicNames), '{"questions": []}');
      }
    } else {
      rawResponse = await generateContentWithFallback(TEXT_PROMPT(chunkText, topicNames), '{"questions": []}');
    }

    const startIdx = rawResponse.indexOf("{");
    const endIdx = rawResponse.lastIndexOf("}");
    if (startIdx !== -1 && endIdx !== -1) rawResponse = rawResponse.substring(startIdx, endIdx + 1);

    repaired = repairJsonString(rawResponse);
    let questions: any[];
    try {
      const parsedObj = JSON.parse(repaired);
      questions = parsedObj.questions || (Array.isArray(parsedObj) ? parsedObj : []);
    } catch {
      questions = extractQuestionsFromBrokenJson(rawResponse);
      console.warn(`[Extract] Full JSON parse failed, recovered ${questions.length} questions via fragment extraction`);
    }
    return questions.map(q => ({
      ...q,
      _questionNumber: (typeof q.questionNumber === "number" && q.questionNumber > 0) ? q.questionNumber : undefined,
      _hasDiagram: q.hasDiagram === true
    }));
  } catch (error: any) {
    console.error("[Extract] Chunk extraction failed:", error.message);
    try {
      fs.writeFileSync("scratch/failed_json_raw.json", rawResponse, "utf8");
      fs.writeFileSync("scratch/failed_json_repaired.json", repaired, "utf8");
    } catch (e) {}
    return [];
  }
}

function chunkPageText(pageText: string, maxQuestionsPerChunk = 6): string[] {
  const preprocessed = pageText.replace(/(?:\r?\n|^)\s*(\d+)\.\s+/g, (match, num) => {
    return `\n\n[QUESTION ${num}]\n`;
  });

  const regex = /\[QUESTION \d+\]/g;
  const matches = [...preprocessed.matchAll(regex)];

  if (matches.length <= maxQuestionsPerChunk) {
    return [preprocessed];
  }

  const chunks: string[] = [];
  let lastIndex = 0;

  for (let i = maxQuestionsPerChunk; i < matches.length; i += maxQuestionsPerChunk) {
    const match = matches[i];
    const startIndex = match.index!;
    const chunkText = preprocessed.substring(lastIndex, startIndex).trim();
    if (chunkText) {
      chunks.push(chunkText);
    }
    lastIndex = startIndex;
  }

  const lastChunkText = preprocessed.substring(lastIndex).trim();
  if (lastChunkText) {
    chunks.push(lastChunkText);
  }

  return chunks;
}

type PageDiagram = { page: number; url: string; bbox: number[]; isQuestionImage?: boolean };

/** True when an option value is empty, a placeholder, or too short to be a real
 * transcribed answer (e.g. just the label). Excludes legitimate short numeric
 * answers like "12" or "-3.5", which must never be treated as image placeholders. */
// Shared across the untranscribed-option check and the post-extraction drop filter.
// Covers every placeholder phrasing seen in practice: prose ("Not provided", "cannot
// be determined") and the model's own bracket convention for "an image goes here"
// (e.g. "(A) [Image A]") — the latter isn't caught by the prose patterns since it
// isn't apologetic text, just a stand-in label the model uses instead of real content.
const PLACEHOLDER_OPTION_PATTERN = /not (fully )?provided|not available|n\/a|unavailable|unknown|not visible|not shown|cannot be determined|unable to (read|extract)|\[\s*image\s*[a-d]?\s*\]/i;

// Hard guard against placeholder options: when a question is cut off at a page/crop
// boundary, the model sometimes ignores the "omit it" instruction and writes filler text
// (e.g. "Not provided", "(A) [Image A]") instead, or repeats the same value across
// options. This check does not depend on the model's compliance — it inspects the actual
// option text and drops any question that clearly wasn't fully read from the page.
// Mutates `questions` in place (same in-place-replace pattern used elsewhere in this file
// so callers holding a reference to the array keep seeing the filtered contents).
function applyGroundingFilter(questions: any[]): void {
  const kept = questions.filter((q: any) => {
    const values = (q.options || []).map((o: any) => String(o.value ?? "").trim());
    if (values.some((v: string) => !v || PLACEHOLDER_OPTION_PATTERN.test(v))) {
      console.warn(`[Extract] Dropped Q${q._questionNumber ?? "?"} — placeholder/empty option text (page likely cut off mid-question): "${(q.prompt || "").slice(0, 60)}"`);
      return false;
    }
    if (values.length >= 2 && new Set(values).size < values.length) {
      console.warn(`[Extract] Dropped Q${q._questionNumber ?? "?"} — duplicate option values (extraction likely incomplete): "${(q.prompt || "").slice(0, 60)}"`);
      return false;
    }
    return true;
  });
  questions.length = 0;
  questions.push(...kept);
}

// Catches a specific, recurring vision-extraction slip: an option value is valid
// LaTeX (e.g. "\frac{V}{4}") but the model forgot to wrap it in $...$, so it rendered
// as literal backslash-command text in the question bank instead of a fraction. Every
// case seen in practice was the *entire* option value being pure math with no
// surrounding prose, so wrapping the whole string is safe — this does not attempt to
// handle options that mix plain text and math (rare, and riskier to auto-wrap).
const RAW_LATEX_COMMAND = /\\(frac|dfrac|text|times|sqrt|left|right|Delta|nabla|partial|infty|alpha|beta|gamma|theta|lambda|mu|omega|pi|sigma|phi|psi|cup|cap|subseteq|subset|supseteq|cdot|ge|le|neq|approx|pm|rightleftharpoons|rightarrow|leftarrow|Rightarrow|ce|vec|hat|overline|underline|begin|end)\b/;

// Bare ASCII math the model sometimes emits instead of proper LaTeX ("x^2", "H_2O",
// "sqrt(x)") instead of "\sqrt{x}", which renders as literal caret/underscore/text
// because there's no $...$ around it. Bases/tails are deliberately length-bounded (not
// unbounded + or *) so a match can only ever be a short, unambiguous math token:
//   - exponent base is unbounded-length alnum (or a closing bracket) because "^" almost
//     never appears in ordinary prose, so "10^-3" / "cm^2" / "log^2" are all safe to wrap
//     in full.
//   - subscript base is capped at 2 chars because "_" DOES appear in ordinary prose/
//     identifiers ("user_id", "Section_A", "test_case") — a 2-char cap keeps matches to
//     atomic-symbol/single-variable length ("H_2", "NH_4", "Ca_3") without ever reaching
//     the underscore in a real multi-char word (deliberate tradeoff: "log_10" is not
//     auto-wrapped as a result — see the report for this and other skipped edge cases).
const EXP_BASE = "[A-Za-z0-9]+";
const EXP_TAIL = "\\{?-?[A-Za-z0-9]{1,6}\\}?";
const SUB_BASE = "[A-Za-z0-9]{1,2}";
const SUB_TAIL = "\\{?[A-Za-z0-9]{1,6}\\}?";

const BARE_EXPONENT_WHOLE = new RegExp(`^(?:${EXP_BASE}|[)\\]])\\^${EXP_TAIL}$`);
const BARE_SUBSCRIPT_WHOLE = new RegExp(`^${SUB_BASE}_${SUB_TAIL}$`);
const BARE_SQRT_WHOLE = /^sqrt\s*\([^()]*\)$/i;

const BARE_EXPONENT_TOKEN = new RegExp(`\\b${EXP_BASE}\\^${EXP_TAIL}|[)\\]]\\^${EXP_TAIL}`, "g");
const BARE_SUBSCRIPT_TOKEN = new RegExp(`\\b${SUB_BASE}_${SUB_TAIL}\\b`, "g");
const BARE_SQRT_TOKEN = /\bsqrt\s*\([^()]*\)/gi;
// Single combined regex (rather than three sequential .replace passes) so a wrapped
// match's own inserted $ characters can never be re-scanned by a later alternative.
const BARE_MATH_TOKEN = new RegExp(
  [BARE_SQRT_TOKEN.source, BARE_EXPONENT_TOKEN.source, BARE_SUBSCRIPT_TOKEN.source].join("|"),
  "gi"
);
// $...$ spans and [IMAGE: ...]/[SMILES: ...] tags (which can contain "_" in filenames,
// e.g. "master_page-01.png") must never be scanned for bare-math tokens.
const PROTECTED_SPAN = /\$\$[^$]*\$\$|\$[^$]*\$|\[(?:IMAGE|SMILES):[^\]]*\]/g;

function isBareAsciiMath(v: string): boolean {
  return BARE_SQRT_WHOLE.test(v) || BARE_EXPONENT_WHOLE.test(v) || BARE_SUBSCRIPT_WHOLE.test(v);
}

// Wraps only the bare-math tokens found outside of protected spans, leaving surrounding
// prose untouched — safe to run over mixed prose+math text (prompt/explanation), unlike
// the whole-string wrap path in ensureMathDelimited below.
function wrapBareMathTokens(text: string): string {
  PROTECTED_SPAN.lastIndex = 0;
  let result = "";
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PROTECTED_SPAN.exec(text)) !== null) {
    result += text.slice(lastIndex, m.index).replace(BARE_MATH_TOKEN, (t) => `$${t}$`);
    result += m[0];
    lastIndex = PROTECTED_SPAN.lastIndex;
  }
  result += text.slice(lastIndex).replace(BARE_MATH_TOKEN, (t) => `$${t}$`);
  return result;
}

// wholeValueIsMath=true (the default, used for option values, where every value seen in
// practice is pure math with no surrounding prose) wraps the entire string as soon as it
// contains a raw LaTeX command anywhere — safe there because there's no prose to corrupt.
// prompt/explanation are multi-sentence prose that may merely *mention* a LaTeX command
// partway through (e.g. "Using Rydberg formula 1/\lambda = ..."), so callers there must
// pass wholeValueIsMath=false: a bare backslash command no longer triggers a whole-string
// wrap (that would swallow surrounding English text into math mode) and instead falls
// through to hasUndelimitedLatex flagging, same as before this file's math-delimiting fix.
export function ensureMathDelimited(value: string, wholeValueIsMath = true): string {
  const v = value.trim();
  if (!v || v.includes("$")) return value;
  if (isBareAsciiMath(v)) return `$${v}$`;
  if (wholeValueIsMath && RAW_LATEX_COMMAND.test(v)) return `$${v}$`;
  return wrapBareMathTokens(value);
}

// Detection-only counterpart to ensureMathDelimited, for whatever bare LaTeX/ASCII math
// ensureMathDelimited couldn't confidently auto-fix: raw backslash LaTeX commands
// embedded in prose are never auto-wrapped (no safe way to guess where the math fragment
// ends within a sentence — a fabrication risk on a live exam), and the bare-ASCII
// patterns here are intentionally looser than the auto-wrap token regexes above (no
// upper bound on tail length, no requirement that sqrt(...) parens balance on one level)
// so edge cases the auto-fix conservatively skips still surface for a human glance
// instead of silently shipping broken text.
const LOOSE_BARE_MATH = /[A-Za-z0-9)\]]\^[A-Za-z0-9({-]|\b[A-Za-z0-9]{1,2}_[A-Za-z0-9{]|\bsqrt\s*\(/i;

export function hasUndelimitedLatex(text: string): boolean {
  if (!text) return false;
  const stripped = text
    .replace(/\${1,2}[^$]*\${1,2}/g, "")
    .replace(/\[(?:IMAGE|SMILES):[^\]]*\]/g, "");
  return RAW_LATEX_COMMAND.test(stripped) || LOOSE_BARE_MATH.test(stripped);
}

// Shared by the diagram-embedding logic in extractQuestionsFromPdfText's final .map()
// and the Tier-1 QA check below — both need "does this prompt talk about a figure that
// isn't actually present" using the exact same keyword list, so it's defined once here.
function promptMentionsFigure(promptLower: string): boolean {
  return (
    promptLower.includes("figure") ||
    promptLower.includes("diagram") ||
    promptLower.includes("image") ||
    promptLower.includes("shown below") ||
    promptLower.includes("given below") ||
    promptLower.includes("above reaction") ||
    promptLower.includes("following structure") ||
    promptLower.includes("the structure") ||
    promptLower.includes("given :") ||
    promptLower.includes("given:") ||
    promptLower.includes("piston") ||
    promptLower.includes("semi-permeable") ||
    promptLower.includes("membrane")
  );
}

// Same "does this question need a diagram" test used both to decide whether to attach
// one and to rank a question against its page-siblings when there are more
// diagram-needing questions on a page than confident question-region diagram candidates
// (see the assignment loop in extractQuestionsFromPdfText's final .map()).
function hasImageOnlyOption(options: any[] | undefined): boolean {
  return (options || []).some((opt: any) => {
    const val = (opt.value || "").trim();
    if (val.length >= 4) return false;
    if (/^-?\d+(\.\d+)?$/.test(val)) return false; // pure numbers aren't image placeholders
    if (val === opt.label || val === `(${opt.label})`) return true;
    return val.length < 3;
  });
}

function needsDiagramFor(pq: any): boolean {
  return (
    pq._hasDiagram === true ||
    promptMentionsFigure((pq.prompt || "").toLowerCase()) ||
    hasImageOnlyOption(pq.options)
  );
}

function looksLikeUntranscribedOption(value: unknown, label: string): boolean {
  const v = String(value ?? "").trim();
  if (!v) return true;
  if (/^-?\d+(\.\d+)?$/.test(v)) return false;
  if (PLACEHOLDER_OPTION_PATTERN.test(v)) return true;
  if (v === label || v === `(${label})`) return true;
  return v.length < 3;
}

/**
 * Recovers graph/diagram-based answer options (e.g. "which v-t graph is correct") that
 * no vision model can describe as text. extract_diagrams.py isolates each option's
 * cropped image with a precise bbox; this groups diagrams into visual "rows" (same
 * y-position — i.e. side-by-side thumbnails) and assigns each row, left to right, to
 * the next question on that page whose options all look untranscribed.
 * Mutates `questions` in place.
 */
function assignOptionImages(questions: any[], diagrams?: PageDiagram[]): void {
  if (!diagrams || diagrams.length === 0) return;

  const byPage = new Map<number, PageDiagram[]>();
  for (const d of diagrams) {
    if (!Array.isArray(d.bbox) || d.bbox.length !== 4) continue;
    const [y1, x1, y2, x2] = d.bbox;
    const area = Math.abs(x2 - x1) * Math.abs(y2 - y1);
    if (area < 0.005) continue;
    if (y2 <= 0.15 || y1 >= 0.90) continue; // header/footer guard
    if (!byPage.has(d.page)) byPage.set(d.page, []);
    byPage.get(d.page)!.push(d);
  }

  const rowsByPage = new Map<number, PageDiagram[][]>();
  for (const [page, pageDiagrams] of byPage) {
    const byY = [...pageDiagrams].sort((a, b) => a.bbox[0] - b.bbox[0]);
    const rows: PageDiagram[][] = [];
    for (const d of byY) {
      const last = rows[rows.length - 1];
      if (last && Math.abs(last[0].bbox[0] - d.bbox[0]) < 0.03) {
        last.push(d);
      } else {
        rows.push([d]);
      }
    }
    // Keep only rows that look like a strip of side-by-side option thumbnails: 2–4
    // images at the same height. Bounding boxes from embedded-image extraction often
    // have generous padding and overlap their neighbors somewhat, so x-overlap alone
    // isn't a reliable disqualifier here — same-height clustering plus the option-count
    // match in the caller is the real signal. Sorting by x1 still yields correct
    // left-to-right (A, B, C, D) order regardless of padding overlap.
    const optionRows = rows
      .filter((row) => row.length >= 2 && row.length <= 4)
      .map((row) => [...row].sort((a, b) => a.bbox[1] - b.bbox[1]));
    if (optionRows.length > 0) rowsByPage.set(page, optionRows);
  }
  if (rowsByPage.size === 0) return;

  const usedRowIndexByPage = new Map<number, Set<number>>();
  for (const q of questions) {
    const pageNum = q.pageNumber;
    const options = q.options;
    if (!pageNum || !Array.isArray(options) || options.length < 2) continue;

    const allUntranscribed = options.every((o: any) => looksLikeUntranscribedOption(o.value, o.label));
    if (!allUntranscribed) continue;

    const rows = rowsByPage.get(pageNum);
    if (!rows) continue;
    const used = usedRowIndexByPage.get(pageNum) ?? new Set<number>();
    const rowIdx = rows.findIndex((row, idx) => !used.has(idx) && Math.abs(row.length - options.length) <= 1);
    if (rowIdx === -1) continue;

    used.add(rowIdx);
    usedRowIndexByPage.set(pageNum, used);

    const row = rows[rowIdx];
    options.forEach((opt: any, i: number) => {
      if (row[i]) opt.value = `[IMAGE: ${row[i].url}]`;
    });
    q._hasDiagram = true;
    console.log(`[Extract] Q${q._questionNumber ?? "?"}: recovered ${Math.min(row.length, options.length)} option image(s) from page ${pageNum}.`);
  }
}

/**
 * Attempts to reconstruct ONE missing question by number from its surrounding page
 * images. Pure function (no shared-state mutation) so it can be retried with a wider
 * page window without duplicating the request-building/provider-fallback logic.
 * Returns the recovered question object (caller sets _questionNumber/pageNumber) or
 * null if every provider/parse attempt failed.
 */
async function recoverQuestionByNumber(
  missingNum: number,
  startPage: number,
  endPage: number,
  pdfPath: string
): Promise<any | null> {
  const recoveryImages: string[] = [];
  for (let p = startPage; p <= endPage; p++) {
    const img = renderPageToBase64(pdfPath, p - 1);
    if (img) recoveryImages.push(img);
  }
  if (recoveryImages.length === 0) return null;

  const recoveryPrompt = `These ${recoveryImages.length} exam page image(s) together contain question number ${missingNum}. The question may start on one page and its options continue on the next page.

Extract ONLY question number ${missingNum} — its full text and all 4 options (A, B, C, D) exactly as printed.

Return JSON:
{
  "questions": [{
    "questionNumber": ${missingNum},
    "prompt": "full question text in LaTeX where needed",
    "difficulty": "medium",
    "marks": 4,
    "negativeMarks": 1,
    "options": [
      {"label":"A","value":"...","isCorrect":false},
      {"label":"B","value":"...","isCorrect":false},
      {"label":"C","value":"...","isCorrect":false},
      {"label":"D","value":"...","isCorrect":false}
    ],
    "explanation": ""
  }]
}`;

  try {
    let recoveryRaw: string | null = null;

    // Try OpenRouter with multiple images in content array
    const { models: recoveryModels } = process.env.OPENROUTER_API_KEY
      ? await resolveVisionModels()
      : { models: [] as string[] };
    if (process.env.OPENROUTER_API_KEY && recoveryModels.length > 0) {
      const imageContent = recoveryImages.map(img => ({
        type: "image_url" as const,
        image_url: { url: `data:image/png;base64,${img}`, detail: "high" as const }
      }));
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://railway.app",
          "X-Title": "Coaching Portal Exam Gen"
        },
        body: JSON.stringify({
          model: recoveryModels[0],
          models: recoveryModels,
          messages: [{ role: "user", content: [
            ...imageContent,
            { type: "text", text: recoveryPrompt }
          ]}],
          response_format: { type: "json_object" },
          temperature: 0.1,
          max_tokens: 4000
        })
      });
      if (response.ok) {
        const data = await response.json();
        recoveryRaw = data.choices?.[0]?.message?.content ?? null;
      } else {
        console.warn(`[Recovery] OpenRouter failed: ${(await response.text()).slice(0, 200)}`);
      }
    }

    // Fallback: Gemini with first image only
    if (!recoveryRaw) {
      const clients = getGeminiClients();
      for (const { client, name } of clients) {
        try {
          const parts: any[] = recoveryImages.map(img => ({ inlineData: { mimeType: "image/png", data: img } }));
          parts.push({ text: recoveryPrompt });
          const result = await client.models.generateContent({
            model: GEMINI_MODEL,
            contents: [{ parts }],
            config: { responseMimeType: "application/json", maxOutputTokens: 4096, temperature: 0.1 }
          });
          if (result.text) { recoveryRaw = result.text; break; }
        } catch (e: any) {
          console.warn(`[Recovery] Gemini ${name} failed:`, e?.message);
        }
      }
    }

    if (!recoveryRaw) { console.warn(`[Recovery] Q${missingNum}: all providers failed.`); return null; }

    const start = recoveryRaw.indexOf("{");
    const end   = recoveryRaw.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    const parsed = JSON.parse(repairJsonString(recoveryRaw.substring(start, end + 1)));
    const recovered = (parsed.questions || [])[0];
    return recovered && recovered.prompt ? recovered : null;
  } catch (e: any) {
    console.warn(`[Recovery] Q${missingNum} recovery threw:`, e.message);
    return null;
  }
}

/**
 * Runs recoverQuestionByNumber for each number in `missingNums`, pushing any success
 * straight into `uniqueQuestions` (caller re-runs the grounding filter afterward — a
 * recovered result isn't pre-validated). `pagePad` widens the page window on each side;
 * used for a second, wider-window attempt on numbers a first pass still couldn't recover.
 */
async function runRecoveryRound(
  missingNums: number[],
  uniqueQuestions: any[],
  pages: string[],
  pdfPath: string,
  pagePad: number
): Promise<void> {
  for (const missingNum of missingNums) {
    const prevQ = uniqueQuestions.find(q => q._questionNumber === missingNum - 1);
    const nextQ = uniqueQuestions.find(q => q._questionNumber === missingNum + 1);
    const startPage = Math.max(1, (prevQ?.pageNumber ?? 1) - pagePad);
    const endPage   = Math.min(pages.length, (nextQ?.pageNumber ?? pages.length) + pagePad);

    console.log(`[Recovery] Q${missingNum}: sending pages ${startPage}–${endPage}${pagePad > 0 ? ` (widened ±${pagePad})` : ""} for targeted recovery...`);
    const recovered = await recoverQuestionByNumber(missingNum, startPage, endPage, pdfPath);
    if (recovered) {
      recovered._questionNumber = missingNum;
      recovered.pageNumber = startPage;
      uniqueQuestions.push(recovered);
      console.log(`[Recovery] Q${missingNum} successfully recovered: "${String(recovered.prompt).slice(0, 60)}..."`);
      uniqueQuestions.sort((a, b) => (a._questionNumber ?? 9999) - (b._questionNumber ?? 9999));
    } else {
      console.warn(`[Recovery] Q${missingNum}: recovery attempt failed.`);
    }
  }
}

export async function extractQuestionsFromPdfText(params: {
  text: string;
  subjectId: string;
  topicId: string;
  topics?: { id: string; name: string }[];
  sourceType: QuestionSource;
  bookId?: string;
  pdfPath?: string;
  diagrams?: Array<{ page: number; url: string; bbox: number[]; isQuestionImage?: boolean }>;
  onProgress?: (message: string) => void;
  pyqYear?: number;
  pyqExamName?: string;
  pyqSession?: string;
  // Combined-subject-paper support (e.g. a NEET paper with internal Physics/Chemistry/
  // Biology sections): when the book's subject has sibling subjects under the same
  // class/stream, the caller runs detectPageSections() and passes the result here so
  // each question gets tagged with the subject of the page it actually came from,
  // instead of the single book-level params.subjectId. Absent/empty for the common
  // single-subject book, in which case behavior is unchanged.
  sectionMap?: Map<number, string>;
  topicsBySubject?: Map<string, { id: string; name: string }[]>;
  // Independent ground truth for which question numbers actually exist in this PDF,
  // sourced from extractPdfQuestionCrops() (PDF text-layer positions, not vision) — the
  // caller already computes this for free before calling here. Filling this in lets the
  // missing-question diagnostic below catch a question vision never mentioned on ANY
  // page (so it never even entered foundNumbers), not just gaps below vision's own max.
  expectedQuestionNumbers?: number[];
  // Per-question normalised vertical bounds on their source page, from the same
  // extract_question_crops.py pass — yEnd deliberately stops before that question's own
  // "Ans." marker. Lets the diagram-assignment logic below match a diagram to a question
  // by real page geometry (is this diagram's bbox actually inside the question's own
  // region?) instead of guessing from page order, which is what let an answer-explanation
  // diagram bleed into an unrelated question's prompt (see needsDiagramFor/candidateDiagrams
  // below). Keyed by questionNumber; absent entries fall back to order-based matching.
  questionBounds?: Map<number, { page: number; yStart: number; yEnd: number }>;
}): Promise<{ questions: Question[]; missingNumbers: number[]; expectedTotal: number }> {
  const pageDelimiter = /--- PAGE \d+ ---/gi;
  const parts = params.text.split(pageDelimiter);
  const pages = parts.map(p => p.trim()).filter(Boolean);

  const allParsedQuestions: any[] = [];

  // Derive expected question count from the highest numbered question marker in the source.
  // Pattern requirements to avoid false positives from decimals (5.4), table captions, equations:
  //   - must be at the very start of a line (after optional whitespace)
  //   - followed by a period and at least one space
  //   - next non-space char must be a letter or '(' (question text / option preamble), NOT a digit
  //   - number must be in realistic question-count range (1–200)
  let maxQuestionNumber = 0;
  const seenNumbers = new Set<number>();
  for (const pageText of pages) {
    for (const m of pageText.matchAll(/^[ \t]*(\d{1,3})\.\s+(?=[A-Za-z(])/gm)) {
      const n = parseInt(m[1]);
      if (!isNaN(n) && n >= 1 && n <= 200) {
        seenNumbers.add(n);
        if (n > maxQuestionNumber) maxQuestionNumber = n;
      }
    }
  }
  // Sanity check: if the numbers are not roughly sequential (e.g. gap > 5 between consecutive),
  // they are likely section/table numbers rather than question numbers — discard.
  if (maxQuestionNumber > 0) {
    const sorted = [...seenNumbers].sort((a, b) => a - b);
    // Expect at least half the numbers from 1..max to be present for sequential questions
    const expectedCoverage = maxQuestionNumber * 0.5;
    if (sorted.length < expectedCoverage) {
      console.log(`[Extract] maxQuestionNumber=${maxQuestionNumber} but only ${sorted.length} distinct numbers found — likely not a question paper. Skipping count cap.`);
      maxQuestionNumber = 0;
    } else {
      console.log(`[Extract] Highest question number in source: ${maxQuestionNumber} (${sorted.length} distinct question numbers found). Using as extraction cap.`);
    }
  }

  const topicNames = (params.topics ?? []).map(t => t.name);

  // Fallback if no page delimiters are found
  if (pages.length <= 1) {
    const chunkSize = 6000;
    const chunks: string[] = [];
    for (let i = 0; i < params.text.length; i += chunkSize) {
      chunks.push(params.text.substring(i, i + chunkSize));
    }
    for (let i = 0; i < chunks.length; i++) {
      console.log(`Extracting from chunk ${i + 1}/${chunks.length} sequentially...`);
      const qList = await extractFromChunkText(chunks[i], undefined, topicNames);

      const validList = qList.filter((q: any) => {
        const prompt = q.prompt || "";
        if (!prompt) return false;
        if (prompt.length < 15) return true;
        const cleanPrompt = prompt.toLowerCase().replace(/[^a-z0-9\s]/g, "");
        const cleanSource = chunks[i].toLowerCase().replace(/[^a-z0-9\s]/g, "");
        const words = cleanPrompt.split(/\s+/).filter((w: string) => w.length > 3);
        if (words.length === 0) return true;
        let matchCount = 0;
        for (const word of words) {
          if (cleanSource.includes(word)) {
            matchCount++;
          }
        }
        const ratio = matchCount / words.length;
        if (ratio < 0.35) {
          console.log(`[Validation] Discarded hallucinated question: "${prompt.substring(0, 60)}..." (match ratio: ${ratio})`);
          return false;
        }
        return true;
      });

      allParsedQuestions.push(...validList.map(q => ({ ...q, pageNumber: 1 })));
      if (i < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, nextVisionDelayMs()));
      }
    }
  } else {
    // Process page-by-page sequentially
    let prevPageTail = ""; // last 400 chars of previous page, prepended to handle cross-boundary questions
    for (let i = 0; i < pages.length; i++) {
      const pageText = pages[i];
      if (shouldSkipPage(pageText)) {
        console.log(`Skipping page ${i + 1}/${pages.length} (OMR/key/blank)...`);
        prevPageTail = "";
        continue;
      }

      // Render page image for vision-based math extraction if PDF path is available
      let pageImageBase64: string | undefined;
      if (params.pdfPath) {
        const rendered = renderPageToBase64(params.pdfPath, i);
        if (rendered) {
          pageImageBase64 = rendered;
          console.log(`  Rendered page ${i + 1} image for vision extraction (${Math.round(rendered.length * 0.75 / 1024)} KB)`);
        }
      }

      const pageMsg = `Reading page ${i + 1} of ${pages.length}...`;
      console.log(`Extracting from page ${i + 1}/${pages.length} sequentially...`);
      params.onProgress?.(pageMsg);

      // Prepend tail of previous page so questions that span a page boundary are complete
      const pageTextWithOverlap = prevPageTail ? prevPageTail + "\n" + pageText : pageText;
      prevPageTail = pageText.slice(-400);

      if (pageImageBase64) {
        // Vision path: one call per page, no chunking needed — model reads the full page image
        const qList = await extractFromChunkText(pageTextWithOverlap, pageImageBase64, topicNames);
        allParsedQuestions.push(...qList.map((q: any) => ({ ...q, pageNumber: i + 1 })));
        await new Promise(resolve => setTimeout(resolve, nextVisionDelayMs()));
      } else {
        // Text-only path: chunk large pages to stay within token limits
        const chunks = chunkPageText(pageTextWithOverlap, 6);
        for (let c = 0; c < chunks.length; c++) {
          if (chunks.length > 1) {
            console.log(`  Processing sub-chunk ${c + 1}/${chunks.length}...`);
            params.onProgress?.(`Reading page ${i + 1} of ${pages.length}, part ${c + 1}/${chunks.length}...`);
          }
          const qList = await extractFromChunkText(chunks[c], undefined, topicNames);
          const validList = qList.filter((q: any) => {
            const prompt = q.prompt || "";
            if (!prompt || prompt.length < 15) return !!prompt;
            const cleanPrompt = prompt.toLowerCase().replace(/[^a-z0-9\s]/g, "");
            const cleanSource = chunks[c].toLowerCase().replace(/[^a-z0-9\s]/g, "");
            const words = cleanPrompt.split(/\s+/).filter((w: string) => w.length > 3);
            if (words.length === 0) return true;
            const matchCount = words.filter((w: string) => cleanSource.includes(w)).length;
            if (matchCount / words.length < 0.35) {
              console.log(`[Validation] Discarded hallucinated question: "${prompt.substring(0, 60)}..."`);
              return false;
            }
            return true;
          });
          allParsedQuestions.push(...validList.map((q: any) => ({ ...q, pageNumber: i + 1 })));
          await new Promise(resolve => setTimeout(resolve, nextVisionDelayMs()));
        }
      }
    }
  }

  // Extract answer key from ALL pages (including answer-key-only pages skipped above).
  // Vision fallback is used when OCR scrambles the table layout.
  const answerKey = await extractAnswerKey(pages, params.pdfPath);

  // First pass: deduplicate by question number (same number = same question from PDF)
  // This is authoritative — no similarity heuristics needed when numbers match.
  const byNumber = new Map<number, any>();
  const noNumberQuestions: any[] = [];
  for (const q of allParsedQuestions) {
    const n = q._questionNumber;
    if (typeof n === "number" && n > 0) {
      if (!byNumber.has(n)) {
        byNumber.set(n, q);
      } else {
        const existing = byNumber.get(n)!;
        // Keep the version with a longer explanation; merge prompt to shortest clean version
        if (!existing.explanation && q.explanation) existing.explanation = q.explanation;
        if (q.prompt && q.prompt.length < existing.prompt.length && q.prompt.length > 20) {
          existing.prompt = q.prompt;
        }
      }
    } else {
      noNumberQuestions.push(q);
    }
  }
  // Rebuild: numbered questions in order, then unnumbered ones
  const deduplicatedByNumber = [...byNumber.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, q]) => q);
  const allAfterNumberDedup = [...deduplicatedByNumber, ...noNumberQuestions];

  // Second pass: text-similarity dedup for any remaining near-duplicates
  const uniqueQuestions: any[] = [];

  function isDuplicateQuestion(q1: any, q2: any, primaryThreshold = 0.75): boolean {
    const p1 = (q1.prompt || "").replace(/\[image:[^\]]+\]/gi, "").trim();
    const p2 = (q2.prompt || "").replace(/\[image:[^\]]+\]/gi, "").trim();

    const unicodeMap: Record<string, string> = {
      '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
      '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
      '⁻': '-'
    };

    const stripLaTeX = (str: string) => {
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

    const clean1 = stripLaTeX(p1);
    const clean2 = stripLaTeX(p2);

    // Substring check (if one prompt contains another and is long enough)
    if (clean1.length >= 20 && clean2.length >= 20) {
      if (clean1.includes(clean2) || clean2.includes(clean1)) {
        return true;
      }
    }

    // Trigram Jaccard similarity
    const getCharNgrams = (str: string, n: number) => {
      const ngrams = new Set<string>();
      const clean = stripLaTeX(str);
      for (let i = 0; i <= clean.length - n; i++) {
        ngrams.add(clean.substring(i, i + n));
      }
      return ngrams;
    };

    const charNgramSimilarity = (str1: string, str2: string, n: number = 3) => {
      const set1 = getCharNgrams(str1, n);
      const set2 = getCharNgrams(str2, n);
      if (set1.size === 0 || set2.size === 0) return 0;
      let intersection = 0;
      for (const item of set1) {
        if (set2.has(item)) {
          intersection++;
        }
      }
      return intersection / (set1.size + set2.size - intersection);
    };

    const similarity = charNgramSimilarity(p1, p2, 3);

    // Normalize and extract numbers
    const normalizeNums = (str: string) => {
      let norm = str.split('').map(char => unicodeMap[char] || char).join('');
      const matches = norm.match(/-?\d+(\.\d+)?/g) || [];
      return matches.map(Number).filter(n => !isNaN(n)).sort((a, b) => a - b);
    };
    
    const nums1 = normalizeNums(p1);
    const nums2 = normalizeNums(p2);
    
    let numbersMatch = false;
    if (nums1.length === nums2.length && nums1.length > 0) {
      numbersMatch = true;
      for (let i = 0; i < nums1.length; i++) {
        if (Math.abs(nums1[i] - nums2[i]) > 0.0001) {
          numbersMatch = false;
          break;
        }
      }
    }
    
    const getOptVal = (o: any) => typeof o === 'string' ? o : (o?.value || '');
    
    const normalizeOptionValue = (str: string) => {
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
        .replace(/i/g, "l")
        .replace(/1/g, "l")
        .replace(/[^a-z]/g, "");
    };

    const opts1 = q1.options || [];
    const opts2 = q2.options || [];
    let optionsMatch = false;
    if (opts1.length > 0 && opts2.length > 0) {
      const vals1 = opts1.map((o: any) => normalizeOptionValue(getOptVal(o)));
      const vals2 = opts2.map((o: any) => normalizeOptionValue(getOptVal(o)));
      let matchCount = 0;
      for (const v1 of vals1) {
        if (!v1) continue;
        for (const v2 of vals2) {
          if (!v2) continue;
          if (v1 === v2 || v1.includes(v2) || v2.includes(v1)) {
            matchCount++;
            break;
          }
        }
      }
      const minOptions = Math.min(opts1.length, opts2.length);
      optionsMatch = matchCount >= Math.max(2, Math.floor(minOptions * 0.75));
    }
    
    if (similarity >= primaryThreshold) {
      if (opts1.length > 0 && opts2.length > 0 && !optionsMatch) {
        return false;
      }
      return true;
    }
    if (similarity >= 0.45) {
      if (numbersMatch || optionsMatch) return true;
    }
    
    return false;
  }

  for (const q of allAfterNumberDedup) {
    let foundIndex = -1;
    for (let j = 0; j < uniqueQuestions.length; j++) {
      if (isDuplicateQuestion(uniqueQuestions[j], q)) {
        foundIndex = j;
        break;
      }
    }

    if (foundIndex !== -1) {
      const existing = uniqueQuestions[foundIndex];
      
      // Preserve minimum page number
      const p1 = existing.pageNumber || 1;
      const p2 = q.pageNumber || 1;
      existing.pageNumber = Math.min(p1, p2);
      
      // Merge prompt (keep shorter clean one, preserving image tag)
      const imgMatchExisting = existing.prompt.match(/\[image:[^\]]+\]/i);
      const imgMatchNew = q.prompt.match(/\[image:[^\]]+\]/i);
      const imageTag = imgMatchExisting ? imgMatchExisting[0] : (imgMatchNew ? imgMatchNew[0] : null);

      const cleanPromptExisting = existing.prompt.replace(/\[image:[^\]]+\]/gi, "").trim();
      const cleanPromptNew = q.prompt.replace(/\[image:[^\]]+\]/gi, "").trim();

      let bestPrompt = cleanPromptExisting;
      if (cleanPromptNew.length > 0 && cleanPromptNew.length < cleanPromptExisting.length) {
        bestPrompt = cleanPromptNew;
      }

      if (imageTag) {
        existing.prompt = `${bestPrompt}\n${imageTag}`;
      } else {
        existing.prompt = bestPrompt;
      }

      if (!existing.explanation && q.explanation) {
        existing.explanation = q.explanation;
      }
      // Keep the lower question number (more reliable source wins)
      if (q._questionNumber !== undefined) {
        existing._questionNumber = existing._questionNumber !== undefined
          ? Math.min(existing._questionNumber, q._questionNumber)
          : q._questionNumber;
      }
    } else {
      uniqueQuestions.push(q);
    }
  }

  // Second-pass dedup: if we extracted more questions than expected, tighten the threshold to 0.65
  params.onProgress?.(`Deduplicating ${uniqueQuestions.length} extracted questions...`);
  if (maxQuestionNumber > 0 && uniqueQuestions.length > maxQuestionNumber) {
    console.log(`[Dedup] ${uniqueQuestions.length} questions extracted, expected ~${maxQuestionNumber}. Running second-pass dedup (threshold 0.65)...`);
    const strictUnique: any[] = [];
    for (const q of uniqueQuestions) {
      const foundIdx = strictUnique.findIndex(existing => isDuplicateQuestion(existing, q, 0.65));
      if (foundIdx === -1) {
        strictUnique.push(q);
      } else {
        const existing = strictUnique[foundIdx];
        if (!existing.explanation && q.explanation) existing.explanation = q.explanation;
        if (q._questionNumber !== undefined) {
          existing._questionNumber = existing._questionNumber !== undefined
            ? Math.min(existing._questionNumber, q._questionNumber)
            : q._questionNumber;
        }
      }
    }
    console.log(`[Dedup] After second pass: ${strictUnique.length} questions.`);
    uniqueQuestions.length = 0;
    uniqueQuestions.push(...strictUnique);
  }

  // Sort by question number so stored order matches PDF order
  uniqueQuestions.sort((a, b) => {
    const an = a._questionNumber ?? 9999;
    const bn = b._questionNumber ?? 9999;
    if (an !== bn) return an - bn;
    return (a.pageNumber ?? 0) - (b.pageNumber ?? 0);
  });

  // Some questions have graph/diagram answer options (e.g. "which v-t graph is correct")
  // instead of text — no vision model can describe 4 tiny graphs accurately, so it either
  // writes placeholder text or hallucinates. extract_diagrams.py already isolates each
  // option's graph as its own cropped image with a precise bbox; this recovers those
  // questions by matching each option to its own [IMAGE: ...] crop instead of dropping
  // the question outright. Runs before the missing-number recovery below so a question
  // that gets dropped here (placeholder/incomplete options) is treated as "missing" and
  // gets a real shot at cross-page recovery, instead of silently vanishing.
  assignOptionImages(uniqueQuestions, params.diagrams);
  applyGroundingFilter(uniqueQuestions);

  // Diagnostic + recovery: reconcile what vision found against every independent signal
  // of the true question count — vision's own found numbers, the PDF-text-layer
  // question-crop detector (params.expectedQuestionNumbers, from extractPdfQuestionCrops
  // in pdf.ts — reads actual glyph positions, so unlike OCR reading order it isn't
  // scrambled by multi-column layouts), and the OCR-text regex scan (maxQuestionNumber,
  // computed above). Using only "gaps below vision's own highest found number" (the old
  // approach) silently missed any question vision never mentioned on ANY page at all —
  // e.g. a final question on a near-blank last page with zero trace in the logs.
  const targetNumbers = new Set<number>();
  for (const q of uniqueQuestions) {
    if (typeof q._questionNumber === "number") targetNumbers.add(q._questionNumber);
  }
  for (const n of params.expectedQuestionNumbers ?? []) targetNumbers.add(n);
  if (maxQuestionNumber > 0) {
    for (let n = 1; n <= maxQuestionNumber; n++) targetNumbers.add(n);
  }

  const computeMissing = (): number[] => {
    const found = new Set(
      uniqueQuestions.map(q => q._questionNumber).filter((n): n is number => typeof n === "number")
    );
    return [...targetNumbers].filter(n => !found.has(n)).sort((a, b) => a - b);
  };

  console.log(`[Diagnostic] Found question numbers: ${[...targetNumbers].filter(n => uniqueQuestions.some(q => q._questionNumber === n)).sort((a, b) => a - b).join(", ")}`);

  let missing = computeMissing();
  if (missing.length > 0 && params.pdfPath) {
    console.log(`[Diagnostic] MISSING question numbers: ${missing.join(", ")} — attempting cross-page recovery`);
    await runRecoveryRound(missing, uniqueQuestions, pages, params.pdfPath, 0);
  }

  // Recovery above pushes reconstructed questions straight into uniqueQuestions without
  // re-validating them, so run the grounding filter once more (idempotent on questions
  // that already passed) to catch questions where the targeted recovery came back with
  // placeholder/incomplete options.
  assignOptionImages(uniqueQuestions, params.diagrams);
  applyGroundingFilter(uniqueQuestions);

  // Second, wider-window pass: anything still missing — never recovered, or recovered
  // but dropped again by the grounding filter because the true question boundary fell
  // just outside the original page window — gets one more attempt with the window
  // padded by 1 page on each side before it's flagged as genuinely unrecoverable.
  missing = computeMissing();
  if (missing.length > 0 && params.pdfPath) {
    console.log(`[Diagnostic] Still missing after first recovery pass: ${missing.join(", ")} — retrying with a wider page window`);
    await runRecoveryRound(missing, uniqueQuestions, pages, params.pdfPath, 1);
    assignOptionImages(uniqueQuestions, params.diagrams);
    applyGroundingFilter(uniqueQuestions);
  }

  const finalMissing = computeMissing();
  if (finalMissing.length > 0) {
    console.warn(`[Extract] UNRECOVERABLE after 2 recovery attempts: Q${finalMissing.join(", Q")} — flagging for admin, needs manual entry.`);
  }

  const finalQuestions: Question[] = uniqueQuestions.map((q: any, i: number) => {
    const correctOptionIds: string[] = [];
    const options: QuestionOption[] = (q.options || []).map((o: any, idx: number) => {
      const oId = `opt-pdf-${Date.now()}-${i}-${idx}-${Math.random().toString(36).substr(2, 4)}`;
      if (o.isCorrect) correctOptionIds.push(oId);
      return {
        id: oId,
        label: o.label || String.fromCharCode(65 + idx),
        value: ensureMathDelimited(o.value || "")
      };
    });

    // Captured before the answer-key override below so the QA pass can flag cases where
    // the vision model's own answer guess disagrees with the authoritative key — two
    // independent reads landing on different answers is worth a human glance even though
    // the key wins.
    const visionGuessedOptionId = correctOptionIds.length === 1 ? correctOptionIds[0] : null;
    let answerKeyConflict = false;

    // Override with answer key if available for this question number
    const qNum = q._questionNumber;
    if (qNum && answerKey.has(qNum)) {
      const correctLabel = answerKey.get(qNum)!;
      const matchingOpt = options.find(o => o.label.toUpperCase() === correctLabel);
      if (matchingOpt) {
        if (visionGuessedOptionId && visionGuessedOptionId !== matchingOpt.id) {
          answerKeyConflict = true;
        }
        // Replace whatever AI guessed with the authoritative answer key answer
        correctOptionIds.length = 0;
        correctOptionIds.push(matchingOpt.id);
        console.log(`[AnswerKey] Q${qNum}: set correct → ${correctLabel}`);
      }
    }

    let promptText = ensureMathDelimited(q.prompt || "", false);
    let explanationText = ensureMathDelimited(q.explanation || "", false);
    const pageNum = q.pageNumber;

    if (pageNum && params.diagrams) {
      const bounds = typeof q._questionNumber === "number"
        ? params.questionBounds?.get(q._questionNumber)
        : undefined;

      // A diagram printed in the solution/answer area (isQuestionImage === false, e.g.
      // the energy-level diagram a worked answer refers to) isn't part of the question —
      // but it isn't nothing either. It belongs in the explanation. Match it the same
      // geometric way as the prompt match below: does the diagram's bbox fall inside
      // this question's own answer window (from its "Ans." marker to wherever the next
      // question starts on the page, or page end)?
      if (bounds && bounds.page === pageNum && q.explanation && !explanationText.includes("[IMAGE:")) {
        const solutionDiagrams = params.diagrams.filter(d => {
          if (d.page !== pageNum || d.isQuestionImage !== false) return false;
          if (!Array.isArray(d.bbox) || d.bbox.length !== 4) return false;
          const area = Math.abs(d.bbox[3] - d.bbox[1]) * Math.abs(d.bbox[2] - d.bbox[0]);
          return area >= 0.005;
        });
        if (solutionDiagrams.length > 0) {
          let windowEnd = 1;
          for (const b of params.questionBounds!.values()) {
            if (b.page === pageNum && b.yStart > bounds.yEnd && b.yStart < windowEnd) {
              windowEnd = b.yStart;
            }
          }
          const solutionMatch = solutionDiagrams.find(d => {
            const centerY = (d.bbox[0] + d.bbox[2]) / 2;
            return centerY >= bounds.yEnd && centerY <= windowEnd;
          });
          if (solutionMatch) {
            explanationText += `
[IMAGE: ${solutionMatch.url}]`;
          }
        }
      }

      // Filter: must be on the right page and large enough to be a real diagram (≥0.5% area).
      // Watermarks in header/footer are already excluded by extract_diagrams.py, but guard
      // against anything in the top 15% or bottom 10% that slipped through.
      const pageDiagrams = params.diagrams.filter(d => {
        if (d.page !== pageNum) return false;
        if (Array.isArray(d.bbox) && d.bbox.length === 4) {
          const [y1, x1, y2, x2] = d.bbox;
          const area = Math.abs(x2 - x1) * Math.abs(y2 - y1);
          if (area < 0.005) return false;
          if (y2 <= 0.15 || y1 >= 0.90) return false; // header/footer guard
        }
        return true;
      });

      // Sort by vertical position (top of page first) so we can match by question order
      pageDiagrams.sort((a, b) => {
        const ay1 = Array.isArray(a.bbox) ? a.bbox[0] : 0;
        const by1 = Array.isArray(b.bbox) ? b.bbox[0] : 0;
        return ay1 - by1;
      });

      if (pageDiagrams.length > 0) {
        const needsDiagram = needsDiagramFor({ ...q, prompt: promptText });

        if (needsDiagram && !promptText.includes("[IMAGE:")) {
          if (bounds && bounds.page === pageNum) {
            // Ground truth path: does this diagram's bbox actually fall inside THIS
            // question's own region (its center-y between yStart and the question's
            // own "Ans." marker)? This is the same region extract_question_crops.py
            // renders as the question's crop image, so a match here is provably part
            // of the question — never a neighbor's or its own solution's diagram.
            const match = pageDiagrams.find((d: any) => {
              if (!Array.isArray(d.bbox) || d.bbox.length !== 4) return false;
              const centerY = (d.bbox[0] + d.bbox[2]) / 2;
              return centerY >= bounds.yStart && centerY <= bounds.yEnd;
            });
            if (match) {
              promptText += `
[IMAGE: ${match.url}]`;
            }
            // No match: this question's own region genuinely has no diagram in it
            // (e.g. vision mis-self-reported _hasDiagram) — leave unattached rather
            // than guess; missing_referenced_diagram (below) flags it if warranted.
          } else {
            // Fallback for pages/questions without crop-derived bounds (crop
            // extraction failed, or this question came from a non-PDF recovery path).
            // Prefer question-area images; only fall back to all diagrams when there's
            // exactly one on the page (unambiguous single-diagram page).
            const qImgDiagrams = pageDiagrams.filter((d: any) => d.isQuestionImage !== false);
            const candidateDiagrams = qImgDiagrams.length > 0
              ? qImgDiagrams
              : pageDiagrams.length === 1 ? pageDiagrams : [];

            if (candidateDiagrams.length > 0) {
              // Only the questions on THIS page that ALSO need a diagram compete for
              // these candidates, matched 1:1 in page order — with no reuse. Reusing
              // the same diagram across every remaining needing-question once
              // candidates ran out (the old Math.min-capped index) silently attached
              // one question's diagram to an unrelated question instead. Skipping the
              // assignment when there's no unique slot left is the safer default.
              const questionsOnPage = uniqueQuestions.filter(
                (pq: any) => pq.pageNumber === pageNum
              );
              const needingQuestionsOnPage = questionsOnPage.filter(needsDiagramFor);
              const needIndex = needingQuestionsOnPage.findIndex(
                (pq: any) => pq._questionNumber === q._questionNumber || pq.prompt === q.prompt
              );
              if (needIndex >= 0 && needIndex < candidateDiagrams.length) {
                promptText += `
[IMAGE: ${candidateDiagrams[needIndex].url}]`;
              }
            }
          }
        }
      }
    }

    const normalizedPrompt = promptText.toLowerCase().replace(/[^a-z0-9]/g, "");
    const promptHash = crypto.createHash("sha256").update(normalizedPrompt).digest("hex").substring(0, 16);
    // Include the question number in the id whenever one was detected, so two genuinely
    // different questions can never collide on id just because their transcribed text
    // happened to normalize identically. A pure text-hash id has no such guarantee —
    // this is a real, observed failure mode: it silently overwrites one of the two
    // during the upsert save loop in api.ts, with zero warning anywhere. The dedup-by-
    // number pass earlier in this function already guarantees each q._questionNumber is
    // unique within this book by this point, so this is safe.
    const qId = q._questionNumber
      ? `que-pdf-${params.bookId || "book"}-q${q._questionNumber}-${promptHash}`
      : `que-pdf-${params.bookId || "book"}-${promptHash}`;

    // Tier-1 QA pass (deterministic, no extra API cost — see the Phase-4 reliability
    // plan): every question gets checked here at assembly time, since all the context
    // (final promptText, options, pre/post answer-key correctOptionIds) is already at
    // hand. Tier-2 (a per-page vision fidelity cross-check) runs separately afterward
    // via verifyExtractedQuestions() and appends to qaFlags/qaStatus set here.
    const qaFlags: string[] = [];
    if (options.length !== 4) {
      qaFlags.push(`wrong_option_count:${options.length}`);
    }
    if (PLACEHOLDER_OPTION_PATTERN.test(promptText) || PLACEHOLDER_OPTION_PATTERN.test(explanationText)) {
      qaFlags.push("placeholder_leak");
    }
    if (hasUndelimitedLatex(promptText) || hasUndelimitedLatex(explanationText)) {
      qaFlags.push("undelimited_latex");
    }
    if (promptMentionsFigure(promptText.toLowerCase()) && !promptText.includes("[IMAGE:")) {
      qaFlags.push("missing_referenced_diagram");
    }
    if (correctOptionIds.length === 0) {
      qaFlags.push("no_answer_detected");
    }
    if (answerKeyConflict) {
      qaFlags.push("answer_key_conflict");
    }

    const resolvedSubjectId = params.sectionMap?.get(pageNum) ?? params.subjectId;
    const topicsForResolvedSubject = params.topicsBySubject?.get(resolvedSubjectId) ?? params.topics ?? [];
    // If the section map put this question under a different subject than the book's
    // default, params.topicId (the book-level default topic) belongs to the WRONG
    // subject and must not be used as a fallback — fall back to that subject's own
    // topic list instead, and only use params.topicId when we're on the book's own
    // default subject (the common case, where it's always correct).
    const fallbackTopicId = resolvedSubjectId === params.subjectId ? params.topicId : topicsForResolvedSubject[0]?.id ?? params.topicId;
    const resolvedTopicId = matchTopicId(q.topicName, topicsForResolvedSubject) ?? fallbackTopicId;

    // Parse reference tags (e.g., "JEE MAIN 2023", "KVPY 2012"), difficulty tags ("Difficult"), and topic tags from text
    const extractedTags: string[] = Array.isArray(q.tags) ? [...q.tags] : [];
    let detectedDifficulty: "easy" | "medium" | "hard" = (["easy", "medium", "hard"].includes(q.difficulty) ? q.difficulty : "medium") as "easy" | "medium" | "hard";
    let detectedPyqYear: number | undefined = params.pyqYear;
    let detectedPyqExamName: string | undefined = params.pyqExamName;

    const tagMatches = promptText.matchAll(/\(([^)]*(?:JEE|MAIN|ADV|KVPY|GUJCET|NEET|AIEEE|IIT|Easy|Medium|Hard|Difficult|Diﬀcult|Advanced)[^)]*)\)/gi);
    for (const tm of tagMatches) {
      const parts = tm[1].split(",").map(s => s.trim()).filter(Boolean);
      for (const part of parts) {
        let clean = part.replace(/\s+/g, " ");
        clean = clean.replace(/diﬀcult/i, "Difficult").replace(/diffcult/i, "Difficult");

        if (/^easy$/i.test(clean)) {
          detectedDifficulty = "easy";
          if (!extractedTags.includes("Easy")) extractedTags.push("Easy");
        } else if (/^medium$/i.test(clean)) {
          detectedDifficulty = "medium";
          if (!extractedTags.includes("Medium")) extractedTags.push("Medium");
        } else if (/^(hard|difficult|advanced)$/i.test(clean)) {
          detectedDifficulty = "hard";
          const capitalized = clean.charAt(0).toUpperCase() + clean.slice(1);
          if (!extractedTags.includes(capitalized)) extractedTags.push(capitalized);
        } else {
          if (/\b(easy)\b/i.test(clean)) detectedDifficulty = "easy";
          if (/\b(medium)\b/i.test(clean)) detectedDifficulty = "medium";
          if (/\b(hard|difficult|advanced)\b/i.test(clean)) detectedDifficulty = "hard";
          if (!extractedTags.includes(clean)) extractedTags.push(clean);

          const yearMatch = clean.match(/(19\d{2}|20\d{2})/);
          if (yearMatch && !detectedPyqYear) {
            detectedPyqYear = parseInt(yearMatch[1], 10);
          }
          if (!detectedPyqExamName) {
            if (/JEE/i.test(clean)) detectedPyqExamName = /MAIN/i.test(clean) ? "JEE Mains" : "JEE Advanced";
            else if (/IIT/i.test(clean)) detectedPyqExamName = "JEE Advanced";
            else if (/AIEEE/i.test(clean)) detectedPyqExamName = "AIEEE";
            else if (/KVPY/i.test(clean)) detectedPyqExamName = "KVPY";
            else if (/GUJCET/i.test(clean)) detectedPyqExamName = "GUJCET";
            else if (/NEET/i.test(clean)) detectedPyqExamName = "NEET";
          }
        }
      }
    }

    // Tag related topic on question
    const matchedTopicObj = topicsForResolvedSubject.find(t => t.id === resolvedTopicId);
    if (matchedTopicObj && !extractedTags.includes(matchedTopicObj.name)) {
      extractedTags.push(matchedTopicObj.name);
    }

    return {
      id: qId,
      subjectId: resolvedSubjectId,
      topicId: resolvedTopicId,
      type: correctOptionIds.length > 1 ? "multi_correct" : "single_correct",
      prompt: promptText,
      difficulty: detectedDifficulty,
      marks: q.marks || 1,
      negativeMarks: q.negativeMarks || 0,
      correctOptionIds,
      options,
      explanation: explanationText,
      sourceType: detectedPyqExamName ? "pyq" : params.sourceType,
      bookId: params.bookId,
      // Mark unverified if no correct answer was detected (garbled OCR, missing answer key)
      isVerified: correctOptionIds.length > 0,
      pageNumber: pageNum,
      questionNumber: q._questionNumber,
      qaFlags,
      qaStatus: qaFlags.length > 0 ? "flagged" : "unreviewed",
      qaCheckedAt: new Date().toISOString(),
      tags: extractedTags.length > 0 ? extractedTags : undefined,
      ...(detectedPyqYear !== undefined && { pyqYear: detectedPyqYear }),
      ...(detectedPyqExamName !== undefined && { pyqExamName: detectedPyqExamName }),
      ...(params.pyqSession !== undefined && { pyqSession: params.pyqSession }),
    };
  });

  // Defense-in-depth: if any two questions still ended up with the same id (e.g. two
  // questions with no detected number at all, so the id fell back to hash-only), the
  // save loop in api.ts would silently overwrite one via upsert with no error anywhere.
  // Surface that loudly here instead — this is exactly the kind of gap that lost 3
  // questions from a 180-question book without a single log line pointing at it.
  const idCounts = new Map<string, number>();
  for (const q of finalQuestions) idCounts.set(q.id, (idCounts.get(q.id) ?? 0) + 1);
  const collided = [...idCounts.entries()].filter(([, count]) => count > 1);
  if (collided.length > 0) {
    console.warn(
      `[Extract] WARNING: ${collided.length} id collision(s) detected — these questions will silently overwrite each other on save: ` +
      collided.map(([id, count]) => `${id} (x${count})`).join(", ")
    );
  }

  return { questions: finalQuestions, missingNumbers: finalMissing, expectedTotal: targetNumbers.size };
}

/**
 * Tier-2 QA pass: one extra vision call PER PAGE (not per question) using a cheap,
 * independent model, asking it to flag any question on that page whose extracted text
 * doesn't faithfully match what's actually printed. Tier-1 deterministic flags are
 * already set inline during extraction (see the qaFlags block in
 * extractQuestionsFromPdfText's final .map()); this ADDS to those, merged by
 * questionNumber, mutating `questions` in place. No-ops entirely when pdfPath or an
 * OpenRouter key isn't available — Tier-1 flags still stand on their own either way, per
 * the plan's persist-then-flag decision (never block extraction on this).
 */
export async function verifyExtractedQuestions(
  questions: Question[],
  pdfPath?: string
): Promise<void> {
  if (!pdfPath || !process.env.OPENROUTER_API_KEY) return;

  let verifyModel = process.env.OPENROUTER_VERIFY_MODEL;
  if (!verifyModel) {
    const catalog = await getOpenRouterCatalog();
    verifyModel = catalog ? cheapestPaidVisionModel(catalog) ?? undefined : undefined;
  }
  if (!verifyModel) {
    console.warn("[Verify] No usable verification vision model — skipping Tier-2 fidelity check.");
    return;
  }

  const byPage = new Map<number, Question[]>();
  for (const q of questions) {
    if (q.questionNumber == null || q.pageNumber == null) continue;
    const list = byPage.get(q.pageNumber) ?? [];
    list.push(q);
    byPage.set(q.pageNumber, list);
  }

  for (const [pageNumber, pageQuestions] of byPage) {
    const imageBase64 = renderPageToBase64(pdfPath, pageNumber - 1);
    if (!imageBase64) continue;

    const questionsPayload = pageQuestions.map(q => ({
      questionNumber: q.questionNumber,
      prompt: q.prompt,
      options: q.options.map(o => ({ label: o.label, value: o.value }))
    }));

    const verifyPrompt = `You are proofreading extracted exam questions against the original page image. Below is JSON of what was extracted from THIS page:

${JSON.stringify(questionsPayload)}

Compare each question's transcribed text and options against what is actually printed on the page image. Flag ONLY questions where the extracted text does NOT faithfully match the page (garbled text, wrong numbers/symbols, options that don't match what's printed, or a visibly different marked answer). Do not flag minor formatting differences.

Return JSON: {"flagged": [{"questionNumber": <number>, "reason": "<short reason>"}]}
If everything matches, return {"flagged": []}.`;

    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://railway.app",
          "X-Title": "Coaching Portal Exam Gen"
        },
        body: JSON.stringify({
          model: verifyModel,
          messages: [{ role: "user", content: [
            { type: "image_url", image_url: { url: `data:image/png;base64,${imageBase64}`, detail: "high" } },
            { type: "text", text: verifyPrompt }
          ]}],
          response_format: { type: "json_object" },
          temperature: 0.1,
          max_tokens: 2000
        })
      });
      if (!response.ok) {
        console.warn(`[Verify] Page ${pageNumber}: verify call failed (${response.status})`);
        continue;
      }
      const data = await response.json();
      const raw = data.choices?.[0]?.message?.content;
      if (!raw) continue;
      const parsed = JSON.parse(repairJsonString(raw));
      const flagged: Array<{ questionNumber: number; reason: string }> = parsed.flagged || [];
      for (const f of flagged) {
        const match = pageQuestions.find(q => q.questionNumber === f.questionNumber);
        if (!match) continue;
        match.qaFlags = [...(match.qaFlags ?? []), `fidelity_mismatch: ${f.reason}`];
        match.qaStatus = "flagged";
        console.warn(`[Verify] Q${f.questionNumber} (page ${pageNumber}) flagged: ${f.reason}`);
      }
    } catch (e: any) {
      console.warn(`[Verify] Page ${pageNumber} verify threw:`, e.message);
    }

    // Reuse the same adaptive delay as primary extraction so this second vision pass
    // doesn't pile a fresh burst of requests on top of a provider that just rate-limited
    // us during extraction.
    await new Promise(resolve => setTimeout(resolve, nextVisionDelayMs()));
  }

  const checkedAt = new Date().toISOString();
  for (const q of questions) q.qaCheckedAt = checkedAt;
}

export interface AiReviewSuggestion {
  needsCorrection: boolean;
  notes: string;
  prompt?: string;
  options?: { label: string; value: string }[];
  correctLabels?: string[];
  explanation?: string;
}

/**
 * On-demand, single-question counterpart to verifyExtractedQuestions' Tier-2 pass —
 * powers the "AI Review" button in the admin question editor (QuestionBankPage's
 * PDF-vs-question split view). Re-renders the question's own source page and asks a
 * vision model to compare it against what's currently stored, returning ONLY the fields
 * that need to change plus a plain-English explanation.
 *
 * Deliberately returns a suggestion rather than mutating anything — the caller (admin.ts
 * POST /questions/:id/ai-review) never writes to the DB itself; the admin reviews the
 * diff and applies it (or not) via the existing PUT /questions/:id edit flow. Some of
 * these questions may already be in a scheduled or completed exam, so a silent
 * auto-correction that's subtly wrong would be worse than the original error — same
 * persist-then-flag philosophy as the rest of the QA pipeline, applied per-question.
 */
export async function reviewQuestionAgainstSource(
  question: { prompt: string; options: { label: string; value: string }[]; explanation: string },
  currentCorrectLabels: string[],
  pdfPath: string,
  pageNumber: number
): Promise<AiReviewSuggestion> {
  if (!process.env.OPENROUTER_API_KEY) {
    return { needsCorrection: false, notes: "AI review unavailable — OPENROUTER_API_KEY not configured." };
  }

  const imageBase64 = renderPageToBase64(pdfPath, pageNumber - 1);
  if (!imageBase64) {
    return { needsCorrection: false, notes: "Could not render the source PDF page for review." };
  }

  const { models } = await resolveVisionModels();
  if (models.length === 0) {
    return { needsCorrection: false, notes: "No usable vision model available for review." };
  }

  const currentPayload = {
    prompt: question.prompt,
    options: question.options,
    markedCorrect: currentCorrectLabels,
    explanation: question.explanation
  };

  const reviewPrompt = `You are proofreading one exam question against its original source page image.

Currently stored question data:
${JSON.stringify(currentPayload, null, 2)}

Carefully compare against the page image. Check: (1) is the question text transcribed correctly, including all LaTeX/math/chemical formulas, (2) are all options transcribed correctly, (3) is the marked correct answer actually correct per the page (an answer-key marker if visible, otherwise your own careful derivation), (4) is the explanation accurate and consistent with the correct answer.

If everything is already correct, return exactly: {"needsCorrection": false, "notes": "brief confirmation of what you checked"}.

If something is wrong, return corrected fields — include ONLY the fields that actually need to change, omit anything already correct:
{
  "needsCorrection": true,
  "notes": "short explanation of what was wrong and what you changed",
  "prompt": "corrected prompt text using $...$ for inline math and $$...$$ for block math — omit if unchanged",
  "options": [{"label":"A","value":"..."}, {"label":"B","value":"..."}, {"label":"C","value":"..."}, {"label":"D","value":"..."}],
  "correctLabels": ["A"],
  "explanation": "corrected explanation — omit if unchanged"
}
If you include "options" at all, include all of them (not just the changed one), since options are replaced as a set.

Do NOT invent content that isn't visible on the page. If a diagram/image seems to be missing but you can't describe it precisely enough from what's visible, say so in "notes" rather than guessing at its content.`;

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://railway.app",
        "X-Title": "Coaching Portal Exam Gen"
      },
      body: JSON.stringify({
        model: models[0],
        models,
        messages: [{ role: "user", content: [
          { type: "image_url", image_url: { url: `data:image/png;base64,${imageBase64}`, detail: "high" } },
          { type: "text", text: reviewPrompt }
        ]}],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 3000
      })
    });
    if (!response.ok) {
      return { needsCorrection: false, notes: `Review call failed (HTTP ${response.status}).` };
    }
    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content;
    if (!raw) return { needsCorrection: false, notes: "Empty response from review model." };

    const parsed = JSON.parse(repairJsonString(raw));
    if (!parsed.needsCorrection) {
      return { needsCorrection: false, notes: parsed.notes || "No issues found." };
    }
    return {
      needsCorrection: true,
      notes: parsed.notes || "",
      prompt: typeof parsed.prompt === "string" ? parsed.prompt : undefined,
      options: Array.isArray(parsed.options) ? parsed.options : undefined,
      correctLabels: Array.isArray(parsed.correctLabels) ? parsed.correctLabels : undefined,
      explanation: typeof parsed.explanation === "string" ? parsed.explanation : undefined
    };
  } catch (e: any) {
    return { needsCorrection: false, notes: `Review threw an error: ${e.message}` };
  }
}

const BIOLOGY_VISION_PROMPT = `You are a biology exam question generator. You will receive an image from a biology textbook.

FIRST, decide if the image is a proper biological diagram or scientific figure (e.g. cell diagrams, organ cross-sections, microscopy images, plant/animal structure illustrations, biological process diagrams, labelled anatomical figures).

If the image is ANY of the following, respond with ONLY: {"skip": true}
- A portrait or photograph of a person / scientist
- A page of running text or chapter introduction
- A table of contents, index, or chapter heading page
- A decorative or background image unrelated to a biology concept
- A full textbook page spread showing mostly paragraphs of text

Only if it IS a proper biology diagram: create exactly 1 multiple-choice question that:
- References the diagram directly (e.g. "In the figure shown,", "Based on the diagram,", "The structure labeled X is")
- Tests conceptual understanding, not trivial observation
- Has exactly 4 options and exactly 1 correct answer

Return ONLY a JSON object in one of these two forms:

Skip form:  { "skip": true }

Question form:
{
  "question": "Question text referencing the figure",
  "options": ["Option A text", "Option B text", "Option C text", "Option D text"],
  "correctIndex": 0,
  "explanation": "Brief explanation of the correct answer",
  "difficulty": "medium"
}

Rules:
- correctIndex is 0-based (0=A, 1=B, 2=C, 3=D)
- difficulty must be one of: "easy", "medium", "hard"
- Do NOT include option letters (A/B/C/D) inside the option text strings`;

/**
 * Generates biology MCQ questions from diagram images extracted from a PDF.
 * Each diagram is sent to a vision LLM with a structured prompt to produce one question per figure.
 */
export async function generateQuestionsFromBiologyFigures(params: {
  pdfPath: string;
  bookId: string;
  topicId: string;
  topicIds?: string[];
  subjectId: string;
  subject?: string;
  chapterName?: string;
  onProgress?: (message: string) => void;
}): Promise<Question[]> {
  const { pdfPath, bookId, topicId, topicIds = [topicId], subjectId, subject, chapterName, onProgress } = params;

  onProgress?.("Extracting diagrams from PDF...");
  let diagrams: Array<{ page: number; url: string; bbox: number[]; isQuestionImage?: boolean }>;
  try {
    const diagramsResult = await extractPdfDiagrams(pdfPath, bookId);
    if (diagramsResult.failed) {
      onProgress?.(`Diagram extraction failed: ${diagramsResult.errorMessage}`);
      return [];
    }
    diagrams = diagramsResult.items;
  } catch (e: any) {
    onProgress?.(`Diagram extraction failed: ${e.message}`);
    return [];
  }

  // Filter to diagrams that are actual figures:
  //   - area > 3% (skip tiny decorative elements)
  //   - area < 45% (skip full-page text renders / page spreads)
  //   - width < 95% of page (skip full-width banners/headers)
  const significant = diagrams.filter(d => {
    const [y1, x1, y2, x2] = d.bbox;
    const area = (y2 - y1) * (x2 - x1);
    const width = x2 - x1;
    return area > 0.03 && area < 0.45 && width < 0.95;
  });

  if (significant.length === 0) {
    onProgress?.("No significant diagrams found in PDF.");
    return [];
  }

  // Limit to 6 figures to keep generation time reasonable
  const toProcess = significant.slice(0, 6);
  onProgress?.(`Found ${significant.length} diagram(s) — processing up to ${toProcess.length}...`);

  const results: Question[] = [];
  let topicIndex = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const fig = toProcess[i];
    onProgress?.(`Figure ${i + 1}/${toProcess.length}: generating question from diagram (page ${fig.page + 1})...`);

    // Resolve absolute path from the URL like /uploads/diagrams/xxx.png
    const relPath = fig.url.startsWith("/uploads/") ? fig.url.slice("/uploads/".length) : fig.url;
    const absPath = path.join(uploadsRoot, relPath);

    let imageBase64: string;
    try {
      imageBase64 = fs.readFileSync(absPath).toString("base64");
    } catch {
      onProgress?.(`Figure ${i + 1}: file not found at ${absPath}, skipping.`);
      continue;
    }

    let raw: string | null = null;
    try {
      raw = await generateVisionContent(BIOLOGY_VISION_PROMPT, imageBase64);
    } catch (e: any) {
      onProgress?.(`Figure ${i + 1}: vision call failed — ${e.message}`);
      continue;
    }

    if (!raw) {
      onProgress?.(`Figure ${i + 1}: vision model returned no content, skipping.`);
      continue;
    }

    let parsed: any;
    try {
      const repaired = repairJsonString(raw);
      // Strip markdown code fences if present
      const stripped = repaired.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
      parsed = JSON.parse(stripped);
    } catch {
      onProgress?.(`Figure ${i + 1}: failed to parse JSON response, skipping.`);
      continue;
    }

    if (parsed.skip === true) {
      onProgress?.(`Figure ${i + 1}: not a biology diagram (portrait/text page), skipping.`);
      continue;
    }

    const questionText = parsed.question || parsed.questionText;
    if (!questionText || !Array.isArray(parsed.options) || parsed.options.length !== 4) {
      onProgress?.(`Figure ${i + 1}: incomplete question structure, skipping.`);
      continue;
    }

    const correctIdx: number = typeof parsed.correctIndex === "number" ? parsed.correctIndex : 0;
    if (correctIdx < 0 || correctIdx >= 4) {
      onProgress?.(`Figure ${i + 1}: invalid correctIndex ${correctIdx}, skipping.`);
      continue;
    }

    // Build options with stable IDs then Fisher-Yates shuffle
    const labels = ["A", "B", "C", "D"];
    const rawOptions: QuestionOption[] = parsed.options.map((optText: string, idx: number) => ({
      id: `opt-bio-${bookId}-${i}-${idx}`,
      label: labels[idx],
      value: String(optText)
    }));
    const correctOptionId = rawOptions[correctIdx].id;

    const questionId = `que-bio-${bookId}-p${fig.page}-${i}-${crypto.randomBytes(4).toString("hex")}`;
    const assignedTopicId = topicIds[topicIndex % topicIds.length];
    topicIndex++;

    const question: Question = {
      id: questionId,
      subjectId,
      topicId: assignedTopicId,
      type: "single_correct" as QuestionType,
      prompt: `[IMAGE: ${fig.url}]\n${questionText}`,
      difficulty: (["easy", "medium", "hard"].includes(parsed.difficulty) ? parsed.difficulty : "medium") as "easy" | "medium" | "hard",
      marks: 1,
      negativeMarks: 0,
      correctOptionIds: [correctOptionId],
      options: rawOptions,
      explanation: parsed.explanation || "",
      sourceType: "ai_generated" as QuestionSource,
      bookId,
      isVerified: true
    };

    results.push(question);
    onProgress?.(`Figure ${i + 1}: question generated ✓`);
  }

  onProgress?.(`Biology figures complete: ${results.length} question(s) from ${toProcess.length} diagram(s).`);
  return results;
}
