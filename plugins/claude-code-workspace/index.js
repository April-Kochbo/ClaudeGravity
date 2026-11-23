// Claude Code Workspace — M3: 3 Card Types + Right Overview 3-State & Multi-View
// Top:    [⊞ Overview] toggle (matching Claude Image 2)
// Center: Chat Stream Claude Thread Capsules (Image 3) + Right-aligned user bubbles + Status bar
// Right:  Claude Drawer (Image 2): Welcome banner + Waiting / Working / Resolved + Changes / Library
//
// Data policy (evidence-first): zero invented RPCs.

const VIEW_MODES = ["normal", "thinking", "verbose"];
const state = {
  viewMode: plugin.storage.get("viewMode", "normal"),
  drawerOpen: plugin.storage.get("drawerOpen", false),
  drawerWidth: plugin.storage.get("drawerWidth", 380),
  tab: "threads", // "threads" | "changes" | "library"
  showMenu: false, // Threads ▾ dropdown
  searchOpen: false,
  searchQuery: "",
  inspecting: null, // thread id or title being drilled into
  inspectingData: null,
  inspectorTab: "plan", // "plan" | "activity" | "diff" | "verify"
  workingExpanded: true,
  resolvedExpanded: false,
  showAllWorking: false
};

const ICON_SEARCH = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><circle cx="6.5" cy="6.5" r="4.5"/><path d="M10 10l3.8 3.8"/></svg>';
const ICON_PLUS = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M8 3.5v9M3.5 8h9"/></svg>';
const ICON_CLOSE = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>';
const ICON_CLEAR = '<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>';

const el = (tag, attrs = {}, children = []) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "text") node.textContent = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null) node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) if (c) node.append(c);
  return node;
};

const save = () => {
  plugin.storage.set("viewMode", state.viewMode);
  plugin.storage.set("drawerOpen", state.drawerOpen);
  plugin.storage.set("drawerWidth", state.drawerWidth);
};

/* ── Body-level flags (consumed by workspace.css) ───────────────────────── */
function applyBodyFlags() {
  document.body.dataset.claudeViewMode = state.viewMode;
  document.body.dataset.claudeDrawerOpen = String(state.drawerOpen);
  document.documentElement.style.setProperty("--claude-drawer-width", state.drawerWidth + "px");
  const bar = document.querySelector('[data-testid="title-menu-bar"], [data-testid="window-titlebar"]');
  if (bar) document.documentElement.style.setProperty("--claude-titlebar-h", bar.getBoundingClientRect().height + "px");
}

/* ── React Fiber & Store Bridge ─────────────────────────────────────────── */
function getFiber(n) {
  if (!n) return null;
  const fk = Object.keys(n).find(k => k.startsWith("__reactFiber$"));
  return fk ? n[fk] : null;
}

let cachedStore = null;
function getStore() {
  if (cachedStore) return cachedStore;
  const anchors = [
    document.querySelector('[data-testid="conversation-view"]'),
    document.querySelector('[data-testid="conversation-row-sidebar"]'),
    document.body
  ];
  for (const anchor of anchors) {
    if (!anchor) continue;
    let fiber = getFiber(anchor);
    for (let depth = 0; fiber && depth < 40; depth += 1, fiber = fiber.return) {
      const store = fiber.memoizedProps?.store;
      if (typeof store?.getState === "function") {
        cachedStore = store;
        return store;
      }
      let dep = fiber.dependencies?.firstContext;
      for (let i = 0; dep && i < 30; i += 1, dep = dep.next) {
        const depStore = dep.memoizedValue?.store;
        if (typeof depStore?.getState === "function") {
          cachedStore = depStore;
          return depStore;
        }
      }
    }
  }
  return null;
}

function readWorkspaceInfo() {
  const st = getStore()?.getState?.();
  const cv = document.querySelector('[data-testid="conversation-view"]');
  const cid = cv?.getAttribute("data-cascade-id") || st?.conversation?.activeCascadeId || st?.cascade?.activeCascadeId;
  const summary = cid && st?.trajectorySummaries?.summaries?.[cid];
  const branch = summary?.workspaces?.[0]?.branchName || st?.git?.branch || "main";
  const workspaceUri = summary?.workspaces?.[0]?.workspaceFolderAbsoluteUri || "";
  let folderName = workspaceUri ? decodeURIComponent(workspaceUri.split("/").filter(Boolean).pop() || "") : "";
  if (!folderName) {
    folderName = st?.workspace?.currentWorkspace?.name || 
      st?.workspaces?.activeWorkspace?.name ||
      document.querySelector('[data-testid="project-tree-item"][data-active="true"]')?.textContent?.trim() ||
      "";
  }
  return { branch, folderName, cascadeId: cid };
}

function readLatestDiff() {
  const cards = [...document.querySelectorAll('[data-testid="changed-files-card"]')];
  const lastCard = cards[cards.length - 1];
  if (!lastCard) return null;
  const header = lastCard.querySelector('[data-testid="changed-files-card-header"]');
  const text = header?.querySelector('span.truncate')?.textContent?.trim() || "";
  const add = header?.querySelector('span.text-green-500')?.textContent?.trim() || "";
  const del = header?.querySelector('span.text-red-500')?.textContent?.trim() || "";
  const countMatch = text.match(/(\d+)\s+file/);
  const filesCount = countMatch ? parseInt(countMatch[1], 10) : 0;

  let files = [];
  let f = getFiber(lastCard);
  for (let i = 0; i < 6 && f; i++, f = f.return) {
    const td = f.memoizedProps?.turnDiff;
    if (td?.fileDiffs) {
      for (const [uri, d] of Object.entries(td.fileDiffs)) {
        const path = decodeURIComponent(uri.replace(/^file:\/\/\/?/, ""));
        const name = path.split(/[\/\\]/).pop();
        files.push({
          uri,
          path,
          name,
          add: d.additions || 0,
          del: d.deletions || 0
        });
      }
      break;
    }
  }
  return {
    summary: text || (filesCount ? `${filesCount} files changed` : ""),
    filesCount: files.length || filesCount,
    add: add || (files.reduce((a, b) => a + b.add, 0) ? `+${files.reduce((a, b) => a + b.add, 0)}` : ""),
    del: del || (files.reduce((a, b) => a + b.del, 0) ? `-${files.reduce((a, b) => a + b.del, 0)}` : ""),
    files,
    cardEl: lastCard
  };
}

/* ── Thread collection from verified DOM anchors ────────────────────────── */
function readThreads() {
  const rows = [...document.querySelectorAll('[data-testid="conversation-row-sidebar"][data-cascade-id]')];
  const activeRow = rows.find(r => r.getAttribute("data-selected") === "true");
  const GROUP = '[data-testid="project-group"]';
  const groups = [...document.querySelectorAll(GROUP)];
  let scope = activeRow?.closest(GROUP) || null;
  let outsideProjects = !!activeRow && !scope; // active session lives in plain "Conversations"
  if (!activeRow) { // e.g. new-conversation page: fall back to the workspace folder / active project item
    const name = (readWorkspaceInfo().folderName || "").trim();
    const item = document.querySelector('[data-testid="project-tree-item"][data-active="true"]');
    scope = item?.closest(GROUP)
      || (name && groups.find(g => (g.querySelector('[data-testid="project-tree-item"]')?.textContent || "").trim().startsWith(name)))
      || null;
    if (!scope) return [];
  }
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const id = row.getAttribute("data-cascade-id");
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (scope ? !scope.contains(row) : (outsideProjects && row.closest(GROUP))) continue; // current project only
    const title = row.querySelector("span.truncate")?.textContent?.trim()
      || row.querySelector("a[aria-label]")?.getAttribute("aria-label")
      || row.textContent.trim().slice(0, 80) || id;
    const time = row.querySelector(".text-2xs")?.textContent?.trim() || "";
    const isActive = row.getAttribute("data-selected") === "true";
    let status = "completed";
    if (row.querySelector('[data-testid="attention-dot"]')) status = "waiting";
    else if (row.querySelector('[data-testid="status-loading-spinner"]')) status = "working";
    out.push({ id, title, time, status, isActive, row });
  }
  return out;
}

/* ── M3: Chat Stream Thread Capsule Parser & Decorator (Image 3 Style) ──── */
function parseCapsuleLine(raw) {
  const text = (raw || "").trim();
  const dotMatch = text.match(/^([○●\*\-–])\s*/);
  let status = "open";
  let rest = text;
  if (dotMatch) {
    if (dotMatch[1] === "●") status = "working";
    else if (dotMatch[1] === "○") status = "open";
    rest = text.slice(dotMatch[0].length);
  }
  const prBadges = [];
  const badgeRegex = /(?:⑂|PR|#)\s*#?(\d+)/gi;
  let bm;
  while ((bm = badgeRegex.exec(rest)) !== null) {
    prBadges.push(bm[1]);
  }
  let clean = rest.replace(/(?:\[?\s*(?:⑂|PR|#)\s*#?\d+\s*\]?)/gi, "").trim();
  let title = clean;
  let desc = "";
  const boldMatch = clean.match(/^\*\*([^*]+)\*\*(.*)/);
  if (boldMatch) {
    title = boldMatch[1].trim();
    desc = boldMatch[2].replace(/^[\s:\-–—]+/, "").trim();
  } else {
    const sepMatch = clean.match(/^([^:\n]{2,40}?)(?:\s*[:]\s*|\s+[\-–—]\s+)(.+)$/);
    if (sepMatch) {
      title = sepMatch[1].trim();
      desc = sepMatch[2].trim();
    } else {
      const dblSpace = clean.split(/\s{2,}/);
      if (dblSpace.length >= 2) {
        title = dblSpace[0].trim();
        desc = dblSpace.slice(1).join(" ").trim();
      }
    }
  }
  return { status, title, desc, prBadges };
}

const PR_ICON_SVG = '<svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" style="display:inline-block;vertical-align:-1px;margin-right:3px;"><path d="M11.75 2.5a1.75 1.75 0 1 0-2.45 1.603V5.5a1 1 0 0 1-1 1H6.7A2.75 2.75 0 0 0 4 9.25v2.347a1.75 1.75 0 1 0 1.5 0V9.25A1.25 1.25 0 0 1 6.75 8h1a2.5 2.5 0 0 0 2.5-2.5V4.103A1.75 1.75 0 0 0 11.75 2.5z"/></svg>';

/* Capsules: only real tasks. A line becomes a capsule when it carries a ○/● marker or PR badge,
   or its title matches an actual thread of the current project. Live one-line status comes from
   that thread's trajectory (verified getCascadeTrajectory). */
const briefCache = new Map(); // id -> { text, at, busy }
const normTitle = (s) => (s || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
function matchThread(title, threads) {
  const n = normTitle(title);
  if (n.length < 3) return null;
  return threads.find(t => { const m = normTitle(t.title); return m && (m === n || (n.length >= 4 && (m.includes(n) || n.includes(m)))); }) || null;
}
function briefFromSteps(steps, working) {
  const real = steps.filter(x => x.step?.case && !SKIP_CASES.has(x.step.case) && x.step.case !== "userInput");
  if (!real.length) return "";
  const lastStep = real[real.length - 1];
  if (working) {
    if (lastStep.step.case !== "plannerResponse") {
      const s = toolLine(lastStep);
      return `${s.verb}${s.arg ? " " + s.arg : ""}`.slice(0, 90);
    }
    const v = lastStep.step.value || {};
    const say = firstSentence(v.modifiedResponse || v.response);
    return say || (v.thinking ? "Thinking…" : "Working…");
  }
  for (let i = real.length - 1; i >= 0; i--) {
    const v = real[i].step.value || {};
    if (real[i].step.case === "plannerResponse") { const s = firstSentence(v.modifiedResponse || v.response); if (s) return s; }
  }
  return "";
}
async function fetchBrief(id, working) {
  const b = briefCache.get(id) || { text: "", at: 0, busy: false };
  briefCache.set(id, b);
  const ttl = working ? 4000 : 60000;
  if (b.busy || Date.now() - b.at < ttl) return;
  const svc = findAgentService(); if (!svc) return;
  b.busy = true;
  try {
    const res = await svc.getCascadeTrajectory({ cascadeId: id });
    b.text = briefFromSteps(res?.trajectory?.steps || [], working);
  } catch (_) {}
  b.busy = false; b.at = Date.now();
  refreshCapsules();
}

function createThreadCapsuleEl(data) {
  const node = el("div", {
    class: "claude-thread-capsule", tabindex: "0", role: "button",
    title: data.threadId ? `Open thread: ${data.title}` : data.title,
    onclick: (e) => { e.stopPropagation(); openInspector(data.threadId || data.title, data.thread || data); }
  }, [
    el("div", { class: "claude-thread-capsule-left" }, [
      el("span", { class: "claude-thread-capsule-dot", "data-status": data.status }),
      el("span", { class: "claude-thread-capsule-title", text: data.title }),
      el("span", { class: "claude-thread-capsule-desc", text: data.desc || "" })
    ]),
    data.prBadges && data.prBadges.length ? el("div", { class: "claude-thread-capsule-badges" },
      data.prBadges.map(b => el("span", { class: "claude-pr-badge", html: `${PR_ICON_SVG}#${b}` }))) : null
  ]);
  if (data.threadId) node.dataset.threadId = data.threadId;
  return node;
}

function refreshCapsules() {
  const cv = document.querySelector('[data-testid="conversation-view"]');
  if (!cv) return;
  const threads = readThreads();
  cv.querySelectorAll(".claude-thread-capsule[data-thread-id]").forEach(node => {
    const th = threads.find(t => t.id === node.dataset.threadId);
    if (!th) return;
    const dot = node.querySelector(".claude-thread-capsule-dot");
    if (dot) dot.dataset.status = th.status === "working" ? "working" : th.status === "waiting" ? "waiting" : "open";
    const b = briefCache.get(th.id);
    const d = node.querySelector(".claude-thread-capsule-desc");
    if (d && b?.text && d.textContent !== b.text) d.textContent = b.text;
    fetchBrief(th.id, th.status === "working");
  });
}

function decorateChatStream() {
  const cv = document.querySelector('[data-testid="conversation-view"]');
  if (!cv) return;
  const threads = readThreads();
  for (const li of cv.querySelectorAll("li:not([data-claude-decorated])")) {
    const rawText = li.textContent?.trim() || "";
    if (!rawText || rawText.length > 220 || li.querySelector("ul, ol, pre, p + p")) continue;
    const marked = rawText.startsWith("○") || rawText.startsWith("●") || /(?:⑂|PR\s|#)\s*#?\d+/.test(rawText);
    const parsed = parseCapsuleLine(rawText);
    if (!parsed.title || parsed.title.length < 2) continue;
    const th = matchThread(parsed.title, threads);
    if (!marked && !th) continue; // not a task -> plain list item
    li.dataset.claudeDecorated = "true";
    li.classList.add("claude-capsule-wrapper");
    li.parentElement?.classList.add("claude-capsule-list");
    if (th) {
      parsed.threadId = th.id; parsed.thread = th;
      parsed.status = th.status === "working" ? "working" : th.status === "waiting" ? "waiting" : "open";
      parsed.desc = briefCache.get(th.id)?.text || parsed.desc;
    }
    li.replaceChildren(createThreadCapsuleEl(parsed));
  }
  refreshCapsules();
}
/* ── M3: Library Artifacts Discovery ────────────────────────────────────── */
function readLibraryItems() {
  const items = [
    { name: "00-Spec-Baseline.md", path: "docs/00-Spec-Baseline.md", type: "SPEC", time: "Oct 31" },
    { name: "M0-BetterGravity-UI-Feasibility.md", path: "docs/M0-BetterGravity-UI-Feasibility.md", type: "FEASIBILITY", time: "Oct 31" },
    { name: "README.md", path: "README.md", type: "GUIDE", time: "Oct 31" }
  ];
  const cv = document.querySelector('[data-testid="conversation-view"]');
  if (cv) {
    const artCards = cv.querySelectorAll('[data-testid="artifact-card"], [data-testid="artifact-block"]');
    artCards.forEach(c => {
      const title = c.querySelector("span, .font-medium")?.textContent?.trim();
      if (title && !items.some(x => x.name === title)) {
        items.push({ name: title, path: "session/artifacts", type: "ARTIFACT", time: "Current" });
      }
    });
  }
  return items;
}

/* ── Transcript Folding Control (Normal | Thinking | Verbose via Ctrl+O) ─ */
function applyTranscriptFolding(mode) {
  const cv = document.querySelector('[data-testid="conversation-view"]');
  if (!cv) return;
  if (mode === "normal") {
    cv.querySelectorAll('[data-testid="thinking-collapsible-trigger"][aria-expanded="true"]').forEach(b => b.click());
    cv.querySelectorAll('[data-testid="worked-for-collapsible"][aria-expanded="true"]').forEach(b => b.click());
    cv.querySelectorAll('[data-testid="tool-group-collapsible"][aria-expanded="true"]').forEach(b => b.click());
  } else if (mode === "thinking") {
    cv.querySelectorAll('[data-testid="thinking-collapsible-trigger"][aria-expanded="false"]').forEach(b => b.click());
    cv.querySelectorAll('[data-testid="worked-for-collapsible"][aria-expanded="false"]').forEach(b => b.click());
    cv.querySelectorAll('[data-testid="tool-group-collapsible"][aria-expanded="true"]').forEach(b => b.click());
  } else if (mode === "verbose") {
    cv.querySelectorAll('[data-testid="thinking-collapsible-trigger"][aria-expanded="false"]').forEach(b => b.click());
    cv.querySelectorAll('[data-testid="worked-for-collapsible"][aria-expanded="false"]').forEach(b => b.click());
    cv.querySelectorAll('[data-testid="tool-group-collapsible"][aria-expanded="false"]').forEach(b => b.click());
  }
}

function setViewMode(v) {
  state.viewMode = v; save(); applyBodyFlags();
  applyTranscriptFolding(v);
}

function onKey(e) {
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "o") {
    e.preventDefault(); e.stopPropagation();
    setViewMode(VIEW_MODES[(VIEW_MODES.indexOf(state.viewMode) + 1) % VIEW_MODES.length]);
  }
}

/* ── Title bar: [⊞ Overview] Button (Claude Image 2 Style) ──────────────── */
const OVERVIEW_SVG = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" class="claude-overview-icon"><rect x="1.5" y="2.5" width="13" height="11" rx="2" stroke="currentColor" stroke-width="1.3"/><path d="M10 2.5V13.5" stroke="currentColor" stroke-width="1.3"/></svg>';

function mountTitlebar(anchor) {
  const existing = document.querySelector(".claude-titlebar-controls");
  const moreBtn = document.querySelector('[data-testid="titlebar-more-actions"]');
  if (existing) {
    if (moreBtn && existing.parentElement !== moreBtn.parentElement) {
      moreBtn.parentElement.insertBefore(existing, moreBtn);
    }
    return;
  }
  const trigger = el("button", {
    class: "claude-overview-trigger", id: "claude-overview-trigger", type: "button", "data-open": String(state.drawerOpen),
    title: "Toggle Overview (Threads & Changes)",
    onclick: () => toggleDrawer()
  }, [el("span", { html: OVERVIEW_SVG }), el("span", { text: "Overview" })]);
  const controls = el("div", { class: "claude-titlebar-controls" }, [trigger]);
  if (moreBtn && moreBtn.parentElement) {
    moreBtn.parentElement.insertBefore(controls, moreBtn);
    return;
  }
  const aux = anchor.matches('[data-testid="toggle-aux-sidebar"]') ? anchor : null;
  const row = aux?.parentElement;
  if (row) {
    const first = [...row.children].find(c => c.tagName === "BUTTON" || c.querySelector("button")) || aux;
    row.insertBefore(controls, first);
    return;
  }
  const winCtl = anchor.querySelector('[data-testid="window-controls"]');
  if (winCtl && winCtl.parentElement) winCtl.parentElement.insertBefore(controls, winCtl);
  else anchor.append(controls);
}

/* ── Bottom Composer Compact Status Bar ─────────────────────────────────── */
function dockComposerAtBottom(inputBox) {
  if (!inputBox) return;
  try {
    const cv = inputBox.closest('[data-testid="conversation-view"]') || inputBox.closest('.agy-sheet');
    if (cv) {
      cv.style.setProperty("display", "flex", "important");
      cv.style.setProperty("flex-direction", "column", "important");
      cv.style.setProperty("justify-content", "flex-end", "important");
      
      // Find direct child of cv
      let directChild = inputBox;
      while (directChild && directChild.parentElement !== cv) {
        directChild = directChild.parentElement;
      }
      if (directChild) {
        directChild.style.setProperty("margin-top", "auto", "important");
        directChild.style.setProperty("margin-bottom", "0px", "important");
        directChild.style.setProperty("flex-shrink", "0", "important");
      }

      // Also ensure all parents between inputBox and directChild do not center or add large margins
      let cur = inputBox;
      while (cur && cur !== cv) {
        if (cur.style.marginTop === "auto") cur.style.setProperty("margin-top", "0px", "important");
        if (cur.style.marginBottom === "auto") cur.style.setProperty("margin-bottom", "0px", "important");
        cur = cur.parentElement;
      }

      // If there are trailing empty spacers after directChild, hide them
      let next = directChild ? directChild.nextElementSibling : null;
      while (next) {
        if (!next.innerText.trim() && !next.querySelector('input, button, textarea, [data-testid]')) {
          next.style.setProperty("display", "none", "important");
        }
        next = next.nextElementSibling;
      }
    }
  } catch (e) {}
}

function mountStatusBar(inputBox) {
  if (!inputBox) return;
  dockComposerAtBottom(inputBox);
  let bar = inputBox.querySelector(".claude-composer-statusbar");
  if (!bar) {
    bar = el("div", { class: "claude-composer-statusbar" }, [
      el("div", { class: "claude-statusbar-left" }, [
        el("button", { class: "claude-statusbar-item claude-sb-branch", type: "button", title: "Current workspace branch" }),
        el("div", { class: "claude-statusbar-divider" }),
        el("button", { class: "claude-statusbar-item claude-sb-diff", type: "button", title: "Click to open Changes tab in Overview", onclick: () => {
          state.tab = "changes";
          if (!state.drawerOpen) toggleDrawer(true);
          else render();
        } })
      ]),
      el("div", { class: "claude-statusbar-right" }, [
        el("button", { class: "claude-statusbar-item claude-sb-threads", type: "button", title: "Click to open Threads in Overview", onclick: () => {
          state.tab = "threads";
          if (!state.drawerOpen) toggleDrawer(true);
          else render();
        } })
      ])
    ]);
    inputBox.insertBefore(bar, inputBox.firstChild);
  }
  updateStatusBar(bar);
}

function updateStatusBar(bar) {
  if (!bar) return;
  const ws = readWorkspaceInfo();
  const diff = readLatestDiff();
  const threads = readThreads();

  // 1. Branch item
  const branchBtn = bar.querySelector(".claude-sb-branch");
  if (branchBtn) {
    const parts = [
      el("span", { text: "🌿" }),
      el("span", { class: "claude-statusbar-branch", text: ws.branch || "main" }),
      ws.folderName ? el("span", { class: "claude-thread-row-meta", text: `(${ws.folderName})` }) : null
    ].filter(Boolean);
    branchBtn.replaceChildren(...parts);
  }

  // 2. Diff item
  const diffBtn = bar.querySelector(".claude-sb-diff");
  if (diffBtn) {
    if (diff && (diff.filesCount > 0 || diff.add || diff.del)) {
      const parts = [
        el("span", { text: diff.summary || `${diff.filesCount} changed` }),
        diff.add ? el("span", { class: "claude-diff-stat-add", text: diff.add }) : null,
        diff.del ? el("span", { class: "claude-diff-stat-del", text: diff.del }) : null
      ].filter(Boolean);
      diffBtn.replaceChildren(...parts);
    } else {
      diffBtn.replaceChildren(el("span", { text: "Working tree clean" }));
    }
  }

  // 3. Threads status
  const threadsBtn = bar.querySelector(".claude-sb-threads");
  if (threadsBtn) {
    const working = threads.filter(t => t.status === "working").length;
    const waiting = threads.filter(t => t.status === "waiting").length;
    if (working > 0) {
      const parts = [
        el("span", { class: "claude-overview-dot", style: "background-color: var(--claude-status-working); animation: claude-pulse 1.6s infinite ease-in-out;" }),
        el("span", { text: `${working} working` }),
        waiting > 0 ? el("span", { text: `· ${waiting} waiting` }) : null
      ].filter(Boolean);
      threadsBtn.replaceChildren(...parts);
    } else if (waiting > 0) {
      threadsBtn.replaceChildren(
        el("span", { class: "claude-overview-dot", style: "background-color: var(--claude-status-waiting);" }),
        el("span", { text: `${waiting} waiting` })
      );
    } else {
      threadsBtn.replaceChildren(
        el("span", { text: `Threads (${threads.length})` })
      );
    }
  }
}

/* ── Right Drawer (Claude Image 2 Style) ─────────────────────────────────── */
let drawer = null;

function ensureDrawer() {
  if (drawer && document.body.contains(drawer)) return drawer;
  drawer = el("aside", { id: "claude-right-drawer", "data-collapsed": String(!state.drawerOpen), "aria-label": "Threads" });
  const resizer = el("div", { class: "claude-drawer-resizer" });
  resizer.addEventListener("pointerdown", (e) => {
    resizer.dataset.dragging = "true"; resizer.setPointerCapture(e.pointerId);
    const move = (ev) => {
      state.drawerWidth = Math.max(310, Math.min(580, window.innerWidth - ev.clientX));
      applyBodyFlags();
    };
    const up = () => { resizer.dataset.dragging = "false"; save(); resizer.removeEventListener("pointermove", move); resizer.removeEventListener("pointerup", up); };
    resizer.addEventListener("pointermove", move); resizer.addEventListener("pointerup", up);
  });
  drawer.append(resizer, el("div", { class: "claude-drawer-content" }));
  document.body.append(drawer);
  return drawer;
}

function toggleDrawer(force) {
  state.drawerOpen = typeof force === "boolean" ? force : !state.drawerOpen;
  save(); applyBodyFlags(); render();
}

function openInspector(id, data = null) {
  state.inspecting = id;
  state.inspectingData = data;
  state.inspectorTab = "chat";
  threadCache.delete(id); startPolling(id);
  if (!state.drawerOpen) state.drawerOpen = true;
  save(); applyBodyFlags(); render();
}

function renderThreadRow(t) {
  return el("div", { class: "claude-thread-item", "data-status": t.status, onclick: () => openInspector(t.id, t) }, [
    el("div", { class: "claude-thread-item-icon", text: t.status === "completed" ? "✓" : "" }),
    el("div", { class: "claude-thread-item-content" }, [
      el("div", { class: "claude-thread-item-title", text: t.title }),
      el("div", { class: "claude-thread-item-sub", text: t.isActive ? "Current session" : (t.time ? `Updated ${t.time} ago` : t.id.slice(0, 8)) })
    ]),
    el("div", { class: "claude-thread-item-time", text: t.time || (t.isActive ? "now" : "") })
  ]);
}

function renderOverview(threads) {
  const ws = readWorkspaceInfo();
  const diff = readLatestDiff();
  const library = readLibraryItems();

  // Filter threads by search query if active
  const q = (state.searchQuery || "").toLowerCase().trim();
  const filteredThreads = q ? threads.filter(t => t.title.toLowerCase().includes(q)) : threads;

  const waitingList = filteredThreads.filter(t => t.status === "waiting");
  const workingList = filteredThreads.filter(t => t.status === "working");
  const resolvedList = filteredThreads.filter(t => t.status === "completed");

  const tabTitle = state.tab === "changes" ? "Changes" : (state.tab === "library" ? "Library" : "Threads");

  // Top Drawer Header (Threads dropdown + search + new session + close)
  const menuBtn = el("div", {
    class: "claude-drawer-title-menu",
    onclick: (e) => {
      e.stopPropagation();
      state.showMenu = !state.showMenu;
      render();
    }
  }, [
    el("span", { text: tabTitle }),
    el("span", { style: "font-size: 10px; color: var(--claude-text-muted);", text: "▾" })
  ]);

  // Dropdown Popover Menu for Threads ▾
  if (state.showMenu) {
    const pop = el("div", { class: "claude-drawer-menu-popover", onclick: (e) => e.stopPropagation() }, [
      el("div", {
        class: "claude-drawer-menu-item",
        "data-active": String(state.tab === "threads"),
        onclick: () => { state.tab = "threads"; state.showMenu = false; render(); }
      }, [
        el("span", { text: `${state.tab === "threads" ? "✓ " : "  "}Threads` }),
        el("span", { class: "claude-drawer-menu-count", text: String(threads.length) })
      ]),
      el("div", {
        class: "claude-drawer-menu-item",
        "data-active": String(state.tab === "changes"),
        onclick: () => { state.tab = "changes"; state.showMenu = false; render(); }
      }, [
        el("span", { text: `${state.tab === "changes" ? "✓ " : "  "}Changes` }),
        el("span", { class: "claude-drawer-menu-count", text: String(diff?.filesCount || 0) })
      ]),
      el("div", {
        class: "claude-drawer-menu-item",
        "data-active": String(state.tab === "library"),
        onclick: () => { state.tab = "library"; state.showMenu = false; render(); }
      }, [
        el("span", { text: `${state.tab === "library" ? "✓ " : "  "}Library` }),
        el("span", { class: "claude-drawer-menu-count", text: String(library.length) })
      ])
    ]);
    menuBtn.append(pop);
  }

  // Search component when active (Inline pill between menuBtn and actions, never covers Threads text)
  let searchPill = null;
  if (state.searchOpen) {
    const sInput = el("input", {
      class: "claude-header-inline-search-input",
      placeholder: `Filter ${tabTitle.toLowerCase()}…`,
      value: state.searchQuery,
      oninput: (e) => { state.searchQuery = e.target.value; render(true); },
      onkeydown: (e) => {
        if (e.key === "Escape") {
          state.searchOpen = false;
          state.searchQuery = "";
          render();
        }
      }
    });
    const sIcon = el("span", { class: "claude-header-search-icon", html: ICON_SEARCH });
    const sClose = el("button", {
      class: "claude-header-search-close",
      type: "button",
      title: "Exit search (Esc)",
      html: ICON_CLEAR,
      onclick: (e) => {
        e.stopPropagation();
        state.searchOpen = false;
        state.searchQuery = "";
        render();
      }
    });
    searchPill = el("div", { class: "claude-header-inline-search-pill" }, [sIcon, sInput, sClose]);
  }

  // Header Actions (Search / New / Close)
  const actions = el("div", { class: "claude-drawer-header-actions" }, [
    !state.searchOpen ? el("button", {
      class: "claude-drawer-action-btn",
      type: "button",
      title: "Search & Filter",
      onclick: (e) => {
        e.stopPropagation();
        state.searchOpen = true;
        render();
        setTimeout(() => document.querySelector(".claude-header-inline-search-input")?.focus(), 40);
      }
    }, [el("span", { html: ICON_SEARCH })]) : null,
    el("button", {
      class: "claude-drawer-action-btn",
      type: "button",
      title: "New session",
      onclick: (e) => {
        e.stopPropagation();
        document.querySelector('[data-testid="new-conversation-button"]')?.click();
        setTimeout(() => {
          document.querySelectorAll('[data-testid="agent-input-box"]').forEach(mountStatusBar);
        }, 50);
        setTimeout(() => {
          document.querySelectorAll('[data-testid="agent-input-box"]').forEach(mountStatusBar);
        }, 200);
      }
    }, [el("span", { html: ICON_PLUS })]),
    el("button", {
      class: "claude-drawer-action-btn",
      type: "button",
      title: "Close Overview",
      onclick: (e) => {
        e.stopPropagation();
        toggleDrawer(false);
      }
    }, [el("span", { html: ICON_CLOSE })])
  ]);

  const header = el("div", { class: "claude-drawer-header" }, [
    menuBtn,
    searchPill,
    actions
  ]);

  const body = el("div", { class: "claude-drawer-body" });

  // View 1: Threads Tab
  if (state.tab === "threads") {
    // Welcome Banner (Image 2)
    const welcome = el("div", { class: "claude-drawer-welcome" }, [
      el("h2", { class: "claude-drawer-welcome-h2", text: ws.folderName ? `Welcome, ${ws.folderName}.` : "Welcome." }),
      el("p", { class: "claude-drawer-welcome-sub", text: "Working on things! I'll ping you." })
    ]);
    body.append(welcome);

    // 1. Waiting on you Section
    const waitingBox = el("div", { class: "claude-section-waiting-box" }, [
      el("div", { class: "claude-section-waiting-title", text: `Waiting on you ${waitingList.length}` }),
      el("div", { class: "claude-section-waiting-desc", text: "Decisions, reviews, and permission requests." })
    ]);
    body.append(waitingBox);
    if (waitingList.length) {
      body.append(el("div", { class: "claude-thread-list" }, waitingList.map(renderThreadRow)));
    }

    // 2. Working Section (Accordion)
    const workingHeader = el("div", { class: "claude-accordion-header", onclick: (e) => {
      e.stopPropagation();
      state.workingExpanded = !state.workingExpanded;
      render();
    } }, [
      el("div", { class: "claude-accordion-left" }, [
        el("span", { class: "claude-accordion-chevron", "data-expanded": String(state.workingExpanded), text: "▶" }),
        el("span", { text: "Working" })
      ]),
      el("span", { class: "claude-accordion-count", text: String(workingList.length) })
    ]);
    body.append(workingHeader);
    if (state.workingExpanded) {
      if (workingList.length) {
        const visibleWorking = state.showAllWorking ? workingList : workingList.slice(0, 5);
        body.append(el("div", { class: "claude-thread-list" }, visibleWorking.map(renderThreadRow)));
        if (workingList.length > 5) {
          body.append(el("button", {
            class: "claude-show-more-btn",
            type: "button",
            text: state.showAllWorking ? "Show less" : `Show more (${workingList.length - 5} more)`,
            onclick: (e) => { e.stopPropagation(); state.showAllWorking = !state.showAllWorking; render(); }
          }));
        }
      } else {
        body.append(el("div", { class: "claude-thread-item-sub", style: "padding: 4px 8px;", text: "No active background tasks." }));
      }
    }

    // 3. Resolved Section (Accordion)
    const resolvedHeader = el("div", { class: "claude-accordion-header", onclick: (e) => {
      e.stopPropagation();
      state.resolvedExpanded = !state.resolvedExpanded;
      render();
    } }, [
      el("div", { class: "claude-accordion-left" }, [
        el("span", { class: "claude-accordion-chevron", "data-expanded": String(state.resolvedExpanded), text: "▶" }),
        el("span", { text: "Resolved" })
      ]),
      el("span", { class: "claude-accordion-count", text: String(resolvedList.length) })
    ]);
    body.append(resolvedHeader);
    if (state.resolvedExpanded) {
      if (resolvedList.length) {
        body.append(el("div", { class: "claude-thread-list" }, resolvedList.map(renderThreadRow)));
      } else {
        body.append(el("div", { class: "claude-thread-item-sub", style: "padding: 4px 8px;", text: "No completed sessions yet." }));
      }
    }
  } else if (state.tab === "changes") {
    // View 2: Changes Tab
    if (diff && (diff.files.length || diff.summary)) {
      body.append(el("div", { class: "claude-changes-summary-bar" }, [
        el("div", { class: "claude-changes-summary-stats" }, [
          el("span", { text: diff.summary || `${diff.filesCount} files changed` }),
          diff.add ? el("span", { class: "claude-diff-stat-add", text: diff.add }) : null,
          diff.del ? el("span", { class: "claude-diff-stat-del", text: diff.del }) : null
        ]),
        el("button", {
          class: "claude-review-btn",
          type: "button",
          text: "Review in Main",
          onclick: () => {
            const revBtn = diff.cardEl?.querySelector('[data-testid="changed-files-card-review"]') || diff.cardEl?.querySelector('button');
            revBtn?.click();
          }
        })
      ]));
      const visibleFiles = q ? diff.files.filter(f => f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q)) : diff.files;
      if (visibleFiles.length) {
        const fileList = el("div", { class: "claude-thread-list" });
        visibleFiles.forEach(f => {
          fileList.append(el("div", {
            class: "claude-change-file-card",
            onclick: () => {
              const revBtn = diff.cardEl?.querySelector('[data-testid="changed-files-card-review"]') || diff.cardEl?.querySelector('button');
              revBtn?.click();
            }
          }, [
            el("div", { class: "claude-change-file-info" }, [
              el("span", { class: "claude-change-file-name", text: f.name }),
              el("span", { class: "claude-change-file-path", text: f.path })
            ]),
            el("div", { class: "claude-change-file-stats" }, [
              f.add ? el("span", { class: "claude-diff-stat-add", text: `+${f.add}` }) : null,
              f.del ? el("span", { class: "claude-diff-stat-del", text: `-${f.del}` }) : null
            ])
          ]));
        });
        body.append(fileList);
      }
    } else {
      body.append(el("div", { class: "claude-thread-item-sub", style: "padding: 16px 8px; text-align: center;", text: "No uncommitted file changes in this turn." }));
    }
  } else if (state.tab === "library") {
    // View 3: Library Tab
    const visibleLib = q ? library.filter(it => it.name.toLowerCase().includes(q) || it.path.toLowerCase().includes(q)) : library;
    if (visibleLib.length) {
      const libList = el("div", { class: "claude-library-list" });
      visibleLib.forEach(item => {
        libList.append(el("div", {
          class: "claude-library-item-card",
          title: `Inspect ${item.name}`,
          onclick: () => openInspector(item.name, { title: item.name, desc: item.path, status: "completed" })
        }, [
          el("div", { class: "claude-library-item-left" }, [
            el("span", { class: "claude-library-item-icon", text: "📄" }),
            el("div", { class: "claude-library-item-meta" }, [
              el("div", { class: "claude-library-item-title", text: item.name }),
              el("div", { class: "claude-library-item-path", text: item.path })
            ])
          ]),
          el("span", { class: "claude-library-badge", text: item.type })
        ]));
      });
      body.append(libList);
    } else {
      body.append(el("div", { class: "claude-thread-item-sub", style: "padding: 16px 8px; text-align: center;", text: "No documents found." }));
    }
  }

  return [header, body];
}

/* ── M4: thread chat view, built from getCascadeTrajectory of ANY cascade ── */
const threadCache = new Map(); // id -> { steps, total, loading, error, at }
let cacheVer = 0;
let pollTimer = 0;

async function loadThread(id) {
  const svc = findAgentService();
  const c = threadCache.get(id) || { steps: [], total: 0, loading: false, error: "", at: 0 };
  threadCache.set(id, c);
  if (!svc) { c.error = "Agent service unavailable."; cacheVer++; render(); return; }
  if (c.loading) return;
  c.loading = true;
  try {
    const res = await svc.getCascadeTrajectory({ cascadeId: id });
    c.steps = res?.trajectory?.steps || [];
    c.total = res?.numTotalSteps || c.steps.length;
    c.error = "";
  } catch (e) { c.error = String(e?.message || e); }
  c.loading = false; c.at = Date.now(); cacheVer++;
  render();
}

function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = 0; } }
function startPolling(id) {
  stopPolling();
  pollTimer = setInterval(() => {
    const th = readThreads().find(x => x.id === id);
    if (state.inspecting === id && ((th && th.status === "working") || Date.now() < (state.pollUntil || 0))) loadThread(id);
  }, 3000);
}

const FILE_KEYS = ["absolutePathUri", "targetFile", "filePath", "path", "uri"];
const SUMMARY_KEYS = ["commandLine", "query", "url", "searchPath", "pattern", "description", "task", "name"];
function stepFile(v) {
  for (const k of FILE_KEYS) if (typeof v?.[k] === "string" && v[k]) {
    const p = decodeURIComponent(v[k].replace(/^file:\/\/\/?/, ""));
    return p;
  }
  return "";
}
function stepLabel(x) {
  const c = x.step?.case || "step";
  const v = x.step?.value || {};
  const ts = x.metadata?.toolSummary;
  const file = stepFile(v);
  let arg = file ? file.split(/[\/\\]/).pop() : "";
  if (!arg) for (const k of SUMMARY_KEYS) if (typeof v[k] === "string" && v[k]) { arg = v[k]; break; }
  const name = c.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase()).trim();
  return { name: ts || name, arg: arg.replace(/\s+/g, " ").slice(0, 120), file, kind: c };
}
/* ── helpers: timestamps, tool classification, markdown ─────────────────── */
const SKIP_CASES = new Set(["ephemeralMessage", "checkpoint", "conversationHistory", "knowledgeGeneration", "systemMessage", "errorMessage"]);
const tsMs = (t) => t ? Number(t.seconds || 0) * 1000 + Math.floor((t.nanos || 0) / 1e6) : 0;
function fmtDur(ms) {
  const s = Math.max(1, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}
function toolCat(c) {
  if (c === "runCommand") return "cmd";
  if (c === "codeAction") return "edit";
  if (c === "searchWeb" || c === "readUrlContent") return "web";
  if (/view|list|grep|find|search|read|dir/i.test(c)) return "read";
  if (c === "invokeSubagent") return "agent";
  return "other";
}
const CAT_LABEL = { cmd: "Ran commands", edit: "Edited files", web: "Browsed the web", read: "Explored files", agent: "Ran subagents", other: "Used tools" };
function fileOf(x) {
  const v = x.step?.value || {};
  if (x.step?.case === "codeAction") {
    return decodeURIComponent((v.actionResult?.result?.value?.absoluteUri || v.actionSpec?.spec?.value?.path?.absoluteUri || "").replace(/^file:\/\/\/?/, ""));
  }
  return stepFile(v);
}
function toolLine(x) {
  const c = x.step?.case, v = x.step?.value || {}, file = fileOf(x);
  const base = file ? file.split(/[\/\\]/).pop() : "";
  if (c === "runCommand") return { verb: "Running", name: "Ran", arg: (v.commandLine || v.proposedCommandLine || "").replace(/\s+/g, " ").slice(0, 140), file };
  if (c === "codeAction") { const d = v.diffStats || {}; return { verb: "Editing", name: "Edited", arg: base, file, add: d.additions || 0, del: d.deletions || 0 }; }
  if (c === "searchWeb") return { verb: "Searching", name: "Searched", arg: v.query || "", file };
  if (c === "readUrlContent") return { verb: "Fetching", name: "Fetched", arg: v.url || "", file };
  if (c === "viewFile") return { verb: "Reading", name: "Read", arg: base, file };
  const s = stepLabel(x);
  return { verb: s.name, name: s.name, arg: s.arg, file };
}
function firstSentence(s, max = 90) {
  const t = (s || "").replace(/```[\s\S]*?```/g, " ").replace(/[`*_#>]/g, "").replace(/\s+/g, " ").trim();
  const m = /^(.+?[.!?。！？])(\s|$)/.exec(t);
  let r = m ? m[1] : t;
  if (r.length > max) r = r.slice(0, max - 1) + "…";
  return r;
}

const escHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const isStepHandler = o => o && typeof o === "object" && (typeof o.openFile === "function" || typeof o.getFileIcon === "function");
let cachedStepCtx = null;
function findStepCtx() {
  if (cachedStepCtx) return cachedStepCtx;
  const cv = document.querySelector('[data-testid="conversation-view"]');
  let f = getFiber(cv);
  for (let d = 0; f && d < 160; d++, f = f.return) {
    let dep = f.dependencies?.firstContext;
    for (let i = 0; dep && i < 30; i++, dep = dep.next) {
      const v = dep.memoizedValue;
      if (v && typeof v === "object" && isStepHandler(v.stepHandler)) { cachedStepCtx = v; return v; }
    }
  }
  return null;
}

const EXT_ICON = {
  js: "js", mjs: "js", cjs: "js", ts: "ts", jsx: "react", tsx: "react-ts", css: "brackets-sky", scss: "sass", sass: "sass", less: "less",
  json: "brackets-yellow", html: "code-orange", htm: "code-orange", md: "markdown", mdx: "mdx", py: "python", go: "go", rs: "rust",
  java: "java", kt: "kotlin", c: "c", h: "h", cpp: "cplus", cc: "cplus", cs: "csharp", rb: "ruby", php: "php", swift: "swift",
  sh: "shell", bash: "shell", zsh: "shell", ps1: "shell", bat: "shell", cmd: "shell", yml: "yaml", yaml: "yaml", xml: "xml",
  sql: "database", db: "database", svg: "svg", png: "image", jpg: "image", jpeg: "image", gif: "gif", webp: "image", ico: "image",
  pdf: "pdf", txt: "document", lock: "lock", env: "gear", vue: "vue", svelte: "svelte", astro: "astro", proto: "proto"
};
function fileIconName(name) {
  const lower = (name || "").toLowerCase();
  if (lower === "tsconfig.json") return "tsconfig";
  if (lower.startsWith("dockerfile")) return "docker";
  const ext = lower.includes(".") ? lower.split(".").pop() : "";
  return EXT_ICON[ext] || "document";
}
function renderFilePillHtml(label, rawUri) {
  const clean = rawUri.replace(/&amp;/g, "&");
  const [noHash, hash] = clean.split("#");
  const fsPath = decodeURIComponent(noHash.replace(/^file:\/\/\/?/, "")).replace(/\//g, "\\");
  const base = (label || fsPath.split(/[\\/]/).pop() || fsPath).replace(/^`|`$/g, "");
  const lineSuffix = hash && /^L\d+/i.test(hash) ? `<span class="text-muted-foreground ml-0.5">#${escHtml(hash)}</span>` : "";
  const icon = fileIconName(base.split("#")[0]);
  return `<span class="context-scope-mention" data-quotable-inline="true"><button class="select-none inline-flex items-baseline align-baseline text-sm font-medium inline-pill gap-0.5 rounded-md p-0.5 text-foreground cursor-pointer hover:bg-secondary transition-[background-color,opacity]" title="${escHtml(fsPath)}" data-uri="${escHtml(clean)}" type="button"><span class="inline-flex self-center shrink-0 items-center justify-center"><div class="flex shrink-0"><img src="/symbols-icons/icons/files/${icon}.svg" width="16" height="16" style="min-width:16px;min-height:16px;display:inline-block;"></div></span><span class="inline-flex items-baseline gap-1 break-all leading-tight select-text text-left">${escHtml(base)}${lineSuffix}</span></button></span>`;
}

function mdInline(src) {
  const links = []; const codes = [];
  // 1) Stash markdown links [label](url) BEFORE inline-code splitting so [`symbol`](file:///...) works
  let s = src.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, url) => {
    const id = links.length;
    if (/^file:\/\//i.test(url)) links.push(renderFilePillHtml(label, url));
    else if (/^conversation:\/\//i.test(url)) {
      const cid = url.replace(/^conversation:\/\/\/?/, "");
      links.push(`<button type="button" class="select-none inline-flex items-baseline align-baseline text-sm font-medium inline-pill gap-0.5 rounded-md p-0.5 text-foreground cursor-pointer hover:bg-secondary" data-cid="${escHtml(cid)}">${escHtml(label)}</button>`);
    } else links.push(`<a href="${escHtml(url)}" target="_blank" rel="noopener noreferrer">${escHtml(label)}</a>`);
    return `\u0001${id}\u0001`;
  });
  s = escHtml(s);
  s = s.replace(/`([^`]+)`/g, (m, c) => { codes.push(c); return "\u0000" + (codes.length - 1) + "\u0000"; });
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
  s = s.replace(/\u0000(\d+)\u0000/g, (m, i) => "<code>" + codes[i] + "</code>");
  return s.replace(/\u0001(\d+)\u0001/g, (m, i) => links[i]);
}
function mdToHtml(text) {
  const lines = (text || "").replace(/\r/g, "").split("\n");
  const out = []; let i = 0;
  while (i < lines.length) {
    const ln = lines[i];
    if (/^```/.test(ln)) {
      const buf = []; i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++; out.push("<pre><code>" + escHtml(buf.join("\n")) + "</code></pre>"); continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(ln);
    if (h) { out.push(`<h${h[1].length + 2}>${mdInline(h[2])}</h${h[1].length + 2}>`); i++; continue; }
    if (/^\s*([-*_])\1{2,}\s*$/.test(ln)) { out.push("<hr>"); i++; continue; }
    if (/^\s*>/.test(ln)) {
      const buf = []; while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ""));
      out.push("<blockquote>" + mdInline(buf.join(" ")) + "</blockquote>"); continue;
    }
    if (/^\s*\|.*\|\s*$/.test(ln) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] || "")) {
      const cells = (r) => r.trim().replace(/^\||\|$/g, "").split("|").map(c => mdInline(c.trim()));
      const head = cells(ln); i += 2; const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]));
      out.push("<table><thead><tr>" + head.map(c => `<th>${c}</th>`).join("") + "</tr></thead><tbody>" +
        rows.map(r => "<tr>" + r.map(c => `<td>${c}</td>`).join("") + "</tr>").join("") + "</tbody></table>"); continue;
    }
    const li = /^(\s*)([-*•]|\d+[.)])\s+(.*)$/.exec(ln);
    if (li) {
      const ordered = /\d/.test(li[2]); const items = [];
      while (i < lines.length) {
        const m = /^(\s*)([-*•]|\d+[.)])\s+(.*)$/.exec(lines[i]);
        if (!m) break; items.push(mdInline(m[3])); i++;
      }
      out.push((ordered ? "<ol>" : "<ul>") + items.map(x => `<li>${x}</li>`).join("") + (ordered ? "</ol>" : "</ul>")); continue;
    }
    if (!ln.trim()) { i++; continue; }
    const buf = [];
    while (i < lines.length && lines[i].trim() && !/^(```|#{1,4}\s|\s*>|\s*([-*•]|\d+[.)])\s)/.test(lines[i])) buf.push(lines[i++]);
    out.push("<p>" + mdInline(buf.join("\n")).replace(/\n/g, "<br>") + "</p>");
  }
  return out.join("");
}
function renderMd(text) {
  const node = el("div", { class: "claude-md", html: mdToHtml(text) });
  node.querySelectorAll("button[data-uri]").forEach(btn => {
    const uri = btn.getAttribute("data-uri");
    const ctx = findStepCtx();
    const customIcon = ctx?.stepHandler?.getFileIcon?.(uri.split("#")[0], false);
    if (customIcon instanceof Node) {
      const holder = btn.querySelector("div.flex.shrink-0");
      if (holder) holder.replaceChildren(customIcon.cloneNode(true));
    }
    btn.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      const [u, h] = uri.split("#");
      const m = /^L(\d+)(?:-L?(\d+))?$/i.exec(h || "");
      const sh = findStepCtx()?.stepHandler;
      if (sh?.openFile) {
        sh.openFile(u, m ? parseInt(m[1], 10) - 1 : undefined, m && m[2] ? parseInt(m[2], 10) - 1 : undefined, false, { event: e, useExternalBrowser: false });
      }
    });
  });
  node.querySelectorAll("button[data-cid]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      const cid = btn.getAttribute("data-cid");
      const th = readThreads().find(t => t.id === cid);
      openInspector(cid, th || { id: cid, title: btn.textContent || cid });
    });
  });
  return node;
}

/* ── Thread chat: user bubbles, "Worked for Ns" folds, final answer ─────── */
const openKeys = new Map();
function collapsible(key, label, build, defOpen, cls, extra) {
  let open = openKeys.has(key) ? openKeys.get(key) : defOpen;
  const wrap = el("div", { class: cls });
  const head = el("button", { type: "button", class: cls + "-head" }, [
    el("span", { class: cls + "-label", text: label }), extra || null,
    el("span", { class: "claude-chev", html: ICON_CHEV })
  ]);
  const body = el("div", { class: cls + "-body" });
  const apply = () => {
    wrap.dataset.open = String(open);
    if (open && !body.firstChild) body.append(...[].concat(build()).filter(Boolean));
    body.style.display = open ? "" : "none";
  };
  head.addEventListener("click", () => { open = !open; openKeys.set(key, open); apply(); });
  wrap.append(head, body); apply(); return wrap;
}

function buildTurns(steps) {
  const turns = []; let cur = null;
  const newTurn = (user) => { cur = { user, items: [], t0: 0, t1: 0 }; turns.push(cur); };
  for (const x of steps) {
    const c = x.step?.case, v = x.step?.value || {};
    if (c === "userInput") { newTurn((v.userResponse || v.query || "").trim()); continue; }
    if (!c || SKIP_CASES.has(c)) continue;
    if (!cur) newTurn("");
    const m = x.metadata || {};
    const a = tsMs(m.createdAt), b = tsMs(m.completedAt) || tsMs(m.finishedGeneratingAt) || a;
    if (a && (!cur.t0 || a < cur.t0)) cur.t0 = a;
    if (b > cur.t1) cur.t1 = b;
    if (c === "plannerResponse") {
      const think = (v.thinking || "").trim(), say = (v.modifiedResponse || v.response || "").trim();
      if (think) cur.items.push({ k: "think", text: think, ms: Math.max(0, (tsMs(m.finishedGeneratingAt) || b) - (tsMs(m.startedAt) || a)) });
      if (say) cur.items.push({ k: "say", text: say });
    } else cur.items.push({ k: "tool", x, cat: toolCat(c) });
  }
  return turns;
}

function toolRow(x) {
  const s = toolLine(x);
  return el("div", { class: "claude-tchat-tool", title: s.file || s.arg }, [
    el("span", { class: "claude-tchat-tool-name", text: s.name }),
    s.arg ? el("span", { class: "claude-tchat-tool-arg", text: s.arg }) : null,
    s.add || s.del ? el("span", { class: "claude-tchat-tool-stat" }, [
      s.add ? el("span", { class: "claude-diff-stat-add", text: `+${s.add}` }) : null,
      s.del ? el("span", { class: "claude-diff-stat-del", text: `-${s.del}` }) : null
    ]) : null
  ]);
}

function renderChat(c, id, working) {
  const wrap = el("div", { class: "claude-tchat" });
  const mode = state.viewMode;
  const turns = buildTurns(c.steps);
  turns.forEach((turn, ti) => {
    if (turn.user) wrap.append(el("div", { class: "claude-tchat-user" }, [el("div", { class: "claude-tchat-user-bubble", text: turn.user })]));
    const items = turn.items.slice();
    const last = items[items.length - 1];
    const final = last && last.k === "say" ? items.pop() : null;
    const ongoing = working && ti === turns.length - 1 && !final;
    if (items.length) {
      const dur = turn.t1 > turn.t0 ? ` for ${fmtDur(turn.t1 - turn.t0)}` : "";
      wrap.append(collapsible(`${id}|${ti}`, ongoing ? "Working…" : `Worked${dur}`, () => {
        const rows = []; let gi = 0;
        for (let k = 0; k < items.length; k++) {
          const it = items[k];
          if (it.k === "think") {
            rows.push(collapsible(`${id}|${ti}|t${k}`, `Thought${it.ms > 500 ? " for " + fmtDur(it.ms) : ""}`, () => [renderMd(it.text)], mode !== "normal", "claude-tw-row"));
          } else if (it.k === "say") {
            rows.push(renderMd(it.text));
          } else {
            const grp = [it]; while (items[k + 1] && items[k + 1].k === "tool" && items[k + 1].cat === it.cat) grp.push(items[++k]);
            rows.push(collapsible(`${id}|${ti}|g${gi++}|${k}`, CAT_LABEL[it.cat], () => grp.map(g => toolRow(g.x)), mode === "verbose", "claude-tw-row"));
          }
        }
        return rows;
      }, ongoing || mode !== "normal", "claude-tw"));
    }
    if (final) wrap.append(el("div", { class: "claude-tchat-assistant" }, [renderMd(final.text)]));
  });
  if (!wrap.children.length) wrap.append(el("div", { class: "claude-thread-item-sub", text: "No messages yet." }));
  return wrap;
}

function renderFiles(c) {
  const map = new Map();
  for (const x of c.steps) {
    const cs = x.step?.case; if (SKIP_CASES.has(cs)) continue;
    const s = toolLine(x);
    if (!s.file) continue;
    const e = map.get(s.file) || { edited: false, add: 0, del: 0 };
    if (cs === "codeAction") { e.edited = true; e.add += s.add || 0; e.del += s.del || 0; }
    map.set(s.file, e);
  }
  if (!map.size) return el("div", { class: "claude-thread-item-sub", text: "This thread did not touch any files." });
  const list = el("div", { class: "claude-thread-list" });
  [...map.entries()].sort((a, b) => b[1].edited - a[1].edited).forEach(([p, e]) => {
    list.append(el("div", { class: "claude-change-file-card" }, [
      el("div", { class: "claude-change-file-info" }, [
        el("span", { class: "claude-change-file-name", text: p.split(/[\/\\]/).pop() }),
        el("span", { class: "claude-change-file-path", text: p })
      ]),
      el("div", { class: "claude-change-file-stats" }, e.edited
        ? [e.add ? el("span", { class: "claude-diff-stat-add", text: `+${e.add}` }) : null, e.del ? el("span", { class: "claude-diff-stat-del", text: `-${e.del}` }) : null].filter(Boolean)
        : [el("span", { text: "read" })])
    ]));
  });
  return list;
}
function renderInspector(t) {
  const tabs = [["chat", "Chat"], ["activity", "Activity"], ["files", "Files"]];
  if (!tabs.some(x => x[0] === state.inspectorTab)) state.inspectorTab = "chat";
  const id = state.inspecting;
  const title = t?.title || state.inspectingData?.title || id;
  const status = t?.status || state.inspectingData?.status || "completed";
  const c = threadCache.get(id);
  if (!c) loadThread(id);

  const top = el("div", { class: "claude-inspector-topbar" }, [
    el("div", { class: "claude-inspector-nav" }, [
      el("button", {
        class: "claude-back-btn", type: "button", text: "← Back",
        onclick: () => { stopPolling(); state.inspecting = null; state.inspectingData = null; render(); }
      })
    ]),
    el("div", { class: "claude-inspector-title-row" }, [
      el("span", { class: "claude-inspector-title", text: title }),
      el("span", { class: "claude-thread-capsule-dot", "data-status": status })
    ]),
    el("div", { class: "claude-inspector-tabs" }, tabs.map(([k, label]) => el("button", {
      class: "claude-inspector-tab", "data-active": String(state.inspectorTab === k), type: "button", text: label,
      onclick: () => { state.inspectorTab = k; render(); }
    })))
  ]);

  const body = el("div", { class: "claude-drawer-body" });
  if (!c || (c.loading && !c.steps.length)) body.append(el("div", { class: "claude-thread-item-sub", text: "Loading thread…" }));
  else if (c.error && !c.steps.length) body.append(el("div", { class: "claude-thread-item-sub", text: c.error }));
  else if (state.inspectorTab === "chat") body.append(renderChat(c, id, status === "working"));
  else if (state.inspectorTab === "activity") {
    const tools = c.steps.filter(x => x.step?.case && x.step.case !== "userInput" && x.step.case !== "plannerResponse" && !SKIP_CASES.has(x.step.case));
    if (!tools.length) body.append(el("div", { class: "claude-thread-item-sub", text: "No tool steps." }));
    else body.append(el("div", { class: "claude-tchat-tools" }, tools.map(toolRow)));
  } else body.append(renderFiles(c));
  return [top, body];
}
/* ── M4: agentService discovery (React Fiber walk; verified in renderer bundle:
   RTK/props carry `agentService` exposing getCascadeTrajectory({cascadeId, verbosity})) ── */
let cachedAgentService = null;
function isAgentService(o) { return o && typeof o === "object" && typeof o.getCascadeTrajectory === "function"; }
function scanValue(v, depth = 0, seen = new Set(), pred = isAgentService) {
  if (!v || typeof v !== "object" || depth > 3 || seen.has(v)) return null;
  seen.add(v);
  if (pred(v)) return v;
  if (pred === isAgentService && isAgentService(v.agentService)) return v.agentService;
  if (depth < 3) for (const k of Object.keys(v).slice(0, 40)) {
    try { const r = scanValue(v[k], depth + 1, seen, pred); if (r) return r; } catch (_) {}
  }
  return null;
}
/* Composer service (verified in bundle): { sendMessage, resolveConfig, getCurrentModelConfig, getEditorState } */
const isComposerSvc = o => o && typeof o === "object" && typeof o.sendMessage === "function" && typeof o.resolveConfig === "function" && typeof o.getCurrentModelConfig === "function";
function findComposerService() {
  const anchors = [document.querySelector('[data-testid="agent-input-box"]'), document.querySelector('[data-testid="conversation-view"]')].filter(Boolean);
  for (const a of anchors) {
    let f = getFiber(a);
    for (let d = 0; f && d < 160; d++, f = f.return) {
      let r = scanValue(f.memoizedProps, 0, new Set(), isComposerSvc);
      if (!r) { let dep = f.dependencies?.firstContext; for (let i = 0; dep && i < 30 && !r; i++, dep = dep.next) r = scanValue(dep.memoizedValue, 0, new Set(), isComposerSvc); }
      if (r) return r;
    }
  }
  return null;
}
async function sendToThread(id, text) {
  const pick = threadModels[id];
  const override = pick ? listModels().find(m => m.label === pick) : undefined;
  const svc = findComposerService();
  if (!svc) throw new Error("Composer service not found. Open any conversation first.");
  const cascadeConfig = svc.resolveConfig({ cascadeId: id, modelConfigOverride: override, currentModelConfig: svc.getCurrentModelConfig() });
  const editorState = await svc.getEditorState();
  await svc.sendMessage({ cascadeId: id, items: [{ chunk: { case: "text", value: text } }], media: [], cascadeConfig, editorState });
  state.pollUntil = Date.now() + 120000;
  await loadThread(id);
}
function findAgentService() {
  if (cachedAgentService) return cachedAgentService;
  const anchors = [document.querySelector('[data-testid="conversation-view"]'), document.querySelector('[data-testid="conversation-row-sidebar"]'), document.body].filter(Boolean);
  for (const a of anchors) {
    let f = getFiber(a);
    for (let d = 0; f && d < 120; d++, f = f.return) {
      let r = scanValue(f.memoizedProps);
      if (!r) { let h = f.memoizedState; for (let i = 0; h && i < 30 && !r; i++, h = h.next) r = scanValue(h.memoizedState); }
      if (!r) { let dep = f.dependencies?.firstContext; for (let i = 0; dep && i < 30 && !r; i++, dep = dep.next) r = scanValue(dep.memoizedValue); }
      if (r) { cachedAgentService = r.agentService && !isAgentService(r) ? r.agentService : r; return cachedAgentService; }
    }
  }
  return null;
}
/* ── Per-thread model choice (verified: resolveConfig({modelConfigOverride:{label,value}}) ) ── */
const threadModels = plugin.storage.get("threadModels", {});
function listModels() {
  const cfgs = getStore()?.getState?.()?.userStatus?.cascadeModelConfigData?.clientModelConfigs || [];
  return cfgs.filter(c => !c.disabled && c.modelOrAlias?.choice?.case === "model" && c.modelOrAlias.choice.value)
    .map(c => ({ label: c.label, value: c.modelOrAlias.choice.value }));
}
const ICON_CHEV = '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l4 4 4-4"/></svg>';
const ICON_SEND = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8h10M9 4l4 4-4 4"/></svg>';
const ICON_CHECK = '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5l3 3 6-7"/></svg>';

function splitModelLabel(label) {
  const m = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(label || "");
  return m ? { name: m[1], tier: m[2] } : { name: label || "", tier: "" };
}
function mainModelText() {
  return document.querySelector('[data-testid="model-selector-trigger"]')?.firstElementChild?.textContent?.trim()
    || document.querySelector('[data-testid="model-selector-trigger"]')?.textContent?.trim() || "Model";
}

function buildThreadFooter(id) {
  const TW = "flex cursor-pointer items-center h-7 gap-1 rounded-full pl-2 pr-1 text-xs text-secondary-foreground select-none outline-none hover:bg-secondary transition-colors min-w-0 max-w-full";
  const input = el("textarea", {
    class: "claude-thread-composer-input w-full resize-none bg-transparent leading-6 p-2 outline-none text-sm",
    rows: "1", placeholder: "Reply to this thread…", spellcheck: "false", "aria-label": "Message input"
  });
  const autosize = () => { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 300) + "px"; };

  const pillLabel = () => {
    const pick = threadModels[id];
    if (!pick) return el("span", { class: "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap", text: mainModelText() });
    const { name, tier } = splitModelLabel(pick);
    return el("span", { class: "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap" }, [name, tier ? el("span", { class: "opacity-70", text: " " + tier }) : null]);
  };
  const pill = el("button", { type: "button", class: TW, "aria-haspopup": "menu", "aria-expanded": "false", title: "Select model for this thread" });
  const refreshPill = () => pill.replaceChildren(pillLabel(), el("span", { html: ICON_CHEV, style: "display:inline-flex;opacity:.7;" }));
  refreshPill();

  let menu = null;
  const escClose = (e) => { if (e.key === "Escape" && menu) { e.stopPropagation(); closeMenu(); } };
  const closeMenu = () => { if (menu) { document.removeEventListener("keydown", escClose, true); menu.remove(); menu = null; pill.setAttribute("aria-expanded", "false"); document.removeEventListener("mousedown", outside, true); } };
  const outside = (e) => { if (menu && !menu.contains(e.target) && !pill.contains(e.target)) closeMenu(); };
  const choose = (label) => {
    if (label) threadModels[id] = label; else delete threadModels[id];
    plugin.storage.set("threadModels", threadModels);
    refreshPill(); closeMenu();
  };
  const openMenu = () => {
    if (menu) return closeMenu();
    const current = threadModels[id] || "";
    const item = (label, text, tier) => el("button", {
      type: "button", class: "claude-model-item", "data-selected": String(label === current), onclick: () => choose(label)
    }, [
      el("span", { class: "claude-model-item-label" }, [text, tier ? el("span", { class: "opacity-70", text: " " + tier }) : null]),
      label === current ? el("span", { html: ICON_CHECK, style: "display:inline-flex;" }) : null
    ]);
    menu = el("div", { class: "claude-model-menu", role: "menu" }, [
      item("", "Same as main", ""),
      el("div", { class: "claude-model-sep" }),
      ...listModels().map(m => { const s = splitModelLabel(m.label); return item(m.label, s.name, s.tier); })
    ]);
    footer.append(menu);
    pill.setAttribute("aria-expanded", "true");
    document.addEventListener("keydown", escClose, true);
    setTimeout(() => document.addEventListener("mousedown", outside, true), 0);
  };
  pill.addEventListener("click", openMenu);

  const send = el("button", {
    type: "button", "aria-label": "Send message", disabled: "true",
    class: "claude-thread-send w-7 h-7 rounded-full cursor-pointer flex items-center justify-center transition-colors", html: ICON_SEND
  });
  const msg = el("div", { class: "claude-thread-composer-msg", style: "display:none;" });
  const sync = () => { send.disabled = !input.value.trim() || send.dataset.busy === "1"; };
  const submit = async () => {
    const text = input.value.trim();
    if (!text || send.dataset.busy === "1") return;
    send.dataset.busy = "1"; sync(); input.readOnly = true; msg.style.display = "none";
    try { await sendToThread(id, text); input.value = ""; autosize(); }
    catch (e) { msg.textContent = "Send failed: " + (e?.message || e); msg.style.display = "block"; }
    send.dataset.busy = "0"; input.readOnly = false; sync(); input.focus();
  };
  input.addEventListener("input", () => { autosize(); sync(); });
  input.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); } });
  send.addEventListener("click", submit);

  const card = el("div", { class: "surface-composer relative flex flex-col p-px rounded-2xl bg-card-border" }, [
    el("div", { class: "surface-composer-card relative z-[1] flex flex-col gap-0 p-1 rounded-2xl bg-card" }, [
      input,
      el("div", { class: "flex w-full items-center justify-between gap-1 p-0.5" }, [
        el("div", { class: "flex min-w-0 flex-1 items-center" }, [pill]),
        el("div", { class: "shrink-0 flex items-center gap-0.5" }, [send])
      ])
    ])
  ]);
  const footer = el("div", { class: "claude-inspector-footer", "data-thread": id }, [card, msg]);
  return footer;
}
let lastSig = "";
function render(force = true) {
  const d = ensureDrawer();
  d.dataset.collapsed = String(!state.drawerOpen);
  const threads = readThreads();
  const diff = readLatestDiff();

  const trig = document.getElementById("claude-overview-trigger");
  if (trig) {
    trig.dataset.open = String(state.drawerOpen);
  }
  if (!state.drawerOpen) return;

  const sig = JSON.stringify([cacheVer, state.tab, state.inspecting, state.inspectorTab, state.workingExpanded, state.resolvedExpanded, threads.map(t => [t.id, t.status, t.title, t.isActive]), diff?.summary, diff?.add, diff?.del]);
  if (!force && sig === lastSig) return;
  lastSig = sig;

  const content = d.querySelector(".claude-drawer-content");
  if (!state.inspecting) { content.replaceChildren(...renderOverview(threads)); return; }
  const id = state.inspecting;
  const oldBody = content.querySelector(".claude-drawer-body");
  const stick = !oldBody || oldBody.scrollHeight - oldBody.scrollTop - oldBody.clientHeight < 40;
  const keepTop = oldBody ? oldBody.scrollTop : 0;
  const [top, body] = renderInspector(threads.find(t => t.id === id));
  let footer = content.querySelector(`.claude-inspector-footer[data-thread="${id}"]`);
  if (footer) {
    [...content.children].forEach(ch => { if (ch !== footer) ch.remove(); });
    content.insertBefore(body, footer); content.insertBefore(top, body);
  } else content.replaceChildren(top, body, buildThreadFooter(id));
  body.scrollTop = stick ? body.scrollHeight : keepTop;
}

/* ── Boot ───────────────────────────────────────────────────────────────── */
let timer = 0;
function boot() {
  applyBodyFlags();
  plugin.dom.observe('[data-testid="titlebar-more-actions"]', (btn) => { mountTitlebar(btn); applyBodyFlags(); render(); });
  plugin.dom.observe('[data-testid="toggle-aux-sidebar"]', (btn) => { mountTitlebar(btn); applyBodyFlags(); render(); });
  plugin.dom.observe('[data-testid="agent-input-box"]', (box) => { mountStatusBar(box); });
  plugin.dom.observe('[data-testid="thinking-collapsible-trigger"]', (btn) => {
    if ((state.viewMode === "thinking" || state.viewMode === "verbose") && btn.getAttribute("aria-expanded") === "false") {
      btn.click();
    }
  });
  plugin.dom.observe('[data-testid="worked-for-collapsible"]', (btn) => {
    if ((state.viewMode === "thinking" || state.viewMode === "verbose") && btn.getAttribute("aria-expanded") === "false") {
      btn.click();
    }
  });
  plugin.dom.observe('[data-testid="tool-group-collapsible"]', (btn) => {
    if (state.viewMode === "verbose" && btn.getAttribute("aria-expanded") === "false") {
      btn.click();
    }
  });
  setTimeout(() => {
    const bar = document.querySelector('[data-testid="window-titlebar"]');
    if (bar) { mountTitlebar(bar); render(); }
  }, 4000);
  window.addEventListener("keydown", onKey, true);
  window.addEventListener("resize", applyBodyFlags);
  window.addEventListener("click", () => {
    if (state.showMenu) { state.showMenu = false; render(); }
  });
  timer = setInterval(() => {
    render(false);
    decorateChatStream();
    document.querySelectorAll('[data-testid="agent-input-box"]').forEach(mountStatusBar);
  }, 1200);
  render();
  setTimeout(() => {
    applyTranscriptFolding(state.viewMode);
    decorateChatStream();
  }, 500);
  plugin.log.info("Claude Code Workspace M3 active: Chat Capsules + Multi-View Overview & Library.");
}
if (document.body) boot();
else document.addEventListener("DOMContentLoaded", boot, { once: true });

plugin.onDispose(() => {
  document.removeEventListener("DOMContentLoaded", boot);
  clearInterval(timer);
  window.removeEventListener("keydown", onKey, true);
  window.removeEventListener("resize", applyBodyFlags);
  document.querySelectorAll(".claude-titlebar-controls, #claude-right-drawer, .claude-composer-statusbar").forEach(n => n.remove());
  for (const k of ["claudeViewMode", "claudeDrawerOpen"]) delete document.body.dataset[k];
});