// ============================================================
// THE ANT BOX ERP — tasks.js
// Kanban board: drag-drop, CRUD, comments, realtime
// ============================================================

import { bootPage } from './modules/authGuard.js';
import { initTheme, initSidebar, initLogout, initThemeToggle, initDropdowns, statusBadge, priorityBadge, avatarHTML, formatDate, formatRelative, debounce, setLoading } from './modules/ui.js';
import { openModal, closeModal, confirm, readForm, populateForm, setupModalClosers } from './modules/modal.js';
import toast from './modules/toast.js';
import { validateForm, rules } from './modules/validators.js';
import { getTasks, createTask, updateTask, moveTask, deleteTask, addComment, subscribeTasks } from './services/taskService.js';
import { getEmployees } from './services/employeeService.js';

initTheme();
const ctx = await bootPage();
if (!ctx) throw new Error('Not authenticated');
initSidebar(); initLogout(); initThemeToggle(); initDropdowns(); setupModalClosers();

// ── Hide New Task button for interns ─────────────────────────────
if (ctx.profile.role === 'intern') {
  const addBtn = document.getElementById('btn-add-task');
  if (addBtn) addBtn.style.display = 'none';
  // Also hide the filter bar (interns only see their tasks)
  document.getElementById('task-assignee')?.closest('.table-filter-group')?.style?.setProperty('display', 'none');
}

const COLUMNS = [
  { id: 'todo',        label: 'To Do',       cls: 'col-todo' },
  { id: 'in_progress', label: 'In Progress',  cls: 'col-inprogress' },
  { id: 'in_review',   label: 'In Review',    cls: 'col-review' },
  { id: 'done',        label: 'Done',         cls: 'col-done' },
];

let allTasks = [];
let editingTaskId = null;
let draggedTaskId = null;

// ── Load & Render Board ───────────────────────────────────────
async function loadBoard() {
  const search = document.getElementById('task-search')?.value.trim() || '';
  const assigneeFilter = document.getElementById('task-assignee')?.value || '';

  // Interns can only see their own tasks — force their own ID as filter
  const effectiveAssignee = ctx.profile.role === 'intern'
    ? ctx.profile.id
    : (assigneeFilter || null);

  try {
    allTasks = await getTasks({
      search,
      assignedTo: effectiveAssignee,
    });
    renderBoard();
    updateColumnCounts();
  } catch (err) {
    toast.error('Failed to load tasks', err.message);
  }
}

function renderBoard() {
  COLUMNS.forEach(col => {
    const container = document.getElementById(`col-${col.id}`);
    if (!container) return;

    const tasks = allTasks.filter(t => t.status === col.id);

    if (!tasks.length) {
      container.innerHTML = `<div class="kanban-empty">No tasks here</div>`;
      return;
    }

    container.innerHTML = tasks.map(task => renderTaskCard(task)).join('');

    // Drag events on cards
    container.querySelectorAll('.task-card-item').forEach(card => {
      card.setAttribute('draggable', 'true');
      card.addEventListener('dragstart', onDragStart);
      card.addEventListener('click', e => {
        if (!e.target.closest('[data-task-action]')) openTaskDetail(card.dataset.taskId);
      });
      card.querySelectorAll('[data-task-action]').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          handleTaskAction(btn.dataset.taskAction, card.dataset.taskId);
        });
      });
    });
  });

  // Drop zones
  document.querySelectorAll('.kanban-col-body').forEach(zone => {
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => onDrop(e, zone));
  });
}

function renderTaskCard(task) {
  const isOverdue = task.deadline && new Date(task.deadline) < new Date() && task.status !== 'done';
  return `
    <div class="task-card-item" data-task-id="${task.id}" draggable="true">
      <div class="task-card-header">
        <div class="task-card-badges">
          ${priorityBadge(task.priority || 'medium')}
          ${isOverdue ? `<span class="badge badge-danger">Overdue</span>` : ''}
        </div>
        ${ctx.profile.role !== 'intern' ? `
        <div class="task-card-menu">
          <button class="btn btn-ghost btn-icon-sm" data-task-action="edit" title="Edit">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="btn btn-ghost btn-icon-sm" data-task-action="delete" title="Delete" style="color:var(--danger)">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
          </button>
        </div>
        ` : ''}
      </div>
      <h4 class="task-card-title">${task.title}</h4>
      ${task.description ? `<p class="task-card-desc">${task.description.slice(0, 80)}${task.description.length > 80 ? '…' : ''}</p>` : ''}
      <div class="task-card-footer">
        <div class="task-card-assignee">
          ${task.assignee ? `
            <div class="avatar avatar-sm avatar-purple">${task.assignee.full_name?.[0] || '?'}</div>
            <span>${task.assignee.full_name?.split(' ')[0] || ''}</span>
          ` : '<span class="text-muted text-sm">Unassigned</span>'}
        </div>
        ${task.deadline ? `
          <span class="task-deadline ${isOverdue ? 'text-danger' : 'text-muted'}">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            ${formatDate(task.deadline)}
          </span>
        ` : ''}
      </div>
    </div>
  `;
}

function updateColumnCounts() {
  COLUMNS.forEach(col => {
    const count = allTasks.filter(t => t.status === col.id).length;
    const badge = document.getElementById(`count-${col.id}`);
    if (badge) badge.textContent = count;
  });
}

// ── Drag & Drop ───────────────────────────────────────────────
function onDragStart(e) {
  draggedTaskId = e.currentTarget.dataset.taskId;
  e.currentTarget.classList.add('is-dragging');
  e.dataTransfer.effectAllowed = 'move';
}

async function onDrop(e, zone) {
  e.preventDefault();
  zone.classList.remove('drag-over');
  const newStatus = zone.dataset.status;
  if (!draggedTaskId || !newStatus) return;

  try {
    await moveTask(draggedTaskId, newStatus);
    await loadBoard();
  } catch (err) {
    toast.error('Move failed', err.message);
  }
  draggedTaskId = null;
}

// ── Task CRUD ─────────────────────────────────────────────────
async function handleTaskAction(action, taskId) {
  if (action === 'edit')   openTaskEdit(taskId);
  if (action === 'delete') {
    const ok = await confirm({ title: 'Delete task?', message: 'This cannot be undone.', type: 'danger' });
    if (ok) { await deleteTask(taskId); toast.success('Task deleted'); await loadBoard(); }
  }
}

function openTaskEdit(taskId) {
  const task = allTasks.find(t => t.id === taskId);
  if (!task) return;
  editingTaskId = taskId;
  document.getElementById('task-modal-title').textContent = 'Edit Task';
  populateForm('task-form', {
    title: task.title, description: task.description,
    priority: task.priority, status: task.status,
    assigned_to: task.assigned_to,
    deadline: task.deadline?.split('T')[0],
  });
  openModal('task-modal');
}

document.getElementById('btn-add-task')?.addEventListener('click', () => {
  editingTaskId = null;
  document.getElementById('task-modal-title').textContent = 'New Task';
  document.getElementById('task-form')?.reset();
  openModal('task-modal');
});

document.getElementById('task-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const valid = validateForm('task-form', { title: [rules.required()] });
  if (!valid) return;

  const btn = e.target.querySelector('[type="submit"]');
  setLoading(btn, true);
  const data = readForm('task-form');
  data.assigned_by = ctx.profile.id;

  try {
    if (editingTaskId) {
      await updateTask(editingTaskId, data);
      toast.success('Task updated');
    } else {
      await createTask(data);
      toast.success('Task created');
    }
    closeModal('task-modal');
    await loadBoard();
  } catch (err) {
    toast.error('Save failed', err.message);
  } finally {
    setLoading(btn, false);
  }
});

// ── Task detail view ──────────────────────────────────────────
function openTaskDetail(taskId) {
  const task = allTasks.find(t => t.id === taskId);
  if (!task) return;

  const detail = document.getElementById('task-detail');
  if (!detail) return;

  detail.querySelector('#detail-title').textContent       = task.title;
  detail.querySelector('#detail-desc').textContent        = task.description || 'No description.';
  detail.querySelector('#detail-status').innerHTML        = statusBadge(task.status);
  detail.querySelector('#detail-priority').innerHTML      = priorityBadge(task.priority || 'medium');
  detail.querySelector('#detail-assignee').textContent    = task.assignee?.full_name || 'Unassigned';
  detail.querySelector('#detail-deadline').textContent    = formatDate(task.deadline);
  detail.querySelector('#detail-created').textContent     = formatRelative(task.created_at);

  openModal('task-detail-modal');
}

// ── Load assignee options ─────────────────────────────────────
async function loadAssigneeOptions() {
  try {
    let roleIn = null;
    // Employees can only assign to interns
    if (ctx.profile.role === 'employee') {
      roleIn = ['intern'];
    } 
    // Interns don't assign tasks, but if they load it, return empty
    else if (ctx.profile.role === 'intern') {
      roleIn = []; // This will make the 'in' filter return empty
    }

    let { data } = await getEmployees({ pageSize: 100, roleIn });
    
    if (ctx.profile.role === 'employee') {
      const selfExists = data.some(e => e.id === ctx.profile.id);
      if (!selfExists) {
        data = [{ id: ctx.profile.id, full_name: `${ctx.profile.full_name} (Me)` }, ...data];
      }
    }

    const selects = document.querySelectorAll('.assignee-select');
    selects.forEach(sel => {
      sel.innerHTML = `<option value="">Unassigned</option>` +
        data.map(e => `<option value="${e.id}">${e.full_name}</option>`).join('');
    });
  } catch {}
}

// ── Search ────────────────────────────────────────────────────
document.getElementById('task-search')?.addEventListener('input', debounce(() => loadBoard(), 300));
document.getElementById('task-assignee')?.addEventListener('change', () => loadBoard());

// ── Realtime ─────────────────────────────────────────────────
await subscribeTasks(() => loadBoard());

// ── Init ──────────────────────────────────────────────────────
await loadAssigneeOptions();
await loadBoard();
