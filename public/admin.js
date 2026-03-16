// ========================= //
// = Copyright (c) NullDev = //
// =     - SPDX: MIT -     = //
// ========================= //

/* eslint-disable @typescript-eslint/explicit-function-return-type */

let token = sessionStorage.getItem("admin_token") ?? "";
/**
 * @type {never[]}
 */
let submissions = [];
let activeTab = "pending";

function updateCounts() {
    ["pending", "approved", "rejected"].forEach(status => {
        const el = document.getElementById(`count-${status}`);
        if (el) { // @ts-ignore
            el.textContent = submissions.filter(s => s.status === status).length.toString();
        }
    });
}

async function loadSubmissions() {
    try {
        const res = await fetch("api/admin/submissions", {
            headers: { Authorization: token },
        });
        if (!res.ok) return false;
        submissions = await res.json();
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

function renderList() { // @ts-ignore
    const filtered = submissions.filter(s => s.status === activeTab);
    const container = document.getElementById("sub-list");

    if (!container) return;

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

        const actions = sub.status === "pending" ? `
            <div class="sub-actions">
                <button class="btn btn-sm btn-success" data-id="${sub.id}" data-action="approve">✓ Approve</button>
                <button class="btn btn-sm btn-danger" data-id="${sub.id}" data-action="reject">✗ Reject</button>
            </div>
        ` : "";

        return `
            <div class="sub-card" id="sub-${sub.id}">
                <div class="sub-content">${escHtml(sub.content)}</div>
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
        sessionStorage.setItem("admin_token", token);
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
        sessionStorage.removeItem("admin_token");
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
    sessionStorage.removeItem("admin_token");
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
            const sub = submissions.find(s => s.id === id);
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

document.getElementById("sub-list")?.addEventListener("click", async e => {
    const btn = /** @type {HTMLElement | null} */ (e.target)?.closest("[data-action]");
    if (!btn) return;
    const {id, action} = /** @type {HTMLElement} */ (btn).dataset;
    if (id && action) await doReview(id, action);
});
