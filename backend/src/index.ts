import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { initDatabase } from "./data/database.js";
import { apiRouter } from "./routes/api.js";
import { referencePapersRoot, uploadsRoot } from "./utils/paths.js";

const app = express();
const port = Number(process.env.PORT ?? 3030);

app.use(cors());
app.use(express.json());
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});
app.use("/uploads", express.static(uploadsRoot));
app.use("/reference-files", express.static(referencePapersRoot));
app.use("/api", apiRouter);
app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
  console.error(`[api-error] ${req.method} ${req.originalUrl}`, error);
  const message = error instanceof Error ? error.message : "Internal server error";
  res.status(500).json({ message });
});

await initDatabase();

app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
});
