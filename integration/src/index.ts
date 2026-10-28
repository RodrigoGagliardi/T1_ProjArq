import { IEducarClient } from "./adapters/ieducarClient.js";
import { MoodleClient } from "./adapters/moodleClient.js";
import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import { startScheduler } from "./scheduler.js";
import { createServer } from "./server.js";
import { openDatabase } from "./store/db.js";
import { EnrollmentRepo } from "./store/enrollmentRepo.js";
import { SchoolClassRepo } from "./store/schoolClassRepo.js";
import { SyncRunRepo } from "./store/syncRunRepo.js";
import { runSyncCycle, type SyncContext } from "./sync/runSync.js";

const config = loadConfig();
const logger = createLogger(config.LOG_LEVEL);

const db = openDatabase(config.DB_PATH);
const schoolClassRepo = new SchoolClassRepo(db);
const enrollmentRepo = new EnrollmentRepo(db);
const syncRunRepo = new SyncRunRepo(db);

const ieducar = new IEducarClient({ baseUrl: config.IEDUCAR_BASE_URL, token: config.IEDUCAR_API_TOKEN, logger });
const moodle = new MoodleClient({
  baseUrl: config.MOODLE_BASE_URL,
  token: config.MOODLE_WS_TOKEN,
  hostHeader: config.MOODLE_HOST_HEADER,
  logger,
});

const syncContext: SyncContext = {
  ieducar,
  moodle,
  schoolClassRepo,
  enrollmentRepo,
  syncRunRepo,
  logger,
  categoryId: config.MOODLE_CATEGORY_ID,
  year: config.ACTIVE_YEAR,
};

const app = createServer(syncContext, syncRunRepo, logger);
app.listen(config.PORT, () => {
  logger.info({ port: config.PORT }, "servidor HTTP no ar");
});

const stopScheduler = startScheduler(syncContext, config.POLL_INTERVAL_SECONDS, logger);

// Dispara um ciclo imediatamente na subida, sem esperar o primeiro intervalo.
runSyncCycle(syncContext).catch((err) => logger.error({ err }, "falha no ciclo inicial de sincronizacao"));

process.on("SIGTERM", () => {
  logger.info("recebido SIGTERM, encerrando");
  stopScheduler();
  db.close();
  process.exit(0);
});
