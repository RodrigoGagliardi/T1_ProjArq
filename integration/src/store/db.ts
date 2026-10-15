import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS school_class_sync (
  cod_turma INTEGER PRIMARY KEY,
  moodle_course_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  year INTEGER NOT NULL,
  synced_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS enrollment_sync (
  cod_matricula INTEGER NOT NULL,
  cod_turma INTEGER NOT NULL,
  moodle_user_id INTEGER NOT NULL,
  moodle_course_id INTEGER NOT NULL,
  role TEXT NOT NULL,
  synced_at TEXT NOT NULL,
  PRIMARY KEY (cod_matricula, cod_turma)
);

CREATE TABLE IF NOT EXISTS sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  school_classes_processed INTEGER NOT NULL DEFAULT 0,
  school_classes_created INTEGER NOT NULL DEFAULT 0,
  enrollments_processed INTEGER NOT NULL DEFAULT 0,
  enrollments_created INTEGER NOT NULL DEFAULT 0,
  errors TEXT NOT NULL DEFAULT '[]'
);
`;

export function openDatabase(path: string): Database.Database {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA);
  return db;
}
