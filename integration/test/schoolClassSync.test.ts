import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IEducarClient } from "../src/adapters/ieducarClient.js";
import type { MoodleClient } from "../src/adapters/moodleClient.js";
import { createLogger } from "../src/logger.js";
import { openDatabase } from "../src/store/db.js";
import { SchoolClassRepo } from "../src/store/schoolClassRepo.js";
import { syncSchoolClasses } from "../src/sync/schoolClassSync.js";
import type { IEducarSchoolClassDTO } from "../src/domain/types.js";

const logger = createLogger("silent");

function makeSchoolClassDto(overrides: Partial<IEducarSchoolClassDTO> = {}): IEducarSchoolClassDTO {
  return {
    cod_turma: 42,
    nm_turma: "6o Ano A",
    ano: 2026,
    ref_ref_cod_escola: 1,
    ref_cod_curso: 7,
    ref_ref_cod_serie: 3,
    ativo: 1,
    ...overrides,
  };
}

describe("syncSchoolClasses", () => {
  let repo: SchoolClassRepo;
  let moodle: MoodleClient;
  let ieducar: IEducarClient;

  beforeEach(() => {
    repo = new SchoolClassRepo(openDatabase(":memory:"));
    moodle = {
      findCourseByShortname: vi.fn().mockResolvedValue(null),
      createCourse: vi.fn().mockResolvedValue({ id: 999, shortname: "ieducar-turma-42" }),
      updateCourse: vi.fn().mockResolvedValue(undefined),
    } as unknown as MoodleClient;
    ieducar = {
      fetchActiveSchoolClasses: vi.fn().mockResolvedValue([makeSchoolClassDto()]),
    } as unknown as IEducarClient;
  });

  it("cria o curso no Moodle na primeira sincronizacao", async () => {
    const result = await syncSchoolClasses({ ieducar, moodle, repo, logger, categoryId: 1, year: 2026 });

    expect(result.processed).toBe(1);
    expect(result.created).toBe(1);
    expect(result.errors).toEqual([]);
    expect(moodle.createCourse).toHaveBeenCalledTimes(1);
    expect(result.courseIdByTurma.get(42)).toBe(999);
  });

  it("e idempotente: nao recria o curso numa segunda execucao", async () => {
    await syncSchoolClasses({ ieducar, moodle, repo, logger, categoryId: 1, year: 2026 });
    const second = await syncSchoolClasses({ ieducar, moodle, repo, logger, categoryId: 1, year: 2026 });

    expect(second.created).toBe(0);
    expect(moodle.createCourse).toHaveBeenCalledTimes(1); // nao chamou de novo
  });

  it("atualiza o curso quando o nome da turma muda, sem duplicar", async () => {
    await syncSchoolClasses({ ieducar, moodle, repo, logger, categoryId: 1, year: 2026 });
    (ieducar.fetchActiveSchoolClasses as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeSchoolClassDto({ nm_turma: "6o Ano A (renomeada)" }),
    ]);

    const second = await syncSchoolClasses({ ieducar, moodle, repo, logger, categoryId: 1, year: 2026 });

    expect(second.created).toBe(0);
    expect(moodle.updateCourse).toHaveBeenCalledWith(999, { fullname: "6o Ano A (renomeada) - 2026" });
  });

  it("continua processando as demais turmas quando uma falha", async () => {
    (ieducar.fetchActiveSchoolClasses as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeSchoolClassDto({ cod_turma: 1 }),
      makeSchoolClassDto({ cod_turma: 2 }),
    ]);
    (moodle.createCourse as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error("moodle indisponivel"))
      .mockResolvedValueOnce({ id: 999, shortname: "ieducar-turma-2" });

    const result = await syncSchoolClasses({ ieducar, moodle, repo, logger, categoryId: 1, year: 2026 });

    expect(result.processed).toBe(2);
    expect(result.created).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].context).toBe("turma:1");
    expect(result.courseIdByTurma.get(2)).toBe(999);
  });
});
