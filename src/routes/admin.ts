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
};
