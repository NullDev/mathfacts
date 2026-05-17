import { Database } from "bun:sqlite";
import seedFacts from "../seed/seed";
import Log from "./util/log";

// ========================= //
// = Copyright (c) NullDev = //
// =     - SPDX: MIT -     = //
// ========================= //

let db: Database;

export function getDb(): Database {
    return db;
}

function ensureColumn(table: string, column: string, def: string): void {
    const cols = db.query<{ name: string }, []>(`PRAGMA table_info(${table})`).all();
    if (!cols.some((c: { name: string }) => c.name === column)) {
        db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
    }
}

export function initDb(): void {
    db = new Database("data/mathfacts.db", { create: true });

    db.run("PRAGMA journal_mode = WAL;");

    db.run(`
        CREATE TABLE IF NOT EXISTS facts (
            id   INTEGER PRIMARY KEY AUTOINCREMENT,
            content TEXT NOT NULL UNIQUE,
            proof   TEXT
        );

        CREATE TABLE IF NOT EXISTS submissions (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            content      TEXT NOT NULL,
            proof        TEXT,
            status       TEXT NOT NULL DEFAULT 'pending',
            submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            reviewed_at  DATETIME
        );

        CREATE TABLE IF NOT EXISTS revisions (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            fact_id      INTEGER NOT NULL,
            content      TEXT NOT NULL,
            proof        TEXT,
            status       TEXT NOT NULL DEFAULT 'pending',
            submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            reviewed_at  DATETIME,
            FOREIGN KEY (fact_id) REFERENCES facts(id)
        );
    `);

    ensureColumn("facts", "proof", "TEXT");
    ensureColumn("submissions", "proof", "TEXT");
    ensureColumn("revisions", "proof", "TEXT");

    // Seed initial facts if the table is empty
    const row = db.query<{ count: number }, []>(
        "SELECT COUNT(*) AS count FROM facts",
    ).get();

    let cnt = 0;
    if (row && row.count === 0) {
        const insert = db.prepare("INSERT OR IGNORE INTO facts (content) VALUES (?)");
        const seed = db.transaction((facts: string[]) => {
            for (const fact of facts){
                insert.run(fact);
                cnt++;
            }
        });
        seed(seedFacts as string[]);
    }

    Log.done("Database initialized.");
    Log.info("Seeded " + cnt + " facts.");
}
