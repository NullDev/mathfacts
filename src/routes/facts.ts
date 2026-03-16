import type { FastifyPluginAsync } from "fastify";
import { getDb } from "../db.js";
import Log from "../util/log.js";

// ========================= //
// = Copyright (c) NullDev = //
// =     - SPDX: MIT -     = //
// ========================= //

interface Fact {
    id: number;
    content: string;
}

export const factsRoutes: FastifyPluginAsync = async(app) => {
    // GET /api/facts — return all facts
    app.get("/facts", async() => {
        const db = getDb();
        return db.query<Fact, []>("SELECT id, content FROM facts ORDER BY id").all();
    });

    // GET /api/facts/random?exclude=1,2,3
    app.get<{ Querystring: { exclude?: string } }>("/facts/random", async(req, reply) => {
        const db = getDb();
        const rawExclude = req.query.exclude ?? "";

        const excludeIds: number[] = rawExclude
            .split(",")
            .map((s) => parseInt(s.trim(), 10))
            .filter((n) => Number.isFinite(n) && n > 0);

        let fact: Fact | null;

        if (excludeIds.length > 0) {
            const placeholders = excludeIds.map(() => "?").join(", ");
            fact = db
                .query<Fact, number[]>(
                    `SELECT id, content FROM facts WHERE id NOT IN (${placeholders}) ORDER BY RANDOM() LIMIT 1`,
                )
                .get(...excludeIds);
        }
        else {
            fact = db
                .query<Fact, []>(
                    "SELECT id, content FROM facts ORDER BY RANDOM() LIMIT 1",
                )
                .get();
        }

        if (!fact) {
            return reply.code(404).send({ error: "No facts available" });
        }

        return fact;
    });

    // POST /api/facts/submit — submit a fact for review
    app.post<{ Body: { fact?: string } }>("/facts/submit", async(req, reply) => {
        const fact = req.body?.fact;

        if (!fact || typeof fact !== "string" || fact.trim().length === 0) {
            return reply.code(400).send({ error: "'fact' field is required" });
        }

        const trimmed = fact.trim();

        if (trimmed.length > 500) {
            return reply.code(400).send({ error: "Fact must be 500 characters or fewer" });
        }

        const db = getDb();
        db.query("INSERT INTO submissions (content) VALUES (?)").run(trimmed);

        const ip = req.ip || req.headers["x-forwarded-for"] || "unknown";
        Log.info(`New submission from IP ${ip}: ${trimmed}`);

        return reply.code(201).send({ message: "Fact submitted for review. Thank you!" });
    });
};
