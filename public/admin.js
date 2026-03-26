// ========================= //
// = Copyright (c) NullDev = //
// =     - SPDX: MIT -     = //
// ========================= //

/* eslint-disable @typescript-eslint/explicit-function-return-type */

let token = localStorage.getItem("admin_token") ?? "";
/**
 * @type {any[]}
 */
let submissions = [];
/**
 * @type {any[]}
 */
let facts = [];
let activeTab = "pending";

/**
 * @param {string} content
 * @param {string} query
 */
function fuzzyScore(content, query) {
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

function updateCounts() {
    ["pending", "approved", "rejected"].forEach(status => {
        const el = document.getElementById(`count-${status}`);
        if (el) { // @ts-ignore
            el.textContent = submissions.filter(s => s.status === status).length.toString();
        }
    });
    const factsCount = document.getElementById("count-facts");
    if (factsCount) factsCount.textContent = facts.length.toString();
}

async function loadSubmissions() {
    try {
        const res = await fetch("api/admin/submissions", {
            headers: { Authorization: token },
        });
        if (!res.ok) return false;
        submissions = await res.json();

        const factsRes = await fetch("api/admin/facts", {
            headers: { Authorization: token },
        });
        if (factsRes.ok) facts = await factsRes.json();

        updateCounts();
        return true;
    }
    catch {
        return false;
    }
}

/**
 * @param {string} str
 */
function escHtml(str) {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

/**
 * @param {HTMLElement} container
 */
function renderFacts(container) {
    if (facts.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>No facts in the database.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = facts.map(/** @type {(f: any) => string} */ (f) => `
        <div class="sub-card fact-card" id="fact-${f.id}" data-fact-content="${escHtml(f.content)}">
            <div class="fact-display">
                <div class="sub-content">${escHtml(f.content)}</div>
                <div class="sub-meta">
                    <span>#${f.id}</span>
                </div>
                <div class="sub-actions">
                    <button class="btn btn-sm btn-ghost" data-fact-id="${f.id}" data-action="edit-fact">✎ Edit</button>
                    <button class="btn btn-sm btn-danger" data-fact-id="${f.id}" data-action="delete-fact">✗ Delete</button>
                </div>
            </div>
        </div>
    `).join("");
}

function renderList() {
    const container = document.getElementById("sub-list");
    if (!container) return;

    if (activeTab === "facts") {
        renderFacts(container);
        return;
    }

    // @ts-ignore
    const filtered = submissions.filter(s => s.status === activeTab);

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
                    <rect x="9" y="3" width="6" height="4" rx="1"/>
                </svg>
                <p>No ${activeTab} submissions.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = filtered.map(/** @type {(sub: any) => string} */ (sub) => {
        const date = new Date(sub.submitted_at).toLocaleString();
        const reviewDate = sub.reviewed_at ? new Date(sub.reviewed_at).toLocaleString() : null;

        let similarHtml = "";
        if (sub.status === "pending" && facts.length > 0) {
            const similar = facts
                .map(f => ({ ...f, score: fuzzyScore(f.content, sub.content) }))
                .filter(f => f.score > 0)
                .sort((a, b) => b.score - a.score)
                .slice(0, 3);
            if (similar.length > 0) {
                similarHtml = `
                    <div class="similar-facts">
                        <div class="similar-label">⚠ Similar existing facts:</div>
                        ${similar.map(f => `<div class="similar-item"><span class="similar-id">#${f.id}</span> ${escHtml(f.content)}</div>`).join("")}
                    </div>
                `;
            }
        }

        const actions = sub.status === "pending" ? `
            <div class="sub-actions">
                <button class="btn btn-sm btn-success" data-id="${sub.id}" data-action="approve">✓ Approve</button>
                <button class="btn btn-sm btn-danger" data-id="${sub.id}" data-action="reject">✗ Reject</button>
                <button class="btn btn-sm btn-ghost" data-id="${sub.id}" data-action="revise">✎ Approve with Revision</button>
            </div>
        ` : "";

        return `
            <div class="sub-card" id="sub-${sub.id}" data-content="${escHtml(sub.content)}">
                <div class="sub-content">${escHtml(sub.content)}</div>
                ${similarHtml}
                <div class="sub-meta">
                <span>#${sub.id}</span>
                <span>Submitted: ${date}</span>
                ${reviewDate ? `<span>Reviewed: ${reviewDate}</span>` : ""}
                <span class="status-badge status-${sub.status}">${sub.status}</span>
                </div>
                ${actions}
            </div>
        `;
    }).join("");
}

function showPanel() {
    const loginScreen = document.getElementById("login-screen");
    if (loginScreen) loginScreen.style.display = "none";
    const panel = document.getElementById("admin-panel");
    if (panel) panel.classList.add("active");
    renderList();
}

/**
 * @param {string | null} msg
 */
function showLoginError(msg) {
    const el = document.getElementById("login-error");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
}

async function doLogin() {
    const pwd = /** @type {HTMLInputElement | null} */ (document.getElementById("pwd-input"))?.value;
    if (!pwd) return;

    const btn = /** @type {HTMLButtonElement | null} */ (document.getElementById("btn-login"));
    if (!btn) return;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';

    token = `Bearer ${pwd}`;

    const ok = await loadSubmissions();
    if (ok) {
        localStorage.setItem("admin_token", token);
        showPanel();
    }
    else {
        showLoginError("Incorrect password.");
        token = "";
    }

    btn.disabled = false;
    btn.innerHTML = "Sign In";
}

async function tryLoadPanel() {
    const ok = await loadSubmissions();
    if (ok) {
        showPanel();
    }
    else {
        token = "";
        localStorage.removeItem("admin_token");
    }
}

if (token) tryLoadPanel();

document.getElementById("btn-login")?.addEventListener("click", doLogin);
document.getElementById("pwd-input")?.addEventListener("keydown", e => {
    if (e.key === "Enter") doLogin();
});

/**
 * @param {string} type
 * @param {string | null} msg
 */
function showActionAlert(type, msg) {
    const id = type === "success" ? "action-alert" : "action-error";
    const other = type === "success" ? "action-error" : "action-alert";
    document.getElementById(other)?.classList.remove("show");
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 3500);
}

document.getElementById("btn-logout")?.addEventListener("click", () => {
    localStorage.removeItem("admin_token");
    token = "";
    location.reload();
});

document.getElementById("btn-refresh")?.addEventListener("click", async() => {
    const btn = /** @type {HTMLButtonElement | null} */ (document.getElementById("btn-refresh"));
    if (!btn) return;
    btn.disabled = true;
    await loadSubmissions();
    renderList();
    btn.disabled = false;
});

document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => {
        document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
        tab.classList.add("active"); // @ts-ignore
        activeTab = tab.dataset.tab;
        renderList();
    });
});

/**
 * @param {any} id
 * @param {any} action
 */
async function reviewSubmission(id, action) {
    const res = await fetch(`api/admin/submissions/${id}/${action}`, {
        method: "POST",
        headers: { Authorization: token },
    });
    return res;
}

/**
 * @param {any} id
 * @param {string} action
 */
async function doReview(id, action) {
    const card = document.getElementById(`sub-${id}`);
    const buttons = card?.querySelectorAll("button");
    buttons?.forEach(b => (b.disabled = true));

    try {
        const res = await reviewSubmission(id, action);
        const data = await res.json();

        if (res.ok) {
            showActionAlert("success", data.message); // @ts-ignore
            const numId = parseInt(id, 10);
            const sub = submissions.find(s => s.id === numId);
            if (sub) { // @ts-ignore
                sub.status = action === "approve" ? "approved" : "rejected"; // @ts-ignore
                sub.reviewed_at = new Date().toISOString();
            }
            updateCounts();
            renderList();
        }
        else {
            showActionAlert("error", data.error ?? "Action failed");
            buttons?.forEach(b => (b.disabled = false));
        }
    }
    catch {
        showActionAlert("error", "Network error");
        buttons?.forEach(b => (b.disabled = false));
    }
}

/**
 * @param {any} id
 * @param {string} content
 */
async function doReviewWithRevision(id, content) {
    const card = document.getElementById(`sub-${id}`);
    const buttons = card?.querySelectorAll("button");
    buttons?.forEach(b => (b.disabled = true));

    try {
        const res = await fetch(`api/admin/submissions/${id}/approve-revision`, {
            method: "POST",
            headers: { Authorization: token, "Content-Type": "application/json" },
            body: JSON.stringify({ content }),
        });
        const data = await res.json();

        if (res.ok) {
            showActionAlert("success", data.message); // @ts-ignore
            const sub = submissions.find(s => s.id === parseInt(id, 10));
            if (sub) { // @ts-ignore
                sub.status = "approved"; // @ts-ignore
                sub.reviewed_at = new Date().toISOString();
            }
            updateCounts();
            renderList();
        }
        else {
            showActionAlert("error", data.error ?? "Action failed");
            buttons?.forEach(b => (b.disabled = false));
        }
    }
    catch {
        showActionAlert("error", "Network error");
        buttons?.forEach(b => (b.disabled = false));
    }
}

document.getElementById("sub-list")?.addEventListener("click", async e => {
    const btn = /** @type {HTMLElement | null} */ (e.target)?.closest("[data-action]");
    if (!btn) return;
    // eslint-disable-next-line prefer-destructuring
    const dataset = /** @type {HTMLElement} */ (btn).dataset;
    const {action} = dataset;
    if (!action) return;

    // Fact management actions
    const {factId} = dataset;
    if (factId) {
        if (action === "edit-fact") {
            const card = document.getElementById(`fact-${factId}`);
            if (!card) return;
            const display = card.querySelector(".fact-display");
            if (!display) return;
            display.innerHTML = `
                <textarea class="revision-textarea">${escHtml(card.dataset.factContent ?? "")}</textarea>
                <div style="display:flex;gap:.5rem;margin-top:.5rem">
                    <button class="btn btn-sm btn-success" data-fact-id="${factId}" data-action="save-fact">✓ Save</button>
                    <button class="btn btn-sm btn-ghost" data-fact-id="${factId}" data-action="cancel-edit">✗ Cancel</button>
                </div>
            `;
            const textarea = /** @type {HTMLTextAreaElement | null} */ (display.querySelector(".revision-textarea"));
            if (textarea) textarea.value = card.dataset.factContent ?? "";
        }
        else if (action === "save-fact") {
            const card = document.getElementById(`fact-${factId}`);
            const textarea = /** @type {HTMLTextAreaElement | null} */ (card?.querySelector(".revision-textarea"));
            const content = textarea?.value.trim();
            if (!content) return;
            const buttons = card?.querySelectorAll("button");
            buttons?.forEach(b => (b.disabled = true));
            try {
                const res = await fetch(`api/admin/facts/${factId}`, {
                    method: "PUT",
                    headers: { Authorization: token, "Content-Type": "application/json" },
                    body: JSON.stringify({ content }),
                });
                const data = await res.json();
                if (res.ok) {
                    showActionAlert("success", data.message);
                    // eslint-disable-next-line no-shadow
                    const f = facts.find(f => f.id === parseInt(factId, 10));
                    if (f) f.content = content;
                    renderList();
                }
                else {
                    showActionAlert("error", data.error ?? "Update failed");
                    buttons?.forEach(b => (b.disabled = false));
                }
            }
            catch {
                showActionAlert("error", "Network error");
                buttons?.forEach(b => (b.disabled = false));
            }
        }
        else if (action === "cancel-edit") {
            renderList();
        }
        else if (action === "delete-fact") {
            // eslint-disable-next-line no-alert
            if (!confirm(`Delete fact #${factId}?`)) return;
            try {
                const res = await fetch(`api/admin/facts/${factId}`, {
                    method: "DELETE",
                    headers: { Authorization: token },
                });
                const data = await res.json();
                if (res.ok) {
                    showActionAlert("success", data.message);
                    facts = facts.filter(f => f.id !== parseInt(factId, 10));
                    updateCounts();
                    renderList();
                }
                else {
                    showActionAlert("error", data.error ?? "Delete failed");
                }
            }
            catch {
                showActionAlert("error", "Network error");
            }
        }
        return;
    }

    // Submission actions
    const {id} = dataset;
    if (!id) return;

    if (action === "approve" || action === "reject") {
        await doReview(id, action);
    }
    else if (action === "revise") {
        const card = document.getElementById(`sub-${id}`);
        if (!card) return;
        const actionsDiv = card.querySelector(".sub-actions");
        if (!actionsDiv) return;
        actionsDiv.innerHTML = `
            <textarea class="revision-textarea"></textarea>
            <div style="display:flex;gap:.5rem;margin-top:.5rem">
                <button class="btn btn-sm btn-success" data-id="${id}" data-action="confirm-revise">✓ Confirm</button>
                <button class="btn btn-sm btn-ghost" data-id="${id}" data-action="cancel-revise">✗ Cancel</button>
            </div>
        `;
        const textarea = /** @type {HTMLTextAreaElement | null} */ (actionsDiv.querySelector(".revision-textarea"));
        if (textarea) textarea.value = card.dataset.content ?? "";
    }
    else if (action === "confirm-revise") {
        const card = document.getElementById(`sub-${id}`);
        const textarea = /** @type {HTMLTextAreaElement | null} */ (card?.querySelector(".revision-textarea"));
        const revised = textarea?.value.trim();
        if (!revised) return;
        await doReviewWithRevision(id, revised);
    }
    else if (action === "cancel-revise") {
        renderList();
    }
});
