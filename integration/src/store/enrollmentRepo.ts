import type Database from "better-sqlite3";

export interface EnrollmentSyncRow {
  cod_matricula: number;
  cod_turma: number;
  moodle_user_id: number;
  moodle_course_id: number;
  role: "student" | "teacher";
  synced_at: string;
}

export class EnrollmentRepo {
  constructor(private readonly db: Database.Database) {}

  find(codMatricula: number, codTurma: number): EnrollmentSyncRow | undefined {
    return this.db
      .prepare<[number, number], EnrollmentSyncRow>(
        "SELECT * FROM enrollment_sync WHERE cod_matricula = ? AND cod_turma = ?",
      )
      .get(codMatricula, codTurma);
  }

  upsert(row: Omit<EnrollmentSyncRow, "synced_at">): void {
    this.db
      .prepare(
        `INSERT INTO enrollment_sync (cod_matricula, cod_turma, moodle_user_id, moodle_course_id, role, synced_at)
         VALUES (@cod_matricula, @cod_turma, @moodle_user_id, @moodle_course_id, @role, @synced_at)
         ON CONFLICT(cod_matricula, cod_turma) DO UPDATE SET
           moodle_user_id = excluded.moodle_user_id,
           moodle_course_id = excluded.moodle_course_id,
           role = excluded.role,
           synced_at = excluded.synced_at`,
      )
      .run({ ...row, synced_at: new Date().toISOString() });
  }

  all(): EnrollmentSyncRow[] {
    return this.db.prepare<[], EnrollmentSyncRow>("SELECT * FROM enrollment_sync").all();
  }
}
