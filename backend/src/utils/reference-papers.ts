import fs from "node:fs/promises";
import path from "node:path";
import { referencePapersRoot } from "./paths.js";

export interface ReferencePaper {
  id: string;
  fileName: string;
  displayName: string;
  relativePath: string;
  subject: string;
  category: string;
  classLevel: string;
  fileType: "pdf" | "zip";
  fileUrl: string;
}

function prettifyName(value: string) {
  return value
    .replace(/\.[^.]+$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractReferenceCode(referencePath: string) {
  const normalizedPath = referencePath.toLowerCase().replace(/\\/g, "/");
  const folderSegment = normalizedPath.split("/").find((segment) => /^(ke|le)[a-z]{2,}/.test(segment));
  const fileSegment = path.basename(normalizedPath);
  const fileMatch = fileSegment.match(/^(ke|le)[a-z]{2,}/);
  return (folderSegment ?? fileMatch?.[0] ?? "").replace(/-1$/, "");
}

function inferSubject(referencePath: string) {
  const name = referencePath.toLowerCase();
  const code = extractReferenceCode(referencePath);

  const codeSubjectMap: Record<string, string> = {
    keac: "Accountancy",
    leac: "Accountancy",
    kebo: "Business Studies",
    lebo: "Business Studies",
    kebs: "Biology",
    lebs: "Biology",
    kech: "Chemistry",
    lech: "Chemistry",
    keec: "Economics",
    leec: "Economics",
    kehb: "English - Hornbill",
    keww: "English - Woven Words",
    lefl: "English - Flamingo",
    lekl: "English - Kaleidoscope",
    kemh: "Mathematics",
    lemh: "Mathematics",
    keph: "Physics",
    leph: "Physics",
    kest: "Statistics"
  };

  const matchedCode = Object.keys(codeSubjectMap).find((prefix) => code.startsWith(prefix));
  if (matchedCode) {
    return codeSubjectMap[matchedCode];
  }

  if (name.includes("math")) return "Mathematics";
  if (name.includes("chemistry")) return "Chemistry";
  if (name.includes("physics")) return "Physics";
  if (name.includes("english")) return "English";
  if (name.includes("security")) return "Security";
  if (name.includes("it")) return "Information Technology";
  if (name.includes("ai")) return "Artificial Intelligence";
  return "General";
}

function inferCategory(referencePath: string, extension: string) {
  const name = referencePath.toLowerCase();
  if (extension === ".zip") return "Book Archive";
  if (name.includes("ms")) return "Marking Scheme";
  if (name.includes("sqp")) return "Sample Question Paper";
  if (name.includes("handbook")) return "Handbook";
  if (name.includes("ps")) return "Practice Support";
  return "Reference";
}

function inferClassLevel(referencePath: string) {
  const name = referencePath.toLowerCase();
  if (name.includes("11th")) return "11th";
  if (name.includes("12th")) return "12th";
  if (name.includes("_x") || name.includes(" x ")) return "10th";
  if (name.includes("viii")) return "8th";
  if (name.includes("vii")) return "7th";
  if (name.includes("vi")) return "6th";
  return "General";
}

function buildPublicPath(relativePath: string) {
  return `/reference-files/${relativePath.split(path.sep).map(encodeURIComponent).join("/")}`;
}

async function walkReferences(directory: string, currentRelativePath = ""): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      continue;
    }

    const absolutePath = path.join(directory, entry.name);
    const relativePath = path.join(currentRelativePath, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await walkReferences(absolutePath, relativePath)));
      continue;
    }

    const extension = path.extname(entry.name).toLowerCase();
    if (extension === ".pdf" || extension === ".zip") {
      files.push(relativePath);
    }
  }

  return files;
}

export async function listReferencePapers(): Promise<ReferencePaper[]> {
  try {
    const files = await walkReferences(referencePapersRoot);
    return files
      .sort((left, right) => left.localeCompare(right))
      .map((relativePath) => {
        const fileName = path.basename(relativePath);
        const extension = path.extname(fileName).toLowerCase();

        return {
          id: relativePath,
          fileName,
          displayName: prettifyName(fileName),
          relativePath,
          subject: inferSubject(relativePath),
          category: inferCategory(relativePath, extension),
          classLevel: inferClassLevel(relativePath),
          fileType: extension === ".zip" ? "zip" : "pdf",
          fileUrl: buildPublicPath(relativePath)
        };
      });
  } catch {
    return [];
  }
}
