import "dotenv/config";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { initDatabase } from "./data/database.js";
import { apiRouter } from "./routes/api.js";
import { adminRouter } from "./routes/admin.js";
import { referencePapersRoot, uploadsRoot } from "./utils/paths.js";

const app = express();
const port = Number(process.env.PORT ?? 3030);

// Containers run in UTC regardless of host timezone. Format log lines in IST so
// they're directly readable in `docker logs` / Coolify's log viewer without the
// admin having to mentally offset by +5:30. Stored timestamps (createdAt, etc.)
// are intentionally left as UTC ISO strings — the frontend already renders those
// in the viewer's local timezone via toLocaleString().
function nowIST(): string {
  return new Date().toLocaleString("sv-SE", { timeZone: "Asia/Kolkata" }).replace(" ", "T") + "+05:30";
}

app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  next();
});
app.use((req, _res, next) => {
  console.log(`[${nowIST()}] ${req.method} ${req.originalUrl}`);
  next();
});
app.use("/uploads", express.static(uploadsRoot));
app.use("/reference-files", express.static(referencePapersRoot));
app.use("/api/admin", adminRouter);
app.use("/api", apiRouter);

// Serve frontend static files
import fs from "node:fs";
import path from "node:path";
import { frontendDistRoot } from "./utils/paths.js";

if (fs.existsSync(frontendDistRoot)) {
  console.log(`Serving frontend from: ${frontendDistRoot}`);
  app.use(express.static(frontendDistRoot));
  // SPA fallback
  app.get("*", (req, res, next) => {
    if (req.originalUrl.startsWith("/api") || req.originalUrl.startsWith("/uploads") || req.originalUrl.startsWith("/reference-files")) {
      return next();
    }
    res.sendFile(path.join(frontendDistRoot, "index.html"));
  });
}

app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
  console.error(`[api-error] ${req.method} ${req.originalUrl}`, error);
  const message = error instanceof Error ? error.message : "Internal server error";
  res.status(500).json({ message });
});

await initDatabase();

app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
});

// Non-blocking: surface retired/misconfigured AI models in the logs at boot
// instead of at first extraction.
if (process.env.OPENROUTER_API_KEY) {
  import("./utils/ai-generator.js")
    .then((ai) => ai.checkAiModelHealth())
    .then(({ ok, visionModels, textModel }) => {
      console.log(`[AI health] ${ok ? "ok" : "DEGRADED"} — text: ${textModel}, vision: ${visionModels.join(", ") || "none"}`);
    })
    .catch((e) => console.warn("[AI health] startup check failed:", e?.message ?? e));
}
