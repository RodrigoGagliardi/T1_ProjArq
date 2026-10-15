import express, { type Express } from "express";
import type { Logger } from "./logger.js";
import type { SyncRunRepo } from "./store/syncRunRepo.js";
import { runSyncCycle, type SyncContext } from "./sync/runSync.js";

export function createServer(ctx: SyncContext, syncRunRepo: SyncRunRepo, logger: Logger): Express {
  const app = express();

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/sync/status", (_req, res) => {
    res.json({
      latest: syncRunRepo.latest() ?? null,
      history: syncRunRepo.history(10),
    });
  });

  app.post("/sync/run", (_req, res) => {
    runSyncCycle(ctx)
      .then((result) => res.status(202).json(result))
      .catch((err) => {
        logger.error({ err }, "falha ao executar sincronizacao manual");
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
      });
  });

  return app;
}
