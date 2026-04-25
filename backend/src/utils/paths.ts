import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);

export const backendRoot = path.resolve(currentDir, "..", "..");
export const workspaceRoot = path.resolve(backendRoot, "..");
export const uploadsRoot = path.join(backendRoot, "uploads");
export const booksUploadsRoot = path.join(uploadsRoot, "books");
export const scriptsRoot = path.join(backendRoot, "scripts");
export const referencePapersRoot = path.join(workspaceRoot, "books-papers");
