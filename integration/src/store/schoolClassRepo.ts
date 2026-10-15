import type Database from "better-sqlite3";

export interface SchoolClassSyncRow {
  cod_turma: number;
  moodle_course_id: number;
  name: string;
  year: number;
  synced_at: string;
}

export class SchoolClassRepo {
  constructor(private readonly db: Database.Database) {}

  findByCodTurma(codTurma: number): SchoolClassSyncRow | undefined {
    return this.db
      .prepare<[number], SchoolClassSyncRow>("SELECT * FROM school_class_sync WHERE cod_turma = ?")
      .get(codTurma);
  }

  upsert(row: Omit<SchoolClassSyncRow, "synced_at">): void {
    this.db
      .prepare(
        `INSERT INTO school_class_sync (cod_turma, moodle_course_id, name, year, synced_at)
         VALUES (@cod_turma, @moodle_course_id, @name, @year, @synced_at)
         ON CONFLICT(cod_turma) DO UPDATE SET
           moodle_course_id = excluded.moodle_course_id,
           name = excluded.name,
           year = excluded.year,
           synced_at = excluded.synced_at`,
      )
      .run({ ...row, synced_at: new Date().toISOString() });
  }

  all(): SchoolClassSyncRow[] {
    return this.db.prepare<[], SchoolClassSyncRow>("SELECT * FROM school_class_sync").all();
  }
}
