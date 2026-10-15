import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IEducarClient } from "../src/adapters/ieducarClient.js";
import type { MoodleClient } from "../src/adapters/moodleClient.js";
import { normalizeSchoolClass } from "../src/domain/mapping.js";
import { createLogger } from "../src/logger.js";
import { openDatabase } from "../src/store/db.js";
import { EnrollmentRepo } from "../src/store/enrollmentRepo.js";
import { syncEnrollments } from "../src/sync/enrollmentSync.js";

const logger = createLogger("silent");

const schoolClass = normalizeSchoolClass({
  cod_turma: 42,
  nm_turma: "6o Ano A",
  ano: 2026,
  ref_ref_cod_escola: 1,
  ref_cod_curso: 7,
  ref_ref_cod_serie: 3,
  ativo: 1,
  enrollments: [{ ref_cod_matricula: 100, ref_cod_turma: 42, ativo: 1 }],
});

describe("syncEnrollments", () => {
  let repo: EnrollmentRepo;
  let moodle: MoodleClient;
  let ieducar: IEducarClient;

  beforeEach(() => {
    repo = new EnrollmentRepo(openDatabase(":memory:"));
    moodle = {
      findUserByIdNumber: vi.fn().mockResolvedValue(null),
      createUser: vi.fn().mockResolvedValue({ id: 555 }),
      enrolUser: vi.fn().mockResolvedValue(undefined),
    } as unknown as MoodleClient;
    ieducar = {
      fetchActiveRegistrations: vi.fn().mockResolvedValue([
        { id: 100, student_id: 7, ref_ref_cod_escola: 1, ref_ref_cod_serie: 3, ano: 2026, ativo: 1 },
      ]),
    } as unknown as IEducarClient;
  });

  it("cria usuario e inscreve o aluno no curso correspondente", async () => {
    const result = await syncEnrollments({
      ieducar,
      moodle,
      repo,
      logger,
      year: 2026,
      schoolClasses: [schoolClass],
      courseIdByTurma: new Map([[42, 999]]),
    });

    expect(result.processed).toBe(1);
    expect(result.created).toBe(1);
    expect(result.errors).toEqual([]);
    expect(moodle.createUser).toHaveBeenCalledTimes(1);
    expect(moodle.enrolUser).toHaveBeenCalledWith(999, 555, 5); // 5 = MOODLE_ROLE.STUDENT
  });

  it("e idempotente: nao inscreve de novo numa segunda execucao", async () => {
    await syncEnrollments({
      ieducar,
      moodle,
      repo,
      logger,
      year: 2026,
      schoolClasses: [schoolClass],
      courseIdByTurma: new Map([[42, 999]]),
    });

    const second = await syncEnrollments({
      ieducar,
      moodle,
      repo,
      logger,
      year: 2026,
      schoolClasses: [schoolClass],
      courseIdByTurma: new Map([[42, 999]]),
    });

    expect(second.created).toBe(0);
    expect(moodle.enrolUser).toHaveBeenCalledTimes(1); // nao chamou de novo
  });

  it("reaproveita usuario existente no Moodle em vez de duplicar", async () => {
    (moodle.findUserByIdNumber as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 777 });

    const result = await syncEnrollments({
      ieducar,
      moodle,
      repo,
      logger,
      year: 2026,
      schoolClasses: [schoolClass],
      courseIdByTurma: new Map([[42, 999]]),
    });

    expect(moodle.createUser).not.toHaveBeenCalled();
    expect(moodle.enrolUser).toHaveBeenCalledWith(999, 777, 5);
    expect(result.created).toBe(1);
  });

  it("registra erro e continua quando a matricula nao e encontrada", async () => {
    (ieducar.fetchActiveRegistrations as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const result = await syncEnrollments({
      ieducar,
      moodle,
      repo,
      logger,
      year: 2026,
      schoolClasses: [schoolClass],
      courseIdByTurma: new Map([[42, 999]]),
    });

    expect(result.processed).toBe(1);
    expect(result.created).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(moodle.enrolUser).not.toHaveBeenCalled();
  });

  it("pula turmas cujo curso ainda nao foi criado no Moodle neste ciclo", async () => {
    const result = await syncEnrollments({
      ieducar,
      moodle,
      repo,
      logger,
      year: 2026,
      schoolClasses: [schoolClass],
      courseIdByTurma: new Map(), // turma 42 sem courseId
    });

    expect(result.processed).toBe(0);
    expect(moodle.enrolUser).not.toHaveBeenCalled();
  });
});
