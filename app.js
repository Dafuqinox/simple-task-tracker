/* Simple Task Tracker — no sign-in, localStorage, offline-ready
   Features: lists, tasks, subtasks, due, priority, tags, notes, pinned, archive,
   recurring, filters, sort, export/import, CSV, print, dark mode, undo delete, migrations.
*/

const STORAGE_KEY = "simple_task_tracker_v2";
const SCHEMA_VERSION = 2;

const $ = (id) => document.getElementById(id);

const els = {
  listSelect: $("listSelect"),
  newListBtn: $("newListBtn"),
  renameListBtn: $("renameListBtn"),
  deleteListBtn: $("deleteListBtn"),

  taskText: $("taskText"),
  addTaskBtn: $("addTaskBtn"),
  dueInput: $("dueInput"),
  prioritySelect: $("prioritySelect"),
  tagsInput: $("tagsInput"),
  notesInput: $("notesInput"),
  repeatSelect: $("repeatSelect"),
  customRepeatWrap: $("customRepeatWrap"),
  customRepeatDays: $("customRepeatDays"),

  searchInput: $("searchInput"),
  statusFilter: $("statusFilter"),
  priorityFilter: $("priorityFilter"),
  tagFilter: $("tagFilter"),
  dueFilter: $("dueFilter"),
  sortSelect: $("sortSelect"),

  countText: $("countText"),
  progressBar: $("progressBar"),

  clearCompletedBtn: $("clearCompletedBtn"),
  exportJsonBtn: $("exportJsonBtn"),
  importJsonInput: $("importJsonInput"),
  exportCsvBtn: $("exportCsvBtn"),
  resetBtn: $("resetBtn"),

  taskList: $("taskList"),
  emptyState: $("emptyState"),

  themeBtn: $("themeBtn"),
  printBtn: $("printBtn"),

  toast: $("toast"),

  taskDialog: $("taskDialog"),
  dialogTitle: $("dialogTitle"),
  editText: $("editText"),
  editDue: $("editDue"),
  editPriority: $("editPriority"),
  editTags: $("editTags"),
  editNotes: $("editNotes"),
  editRepeat: $("editRepeat"),
  editCustomRepeatWrap: $("editCustomRepeatWrap"),
  editCustomRepeatDays: $("editCustomRepeatDays"),

  subtaskText: $("subtaskText"),
  addSubtaskBtn: $("addSubtaskBtn"),
  subtaskList: $("subtaskList"),

  taskForm: $("taskForm")
};

const uid = () => Math.random().toString(16).slice(2) + Date.now().toString(16);
const nowISO = () => new Date().toISOString();
const toLocalInput = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
};
const fromLocalInput = (value) => {
  if (!value) return null;
  // Treat as local time and convert to ISO
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d.toISOString();
};

function parseTags(input) {
  return (input || "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function prettyDue(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString([], { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0,0,0,0);
  return x;
}

function isSameDay(a, b) {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

function addDays(iso, days) {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function addMonths(iso, months) {
  const d = new Date(iso);
  d.setMonth(d.getMonth() + months);
  return d.toISOString();
}

function priorityRank(p) {
  if (p === "high") return 3;
  if (p === "med") return 2;
  return 1;
}

function confirmAction(message) {
  return window.confirm(message);
}

/* ------------------ Data Model ------------------
state = {
  schemaVersion: 2,
  settings: { theme: "light"|"dark" },
  activeListId: string,
  lists: [{ id, name, createdAt }],
  tasks: [{
    id, listId, text, notes, dueAt, createdAt,
    priority: "low"|"med"|"high",
    tags: string[],
    pinned: bool,
    completedAt: iso|null,
    archivedAt: iso|null,
    recurrence: { type:"none"|"daily"|"weekly"|"monthly"|"custom", everyDays?: number }|null,
    subtasks: [{ id, text, done }]
  }]
}
-------------------------------------------------- */

function defaultState() {
  const listId = uid();
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: { theme: "light" },
    activeListId: listId,
    lists: [{ id: listId, name: "My Tasks", createdAt: nowISO() }],
    tasks: []
  };
}

function migrateState(raw) {
  // If nothing exists, return default
  if (!raw || typeof raw !== "object") return defaultState();

  // v1 -> v2 example: ensure schemaVersion and settings exist
  const s = { ...raw };

  if (!s.schemaVersion) s.schemaVersion = 1;
  if (!s.settings) s.settings = { theme: "light" };
  if (!Array.isArray(s.lists)) s.lists = [];
  if (!Array.isArray(s.tasks)) s.tasks = [];

  // Ensure at least one list
  if (s.lists.length === 0) {
    const listId = uid();
    s.lists.push({ id: listId, name: "My Tasks", createdAt: nowISO() });
    s.activeListId = listId;
  }

  // Normalize tasks
  s.tasks = s.tasks.map(t => ({
    id: t.id || uid(),
    listId: t.listId || s.activeListId,
    text: (t.text ?? "").toString(),
    notes: (t.notes ?? "").toString(),
    dueAt: t.dueAt || null,
    createdAt: t.createdAt || nowISO(),
    priority: t.priority || "med",
    tags: Array.isArray(t.tags) ? t.tags : [],
    pinned: !!t.pinned,
    completedAt: t.completedAt || null,
    archivedAt: t.archivedAt || null,
    recurrence: t.recurrence || null,
    subtasks: Array.isArray(t.subtasks) ? t.subtasks : []
  }));

  s.schemaVersion = SCHEMA_VERSION;
  return s;
}

function loadState() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return migrateState(raw);
  } catch {
    return defaultState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

let state = loadState();

/* ------------------ Theme ------------------ */
function applyTheme() {
  document.documentElement.setAttribute("data-theme", state.settings.theme === "dark" ? "dark" : "light");
  els.themeBtn.textContent = state.settings.theme === "dark" ? "☀️" : "🌙";
}
function toggleTheme() {
  state.settings.theme = state.settings.theme === "dark" ? "light" : "dark";
  saveState();
  applyTheme();
}

/* ------------------ Lists ------------------ */
function renderLists() {
  els.listSelect.innerHTML = "";
  for (const list of state.lists) {
    const opt = document.createElement("option");
    opt.value = list.id;
    opt.textContent = list.name;
    if (list.id === state.activeListId) opt.selected = true;
    els.listSelect.appendChild(opt);
  }
}
function setActiveList(id) {
  state.activeListId = id;
  saveState();
  renderAll();
}

function createList() {
  const name = prompt("New list name:", "New List");
  if (!name) return;
  const list = { id: uid(), name: name.trim().slice(0, 60), createdAt: nowISO() };
  state.lists.push(list);
  state.activeListId = list.id;
  saveState();
  renderAll();
}

function renameList() {
  const current = state.lists.find(l => l.id === state.activeListId);
  if (!current) return;
  const name = prompt("Rename list:", current.name);
  if (!name) return;
  current.name = name.trim().slice(0, 60);
  saveState();
  renderLists();
}

function deleteList() {
  if (state.lists.length <= 1) {
    alert("You need at least one list.");
    return;
  }
  const current = state.lists.find(l => l.id === state.activeListId);
  if (!current) return;

  if (!confirmAction(`Delete list "${current.name}" and all its tasks?`)) return;

  state.tasks = state.tasks.filter(t => t.listId !== current.id);
  state.lists = state.lists.filter(l => l.id !== current.id);
  state.activeListId = state.lists[0].id;
  saveState();
  renderAll();
}

/* ------------------ Tasks ------------------ */
function recurrenceFromInputs(type, customDays) {
  if (!type || type === "none") return null;
  if (type === "custom") {
    const n = Number(customDays);
    if (!Number.isFinite(n) || n < 1) return null;
    return { type: "custom", everyDays: Math.floor(n) };
  }
  return { type };
}

function nextDueFromRecurrence(task) {
  if (!task.recurrence) return null;
  const base = task.dueAt || nowISO();
  const rt = task.recurrence.type;
  if (rt === "daily") return addDays(base, 1);
  if (rt === "weekly") return addDays(base, 7);
  if (rt === "monthly") return addMonths(base, 1);
  if (rt === "custom") return addDays(base, task.recurrence.everyDays || 7);
  return null;
}

function addTask() {
  const text = els.taskText.value.trim();
  if (!text) return;

  const dueAt = fromLocalInput(els.dueInput.value);
  const priority = els.prioritySelect.value;
  const tags = parseTags(els.tagsInput.value);
  const notes = (els.notesInput.value || "").trim().slice(0, 300);
  const repeatType = els.repeatSelect.value;
  const recurrence = recurrenceFromInputs(repeatType, els.customRepeatDays.value);

  const task = {
    id: uid(),
    listId: state.activeListId,
    text: text.slice(0, 140),
    notes,
    dueAt,
    createdAt: nowISO(),
    priority,
    tags,
    pinned: false,
    completedAt: null,
    archivedAt: null,
    recurrence,
    subtasks: []
  };

  state.tasks.unshift(task);
  saveState();

  // reset add form
  els.taskText.value = "";
  els.dueInput.value = "";
  els.tagsInput.value = "";
  els.notesInput.value = "";
  els.prioritySelect.value = "med";
  els.repeatSelect.value = "none";
  els.customRepeatWrap.classList.add("hidden");

  renderAll();
}

function deleteTask(taskId) {
  const idx = state.tasks.findIndex(t => t.id === taskId);
  if (idx < 0) return;
  const removed = state.tasks[idx];
  state.tasks.splice(idx, 1);
  saveState();
  renderAll();
  showUndoToast(removed, idx);
}

function showUndoToast(task, index) {
  els.toast.classList.remove("hidden");
  els.toast.innerHTML = "";

  const msg = document.createElement("div");
  msg.textContent = `Deleted: "${task.text}"`;

  const undo = document.createElement("button");
  undo.textContent = "Undo";
  undo.addEventListener("click", () => {
    state.tasks.splice(index, 0, task);
    saveState();
    hideToast();
    renderAll();
  });

  const close = document.createElement("button");
  close.textContent = "Dismiss";
  close.addEventListener("click", hideToast);

  els.toast.appendChild(msg);
  els.toast.appendChild(undo);
  els.toast.appendChild(close);

  // auto hide
  setTimeout(() => {
    if (!els.toast.classList.contains("hidden")) hideToast();
  }, 7000);
}

function hideToast() {
  els.toast.classList.add("hidden");
  els.toast.innerHTML = "";
}

function togglePinned(taskId) {
  const t = state.tasks.find(x => x.id === taskId);
  if (!t) return;
  t.pinned = !t.pinned;
  saveState();
  renderAll();
}

function toggleComplete(taskId) {
  const t = state.tasks.find(x => x.id === taskId);
  if (!t) return;

  const wasCompleted = !!t.completedAt;
  t.completedAt = wasCompleted ? null : nowISO();

  // If completing a recurring task, create next occurrence
  if (!wasCompleted && t.recurrence) {
    const nextDue = nextDueFromRecurrence(t);
    const nextTask = {
      ...t,
      id: uid(),
      createdAt: nowISO(),
      completedAt: null,
      archivedAt: null,
      pinned: false,
      dueAt: nextDue,
      subtasks: t.subtasks.map(st => ({ ...st, id: uid(), done: false }))
    };
    state.tasks.unshift(nextTask);
  }

  saveState();
  renderAll();
}

function toggleArchive(taskId) {
  const t = state.tasks.find(x => x.id === taskId);
  if (!t) return;
  t.archivedAt = t.archivedAt ? null : nowISO();
  saveState();
  renderAll();
}

function clearCompleted() {
  if (!confirmAction("Clear all completed tasks in this list (not archived)?")) return;
  state.tasks = state.tasks.filter(t => !(t.listId === state.activeListId && t.completedAt && !t.archivedAt));
  saveState();
  renderAll();
}

function resetAll() {
  if (!confirmAction("Reset everything? This deletes all lists and tasks in this browser.")) return;
  localStorage.removeItem(STORAGE_KEY);
  state = defaultState();
  applyTheme();
  renderAll();
}

/* ------------------ Dialog Editing ------------------ */
let editingTaskId = null;

function openEditDialog(taskId) {
  const t = state.tasks.find(x => x.id === taskId);
  if (!t) return;
 editingTaskId = taskId;

  els.dialogTitle.textContent = "Edit Task";
  els.editText.value = t.text;
  els.editDue.value = toLocalInput(t.dueAt);
  els.editPriority.value = t.priority;
  els.editTags.value = (t.tags || []).join(", ");
  els.editNotes.value = t.notes || "";

  const rec = t.recurrence?.type || "none";
  els.editRepeat.value = rec;
  if (rec === "custom") {
    els.editCustomRepeatWrap.classList.remove("hidden");
    els.editCustomRepeatDays.value = String(t.recurrence?.everyDays || 7);
  } else {
    els.editCustomRepeatWrap.classList.add("hidden");
  }

  renderSubtasks(t);

  els.taskDialog.showModal();
  setTimeout(() => els.editText.focus(), 0);
}

function renderSubtasks(task) {
  els.subtaskList.innerHTML = "";
  for (const st of task.subtasks) {
    const li = document.createElement("li");
    li.className = "subtask-item";

    const left = document.createElement("div");
    left.className = "inline";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = !!st.done;
    cb.addEventListener("change", () => {
      st.done = cb.checked;
      saveState();
      renderAll(); // update badges/progress
    });

    const text = document.createElement("span");
    text.className = "st-text";
    text.textContent = st.text;

    left.appendChild(cb);
    left.appendChild(text);

    const del = document.createElement("button");
    del.className = "iconbtn";
    del.type = "button";
    del.textContent = "Remove";
    del.addEventListener("click", () => {
      task.subtasks = task.subtasks.filter(x => x.id !== st.id);
      saveState();
      renderSubtasks(task);
      renderAll();
    });

    li.appendChild(left);
    li.appendChild(del);
    els.subtaskList.appendChild(li);
  }
}

function addSubtask() {
  if (!editingTaskId) return;
  const t = state.tasks.find(x => x.id === editingTaskId);
  if (!t) return;

  const text = els.subtaskText.value.trim();
  if (!text) return;

  t.subtasks.push({ id: uid(), text: text.slice(0, 120), done: false });
  els.subtaskText.value = "";
  saveState();
  renderSubtasks(t);
  renderAll();
}

function saveEditDialog() {
  const t = state.tasks.find(x => x.id === editingTaskId);
  if (!t) return;

  t.text = els.editText.value.trim().slice(0, 140);
  t.dueAt = fromLocalInput(els.editDue.value);
  t.priority = els.editPriority.value;
  t.tags = parseTags(els.editTags.value);
  t.notes = (els.editNotes.value || "").trim().slice(0, 300);

  const rep = els.editRepeat.value;
  t.recurrence = recurrenceFromInputs(rep, els.editCustomRepeatDays.value);

  saveState();
  renderAll();
}

/* ------------------ Filtering/Sorting ------------------ */
function buildTagOptions() {
  const tags = new Set();
  for (const t of state.tasks) {
    if (t.listId !== state.activeListId) continue;
    (t.tags || []).forEach(tag => tags.add(tag));
  }

  const current = els.tagFilter.value || "any";
  els.tagFilter.innerHTML = `<option value="any">Any</option>`;
  Array.from(tags).sort((a,b) => a.localeCompare(b)).forEach(tag => {
    const opt = document.createElement("option");
    opt.value = tag;
    opt.textContent = tag;
    if (tag === current) opt.selected = true;
    els.tagFilter.appendChild(opt);
  });
}

function passesFilters(t) {
  if (t.listId !== state.activeListId) return false;

  const q = (els.searchInput.value || "").trim().toLowerCase();
  const status = els.statusFilter.value;
  const pf = els.priorityFilter.value;
  const tag = els.tagFilter.value;
  const duef = els.dueFilter.value;

  // status
  if (status === "active") {
    if (t.archivedAt) return false;
    if (t.completedAt) return false;
  } else if (status === "completed") {
    if (t.archivedAt) return false;
    if (!t.completedAt) return false;
  } else if (status === "archived") {
    if (!t.archivedAt) return false;
  } // all: show everything

  // priority
  if (pf !== "any" && t.priority !== pf) return false;

  // tag
  if (tag !== "any") {
    if (!Array.isArray(t.tags) || !t.tags.includes(tag)) return false;
  }

  // due filter
  const dueAt = t.dueAt ? new Date(t.dueAt) : null;
  const now = new Date();
  if (duef === "overdue") {
    if (!dueAt) return false;
    if (dueAt.getTime() >= now.getTime()) return false;
  } else if (duef === "today") {
    if (!dueAt) return false;
    if (!isSameDay(dueAt, now)) return false;
  } else if (duef === "week") {
    if (!dueAt) return false;
    const week = new Date(now);
    week.setDate(now.getDate() + 7);
    if (dueAt.getTime() < now.getTime() || dueAt.getTime() > week.getTime()) return false;
  } else if (duef === "nodue") {
    if (dueAt) return false;
  }

  // search
  if (q) {
    const blob = [
      t.text,
      t.notes || "",
      (t.tags || []).join(" "),
      (t.subtasks || []).map(s => s.text).join(" ")
    ].join(" ").toLowerCase();
    if (!blob.includes(q)) return false;
  }

  return true;
}

function sortTasks(a, b) {
  const mode = els.sortSelect.value;

  const ap = a.pinned ? 1 : 0;
  const bp = b.pinned ? 1 : 0;

  const aDue = a.dueAt ? new Date(a.dueAt).getTime() : Infinity;
  const bDue = b.dueAt ? new Date(b.dueAt).getTime() : Infinity;

  const aCreated = new Date(a.createdAt).getTime();
  const bCreated = new Date(b.createdAt).getTime();

  if (mode === "pinned_due") {
    if (ap !== bp) return bp - ap;
    if (aDue !== bDue) return aDue - bDue;
    return bCreated - aCreated;
  }

  if (mode === "created_desc") return bCreated - aCreated;
  if (mode === "due_asc") return aDue - bDue;
  if (mode === "priority_desc") return priorityRank(b.priority) - priorityRank(a.priority);
  if (mode === "alpha_asc") return (a.text || "").localeCompare(b.text || "");

  return 0;
}

/* ------------------ Rendering ------------------ */
function calcProgress() {
  const listTasks = state.tasks.filter(t => t.listId === state.activeListId && !t.archivedAt);
  const total = listTasks.length || 0;
  const completed = listTasks.filter(t => t.completedAt).length;
  const remaining = total - completed;
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
  return { total, completed, remaining, pct };
}

function dueBadges(task) {
  const out = [];
  if (!task.dueAt) return out;

  const now = new Date();
  const due = new Date(task.dueAt);

  if (due.getTime() < now.getTime() && !task.completedAt) out.push({ text: "Overdue", cls: "overdue" });
  if (isSameDay(due, now)) out.push({ text: "Due today", cls: "" });

  out.push({ text: prettyDue(task.dueAt), cls: "" });
  return out;
}

function renderTaskItem(task) {
  const li = document.createElement("li");
  li.className = `item ${task.completedAt ? "completed" : ""} ${task.archivedAt ? "archived" : ""}`;

  const left = document.createElement("div");
  left.className = "item-left";

  const head = document.createElement("div");
  head.className = "item-head";

  const titleline = document.createElement("div");
  titleline.className = "titleline";

  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.className = "check";
  cb.checked = !!task.completedAt;
  cb.disabled = !!task.archivedAt;
  cb.addEventListener("change", () => toggleComplete(task.id));

  const text = document.createElement("div");
  text.className = "text";
  text.tabIndex = 0;
  text.setAttribute("role", "button");
  text.setAttribute("aria-label", "Edit task");
  text.textContent = task.text;
  text.addEventListener("click", () => openEditDialog(task.id));
  text.addEventListener("keydown", (e) => {
    if (e.key === "Enter") openEditDialog(task.id);
  });

  titleline.appendChild(cb);
  titleline.appendChild(text);

  head.appendChild(titleline);
  left.appendChild(head);

  const badges = document.createElement("div");
  badges.className = "badges";

  // priority badge
  const pr = document.createElement("span");
  pr.className = `badge ${task.priority}`;
  pr.textContent = task.priority === "high" ? "High" : task.priority === "med" ? "Medium" : "Low";
  badges.appendChild(pr);

  // pinned
  if (task.pinned) {
    const pin = document.createElement("span");
    pin.className = "badge";
    pin.textContent = "Pinned";
    badges.appendChild(pin);
  }

  // tags
  (task.tags || []).slice(0, 6).forEach(tag => {
    const b = document.createElement("span");
    b.className = "badge";
    b.textContent = `#${tag}`;
    badges.appendChild(b);
  });

  // due
  for (const b of dueBadges(task)) {
    const x = document.createElement("span");
    x.className = `badge ${b.cls || ""}`.trim();
    x.textContent = b.text;
    badges.appendChild(x);
  }

  // recurring
  if (task.recurrence) {
    const r = document.createElement("span");
    r.className = "badge";
    const rt = task.recurrence.type;
    r.textContent = rt === "custom" ? `Repeats every ${task.recurrence.everyDays}d` : `Repeats ${rt}`;
    badges.appendChild(r);
  }

  // subtasks summary
  if (task.subtasks?.length) {
    const done = task.subtasks.filter(s => s.done).length;
    const st = document.createElement("span");
    st.className = "badge";
    st.textContent = `Subtasks ${done}/${task.subtasks.length}`;
    badges.appendChild(st);
  }

  left.appendChild(badges);

  if (task.notes) {
    const notes = document.createElement("div");
    notes.className = "notes";
    notes.textContent = task.notes;
    left.appendChild(notes);
  }

  const actions = document.createElement("div");
  actions.className = "item-actions";

  const pinBtn = document.createElement("button");
  pinBtn.className = "iconbtn";
  pinBtn.type = "button";
  pinBtn.textContent = task.pinned ? "Unpin" : "Pin";
  pinBtn.addEventListener("click", () => togglePinned(task.id));

  const archBtn = document.createElement("button");
  archBtn.className = "iconbtn";
  archBtn.type = "button";
  archBtn.textContent = task.archivedAt ? "Unarchive" : "Archive";
  archBtn.addEventListener("click", () => toggleArchive(task.id));

  const delBtn = document.createElement("button");
  delBtn.className = "iconbtn";
  delBtn.type = "button";
  delBtn.textContent = "Delete";
  delBtn.addEventListener("click", () => {
    if (!confirmAction("Delete this task?")) return;
    deleteTask(task.id);
  });

  actions.appendChild(pinBtn);
  actions.appendChild(archBtn);
  actions.appendChild(delBtn);

  li.appendChild(left);
  li.appendChild(actions);

  return li;
}

function renderTasks() {
  const tasks = state.tasks
    .filter(passesFilters)
    .sort(sortTasks);

  els.taskList.innerHTML = "";
  if (tasks.length === 0) {
    els.emptyState.classList.remove("hidden");
  } else {
    els.emptyState.classList.add("hidden");
    for (const t of tasks) els.taskList.appendChild(renderTaskItem(t));
  }

  const { remaining, pct } = calcProgress();
  els.countText.textContent = `${remaining} remaining`;
  els.progressBar.style.width = `${pct}%`;
}

/* ------------------ Export / Import ------------------ */
function download(filename, text, mime="text/plain") {
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
  const payload = {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: nowISO(),
    data: state
  };
  download(`task-tracker-backup-${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(payload, null, 2), "application/json");
}

function importJSON(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const payload = JSON.parse(reader.result);
      const incoming = payload.data || payload;
      state = migrateState(incoming);
      saveState();
      applyTheme();
      renderAll();
      alert("Import complete.");
    } catch {
      alert("Import failed. Invalid JSON.");
    }
  };
  reader.readAsText(file);
}

function exportCSV() {
  const headers = ["list","task","notes","priority","tags","dueAt","pinned","completedAt","archivedAt","subtasks"];
  const lines = [headers.join(",")];

  const listNameById = new Map(state.lists.map(l => [l.id, l.name]));
  const esc = (v) => {
    const s = (v ?? "").toString().replaceAll('"', '""');
    return `"${s}"`;
  };

  for (const t of state.tasks) {
    const row = [
      listNameById.get(t.listId) || "",
      t.text,
      t.notes || "",
      t.priority,
      (t.tags || []).join(" "),
      t.dueAt || "",
      t.pinned ? "true" : "false",
      t.completedAt || "",
      t.archivedAt || "",
      (t.subtasks || []).map(st => `${st.done ? "[x]" : "[ ]"} ${st.text}`).join(" | ")
    ].map(esc).join(",");
    lines.push(row);
  }

  download(`task-tracker-${new Date().toISOString().slice(0,10)}.csv`, lines.join("\n"), "text/csv");
}

/* ------------------ Misc UI wiring ------------------ */
function renderAll() {
  renderLists();
  buildTagOptions();
  renderTasks();
}

function wireEvents() {
  els.listSelect.addEventListener("change", () => setActiveList(els.listSelect.value));
  els.newListBtn.addEventListener("click", createList);
  els.renameListBtn.addEventListener("click", renameList);
  els.deleteListBtn.addEventListener("click", deleteList);

  els.addTaskBtn.addEventListener("click", addTask);
  els.taskText.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addTask();
  });

  els.repeatSelect.addEventListener("change", () => {
    els.customRepeatWrap.classList.toggle("hidden", els.repeatSelect.value !== "custom");
  });

  // filters
  ["searchInput","statusFilter","priorityFilter","tagFilter","dueFilter","sortSelect"].forEach(id => {
    els[id].addEventListener("input", renderTasks);
    els[id].addEventListener("change", renderTasks);
  });

  els.clearCompletedBtn.addEventListener("click", clearCompleted);
  els.exportJsonBtn.addEventListener("click", exportJSON);
  els.importJsonInput.addEventListener("change", (e) => {
    const f = e.target.files?.[0];
    if (f) importJSON(f);
    e.target.value = "";
  });
  els.exportCsvBtn.addEventListener("click", exportCSV);
  els.resetBtn.addEventListener("click", resetAll);

  els.themeBtn.addEventListener("click", toggleTheme);
  els.printBtn.addEventListener("click", () => window.print());

  // dialog events
  els.editRepeat.addEventListener("change", () => {
    els.editCustomRepeatWrap.classList.toggle("hidden", els.editRepeat.value !== "custom");
  });
  els.addSubtaskBtn.addEventListener("click", addSubtask);
  els.subtaskText.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addSubtask();
  });

  els.taskForm.addEventListener("submit", (e) => {
    e.preventDefault();
    saveEditDialog();
    els.taskDialog.close();
  });

  // ESC dialog close is native
}

/* ------------------ PWA register ------------------ */
function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

/* ------------------ Init ------------------ */
applyTheme();
wireEvents();
renderAll();
registerSW();
