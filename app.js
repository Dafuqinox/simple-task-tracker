/* TaskFlow — Professional UI + localStorage data model
   Features:
   - Multiple lists
   - Add task (title, due, priority, tags) with progressive details panel
   - Search
   - Filter: All/Active/Completed
   - Sort: Newest/Due/Priority/Alpha
   - Edit modal (same fields)
   - Export/Import JSON
   - Theme toggle (saved)
   - Mobile drawer sidebar
   - Toast + undo delete
*/

const STORAGE_KEY = "taskflow_major_ui_v1";

const $ = (id) => document.getElementById(id);
const qs = (sel, root = document) => root.querySelector(sel);
const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const els = {
  scrim: $("scrim"),
  sidebar: $("sidebar"),
  openSidebarBtn: $("openSidebarBtn"),
  closeSidebarBtn: $("closeSidebarBtn"),

  lists: $("lists"),
  newListBtn: $("newListBtn"),

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
};

const uid = () => Math.random().toString(16).slice(2) + Date.now().toString(16);

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

function isOverdue(due, completed) {
  if (!due || completed) return false;
  return due < todayISO();
}

function priorityRank(p) {
  if (p === "high") return 3;
  if (p === "med") return 2;
  return 1;
}

/* ---------------- State ----------------
state = {
  theme: "dark"|"light",
  activeListId: string,
  filter: "all"|"active"|"completed",
  sort: "newest"|"due"|"priority"|"alpha",
  lists: [{id,name,createdAt}],
  tasks: [{id,listId,title,due,priority,tags,completed,createdAt}]
}
---------------------------------------- */

function defaultState() {
  const listId = uid();
  return {
    theme: "dark",
    activeListId: listId,
    filter: "all",
    sort: "newest",
    lists: [{ id: listId, name: "My Tasks", createdAt: Date.now() }],
    tasks: []
  };
}

function loadState() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!raw || !Array.isArray(raw.lists) || !Array.isArray(raw.tasks)) throw new Error("bad");
    // minimal normalization
    raw.theme = raw.theme === "light" ? "light" : "dark";
    raw.filter = ["all","active","completed"].includes(raw.filter) ? raw.filter : "all";
    raw.sort = ["newest","due","priority","alpha"].includes(raw.sort) ? raw.sort : "newest";
    if (!raw.activeListId || !raw.lists.some(l => l.id === raw.activeListId)) {
      raw.activeListId = raw.lists[0]?.id || uid();
    }
    return raw;
  } catch {
    return defaultState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

let state = loadState();

/* ---------------- UI helpers ---------------- */

function applyTheme() {
  document.documentElement.setAttribute("data-theme", state.theme === "light" ? "light" : "dark");
  els.themeBtn.querySelector(".toolIcon")?.remove();
  // Keep button label stable, just swap icon in first span if present
  const iconSpan = els.themeBtn.querySelector(".toolIcon") || document.createElement("span");
  iconSpan.className = "toolIcon";
  iconSpan.textContent = state.theme === "light" ? "☾" : "☀";
  if (!els.themeBtn.querySelector(".toolIcon")) els.themeBtn.prepend(iconSpan);
}

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

/* ---------------- Lists ---------------- */

function listRemainingCount(listId) {
  return state.tasks.filter(t => t.listId === listId && !t.completed).length;
}

function activeList() {
  return state.lists.find(l => l.id === state.activeListId) || state.lists[0];
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

      const count = document.createElement("div");
      count.className = "listCount";
      count.textContent = `${listRemainingCount(list.id)} left`;

      btn.appendChild(name);
      btn.appendChild(count);

      btn.addEventListener("click", () => {
        state.activeListId = list.id;
        saveState();
        renderAll();
        closeSidebar();
      });

      els.lists.appendChild(btn);
    });
}

function newList() {
  const name = prompt("New list name:", "New List");
  if (!name) return;
  const list = { id: uid(), name: name.trim().slice(0, 40), createdAt: Date.now() };
  state.lists.push(list);
  state.activeListId = list.id;
  saveState();
  renderAll();
  showToast("List created.");
}

function renameActiveList() {
  const list = activeList();
  if (!list) return;
  const name = prompt("Rename list:", list.name);
  if (!name) return;
  list.name = name.trim().slice(0, 40);
  saveState();
  renderAll();
  showToast("List renamed.");
}

function deleteActiveList() {
  if (state.lists.length <= 1) {
    alert("You need at least one list.");
    return;
  }
  const list = activeList();
  if (!list) return;

  const ok = confirm(`Delete "${list.name}" and all tasks in it?`);
  if (!ok) return;

  state.tasks = state.tasks.filter(t => t.listId !== list.id);
  state.lists = state.lists.filter(l => l.id !== list.id);
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

  state.tasks.unshift(task);

  els.taskTitle.value = "";
  // keep details (due/priority/tags) as user choices, but reset tags for convenience
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

/* ---------------- Filters / Sort / Search ---------------- */

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

  const mode = state.sort;
  tasks.sort((a,b) => {
    if (mode === "newest") return b.createdAt - a.createdAt;
    if (mode === "alpha") return a.title.localeCompare(b.title);
    if (mode === "priority") {
      const d = priorityRank(b.priority) - priorityRank(a.priority);
      if (d !== 0) return d;
      return b.createdAt - a.createdAt;
    }
    // due
    const ad = a.due || "9999-12-31";
    const bd = b.due || "9999-12-31";
    if (ad !== bd) return ad.localeCompare(bd);
    return b.createdAt - a.createdAt;
  });

  return tasks;
}

/* ---------------- Rendering ---------------- */

function renderHeaderStats() {
  const list = activeList();
  els.activeListName.textContent = list?.name || "My Tasks";

  const allInList = state.tasks.filter(t => t.listId === state.activeListId);
  const remaining = allInList.filter(t => !t.completed).length;
  els.statsText.textContent = `${remaining} remaining`;
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
    li.className = "taskRow";

    const left = document.createElement("div");
    left.className = "taskLeft";

    const cb = document.createElement("input");
    cb.className = "chk";
    cb.type = "checkbox";
    cb.checked = !!t.completed;
    cb.addEventListener("change", () => toggleComplete(t.id));

    const block = document.createElement("div");
    block.style.minWidth = "0";

    const title = document.createElement("div");
    title.className = "taskTitle" + (t.completed ? " completed" : "");
    title.textContent = t.title;
    title.addEventListener("click", () => openEditModal(t.id));

    const meta = document.createElement("div");
    meta.className = "taskMeta";

    // priority
    meta.appendChild(makeBadge(
      t.priority === "high" ? "High" : t.priority === "med" ? "Medium" : "Low",
      t.priority
    ));

    // due
    if (t.due) {
      meta.appendChild(makeBadge(
        `Due ${fmtDue(t.due)}`,
        isOverdue(t.due, t.completed) ? "overdue" : ""
      ));
    }

    // tags
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

  renderLists(); // keep counts updated
}

function renderAll() {
  applyTheme();
  state.sort = els.sortSelect.value || state.sort;
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
  menu.style.top = `${Math.min(window.innerHeight - 10, rect.bottom + 6)}px`;
  menu.style.left = `${Math.max(10, rect.right - 220)}px`;
  menu.style.right = "auto";

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

function deleteEditingTask() {
  if (!editingTaskId) return;
  const t = state.tasks.find(x => x.id === editingTaskId);
  if (!t) return;

  const ok = confirm(`Delete "${t.title}"?`);
  if (!ok) return;

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
  const payload = {
    exportedAt: new Date().toISOString(),
    data: state
  };
  download(`taskflow-backup-${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(payload, null, 2));
  showToast("Exported backup.");
}

function importJSON(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const incoming = parsed.data || parsed;

      if (!incoming || !Array.isArray(incoming.lists) || !Array.isArray(incoming.tasks)) {
        throw new Error("bad");
      }

      state = {
        theme: incoming.theme === "light" ? "light" : "dark",
        activeListId: incoming.activeListId && incoming.lists.some(l => l.id === incoming.activeListId)
          ? incoming.activeListId
          : incoming.lists[0].id,
        filter: "all",
        sort: incoming.sort && ["newest","due","priority","alpha"].includes(incoming.sort) ? incoming.sort : "newest",
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
      alert("Import failed: invalid JSON file.");
    }
  };
  reader.readAsText(file);
}

/* ---------------- More menu (top right) ---------------- */

function toggleMoreMenu() {
  els.moreMenu.classList.toggle("hidden");
}

function closeMoreMenu() {
  els.moreMenu.classList.add("hidden");
}

/* ---------------- Details panel ---------------- */

function toggleDetails() {
  const isOpen = !els.detailsPanel.classList.contains("hidden");
  els.detailsPanel.classList.toggle("hidden", isOpen);
  els.detailsBtn.setAttribute("aria-expanded", isOpen ? "false" : "true");
}

/* ---------------- Wiring ---------------- */

function init() {
  applyTheme();

  // initial UI state
  els.sortSelect.value = state.sort;
  setFilter(state.filter);

  renderAll();

  // sidebar drawer
  els.openSidebarBtn?.addEventListener("click", openSidebar);
  els.closeSidebarBtn?.addEventListener("click", closeSidebar);
  els.scrim.addEventListener("click", closeSidebar);

  // lists
  els.newListBtn.addEventListener("click", newList);

  // tools
  els.themeBtn.addEventListener("click", () => {
    state.theme = state.theme === "light" ? "dark" : "light";
    saveState();
    applyTheme();
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

  // filter segmented
  els.segBtns.forEach(btn => btn.addEventListener("click", () => setFilter(btn.dataset.filter)));

  // sort
  els.sortSelect.addEventListener("change", () => {
    state.sort = els.sortSelect.value;
    saveState();
    renderTasks();
  });

  // search
  const syncClear = () => {
    els.clearSearchBtn.classList.toggle("hidden", !els.searchInput.value.trim());
  };
  els.searchInput.addEventListener("input", () => {
    syncClear();
    renderTasks();
  });
  els.clearSearchBtn.addEventListener("click", () => {
    els.searchInput.value = "";
    syncClear();
    renderTasks();
    els.searchInput.focus();
  });
  syncClear();

  // modal
  els.closeModalBtn.addEventListener("click", closeEditModal);
  els.cancelEditBtn.addEventListener("click", closeEditModal);
  els.saveEditBtn.addEventListener("click", saveEdit);
  els.deleteTaskBtn.addEventListener("click", deleteEditingTask);

  els.modal.addEventListener("click", (e) => {
    if (e.target === els.modal) closeEditModal();
  });

  // more menu
  els.moreBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleMoreMenu();
  });
  els.renameListBtn.addEventListener("click", () => {
    closeMoreMenu();
    renameActiveList();
  });
  els.deleteListBtn.addEventListener("click", () => {
    closeMoreMenu();
    deleteActiveList();
  });

  // global click: close popovers
  document.addEventListener("click", () => {
    closeTaskMenu();
    closeMoreMenu();
  });

  // prevent click inside menus from closing immediately
  els.moreMenu.addEventListener("click", (e) => e.stopPropagation());

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
}

init();
