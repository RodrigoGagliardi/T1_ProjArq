import type { MoodleCourseInput, MoodleUserInput } from "../adapters/moodleClient.js";
import type {
  Enrollment,
  IEducarEnrollmentDTO,
  IEducarRegistrationDTO,
  IEducarSchoolClassDTO,
  Registration,
  SchoolClass,
} from "./types.js";

/** Converte o DTO cru da API do iEducar no modelo normalizado usado pelo resto da aplicacao. */
export function normalizeSchoolClass(dto: IEducarSchoolClassDTO): SchoolClass {
  return {
    codTurma: dto.cod_turma,
    name: dto.nm_turma,
    year: dto.ano,
    schoolId: dto.ref_ref_cod_escola,
    courseId: dto.ref_cod_curso,
    gradeId: dto.ref_ref_cod_serie,
    active: Boolean(dto.ativo),
    enrollments: (dto.enrollments ?? []).map(normalizeEnrollment),
  };
}

function normalizeEnrollment(dto: IEducarEnrollmentDTO): Enrollment {
  return {
    codMatricula: dto.ref_cod_matricula,
    codTurma: dto.ref_cod_turma,
    active: Boolean(dto.ativo),
  };
}

export function normalizeRegistration(dto: IEducarRegistrationDTO): Registration {
  return {
    codMatricula: dto.id,
    studentId: dto.student_id,
    schoolId: dto.ref_ref_cod_escola,
    year: dto.ano,
    active: Boolean(dto.ativo),
  };
}

/**
 * Mapeia uma turma do iEducar para a estrutura esperada por `core_course_create_courses` /
 * `core_course_update_courses` do Moodle. `shortname` e `idnumber` sao deterministicos
 * (derivados do cod_turma) para que a sincronizacao seja idempotente mesmo sem consultar
 * a tabela local de mapeamento.
 */
export function schoolClassToCourseInput(schoolClass: SchoolClass, categoryId: number): MoodleCourseInput {
  return {
    fullname: `${schoolClass.name} - ${schoolClass.year}`,
    shortname: schoolClassShortname(schoolClass.codTurma),
    idnumber: schoolClassIdNumber(schoolClass.codTurma),
    categoryid: categoryId,
    summary: `Curso gerado automaticamente a partir da turma #${schoolClass.codTurma} do iEducar.`,
  };
}

export function schoolClassShortname(codTurma: number): string {
  return `ieducar-turma-${codTurma}`;
}

export function schoolClassIdNumber(codTurma: number): string {
  return `ieducar:turma:${codTurma}`;
}

export function studentIdNumber(studentId: number): string {
  return `ieducar:aluno:${studentId}`;
}

export interface PersonIdentity {
  id: number;
  name: string;
  email?: string | null;
}

/**
 * Mapeia a identidade de uma pessoa do iEducar (aluno ou professor) para o payload de
 * `core_user_create_users`. Email e opcional na origem; quando ausente, gera um email
 * sintetico para satisfazer a exigencia do Moodle (ver limitacoes no relatorio - em
 * producao isso deveria vir de um fluxo de SSO/LTI, nao de senha gerada).
 */
export function personToMoodleUser(person: PersonIdentity): MoodleUserInput {
  const [firstname, ...rest] = person.name.trim().split(/\s+/);
  const lastname = rest.join(" ") || firstname;
  return {
    username: `ieducar${person.id}`,
    password: generateInitialPassword(person.id),
    firstname,
    lastname,
    email: person.email && person.email.length > 0 ? person.email : `ieducar.${person.id}@example.invalid`,
    idnumber: studentIdNumber(person.id),
  };
}

function generateInitialPassword(seed: number): string {
  // Satisfaz a politica padrao do Moodle (minuscula, maiuscula, digito, especial, 8+ chars).
  return `Ieducar${seed}#Sync`;
}
