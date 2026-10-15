import type { Logger } from "./logger.js";
import { runSyncCycle, type SyncContext } from "./sync/runSync.js";

/** Agenda o ciclo de sincronizacao a cada `intervalSeconds` (ver POLL_INTERVAL_SECONDS). */
export function startScheduler(ctx: SyncContext, intervalSeconds: number, logger: Logger): () => void {
  const timer = setInterval(() => {
    runSyncCycle(ctx).catch((err) => {
      logger.error({ err }, "erro nao tratado no ciclo agendado");
    });
  }, intervalSeconds * 1000);

  logger.info({ intervalSeconds }, "scheduler iniciado");
  return () => clearInterval(timer);
}
