import type { Response } from "express";

export interface SseEvent {
  type: "progress" | "complete" | "error";
  message: string;
  data?: any;
}

interface Job {
  id: string;
  status: "running" | "complete" | "error";
  events: SseEvent[];
  clients: Set<Response>;
  createdAt: number;
}

const jobs = new Map<string, Job>();

// Prune jobs older than 2 hours to prevent memory leaks
setInterval(() => {
  const cutoff = Date.now() - 7_200_000;
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff) jobs.delete(id);
  }
}, 600_000).unref();

export function createJob(): string {
  const id = `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  jobs.set(id, { id, status: "running", events: [], clients: new Set(), createdAt: Date.now() });
  return id;
}

export function emitJobEvent(jobId: string, event: SseEvent): void {
  const job = jobs.get(jobId);
  if (!job || job.status !== "running") return;
  job.events.push(event);
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of job.clients) {
    try { client.write(payload); } catch { /* disconnected */ }
  }
  if (event.type === "complete" || event.type === "error") {
    job.status = event.type;
    for (const client of job.clients) {
      try { client.end(); } catch { /* ignore */ }
    }
    job.clients.clear();
  }
}

export function subscribeToJob(jobId: string, res: Response): boolean {
  const job = jobs.get(jobId);
  if (!job) return false;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // prevents nginx/caddy proxy buffering
  res.flushHeaders();
  // Disable Nagle's algorithm so each write() flushes immediately through proxies
  res.socket?.setNoDelay?.(true);
  res.socket?.setTimeout?.(0);

  // Replay full event history so late-joining clients see everything
  for (const event of job.events) {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  if (job.status !== "running") {
    res.end();
    return true;
  }

  job.clients.add(res);

  // Heartbeat comment every 25s — beats Cloudflare's 100s idle read timeout
  const heartbeat = setInterval(() => {
    try { res.write(": keepalive\n\n"); } catch { clearInterval(heartbeat); }
  }, 25_000);

  res.on("close", () => {
    clearInterval(heartbeat);
    job.clients.delete(res);
  });

  return true;
}
