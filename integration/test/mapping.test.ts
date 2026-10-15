import { describe, expect, it } from "vitest";
import {
  normalizeSchoolClass,
  personToMoodleUser,
  schoolClassIdNumber,
  schoolClassShortname,
  schoolClassToCourseInput,
  studentIdNumber,
} from "../src/domain/mapping.js";
import type { IEducarSchoolClassDTO } from "../src/domain/types.js";

describe("normalizeSchoolClass", () => {
  it("mapeia os campos crus do iEducar para o modelo normalizado", () => {
    const dto: IEducarSchoolClassDTO = {
      cod_turma: 42,
      nm_turma: "6o Ano A",
      ano: 2026,
      ref_ref_cod_escola: 1,
      ref_cod_curso: 7,
      ref_ref_cod_serie: 3,
      ativo: 1,
      enrollments: [{ ref_cod_matricula: 100, ref_cod_turma: 42, ativo: 1 }],
    };

    const result = normalizeSchoolClass(dto);

    expect(result).toEqual({
      codTurma: 42,
      name: "6o Ano A",
      year: 2026,
      schoolId: 1,
      courseId: 7,
      gradeId: 3,
      active: true,
      enrollments: [{ codMatricula: 100, codTurma: 42, active: true }],
    });
  });

  it("trata ausencia de enrollments (API nao expos include) como lista vazia", () => {
    const dto: IEducarSchoolClassDTO = {
      cod_turma: 1,
      nm_turma: "Turma sem include",
      ano: 2026,
      ref_ref_cod_escola: 1,
      ref_cod_curso: 1,
      ref_ref_cod_serie: 1,
      ativo: 1,
    };

    expect(normalizeSchoolClass(dto).enrollments).toEqual([]);
  });
});

describe("schoolClassToCourseInput", () => {
  it("gera shortname/idnumber deterministicos a partir do cod_turma", () => {
    const schoolClass = normalizeSchoolClass({
      cod_turma: 42,
      nm_turma: "6o Ano A",
      ano: 2026,
      ref_ref_cod_escola: 1,
      ref_cod_curso: 7,
      ref_ref_cod_serie: 3,
      ativo: 1,
    });

    const input = schoolClassToCourseInput(schoolClass, 5);

    expect(input.shortname).toBe(schoolClassShortname(42));
    expect(input.idnumber).toBe(schoolClassIdNumber(42));
    expect(input.fullname).toBe("6o Ano A - 2026");
    expect(input.categoryid).toBe(5);
  });
});

describe("personToMoodleUser", () => {
  it("usa o email real quando disponivel", () => {
    const user = personToMoodleUser({ id: 10, name: "Maria Silva", email: "maria@example.com" });
    expect(user.email).toBe("maria@example.com");
    expect(user.firstname).toBe("Maria");
    expect(user.lastname).toBe("Silva");
    expect(user.idnumber).toBe(studentIdNumber(10));
  });

  it("gera email sintetico quando ausente na origem", () => {
    const user = personToMoodleUser({ id: 10, name: "Joao" });
    expect(user.email).toContain("10");
    expect(user.lastname).toBe("Joao"); // sem sobrenome, repete o primeiro nome
  });
});
