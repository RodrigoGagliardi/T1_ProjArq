import { describe, expect, it } from "vitest";
import { flattenMoodleParams } from "../src/adapters/moodleParams.js";

describe("flattenMoodleParams", () => {
  it("achata arrays de objetos na notacao esperada pelo Moodle", () => {
    const result = flattenMoodleParams({
      courses: [{ fullname: "Turma A", categoryid: 1 }],
    });

    expect(result).toEqual({
      "courses[0][fullname]": "Turma A",
      "courses[0][categoryid]": "1",
    });
  });

  it("achata arrays aninhados (criteria de busca de usuario)", () => {
    const result = flattenMoodleParams({
      criteria: [{ key: "idnumber", value: "ieducar:aluno:7" }],
    });

    expect(result).toEqual({
      "criteria[0][key]": "idnumber",
      "criteria[0][value]": "ieducar:aluno:7",
    });
  });

  it("ignora valores nulos/indefinidos", () => {
    const result = flattenMoodleParams({ courseid: 1, summary: undefined, foo: null });
    expect(result).toEqual({ courseid: "1" });
  });
});
