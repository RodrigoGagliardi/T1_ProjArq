import type { IEducarClient } from "../adapters/ieducarClient.js";
import type { MoodleClient } from "../adapters/moodleClient.js";
import type { Logger } from "../logger.js";
import type { EnrollmentRepo } from "../store/enrollmentRepo.js";
import type { SchoolClassRepo } from "../store/schoolClassRepo.js";
import type { SyncRunRepo } from "../store/syncRunRepo.js";
import { syncEnrollments } from "./enrollmentSync.js";
import { syncSchoolClasses } from "./schoolClassSync.js";

export interface SyncContext {
  ieducar: IEducarClient;
  moodle: MoodleClient;
  schoolClassRepo: SchoolClassRepo;
  enrollmentRepo: EnrollmentRepo;
  syncRunRepo: SyncRunRepo;
  logger: Logger;
  categoryId: number;
  year: number;
}

let runningLock = false;

/**
 * Executa um ciclo completo de sincronizacao (turmas, depois enturmacoes).
 * Protegido por um lock simples para nao sobrepor execucoes concorrentes
 * (ciclo agendado vs disparo manual via POST /sync/run).
 */
export async function runSyncCycle(ctx: SyncContext) {
  if (runningLock) {
    ctx.logger.warn("ciclo de sincronizacao ja em andamento, ignorando novo disparo");
    return { skipped: true as const };
  }
  runningLock = true;
  const runId = ctx.syncRunRepo.start();
  ctx.logger.info({ runId }, "iniciando ciclo de sincronizacao");

  try {
    const schoolClassResult = await syncSchoolClasses({
      ieducar: ctx.ieducar,
      moodle: ctx.moodle,
      repo: ctx.schoolClassRepo,
      logger: ctx.logger,
      categoryId: ctx.categoryId,
      year: ctx.year,
    });

    const enrollmentResult = await syncEnrollments({
      ieducar: ctx.ieducar,
      moodle: ctx.moodle,
      repo: ctx.enrollmentRepo,
      logger: ctx.logger,
      year: ctx.year,
      schoolClasses: schoolClassResult.schoolClasses,
      courseIdByTurma: schoolClassResult.courseIdByTurma,
    });

    const result = {
      schoolClassesProcessed: schoolClassResult.processed,
      schoolClassesCreated: schoolClassResult.created,
      enrollmentsProcessed: enrollmentResult.processed,
      enrollmentsCreated: enrollmentResult.created,
      errors: [...schoolClassResult.errors, ...enrollmentResult.errors],
    };
    ctx.syncRunRepo.finish(runId, result);
    ctx.logger.info({ runId, ...result, errors: result.errors.length }, "ciclo de sincronizacao concluido");
    return { skipped: false as const, runId, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.syncRunRepo.fail(runId, message);
    ctx.logger.error({ runId, err: message }, "ciclo de sincronizacao abortado");
    throw err;
  } finally {
    runningLock = false;
  }
}
