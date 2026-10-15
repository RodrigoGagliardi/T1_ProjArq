import type { IEducarClient } from "../adapters/ieducarClient.js";
import { MOODLE_ROLE, type MoodleClient } from "../adapters/moodleClient.js";
import { normalizeRegistration, personToMoodleUser, studentIdNumber } from "../domain/mapping.js";
import type { SchoolClass } from "../domain/types.js";
import type { Logger } from "../logger.js";
import type { EnrollmentRepo } from "../store/enrollmentRepo.js";
import type { SyncError } from "../store/syncRunRepo.js";

export interface EnrollmentSyncDeps {
  ieducar: IEducarClient;
  moodle: MoodleClient;
  repo: EnrollmentRepo;
  logger: Logger;
  year: number;
  schoolClasses: SchoolClass[];
  courseIdByTurma: Map<number, number>;
}

export interface EnrollmentSyncResult {
  processed: number;
  created: number;
  errors: SyncError[];
}

/**
 * Caso de integracao #2: enturmacao (aluno <-> turma) do iEducar -> inscricao
 * (enrolment) no curso correspondente do Moodle.
 *
 * LIMITACAO CONHECIDA (ver relatorio): a API do iEducar nao expoe nome/email do
 * aluno nos endpoints usados aqui (/api/school-class com include=enrollments e
 * /api/registration so tem `student_id`). Enquanto isso nao for validado/resolvido
 * via um novo `include`, o usuario Moodle e criado com um nome provisorio derivado
 * do id - o professor pode reconciliar isso manualmente ou evoluir o mapeamento
 * numa iteracao futura sem mudar a arquitetura.
 */
export async function syncEnrollments(deps: EnrollmentSyncDeps): Promise<EnrollmentSyncResult> {
  const { ieducar, moodle, repo, logger, year, schoolClasses, courseIdByTurma } = deps;

  const registrationDtos = await ieducar.fetchActiveRegistrations(year);
  const registrationById = new Map(registrationDtos.map(normalizeRegistration).map((r) => [r.codMatricula, r]));

  const errors: SyncError[] = [];
  let processed = 0;
  let created = 0;

  for (const schoolClass of schoolClasses) {
    const courseId = courseIdByTurma.get(schoolClass.codTurma);
    if (!courseId) continue; // curso falhou ao sincronizar neste ciclo; tenta no proximo

    for (const enrollment of schoolClass.enrollments) {
      if (!enrollment.active) continue;
      processed += 1;

      try {
        const registration = registrationById.get(enrollment.codMatricula);
        if (!registration) {
          throw new Error(`matricula ${enrollment.codMatricula} nao encontrada em /api/registration`);
        }
        if (!registration.active) {
          // /api/registration nao pode ser filtrado por `active` no servidor (ver
          // ieducarClient.ts), entao matriculas inativas aparecem na resposta - uma
          // enturmacao ativa apontando para uma matricula inativa e inconsistente,
          // registramos como erro em vez de inscrever no Moodle.
          throw new Error(`matricula ${enrollment.codMatricula} esta inativa (ativo=0)`);
        }

        const wasCreated = await syncOneEnrollment(
          { codMatricula: enrollment.codMatricula, codTurma: schoolClass.codTurma, studentId: registration.studentId, courseId },
          { moodle, repo },
        );
        if (wasCreated) created += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(
          { codMatricula: enrollment.codMatricula, codTurma: schoolClass.codTurma, err: message },
          "falha ao sincronizar enturmacao",
        );
        errors.push({ context: `enturmacao:${enrollment.codMatricula}:${schoolClass.codTurma}`, message });
      }
    }
  }

  return { processed, created, errors };
}

async function syncOneEnrollment(
  input: { codMatricula: number; codTurma: number; studentId: number; courseId: number },
  deps: { moodle: MoodleClient; repo: EnrollmentRepo },
): Promise<boolean> {
  const { moodle, repo } = deps;
  const { codMatricula, codTurma, studentId, courseId } = input;

  const existing = repo.find(codMatricula, codTurma);
  if (existing) return false; // ja sincronizado - idempotente

  const idnumber = studentIdNumber(studentId);
  let moodleUser = await moodle.findUserByIdNumber(idnumber);
  if (!moodleUser) {
    // TODO(validar com include=student): usar nome/email reais assim que disponiveis na API.
    moodleUser = await moodle.createUser(personToMoodleUser({ id: studentId, name: `Aluno ${studentId}` }));
  }

  await moodle.enrolUser(courseId, moodleUser.id, MOODLE_ROLE.STUDENT);
  repo.upsert({
    cod_matricula: codMatricula,
    cod_turma: codTurma,
    moodle_user_id: moodleUser.id,
    moodle_course_id: courseId,
    role: "student",
  });
  return true;
}
