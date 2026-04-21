import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { config } from "../../config/config";
import { getDb } from "../db.js";

// ========================= //
// = Copyright (c) NullDev = //
// =     - SPDX: MIT -     = //
// ========================= //

/* eslint-disable consistent-return */

interface Submission {
    id: number;
    content: string;
    status: string;
    submitted_at: string;
    reviewed_at: string | null;
}

interface Revision {
    id: number;
    fact_id: number;
    content: string;
    status: string;
    submitted_at: string;
    reviewed_at: string | null;
}

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

function requireAuth(req: FastifyRequest, reply: FastifyReply): boolean {
    const auth = req.headers.authorization;
    if (!auth || !config.admin_pass || auth !== `Bearer ${config.admin_pass}`) {
        reply.code(401).send({ error: "Unauthorized" });
        return false;
    }
    return true;
}

export const adminRoutes: FastifyPluginAsync = async(app) => {
    // GET /api/admin/submissions
    app.get("/submissions", async(req, reply) => {
        if (!requireAuth(req, reply)) return;
        const db = getDb();
        return db.query<Submission, []>(
            "SELECT id, content, status, submitted_at, reviewed_at FROM submissions ORDER BY submitted_at DESC",
        ).all();
    });

    // POST /api/admin/submissions/:id/approve
    app.post<{ Params: { id: string } }>("/submissions/:id/approve", async(req, reply) => {
        if (!requireAuth(req, reply)) return;
        const db = getDb();
        const id = parseInt(req.params.id, 10);

        const sub = db
            .query<Pick<Submission, "id" | "content" | "status">, [number]>(
                "SELECT id, content, status FROM submissions WHERE id = ?",
            )
            .get(id);

        if (!sub) return reply.code(404).send({ error: "Submission not found" });
        if (sub.status !== "pending") {return reply.code(400).send({ error: "Submission already reviewed" });}

        db.query("INSERT OR IGNORE INTO facts (content) VALUES (?)").run(sub.content);
        db.query(
            "UPDATE submissions SET status = 'approved', reviewed_at = CURRENT_TIMESTAMP WHERE id = ?",
        ).run(id);

        return { message: "Fact approved and added to the list" };
    });

    // POST /api/admin/submissions/:id/approve-revision
    app.post<{ Params: { id: string }; Body: { content?: unknown } }>("/submissions/:id/approve-revision", async(req, reply) => {
        if (!requireAuth(req, reply)) return;
        const db = getDb();
        const id = parseInt(req.params.id, 10);
        const content = req.body?.content;

        if (!content || typeof content !== "string" || !content.trim()) {
            return reply.code(400).send({ error: "'content' field is required" });
        }
        if (content.trim().length > 500) {
            return reply.code(400).send({ error: "Content must be 500 characters or fewer" });
        }

        const sub = db
            .query<Pick<Submission, "id" | "status">, [number]>(
                "SELECT id, status FROM submissions WHERE id = ?",
            )
            .get(id);

        if (!sub) return reply.code(404).send({ error: "Submission not found" });
        if (sub.status !== "pending") return reply.code(400).send({ error: "Submission already reviewed" });

        db.query("INSERT OR IGNORE INTO facts (content) VALUES (?)").run(content.trim());
        db.query(
            "UPDATE submissions SET status = 'approved', reviewed_at = CURRENT_TIMESTAMP WHERE id = ?",
        ).run(id);

        return { message: "Fact approved with revision and added to the list" };
    });

    // POST /api/admin/submissions/:id/reject
    app.post<{ Params: { id: string } }>("/submissions/:id/reject", async(req, reply) => {
        if (!requireAuth(req, reply)) return;
        const db = getDb();
        const id = parseInt(req.params.id, 10);

        const sub = db
            .query<Pick<Submission, "id" | "status">, [number]>(
                "SELECT id, status FROM submissions WHERE id = ?",
            )
            .get(id);

        if (!sub) return reply.code(404).send({ error: "Submission not found" });
        if (sub.status !== "pending") {return reply.code(400).send({ error: "Submission already reviewed" });}

        db.query(
            "UPDATE submissions SET status = 'rejected', reviewed_at = CURRENT_TIMESTAMP WHERE id = ?",
        ).run(id);

        return { message: "Submission rejected" };
    });

    // GET /api/admin/facts — list all facts
    app.get("/facts", async(req, reply) => {
        if (!requireAuth(req, reply)) return;
        const db = getDb();
        return db.query<Fact, []>("SELECT id, content FROM facts ORDER BY id").all();
    });

    // PUT /api/admin/facts/:id — edit a fact
    app.put<{ Params: { id: string }; Body: { content?: unknown } }>("/facts/:id", async(req, reply) => {
        if (!requireAuth(req, reply)) return;
        const db = getDb();
        const id = parseInt(req.params.id, 10);
        const content = req.body?.content;

        if (!Number.isFinite(id) || id <= 0) return reply.code(400).send({ error: "Invalid ID" });
        if (!content || typeof content !== "string" || !content.trim()) {
            return reply.code(400).send({ error: "'content' field is required" });
        }
        if (content.trim().length > 500) {
            return reply.code(400).send({ error: "Content must be 500 characters or fewer" });
        }

        const fact = db.query<Fact, [number]>("SELECT id FROM facts WHERE id = ?").get(id);
        if (!fact) return reply.code(404).send({ error: "Fact not found" });

        db.query("UPDATE facts SET content = ? WHERE id = ?").run(content.trim(), id);
        return { message: "Fact updated successfully" };
    });

    // DELETE /api/admin/facts/:id — delete a fact
    app.delete<{ Params: { id: string } }>("/facts/:id", async(req, reply) => {
        if (!requireAuth(req, reply)) return;
        const db = getDb();
        const id = parseInt(req.params.id, 10);

        if (!Number.isFinite(id) || id <= 0) return reply.code(400).send({ error: "Invalid ID" });

        const fact = db.query<Fact, [number]>("SELECT id FROM facts WHERE id = ?").get(id);
        if (!fact) return reply.code(404).send({ error: "Fact not found" });

        db.query("DELETE FROM facts WHERE id = ?").run(id);
        return { message: "Fact deleted" };
    });

    // GET /api/admin/submissions/:id/similar — find similar existing facts
    app.get<{ Params: { id: string } }>("/submissions/:id/similar", async(req, reply) => {
        if (!requireAuth(req, reply)) return;
        const db = getDb();
        const id = parseInt(req.params.id, 10);

        const sub = db.query<Pick<Submission, "id" | "content">, [number]>(
            "SELECT id, content FROM submissions WHERE id = ?",
        ).get(id);

        if (!sub) return reply.code(404).send({ error: "Submission not found" });

        const facts = db.query<Fact, []>("SELECT id, content FROM facts ORDER BY id").all();
        const similar = facts
            .map(f => ({ ...f, score: fuzzyScore(f.content, sub.content) }))
            .filter(f => f.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 5)
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            .map(({ score: score, ...f }) => f);

        return { similar };
    });

    // GET /api/admin/revisions
    app.get("/revisions", async(req, reply) => {
        if (!requireAuth(req, reply)) return;
        const db = getDb();
        return db.query<Revision, []>(
            "SELECT id, fact_id, content, status, submitted_at, reviewed_at FROM revisions ORDER BY submitted_at DESC",
        ).all();
    });

    // POST /api/admin/revisions/:id/approve — apply revision to the fact
    app.post<{ Params: { id: string } }>("/revisions/:id/approve", async(req, reply) => {
        if (!requireAuth(req, reply)) return;
        const db = getDb();
        const id = parseInt(req.params.id, 10);

        const rev = db
            .query<Pick<Revision, "id" | "fact_id" | "content" | "status">, [number]>(
                "SELECT id, fact_id, content, status FROM revisions WHERE id = ?",
            )
            .get(id);

        if (!rev) return reply.code(404).send({ error: "Revision not found" });
        if (rev.status !== "pending") return reply.code(400).send({ error: "Revision already reviewed" });

        db.query("UPDATE facts SET content = ? WHERE id = ?").run(rev.content, rev.fact_id);
        db.query(
            "UPDATE revisions SET status = 'approved', reviewed_at = CURRENT_TIMESTAMP WHERE id = ?",
        ).run(id);

        return { message: "Revision approved and fact updated" };
    });

    // POST /api/admin/revisions/:id/approve-revision — approve with edits
    app.post<{ Params: { id: string }; Body: { content?: unknown } }>("/revisions/:id/approve-revision", async(req, reply) => {
        if (!requireAuth(req, reply)) return;
        const db = getDb();
        const id = parseInt(req.params.id, 10);
        const content = req.body?.content;

        if (!content || typeof content !== "string" || !content.trim()) {
            return reply.code(400).send({ error: "'content' field is required" });
        }
        if (content.trim().length > 500) {
            return reply.code(400).send({ error: "Content must be 500 characters or fewer" });
        }

        const rev = db
            .query<Pick<Revision, "id" | "fact_id" | "status">, [number]>(
                "SELECT id, fact_id, status FROM revisions WHERE id = ?",
            )
            .get(id);

        if (!rev) return reply.code(404).send({ error: "Revision not found" });
        if (rev.status !== "pending") return reply.code(400).send({ error: "Revision already reviewed" });

        db.query("UPDATE facts SET content = ? WHERE id = ?").run(content.trim(), rev.fact_id);
        db.query(
            "UPDATE revisions SET status = 'approved', reviewed_at = CURRENT_TIMESTAMP WHERE id = ?",
        ).run(id);

        return { message: "Revision approved with edits and fact updated" };
    });

    // POST /api/admin/revisions/:id/reject
    app.post<{ Params: { id: string } }>("/revisions/:id/reject", async(req, reply) => {
        if (!requireAuth(req, reply)) return;
        const db = getDb();
        const id = parseInt(req.params.id, 10);

        const rev = db
            .query<Pick<Revision, "id" | "status">, [number]>(
                "SELECT id, status FROM revisions WHERE id = ?",
            )
            .get(id);

        if (!rev) return reply.code(404).send({ error: "Revision not found" });
        if (rev.status !== "pending") return reply.code(400).send({ error: "Revision already reviewed" });

        db.query(
            "UPDATE revisions SET status = 'rejected', reviewed_at = CURRENT_TIMESTAMP WHERE id = ?",
        ).run(id);

        return { message: "Revision rejected" };
    });
};
