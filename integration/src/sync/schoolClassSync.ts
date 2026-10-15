import type { IEducarClient } from "../adapters/ieducarClient.js";
import type { MoodleClient } from "../adapters/moodleClient.js";
import { normalizeSchoolClass, schoolClassShortname, schoolClassToCourseInput } from "../domain/mapping.js";
import type { SchoolClass } from "../domain/types.js";
import type { Logger } from "../logger.js";
import type { SchoolClassRepo } from "../store/schoolClassRepo.js";
import type { SyncError } from "../store/syncRunRepo.js";

export interface SchoolClassSyncDeps {
  ieducar: IEducarClient;
  moodle: MoodleClient;
  repo: SchoolClassRepo;
  logger: Logger;
  categoryId: number;
  year: number;
}

export interface SchoolClassSyncResult {
  processed: number;
  created: number;
  errors: SyncError[];
  schoolClasses: SchoolClass[];
  courseIdByTurma: Map<number, number>;
}

/** Caso de integracao #1: turma do iEducar -> curso no Moodle (ver relatorio, secao Arquitetura). */
export async function syncSchoolClasses(deps: SchoolClassSyncDeps): Promise<SchoolClassSyncResult> {
  const { ieducar, moodle, repo, logger, categoryId, year } = deps;
  const dtoList = await ieducar.fetchActiveSchoolClasses(year);
  const schoolClasses = dtoList.map(normalizeSchoolClass);

  const errors: SyncError[] = [];
  const courseIdByTurma = new Map<number, number>();
  let created = 0;

  for (const schoolClass of schoolClasses) {
    try {
      const courseId = await syncOneSchoolClass(schoolClass, { moodle, repo, categoryId });
      courseIdByTurma.set(schoolClass.codTurma, courseId.id);
      if (courseId.created) created += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ codTurma: schoolClass.codTurma, err: message }, "falha ao sincronizar turma");
      errors.push({ context: `turma:${schoolClass.codTurma}`, message });
    }
  }

  return { processed: schoolClasses.length, created, errors, schoolClasses, courseIdByTurma };
}

async function syncOneSchoolClass(
  schoolClass: SchoolClass,
  deps: { moodle: MoodleClient; repo: SchoolClassRepo; categoryId: number },
): Promise<{ id: number; created: boolean }> {
  const { moodle, repo, categoryId } = deps;
  const existing = repo.findByCodTurma(schoolClass.codTurma);

  if (existing) {
    if (existing.name !== schoolClass.name || existing.year !== schoolClass.year) {
      await moodle.updateCourse(existing.moodle_course_id, {
        fullname: `${schoolClass.name} - ${schoolClass.year}`,
      });
    }
    repo.upsert({
      cod_turma: schoolClass.codTurma,
      moodle_course_id: existing.moodle_course_id,
      name: schoolClass.name,
      year: schoolClass.year,
    });
    return { id: existing.moodle_course_id, created: false };
  }

  // Rede de seguranca: mesmo sem registro local (ex. banco apagado), evita duplicar
  // curso se ele ja existir no Moodle com o shortname deterministico.
  const alreadyInMoodle = await moodle.findCourseByShortname(schoolClassShortname(schoolClass.codTurma));
  const course = alreadyInMoodle ?? (await moodle.createCourse(schoolClassToCourseInput(schoolClass, categoryId)));

  repo.upsert({
    cod_turma: schoolClass.codTurma,
    moodle_course_id: course.id,
    name: schoolClass.name,
    year: schoolClass.year,
  });
  return { id: course.id, created: alreadyInMoodle === null };
}
