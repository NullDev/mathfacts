import type { FastifyPluginAsync } from "fastify";
import { getDb } from "../db.js";
import Log from "../util/log.js";
import { config } from "../../config/config.js";

// ========================= //
// = Copyright (c) NullDev = //
// =     - SPDX: MIT -     = //
// ========================= //

interface Fact {
    id: number;
    content: string;
}

function fuzzyScore(content: string, query: string): number {
    const c = content.toLowerCase();
    const q = query.toLowerCase().trim();
    if (!q) return 0;

    let score = c.includes(q) ? 100 : 0;

    const words = q.split(/\s+/).filter(w => w.length > 2);
    if (words.length > 0) {
        const matched = words.filter(w => c.includes(w)).length;
        score += (matched / words.length) * 60;
    }

    return score;
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

    // GET /api/facts/search?text= — fuzzy text search
    app.get<{ Querystring: { text?: string } }>("/facts/search", async(req, reply) => {
        const text = req.query.text?.trim();
        if (!text) return reply.code(400).send({ error: "'text' query parameter is required" });

        const db = getDb();
        const facts = db.query<Fact, []>("SELECT id, content FROM facts ORDER BY id").all();

        const scored = facts
            .map(f => ({ ...f, score: fuzzyScore(f.content, text) }))
            .filter(f => f.score > 0)
            .sort((a, b) => b.score - a.score);

        if (scored.length === 0) return reply.code(404).send({ error: "No matching facts found" });

        const [best, ...rest] = scored;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { score: _b, ...bestMatch } = best;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const matches = rest.map(({ score: _s, ...f }) => f);

        return { bestMatch, matches };
    });

    // GET /api/facts/:id — get a single fact by ID
    app.get<{ Params: { id: string } }>("/facts/:id", async(req, reply) => {
        const id = parseInt(req.params.id, 10);
        if (!Number.isFinite(id) || id <= 0) return reply.code(400).send({ error: "Invalid ID" });

        const db = getDb();
        const fact = db
            .query<Fact, [number]>("SELECT id, content FROM facts WHERE id = ?")
            .get(id);

        if (!fact) return reply.code(404).send({ error: "Fact not found" });
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

        if (config.dc_webhook) {
            try {
                await fetch(config.dc_webhook, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        content: `---\nNew fact submission:\n\`\`\`${trimmed}\`\`\`\nFrom IP: ${ip}\n<https://nulldev.org/mathfacts/admin.html>\n---`,
                    }),
                });
            }
            catch (err) {
                Log.error("Failed to send Discord webhook:", err as Error);
            }
        }

        return reply.code(201).send({ message: "Fact submitted for review. Thank you!" });
    });
};
