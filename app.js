const input = document.getElementById("taskInput");
const addBtn = document.getElementById("addBtn");
const taskList = document.getElementById("taskList");
const countEl = document.getElementById("count");
const clearCompletedBtn = document.getElementById("clearCompleted");
const filterBtns = Array.from(document.querySelectorAll(".filter"));

const STORAGE_KEY = "simple_task_tracker_v1";

let tasks = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
let currentFilter = "all";

function saveTasks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

function remainingCount() {
  return tasks.filter(t => !t.completed).length;
}

function filteredTasks() {
  if (currentFilter === "active") return tasks.filter(t => !t.completed);
  if (currentFilter === "completed") return tasks.filter(t => t.completed);
  return tasks;
}

function setCount() {
  const n = remainingCount();
  countEl.textContent = `${n} remaining`;
}

function setActiveFilterButton() {
  filterBtns.forEach(btn => {
    btn.classList.toggle("active", btn.dataset.filter === currentFilter);
  });
}

function createTaskItem(task, indexInAllTasks) {
  const li = document.createElement("li");
  li.className = "item" + (task.completed ? " completed" : "");

  const text = document.createElement("span");
  text.className = "text";
  text.textContent = task.text;

  text.addEventListener("click", () => {
    tasks[indexInAllTasks].completed = !tasks[indexInAllTasks].completed;
    saveTasks();
    render();
  });

  const actions = document.createElement("div");
  actions.className = "actions";

  const delBtn = document.createElement("button");
  delBtn.className = "icon";
  delBtn.textContent = "Delete";
  delBtn.addEventListener("click", () => {
    tasks.splice(indexInAllTasks, 1);
    saveTasks();
    render();
  });

  actions.appendChild(delBtn);
  li.appendChild(text);
  li.appendChild(actions);
  return li;
}

function render() {
  taskList.innerHTML = "";

  const view = filteredTasks();

  // We need original indexes for correct toggling/deleting
  view.forEach(task => {
    const originalIndex = tasks.indexOf(task);
    taskList.appendChild(createTaskItem(task, originalIndex));
  });

  setCount();
  setActiveFilterButton();
}

function addTask() {
  const value = input.value.trim();
  if (!value) return;

  tasks.unshift({ text: value, completed: false });
  input.value = "";
  saveTasks();
  render();
}

addBtn.addEventListener("click", addTask);

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addTask();
});

clearCompletedBtn.addEventListener("click", () => {
  tasks = tasks.filter(t => !t.completed);
  saveTasks();
  render();
});

filterBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    currentFilter = btn.dataset.filter;
    render();
  });
});

render();
