/* TaskFlow — v5
   Fixes requested:
   - Content bottom padding so tasks never hide under toast/footer
   - Favicon handled in HTML
   - Tab exclamation reminder when page is hidden AND tasks remain
   - Add List section (inline input + button)
   - Delete list deletes all tasks for that list
   - List warnings: show overdue / due-soon counts per list
   - Dark mode select dropdown readability improved via CSS (options)
*/

const STORAGE_KEY = "taskflow_major_ui_v5";

// thresholds
const NEW_TASK_HOURS = 24;
const DUE_SOON_HOURS = 48;

const BASE_TITLE = "TaskFlow";

const $ = (id) => document.getElementById(id);
const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const uid = () => Math.random().toString(16).slice(2) + Date.now().toString(16);

const els = {
  scrim: $("scrim"),
  sidebar: $("sidebar"),
  openSidebarBtn: $("openSidebarBtn"),
  closeSidebarBtn: $("closeSidebarBtn"),

  lists: $("lists"),
  newListName: $("newListName"),
  createListBtn: $("createListBtn"),

  activeListName: $("activeListName"),
  statsText: $("statsText"),

  moreBtn: $("moreBtn"),
  moreMenu: $("moreMenu"),
  renameListBtn: $("renameListBtn"),
  deleteListBtn: $("deleteListBtn"),

  themeBtn: $("themeBtn"),
  exportBtn: $("exportBtn"),
  importInput: $("importInput"),

  searchInput: $("searchInput"),
  clearSearchBtn: $("clearSearchBtn"),

  taskTitle: $("taskTitle"),
  addBtn: $("addBtn"),
  detailsBtn: $("detailsBtn"),
  detailsPanel: $("detailsPanel"),
  taskDue: $("taskDue"),
  taskPriority: $("taskPriority"),
  taskTags: $("taskTags"),

  sortSelect: $("sortSelect"),
  segBtns: qsa(".segBtn"),

  emptyState: $("emptyState"),
  taskList: $("taskList"),

  modal: $("modal"),
  closeModalBtn: $("closeModalBtn"),
  cancelEditBtn: $("cancelEditBtn"),
  saveEditBtn: $("saveEditBtn"),
  deleteTaskBtn: $("deleteTaskBtn"),

  editTitle: $("editTitle"),
  editDue: $("editDue"),
  editPriority: $("editPriority"),
  editTags: $("editTags"),

  toast: $("toast"),
  toastMsg: $("toastMsg"),
  toastUndoBtn: $("toastUndoBtn"),
  toastCloseBtn: $("toastCloseBtn"),

  dialog: $("dialog"),
  dialogTitle: $("dialogTitle"),
  dialogMsg: $("dialogMsg"),
  dialogInputWrap: $("dialogInputWrap"),
  dialogInputLabel: $("dialogInputLabel"),
  dialogInput: $("dialogInput"),
  dialogHint: $("dialogHint"),
  dialogCloseBtn: $("dialogCloseBtn"),
  dialogCancelBtn: $("dialogCancelBtn"),
  dialogOkBtn: $("dialogOkBtn"),
};

function parseTags(input) {
  return (input || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function fmtDue(due) {
  if (!due) return "";
  const d = new Date(due + "T00:00:00");
  return d.toLocaleDateString([], { month: "short", day: "2-digit", year: "numeric" });
}

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function priorityRank(p) {
  if (p === "high") return 3;
  if (p === "med") return 2;
  return 1;
}

function hoursSince(ms) {
  return (Date.now() - ms) / (1000 * 60 * 60);
}

function dueInfo(dueISO) {
  if (!dueISO) return { hoursUntil: null, isDueSoon: false, isOverdue: false };
  const dueEnd = new Date(dueISO + "T23:59:59");
  const diffMs = dueEnd.getTime() - Date.now();
  const hoursUntil = diffMs / (1000 * 60 * 60);
  const overdue = hoursUntil < 0;
  const soon = !overdue && hoursUntil <= DUE_SOON_HOURS;
  return { hoursUntil, isDueSoon: soon, isOverdue: overdue };
}

function isNewTask(createdAt) {
  return hoursSince(createdAt) <= NEW_TASK_HOURS;
}

/* ---------------- State ---------------- */
function defaultState() {
  const listId = uid();
  return {
    theme: "dark",
    activeListId: listId,
    filter: "all",
    sort: "priority_due",
    lists: [{ id: listId, name: "My Tasks", createdAt: Date.now() }],
    tasks: []
  };
}

function loadState() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!raw || !Array.isArray(raw.lists) || !Array.isArray(raw.tasks)) throw new Error("bad");
    raw.theme = raw.theme === "light" ? "light" : "dark";
    raw.filter = ["all","active","completed"].includes(raw.filter) ? raw.filter : "all";
    raw.sort = ["priority_due","newest","due","priority","alpha"].includes(raw.sort) ? raw.sort : "priority_due";
    if (!raw.activeListId || !raw.lists.some(l => l.id === raw.activeListId)) raw.activeListId = raw.lists[0]?.id;
    return raw;
  } catch {
    return defaultState();
  }
}

let state = loadState();

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

/* ---------------- Theme ---------------- */
function applyTheme() {
  document.documentElement.setAttribute("data-theme", state.theme === "light" ? "light" : "dark");
  const iconSpan = els.themeBtn.querySelector(".toolIcon");
  if (iconSpan) iconSpan.textContent = state.theme === "light" ? "☾" : "☀";
}

/* ---------------- Sidebar ---------------- */
function closeSidebar() {
  els.sidebar.classList.remove("open");
  els.scrim.classList.add("hidden");
  els.scrim.setAttribute("aria-hidden", "true");
}
function openSidebar() {
  els.sidebar.classList.add("open");
  els.scrim.classList.remove("hidden");
  els.scrim.setAttribute("aria-hidden", "false");
}

/* ---------------- Toast ---------------- */
function showToast(message, { undoText = null, onUndo = null, timeoutMs = 4500 } = {}) {
  els.toastMsg.textContent = message;
  els.toast.classList.remove("hidden");

  if (undoText && onUndo) {
    els.toastUndoBtn.textContent = undoText;
    els.toastUndoBtn.classList.remove("hidden");
    els.toastUndoBtn.onclick = () => {
      onUndo();
      hideToast();
    };
  } else {
    els.toastUndoBtn.classList.add("hidden");
    els.toastUndoBtn.onclick = null;
  }

  els.toastCloseBtn.onclick = hideToast;

  window.clearTimeout(showToast._t);
  showToast._t = window.setTimeout(() => hideToast(), timeoutMs);
}

function hideToast() {
  els.toast.classList.add("hidden");
  els.toastUndoBtn.classList.add("hidden");
  els.toastUndoBtn.onclick = null;
  window.clearTimeout(showToast._t);
}

/* ---------------- In-app Dialog ---------------- */
function showDialog({
  title = "Dialog",
  message = "",
  input = false,
  inputLabel = "Value",
  inputValue = "",
  hint = "",
  okText = "OK",
  cancelText = "Cancel",
  danger = false
} = {}) {
  return new Promise((resolve) => {
    els.dialogTitle.textContent = title;
    els.dialogMsg.textContent = message;

    els.dialogInputWrap.classList.toggle("hidden", !input);
    els.dialogInputLabel.textContent = inputLabel;
    els.dialogInput.value = inputValue || "";
    els.dialogHint.textContent = hint || "";
    els.dialogHint.style.display = hint ? "block" : "none";

    els.dialogOkBtn.textContent = okText;
    els.dialogCancelBtn.textContent = cancelText;

    els.dialogOkBtn.classList.toggle("danger", danger);
    els.dialogOkBtn.classList.toggle("primary", !danger);

    const cleanup = () => {
      els.dialog.classList.add("hidden");
      els.dialogOkBtn.onclick = null;
      els.dialogCancelBtn.onclick = null;
      els.dialogCloseBtn.onclick = null;
      els.dialog.onclick = null;
      document.removeEventListener("keydown", onKey);
    };

    const onKey = (e) => {
      if (e.key === "Escape") {
        cleanup();
        resolve({ ok: false, value: null });
      }
      if (e.key === "Enter") {
        const v = input ? els.dialogInput.value.trim() : null;
        cleanup();
        resolve({ ok: true, value: v });
      }
    };

    els.dialogOkBtn.onclick = () => {
      const v = input ? els.dialogInput.value.trim() : null;
      cleanup();
      resolve({ ok: true, value: v });
    };

    els.dialogCancelBtn.onclick = () => { cleanup(); resolve({ ok: false, value: null }); };
    els.dialogCloseBtn.onclick = () => { cleanup(); resolve({ ok: false, value: null }); };

    els.dialog.onclick = (e) => {
      if (e.target === els.dialog) {
        cleanup();
        resolve({ ok: false, value: null });
      }
    };

    document.addEventListener("keydown", onKey);
    els.dialog.classList.remove("hidden");
    setTimeout(() => (input ? els.dialogInput : els.dialogOkBtn).focus(), 0);
  });
}

/* ---------------- Lists ---------------- */
function activeList() {
  return state.lists.find(l => l.id === state.activeListId) || state.lists[0];
}

function listTasks(listId) {
  return state.tasks.filter(t => t.listId === listId);
}

function listRemainingCount(listId) {
  return state.tasks.filter(t => t.listId === listId && !t.completed).length;
}

function listWarningCounts(listId) {
  const tasks = listTasks(listId).filter(t => !t.completed);
  let overdue = 0;
  let soon = 0;
  for (const t of tasks) {
    const d = dueInfo(t.due);
    if (d.isOverdue) overdue++;
    else if (d.isDueSoon) soon++;
  }
  return { overdue, soon };
}

function renderLists() {
  els.lists.innerHTML = "";

  state.lists
    .slice()
    .sort((a,b) => a.createdAt - b.createdAt)
    .forEach(list => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "listItem" + (list.id === state.activeListId ? " active" : "");

      const name = document.createElement("div");
      name.className = "listName";
      name.textContent = list.name;

      const meta = document.createElement("div");
      meta.className = "listMeta";

      const left = listRemainingCount(list.id);
      const warn = listWarningCounts(list.id);

      const count = document.createElement("div");
      count.className = "listCount";
      count.textContent = `${left} left`;
      meta.appendChild(count);

      if (warn.overdue > 0) meta.appendChild(makeBadge(`${warn.overdue} overdue`, "overdue"));
      if (warn.soon > 0) meta.appendChild(makeBadge(`${warn.soon} soon`, "soon"));

      btn.appendChild(name);
      btn.appendChild(meta);

      btn.addEventListener("click", () => {
        state.activeListId = list.id;
        saveState();
        renderAll();
        closeSidebar();
      });

      els.lists.appendChild(btn);
    });
}

function createListInline() {
  const name = (els.newListName.value || "").trim();
  if (!name) return;

  const list = { id: uid(), name: name.slice(0, 40), createdAt: Date.now() };
  state.lists.push(list);
  state.activeListId = list.id;
  els.newListName.value = "";

  saveState();
  renderAll();
  showToast("List created.");
}

async function renameActiveList() {
  const list = activeList();
  if (!list) return;

  const res = await showDialog({
    title: "Rename list",
    message: "Update the list name.",
    input: true,
    inputLabel: "List name",
    inputValue: list.name,
    okText: "Save",
    cancelText: "Cancel"
  });
  if (!res.ok) return;

  const name = (res.value || "").trim();
  if (!name) return showToast("List name can’t be empty.");

  list.name = name.slice(0, 40);
  saveState();
  renderAll();
  showToast("List renamed.");
}

async function deleteActiveList() {
  if (state.lists.length <= 1) {
    await showDialog({
      title: "Can’t delete",
      message: "You need at least one list.",
      okText: "OK",
      cancelText: "Close"
    });
    return;
  }

  const list = activeList();
  if (!list) return;

  const res = await showDialog({
    title: "Delete list",
    message: `Delete "${list.name}" and all tasks inside it? This can’t be undone.`,
    okText: "Delete",
    cancelText: "Cancel",
    danger: true
  });
  if (!res.ok) return;

  // IMPORTANT: remove all tasks for that list
  state.tasks = state.tasks.filter(t => t.listId !== list.id);

  // remove list
  state.lists = state.lists.filter(l => l.id !== list.id);

  // set active to first remaining list
  state.activeListId = state.lists[0].id;

  saveState();
  renderAll();
  showToast("List deleted.");
}

/* ---------------- Tasks ---------------- */
function addTask() {
  const title = els.taskTitle.value.trim();
  if (!title) return;

  const task = {
    id: uid(),
    listId: state.activeListId,
    title: title.slice(0, 140),
    due: els.taskDue.value || "",
    priority: els.taskPriority.value || "med",
    tags: parseTags(els.taskTags.value),
    completed: false,
    createdAt: Date.now()
  };

  state.tasks.push(task);

  els.taskTitle.value = "";
  els.taskTags.value = "";

  saveState();
  renderAll();
  showToast("Task added.");
}

function toggleComplete(taskId) {
  const t = state.tasks.find(x => x.id === taskId);
  if (!t) return;
  t.completed = !t.completed;
  saveState();
  renderAll();
}

function deleteTask(taskId) {
  const idx = state.tasks.findIndex(t => t.id === taskId);
  if (idx < 0) return;

  const removed = state.tasks[idx];
  state.tasks.splice(idx, 1);
  saveState();
  renderAll();

  showToast("Task deleted.", {
    undoText: "Undo",
    onUndo: () => {
      state.tasks.splice(idx, 0, removed);
      saveState();
      renderAll();
    }
  });
}

/* ---------------- Filter / Sort / Search ---------------- */
function setFilter(filter) {
  state.filter = filter;
  els.segBtns.forEach(b => {
    const on = b.dataset.filter === filter;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
  });
  saveState();
  renderTasks();
}

function compareTasks(a, b, mode) {
  if (a.completed !== b.completed) return a.completed ? 1 : -1;

  // urgency bump
  const aDue = dueInfo(a.due);
  const bDue = dueInfo(b.due);
  const aUrg = (aDue.isOverdue ? 2 : aDue.isDueSoon ? 1 : 0);
  const bUrg = (bDue.isOverdue ? 2 : bDue.isDueSoon ? 1 : 0);
  if (aUrg !== bUrg) return bUrg - aUrg;

  if (mode === "alpha") return a.title.localeCompare(b.title);
  if (mode === "newest") return b.createdAt - a.createdAt;

  if (mode === "due") {
    const ad = a.due || "9999-12-31";
    const bd = b.due || "9999-12-31";
    if (ad !== bd) return ad.localeCompare(bd);
    const pr = priorityRank(b.priority) - priorityRank(a.priority);
    if (pr !== 0) return pr;
    return b.createdAt - a.createdAt;
  }

  if (mode === "priority") {
    const pr = priorityRank(b.priority) - priorityRank(a.priority);
    if (pr !== 0) return pr;
    const ad = a.due || "9999-12-31";
    const bd = b.due || "9999-12-31";
    if (ad !== bd) return ad.localeCompare(bd);
    return b.createdAt - a.createdAt;
  }

  // priority_due
  const pr = priorityRank(b.priority) - priorityRank(a.priority);
  if (pr !== 0) return pr;
  const ad = a.due || "9999-12-31";
  const bd = b.due || "9999-12-31";
  if (ad !== bd) return ad.localeCompare(bd);
  return b.createdAt - a.createdAt;
}

function filteredTasks() {
  const q = (els.searchInput.value || "").trim().toLowerCase();
  let tasks = state.tasks.filter(t => t.listId === state.activeListId);

  if (state.filter === "active") tasks = tasks.filter(t => !t.completed);
  if (state.filter === "completed") tasks = tasks.filter(t => t.completed);

  if (q) {
    tasks = tasks.filter(t => {
      const blob = `${t.title} ${(t.tags || []).join(" ")}`.toLowerCase();
      return blob.includes(q);
    });
  }

  tasks.sort((a,b) => compareTasks(a,b,state.sort));
  return tasks;
}

/* ---------------- Tab Title Reminder ---------------- */
function remainingInActiveList() {
  return state.tasks.filter(t => t.listId === state.activeListId && !t.completed).length;
}

function updateTabTitle() {
  const remaining = remainingInActiveList();
  if (document.hidden && remaining > 0) {
    document.title = `❗ ${BASE_TITLE} (${remaining})`;
  } else {
    document.title = BASE_TITLE;
  }
}

/* ---------------- Rendering ---------------- */
function renderHeaderStats() {
  const list = activeList();
  els.activeListName.textContent = list?.name || "My Tasks";

  const remaining = remainingInActiveList();
  els.statsText.textContent = `${remaining} remaining`;

  updateTabTitle();
}

function makeBadge(text, cls = "") {
  const b = document.createElement("span");
  b.className = "badge" + (cls ? ` ${cls}` : "");
  b.textContent = text;
  return b;
}

function renderTasks() {
  renderHeaderStats();

  const tasks = filteredTasks();
  els.taskList.innerHTML = "";
  els.emptyState.classList.toggle("hidden", tasks.length !== 0);

  for (const t of tasks) {
    const li = document.createElement("li");

    const d = (!t.completed) ? dueInfo(t.due) : { isDueSoon: false, isOverdue: false };
    const newFlag = (!t.completed) ? isNewTask(t.createdAt) : false;

    li.className = "taskRow";
    if (!t.completed && d.isOverdue) li.classList.add("overdueTask");
    else if (!t.completed && d.isDueSoon) li.classList.add("dueSoon");
    else if (!t.completed && newFlag) li.classList.add("newTask");

    const left = document.createElement("div");
    left.className = "taskLeft";

    const cb = document.createElement("input");
    cb.className = "chk";
    cb.type = "checkbox";
    cb.checked = !!t.completed;
    cb.setAttribute("aria-label", `Mark ${t.title} as ${t.completed ? "incomplete" : "complete"}`);
    cb.addEventListener("change", () => toggleComplete(t.id));

    const block = document.createElement("div");
    block.style.minWidth = "0";

    const title = document.createElement("div");
    title.className = "taskTitle" + (t.completed ? " completed" : "");
    title.textContent = t.title;
    title.tabIndex = 0;
    title.setAttribute("role", "button");
    title.setAttribute("aria-label", `Edit task: ${t.title}`);
    title.addEventListener("click", () => openEditModal(t.id));
    title.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") openEditModal(t.id);
    });

    const meta = document.createElement("div");
    meta.className = "taskMeta";

    meta.appendChild(makeBadge(
      t.priority === "high" ? "High priority" : t.priority === "med" ? "Medium priority" : "Low priority",
      t.priority
    ));

    if (!t.completed && d.isOverdue) meta.appendChild(makeBadge("Overdue", "overdue"));
    else if (!t.completed && d.isDueSoon) meta.appendChild(makeBadge("Due soon", "soon"));
    else if (!t.completed && newFlag) meta.appendChild(makeBadge("New", "new"));

    if (t.due) {
      meta.appendChild(makeBadge(`Due ${fmtDue(t.due)}`, d.isOverdue ? "overdue" : d.isDueSoon ? "soon" : ""));
    }

    (t.tags || []).slice(0, 4).forEach(tag => meta.appendChild(makeBadge(`#${tag}`)));

    block.appendChild(title);
    block.appendChild(meta);

    left.appendChild(cb);
    left.appendChild(block);

    const actions = document.createElement("div");
    actions.className = "taskActions";

    const kebab = document.createElement("button");
    kebab.className = "kebab";
    kebab.type = "button";
    kebab.textContent = "⋯";
    kebab.setAttribute("aria-label", "Task actions");
    kebab.addEventListener("click", (e) => {
      e.stopPropagation();
      openTaskMenu(kebab, t.id);
    });

    actions.appendChild(kebab);

    li.appendChild(left);
    li.appendChild(actions);

    els.taskList.appendChild(li);
  }

  renderLists();
}

function renderAll() {
  applyTheme();
  renderLists();
  renderHeaderStats();
  renderTasks();
}

/* ---------------- Task menu (popover) ---------------- */
let taskMenuEl = null;

function closeTaskMenu() {
  if (taskMenuEl) {
    taskMenuEl.remove();
    taskMenuEl = null;
  }
}

function openTaskMenu(anchorBtn, taskId) {
  closeTaskMenu();

  const rect = anchorBtn.getBoundingClientRect();
  const menu = document.createElement("div");
  menu.className = "menu";
  menu.style.position = "fixed";

  const menuW = 240;
  const menuH = 110;

  let top = rect.bottom + 6;
  let left = rect.right - menuW;

  if (left < 10) left = 10;
  if (left + menuW > window.innerWidth - 10) left = window.innerWidth - menuW - 10;

  if (top + menuH > window.innerHeight - 10) top = rect.top - menuH - 6;
  if (top < 10) top = 10;

  menu.style.top = `${top}px`;
  menu.style.left = `${left}px`;

  const edit = document.createElement("button");
  edit.className = "menuItem";
  edit.textContent = "Edit";
  edit.type = "button";
  edit.addEventListener("click", () => {
    closeTaskMenu();
    openEditModal(taskId);
  });

  const del = document.createElement("button");
  del.className = "menuItem danger";
  del.textContent = "Delete";
  del.type = "button";
  del.addEventListener("click", () => {
    closeTaskMenu();
    deleteTask(taskId);
  });

  menu.appendChild(edit);
  menu.appendChild(del);

  document.body.appendChild(menu);
  taskMenuEl = menu;

  menu.addEventListener("click", (e) => e.stopPropagation());
}

/* ---------------- Edit modal ---------------- */
let editingTaskId = null;

function openEditModal(taskId) {
  const t = state.tasks.find(x => x.id === taskId);
  if (!t) return;

  editingTaskId = taskId;
  els.editTitle.value = t.title;
  els.editDue.value = t.due || "";
  els.editPriority.value = t.priority || "med";
  els.editTags.value = (t.tags || []).join(", ");

  els.modal.classList.remove("hidden");
  setTimeout(() => els.editTitle.focus(), 0);
}

function closeEditModal() {
  editingTaskId = null;
  els.modal.classList.add("hidden");
}

function saveEdit() {
  if (!editingTaskId) return;
  const t = state.tasks.find(x => x.id === editingTaskId);
  if (!t) return;

  const title = els.editTitle.value.trim();
  if (!title) return;

  t.title = title.slice(0, 140);
  t.due = els.editDue.value || "";
  t.priority = els.editPriority.value || "med";
  t.tags = parseTags(els.editTags.value);

  saveState();
  closeEditModal();
  renderAll();
  showToast("Changes saved.");
}

async function deleteEditingTask() {
  if (!editingTaskId) return;
  const t = state.tasks.find(x => x.id === editingTaskId);
  if (!t) return;

  const res = await showDialog({
    title: "Delete task",
    message: `Delete "${t.title}"? This can’t be undone (but you’ll get an Undo toast).`,
    okText: "Delete",
    cancelText: "Cancel",
    danger: true
  });
  if (!res.ok) return;

  closeEditModal();
  deleteTask(editingTaskId);
}

/* ---------------- Export / Import ---------------- */
function download(filename, text, mime = "application/json") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function exportJSON() {
  const payload = { exportedAt: new Date().toISOString(), data: state };
  download(`taskflow-backup-${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(payload, null, 2));
  showToast("Exported backup.");
}

async function importJSON(file) {
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const parsed = JSON.parse(reader.result);
      const incoming = parsed.data || parsed;

      if (!incoming || !Array.isArray(incoming.lists) || !Array.isArray(incoming.tasks)) {
        throw new Error("invalid");
      }

      state = {
        theme: incoming.theme === "light" ? "light" : "dark",
        activeListId: incoming.activeListId && incoming.lists.some(l => l.id === incoming.activeListId)
          ? incoming.activeListId
          : incoming.lists[0].id,
        filter: "all",
        sort: incoming.sort && ["priority_due","newest","due","priority","alpha"].includes(incoming.sort)
          ? incoming.sort
          : "priority_due",
        lists: incoming.lists,
        tasks: incoming.tasks
      };

      saveState();
      applyTheme();
      els.sortSelect.value = state.sort;
      setFilter("all");
      renderAll();
      showToast("Import complete.");
    } catch {
      await showDialog({
        title: "Import failed",
        message: "That file isn’t a valid TaskFlow backup JSON.",
        okText: "OK",
        cancelText: "Close"
      });
    }
  };
  reader.readAsText(file);
}

/* ---------------- More menu ---------------- */
function toggleMoreMenu() { els.moreMenu.classList.toggle("hidden"); }
function closeMoreMenu() { els.moreMenu.classList.add("hidden"); }

/* ---------------- Details panel ---------------- */
function toggleDetails() {
  const isOpen = !els.detailsPanel.classList.contains("hidden");
  els.detailsPanel.classList.toggle("hidden", isOpen);
  els.detailsBtn.setAttribute("aria-expanded", isOpen ? "false" : "true");
}

/* ---------------- Init ---------------- */
function init() {
  applyTheme();

  els.sortSelect.innerHTML = `
    <option value="priority_due">Priority → Due</option>
    <option value="due">Due date</option>
    <option value="priority">Priority</option>
    <option value="newest">Newest</option>
    <option value="alpha">A → Z</option>
  `;
  els.sortSelect.value = state.sort || "priority_due";

  setFilter(state.filter || "all");
  renderAll();

  // sidebar drawer
  els.openSidebarBtn?.addEventListener("click", openSidebar);
  els.closeSidebarBtn?.addEventListener("click", closeSidebar);
  els.scrim.addEventListener("click", closeSidebar);

  // add list section
  els.createListBtn.addEventListener("click", createListInline);
  els.newListName.addEventListener("keydown", (e) => {
    if (e.key === "Enter") createListInline();
  });

  // tools
  els.themeBtn.addEventListener("click", () => {
    state.theme = state.theme === "light" ? "dark" : "light";
    saveState();
    applyTheme();
    renderAll();
    showToast("Theme updated.");
  });

  els.exportBtn.addEventListener("click", exportJSON);
  els.importInput.addEventListener("change", (e) => {
    const f = e.target.files?.[0];
    if (f) importJSON(f);
    e.target.value = "";
  });

  // composer
  els.addBtn.addEventListener("click", addTask);
  els.taskTitle.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addTask();
  });
  els.detailsBtn.addEventListener("click", toggleDetails);

  // filter
  els.segBtns.forEach(btn => btn.addEventListener("click", () => setFilter(btn.dataset.filter)));

  // sort
  els.sortSelect.addEventListener("change", () => {
    state.sort = els.sortSelect.value;
    saveState();
    renderTasks();
    showToast("Sort updated.");
  });

  // search
  const syncClear = () => els.clearSearchBtn.classList.toggle("hidden", !els.searchInput.value.trim());
  els.searchInput.addEventListener("input", () => { syncClear(); renderTasks(); });
  els.clearSearchBtn.addEventListener("click", () => {
    els.searchInput.value = "";
    syncClear();
    renderTasks();
    els.searchInput.focus();
  });
  syncClear();

  // edit modal
  els.closeModalBtn.addEventListener("click", closeEditModal);
  els.cancelEditBtn.addEventListener("click", closeEditModal);
  els.saveEditBtn.addEventListener("click", saveEdit);
  els.deleteTaskBtn.addEventListener("click", deleteEditingTask);
  els.modal.addEventListener("click", (e) => { if (e.target === els.modal) closeEditModal(); });

  // more menu
  els.moreBtn?.addEventListener("click", (e) => { e.stopPropagation(); toggleMoreMenu(); });
  els.renameListBtn.addEventListener("click", async () => { closeMoreMenu(); await renameActiveList(); });
  els.deleteListBtn.addEventListener("click", async () => { closeMoreMenu(); await deleteActiveList(); });

  document.addEventListener("click", () => { closeTaskMenu(); closeMoreMenu(); });
  els.moreMenu.addEventListener("click", (e) => e.stopPropagation());

  // tab reminder
  document.addEventListener("visibilitychange", updateTabTitle);

  // escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeTaskMenu();
      closeMoreMenu();
      closeEditModal();
      closeSidebar();
      hideToast();
    }
  });

  // initial tab title
  updateTabTitle();
}

init();
