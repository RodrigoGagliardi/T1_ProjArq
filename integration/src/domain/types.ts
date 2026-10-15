/**
 * DTOs crus retornados pela API do iEducar. Nomes de campo confirmados contra a API
 * rodando ao vivo (GET /api/school-class?include=enrollments, GET /api/registration) -
 * a API devolve as colunas cruas do banco (cod_turma/nm_turma/ano), NAO os aliases
 * "legacy" (id/name/year) que a documentacao do model sugeria.
 */
export interface IEducarSchoolClassDTO {
  cod_turma: number;
  nm_turma: string;
  ano: number;
  ref_ref_cod_escola: number;
  ref_cod_curso: number;
  ref_ref_cod_serie: number;
  ativo: number; // 0 | 1
  visivel?: number;
  max_aluno?: number;
  data_cadastro?: string;
  enrollments?: IEducarEnrollmentDTO[]; // presente somente se ?include=enrollments funcionar
  [key: string]: unknown;
}

export interface IEducarRegistrationDTO {
  id: number; // cod_matricula (confirmado ao vivo: este alias e aplicado para registration)
  student_id: number; // ref_cod_aluno (idem)
  ref_ref_cod_escola: number;
  ref_ref_cod_serie: number;
  ano: number;
  ativo: number;
  aprovado?: number;
  created_at?: string;
  [key: string]: unknown;
}

export interface IEducarEnrollmentDTO {
  id?: number;
  ref_cod_matricula: number;
  ref_cod_turma: number;
  ativo: number;
  data_enturmacao?: string;
  [key: string]: unknown;
}

export interface LaravelPaginatedResponse<T> {
  data: T[];
  links: { first: string | null; last: string | null; prev: string | null; next: string | null };
  meta: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    [key: string]: unknown;
  };
}

/** Modelo normalizado, usado pela camada de dominio/sync (desacoplado do formato externo). */
export interface SchoolClass {
  codTurma: number;
  name: string;
  year: number;
  schoolId: number;
  courseId: number;
  gradeId: number;
  active: boolean;
  enrollments: Enrollment[];
}

export interface Enrollment {
  codMatricula: number;
  codTurma: number;
  active: boolean;
}

export interface Registration {
  codMatricula: number;
  studentId: number;
  schoolId: number;
  year: number;
  active: boolean;
}
