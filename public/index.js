// ========================= //
// = Copyright (c) NullDev = //
// ========================= //

/* eslint-disable @typescript-eslint/explicit-function-return-type */

/**
 * @type {any[]}
 */
let seenIds = [];

/**
 * @param {string} id
 * @param {string} type
 * @param {string | null} msg
 */
function showAlert(id, type, msg) {
    const el = document.getElementById(id);
    if (!el) return;
    el.className = `alert alert-${type} show`;
    el.textContent = msg;
    setTimeout(() => el.classList.remove("show"), 4000);
}

/**
 * @param {HTMLButtonElement | null} btn
 * @param {boolean} loading
 */
function setLoading(btn, loading) {
    if (!btn) return;
    if (loading) {
        btn.disabled = true;
        btn.dataset.orig = btn.innerHTML;
        btn.innerHTML = '<span class="spinner"></span>';
    }
    else {
        btn.disabled = false;
        btn.innerHTML = btn.dataset.orig || btn.innerHTML;
    }
}

function updateSeenDisplay() {
    const el = document.getElementById("seen-ids");
    if (!el) return;
    el.textContent = seenIds.length ? seenIds.join(", ") : "—";
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

document.getElementById("btn-random")?.addEventListener("click", async() => {
    const btn = /** @type {HTMLButtonElement | null} */ (document.getElementById("btn-random"));
    if (!btn) return;
    setLoading(btn, true);

    const exclude = /** @type {HTMLInputElement | null} */ (
        document.getElementById("chk-exclude")
    )?.checked && seenIds.length
        ? `?exclude=${seenIds.join(",")}`
        : "";

    try {
        const res = await fetch(`api/facts/random${exclude}`);
        const data = await res.json();

        if (!res.ok) {
            if (res.status === 404) {
                showAlert("random-alert", "error", "You've seen all available facts! Clear to start over.");
            }
            else {
                showAlert("random-alert", "error", data.error ?? "Something went wrong");
            }
            return;
        }

        const box = document.getElementById("random-display");
        if (!box) return;
        box.className = "fact-box has-fact";
        box.innerHTML = `<span class="fact-id">#${data.id}</span>${escHtml(data.content)}`;

        if (!seenIds.includes(data.id)) {
            seenIds.push(data.id);
            updateSeenDisplay();
        }
    }
    catch {
        showAlert("random-alert", "error", "Network error. Is the server running?");
    }
    finally {
        setLoading(btn, false);
    }
});

document.getElementById("btn-clear-seen")?.addEventListener("click", () => {
    seenIds = [];
    updateSeenDisplay();
    const box = document.getElementById("random-display");
    if (!box) return;
    box.className = "fact-box";
    box.innerHTML = "Press the button to get a fact…";
});

document.getElementById("btn-all")?.addEventListener("click", async() => {
    const btn = /** @type {HTMLButtonElement | null} */ (document.getElementById("btn-all"));
    if (!btn) return;
    setLoading(btn, true);

    try {
        const res = await fetch("api/facts");
        const data = await res.json();

        if (!res.ok) {
            showAlert("all-alert", "error", data.error ?? "Failed to load facts");
            return;
        }

        const list = document.getElementById("all-list");
        const wrap = document.getElementById("all-wrap");
        const count = document.getElementById("all-count");

        if (!list || !wrap || !count) return;
        list.innerHTML = data.map((/** @type {{ id: any; content: any; }} */ f) =>
            `<li><span class="fact-num">#${f.id}</span><span>${escHtml(f.content)}</span></li>`,
        ).join("");

        wrap.style.display = "block";
        count.textContent = `${data.length} fact${data.length !== 1 ? "s" : ""} loaded`;
        btn.textContent = "Refresh";
    }
    catch {
        showAlert("all-alert", "error", "Network error. Is the server running?");
    }
    finally {
        setLoading(btn, false);
    }
});

const submitInput = /** @type {HTMLInputElement | null} */ (document.getElementById("submit-input"));
submitInput?.addEventListener("input", () => {
    const charNum = document.getElementById("char-num");
    if (!charNum) return;
    charNum.textContent = submitInput.value.length.toString();
});

document.getElementById("btn-submit")?.addEventListener("click", async() => {
    const btn = /** @type {HTMLButtonElement | null} */ (document.getElementById("btn-submit"));
    if (!btn) return;
    const fact = submitInput?.value.trim();

    if (!fact) {
        showAlert("submit-alert", "error", "Please enter a fact before submitting.");
        return;
    }

    setLoading(btn, true);

    try {
        const res = await fetch("api/facts/submit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fact }),
        });
        const data = await res.json();

        if (!res.ok) {
            showAlert("submit-alert", "error", data.error ?? "Submission failed");
        }
        else {
            showAlert("submit-alert", "success", data.message);
            if (submitInput) submitInput.value = "";
            const charNum = document.getElementById("char-num");
            if (charNum) charNum.textContent = "0";
        }
    }
    catch {
        showAlert("submit-alert", "error", "Network error. Is the server running?");
    }
    finally {
        setLoading(btn, false);
    }
});

document.addEventListener("click", e => {
    const header = /** @type {HTMLElement | null} */ (e.target)?.closest("[data-toggle]");
    if (header) {
        const id = /** @type {HTMLElement} */ (header).dataset.toggle;
        if (id) document.getElementById(id)?.classList.toggle("open");
        return;
    }

    const copyBtn = /** @type {HTMLElement | null} */ (e.target)?.closest(".copy-btn");
    if (copyBtn) {
        const pre = copyBtn.closest(".copy-btn-wrap")?.querySelector("pre");
        if (!pre) return;
        navigator.clipboard.writeText(pre.innerText).then(() => {
            const orig = copyBtn.textContent;
            copyBtn.textContent = "Copied!";
            setTimeout(() => (copyBtn.textContent = orig), 1500);
        });
    }
});
