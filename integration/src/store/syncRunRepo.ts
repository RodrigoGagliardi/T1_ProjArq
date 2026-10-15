import type Database from "better-sqlite3";

export interface SyncError {
  context: string;
  message: string;
}

export interface SyncRunRow {
  id: number;
  started_at: string;
  finished_at: string | null;
  status: "running" | "success" | "partial" | "error";
  school_classes_processed: number;
  school_classes_created: number;
  enrollments_processed: number;
  enrollments_created: number;
  errors: string; // JSON
}

export interface SyncRunResult {
  schoolClassesProcessed: number;
  schoolClassesCreated: number;
  enrollmentsProcessed: number;
  enrollmentsCreated: number;
  errors: SyncError[];
}

export class SyncRunRepo {
  constructor(private readonly db: Database.Database) {}

  start(): number {
    const result = this.db
      .prepare("INSERT INTO sync_runs (started_at, status) VALUES (?, 'running')")
      .run(new Date().toISOString());
    return Number(result.lastInsertRowid);
  }

  finish(id: number, result: SyncRunResult): void {
    const status = result.errors.length === 0 ? "success" : "partial";
    this.db
      .prepare(
        `UPDATE sync_runs SET
           finished_at = @finished_at,
           status = @status,
           school_classes_processed = @school_classes_processed,
           school_classes_created = @school_classes_created,
           enrollments_processed = @enrollments_processed,
           enrollments_created = @enrollments_created,
           errors = @errors
         WHERE id = @id`,
      )
      .run({
        id,
        finished_at: new Date().toISOString(),
        status,
        school_classes_processed: result.schoolClassesProcessed,
        school_classes_created: result.schoolClassesCreated,
        enrollments_processed: result.enrollmentsProcessed,
        enrollments_created: result.enrollmentsCreated,
        errors: JSON.stringify(result.errors),
      });
  }

  fail(id: number, message: string): void {
    this.db
      .prepare("UPDATE sync_runs SET finished_at = ?, status = 'error', errors = ? WHERE id = ?")
      .run(new Date().toISOString(), JSON.stringify([{ context: "run", message }]), id);
  }

  latest(): SyncRunRow | undefined {
    return this.db
      .prepare<[], SyncRunRow>("SELECT * FROM sync_runs ORDER BY id DESC LIMIT 1")
      .get();
  }

  history(limit = 20): SyncRunRow[] {
    return this.db
      .prepare<[number], SyncRunRow>("SELECT * FROM sync_runs ORDER BY id DESC LIMIT ?")
      .all(limit);
  }
}
