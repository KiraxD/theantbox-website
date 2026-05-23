// ============================================================
// THE ANT BOX ERP — crm.js
// CRM dashboard controller: Leads Kanban & Clients Directory
// ============================================================

import { bootPage } from './modules/authGuard.js';
import {
  initTheme,
  initSidebar,
  initLogout,
  initThemeToggle,
  initDropdowns,
  statusBadge,
  avatarHTML,
  formatDate,
  renderSkeletonRows,
  renderEmptyState,
} from './modules/ui.js';
import { openModal, closeModal, populateForm, readForm, confirm, setupModalClosers } from './modules/modal.js';
import toast from './modules/toast.js';
import { validateForm } from './modules/validators.js';
import {
  getLeads,
  getLead,
  createLead,
  updateLead,
  updateLeadStatus,
  deleteLead,
  getClients,
  getClient,
  createClient,
  updateClient,
  getInteractions,
  addInteraction,
  getCRMStats,
  getSalesPipelineStages,
} from './services/crmService.js';
import { getEmployees } from './services/employeeService.js';

// Init page
initTheme();
const ctx = await bootPage({ requiredRoles: ['super_admin', 'admin', 'manager', 'hr', 'accountant', 'employee'] });
if (!ctx) throw new Error('Not authenticated');
initSidebar();
initLogout();
initThemeToggle();
initDropdowns();
setupModalClosers();

// Page State
let state = {
  activeTab: 'leads-panel',
  // Leads Kanban State
  leads: [],
  stages: [],
  leadSearch: '',
  leadOwner: '',
  employees: [],
  // Clients Table State
  clients: [],
  clientSearch: '',
  clientStatus: '',
  clientPage: 1,
  clientPageSize: 15,
  clientTotalPages: 1,
  // Current editing / detailing IDs
  editingLeadId: null,
  editingClientId: null,
  activeDetailId: null,
  activeDetailType: null, // 'lead' or 'client'
};

// DOM elements
const leadsTabBtn = document.querySelector('[data-tab="leads-panel"]');
const clientsTabBtn = document.querySelector('[data-tab="clients-panel"]');
const leadsPanel = document.getElementById('leads-panel');
const clientsPanel = document.getElementById('clients-panel');

const btnAddLead = document.getElementById('btn-add-lead');
const btnAddClient = document.getElementById('btn-add-client');

const leadSearchInput = document.getElementById('lead-search');
const leadOwnerFilter = document.getElementById('lead-owner-filter');
const leadsCountSpan = document.getElementById('leads-count');
const kanbanBoard = document.getElementById('kanban-board');

const clientSearchInput = document.getElementById('client-search');
const clientStatusFilter = document.getElementById('client-status-filter');
const clientsCountSpan = document.getElementById('clients-count');
const clientsTbody = document.getElementById('clients-tbody');
const clientsPagination = document.getElementById('clients-pagination');

// Modals & Forms
const leadModal = document.getElementById('lead-modal');
const leadForm = document.getElementById('lead-form');
const leadModalTitle = document.getElementById('lead-modal-title');
const leadAssignedSelect = document.getElementById('lead_assigned');

const clientModal = document.getElementById('client-modal');
const clientForm = document.getElementById('client-form');
const clientModalTitle = document.getElementById('client-modal-title');

const detailsModal = document.getElementById('details-modal');
const detailsModalTitle = document.getElementById('details-modal-title');
const detailsInfoCard = document.getElementById('details-info-card');
const interactionForm = document.getElementById('interaction-form');
const interactionHistoryList = document.getElementById('interaction-history-list');

// Setup Tabs
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    
    btn.classList.add('active');
    const panelId = btn.getAttribute('data-tab');
    document.getElementById(panelId).classList.add('active');
    state.activeTab = panelId;

    if (panelId === 'leads-panel') {
      loadLeadsPipeline();
    } else {
      loadClientsDirectory();
    }
  });
});

// Setup filters listeners
leadSearchInput.addEventListener('input', debounce(() => {
  state.leadSearch = leadSearchInput.value.trim();
  loadLeadsPipeline();
}, 300));

leadOwnerFilter.addEventListener('change', () => {
  state.leadOwner = leadOwnerFilter.value;
  loadLeadsPipeline();
});

clientSearchInput.addEventListener('input', debounce(() => {
  state.clientSearch = clientSearchInput.value.trim();
  state.clientPage = 1;
  loadClientsDirectory();
}, 300));

clientStatusFilter.addEventListener('change', () => {
  state.clientStatus = clientStatusFilter.value;
  state.clientPage = 1;
  loadClientsDirectory();
});

// Setup actions
btnAddLead.addEventListener('click', () => {
  state.editingLeadId = null;
  leadModalTitle.textContent = 'Add Lead';
  leadForm.reset();
  openModal('lead-modal');
});

btnAddClient.addEventListener('click', () => {
  state.editingClientId = null;
  clientModalTitle.textContent = 'Add Client';
  clientForm.reset();
  openModal('client-modal');
});

// Lead Form Submit
leadForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const payload = readForm(leadForm);
    if (!payload.assigned_to) payload.assigned_to = null;
    
    if (state.editingLeadId) {
      await updateLead(state.editingLeadId, payload);
      toast.success('Lead updated successfully');
    } else {
      await createLead(payload);
      toast.success('Lead created successfully');
    }
    closeModal('lead-modal');
    loadLeadsPipeline();
  } catch (err) {
    toast.error(err.message);
  }
});

// Client Form Submit
clientForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const payload = readForm(clientForm);
    if (state.editingClientId) {
      await updateClient(state.editingClientId, payload);
      toast.success('Client updated successfully');
    } else {
      await createClient(payload);
      toast.success('Client created successfully');
    }
    closeModal('client-modal');
    loadClientsDirectory();
  } catch (err) {
    toast.error(err.message);
  }
});

// Interaction Form Submit
interactionForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const payload = readForm(interactionForm);
    if (!payload.lead_id) delete payload.lead_id;
    if (!payload.client_id) delete payload.client_id;

    await addInteraction(payload);
    toast.success('Interaction logged successfully');
    interactionForm.reset();
    
    // Set IDs back
    if (state.activeDetailType === 'lead') {
      document.getElementById('interaction_lead_id').value = state.activeDetailId;
    } else {
      document.getElementById('interaction_client_id').value = state.activeDetailId;
    }
    
    loadInteractions(state.activeDetailType, state.activeDetailId);
  } catch (err) {
    toast.error(err.message);
  }
});

// Load Initial Data
async function init() {
  try {
    // 1. Fetch Employees for filters and assignments
    const empRes = await getEmployees({ pageSize: 100 });
    state.employees = empRes.data ?? [];
    
    // Populating Assigned To dropdown
    leadAssignedSelect.innerHTML = '<option value="">Unassigned</option>' +
      state.employees.map(emp => `<option value="${emp.id}">${emp.full_name}</option>`).join('');

    // Populating Owner filter
    leadOwnerFilter.innerHTML = '<option value="">All Owners</option>' +
      state.employees.map(emp => `<option value="${emp.id}">${emp.full_name}</option>`).join('');

    // 2. Fetch Pipeline Stages
    state.stages = await getSalesPipelineStages();

    // 3. Load active tab
    if (state.activeTab === 'leads-panel') {
      await loadLeadsPipeline();
    } else {
      await loadClientsDirectory();
    }
  } catch (err) {
    toast.error('Failed to load CRM data: ' + err.message);
  }
}

// ── LEADS PIPELINE LOGIC ──────────────────────────────────────

async function loadLeadsPipeline() {
  try {
    kanbanBoard.innerHTML = '<div style="padding:40px; text-align:center; width:100%; color:var(--muted);">Loading leads...</div>';
    
    const stats = await getCRMStats();
    leadsCountSpan.textContent = `${stats.total_leads} total leads • ${stats.active_leads} active pipeline • ${stats.won_deals} closed won`;

    // Fetch leads matching search & owner filter
    const leadsRes = await getLeads({
      pageSize: 1000, // fetch all for kanban layout
      search: state.leadSearch,
      assignedTo: state.leadOwner || null,
    });
    
    state.leads = leadsRes.data ?? [];
    renderKanban();
  } catch (err) {
    toast.error('Failed to load leads: ' + err.message);
  }
}

function renderKanban() {
  kanbanBoard.innerHTML = '';

  state.stages.forEach(stage => {
    const colLeads = state.leads.filter(l => l.status === stage.key);
    
    // Create column element
    const col = document.createElement('div');
    col.className = 'kanban-col';
    col.setAttribute('data-stage', stage.key);
    
    col.innerHTML = `
      <div class="kanban-col-header">
        <span class="kanban-col-title">${stage.name}</span>
        <span class="kanban-col-count">${colLeads.length}</span>
      </div>
      <div class="kanban-col-body" id="col-${stage.key}">
        <!-- Cards loaded dynamically -->
      </div>
    `;
    
    kanbanBoard.appendChild(col);
    const colBody = col.querySelector('.kanban-col-body');

    // Drag-over handlers
    colBody.addEventListener('dragover', (e) => {
      e.preventDefault();
      colBody.classList.add('drag-over');
    });

    colBody.addEventListener('dragleave', () => {
      colBody.classList.remove('drag-over');
    });

    colBody.addEventListener('drop', async (e) => {
      e.preventDefault();
      colBody.classList.remove('drag-over');
      const leadId = e.dataTransfer.getData('text/plain');
      if (leadId) {
        try {
          await updateLeadStatus(leadId, stage.key);
          toast.success(`Deal moved to ${stage.name}`);
          loadLeadsPipeline();
        } catch (err) {
          toast.error(err.message);
        }
      }
    });

    if (colLeads.length === 0) {
      colBody.innerHTML = '<div class="kanban-empty">No leads in this stage</div>';
    } else {
      colLeads.forEach(lead => {
        const card = document.createElement('div');
        card.className = 'task-card-item';
        card.setAttribute('draggable', 'true');
        card.setAttribute('data-id', lead.id);

        const companyStr = lead.company ? ` • ${lead.company}` : '';
        const ownerName = lead.assigned_emp ? lead.assigned_emp.full_name : 'Unassigned';
        const phoneStr = lead.phone ? `<div style="font-size:11px; margin-top:2px;">📞 ${lead.phone}</div>` : '';

        // Touch friendly dropdown for stage selection
        const selectOptions = state.stages.map(s => 
          `<option value="${s.key}" ${s.key === lead.status ? 'selected' : ''}>Move to: ${s.name}</option>`
        ).join('');

        card.innerHTML = `
          <div class="task-card-header">
            <span class="status ${lead.status === 'won' ? 'active' : lead.status === 'lost' ? 'inactive' : 'pending'}" style="font-size:10px;">${lead.source || 'Direct'}</span>
            <div style="display:flex; gap:6px;">
              <button class="btn btn-ghost btn-icon btn-sm edit-lead-btn" title="Edit details">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"/></svg>
              </button>
              <button class="btn btn-ghost btn-icon btn-sm delete-lead-btn" style="color:var(--red);" title="Delete lead">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            </div>
          </div>
          <div class="task-card-title view-lead-details" style="cursor:pointer;" title="View Interactions">${lead.name}</div>
          <div class="task-card-desc">
            <strong>${lead.designation || 'Lead'}${companyStr}</strong>
            <div style="font-size:11px; margin-top:4px;">✉️ ${lead.email}</div>
            ${phoneStr}
          </div>
          <div class="task-card-footer">
            <div class="task-card-assignee">
              <div class="avatar avatar-xs avatar-purple">${ownerName.substring(0,2).toUpperCase()}</div>
              <span>${ownerName}</span>
            </div>
          </div>
          <div style="margin-top:10px; border-top:1px solid var(--line); padding-top:8px;">
            <select class="select select-sm stage-selector" style="font-size:11px; padding:2px 6px; height:26px; width:100%;">
              ${selectOptions}
            </select>
          </div>
        `;

        // Card drag handlers
        card.addEventListener('dragstart', (e) => {
          card.classList.add('is-dragging');
          e.dataTransfer.setData('text/plain', lead.id);
        });

        card.addEventListener('dragend', () => {
          card.classList.remove('is-dragging');
        });

        // Edit lead details
        card.querySelector('.edit-lead-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          openEditLead(lead);
        });

        // Delete lead
        card.querySelector('.delete-lead-btn').addEventListener('click', async (e) => {
          e.stopPropagation();
          const confirmed = await confirm({
            title: 'Delete Lead',
            message: `Are you sure you want to delete lead ${lead.name}?`,
            confirmText: 'Delete',
            confirmClass: 'btn-danger'
          });
          if (confirmed) {
            try {
              await deleteLead(lead.id);
              toast.success('Lead deleted');
              loadLeadsPipeline();
            } catch (err) {
              toast.error(err.message);
            }
          }
        });

        // View interactions and detail modal
        card.querySelector('.view-lead-details').addEventListener('click', () => {
          openDetailsModal('lead', lead.id);
        });

        // Status drop down selector change
        card.querySelector('.stage-selector').addEventListener('change', async (e) => {
          try {
            await updateLeadStatus(lead.id, e.target.value);
            toast.success(`Status updated`);
            loadLeadsPipeline();
          } catch (err) {
            toast.error(err.message);
          }
        });

        colBody.appendChild(card);
      });
    }
  });
}

function openEditLead(lead) {
  state.editingLeadId = lead.id;
  leadModalTitle.textContent = 'Edit Lead';
  populateForm(leadForm, {
    name: lead.name,
    email: lead.email,
    phone: lead.phone || '',
    company: lead.company || '',
    designation: lead.designation || '',
    industry: lead.industry || '',
    source: lead.source || 'Direct',
    assigned_to: lead.assigned_to || '',
    status: lead.status || 'new',
  });
  openModal('lead-modal');
}

// ── CLIENTS DIRECTORY LOGIC ───────────────────────────────────

async function loadClientsDirectory() {
  try {
    clientsTbody.innerHTML = '';
    renderSkeletonRows(clientsTbody, 6, 6);

    const stats = await getCRMStats();
    clientsCountSpan.textContent = `${stats.total_clients} active clients`;

    const clientsRes = await getClients({
      page: state.clientPage,
      pageSize: state.clientPageSize,
      search: state.clientSearch,
      status: state.clientStatus,
    });

    state.clients = clientsRes.data ?? [];
    state.clientTotalPages = clientsRes.pages ?? 1;

    renderClients();
  } catch (err) {
    toast.error('Failed to load clients: ' + err.message);
  }
}

function renderClients() {
  clientsTbody.innerHTML = '';
  
  if (state.clients.length === 0) {
    renderEmptyState(clientsTbody, 'No clients found matching the filter criteria.');
    clientsPagination.innerHTML = '';
    return;
  }

  state.clients.forEach(client => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <div class="table-name-cell">
          <div class="name">${client.name}</div>
          <div class="sub">${client.address || ''}</div>
        </div>
      </td>
      <td>${client.email || '-'}</td>
      <td>${client.phone || '-'}</td>
      <td>${[client.city, client.country].filter(Boolean).join(', ') || '-'}</td>
      <td>
        <span class="status ${client.status === 'active' ? 'active' : 'inactive'}">
          ${client.status === 'active' ? 'Active' : 'Inactive'}
        </span>
      </td>
      <td>
        <div class="table-actions justify-end">
          <button class="btn btn-ghost btn-icon btn-sm view-cli-details" title="View interactions">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          </button>
          <button class="btn btn-ghost btn-icon btn-sm edit-cli-btn" title="Edit client details">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"/></svg>
          </button>
        </div>
      </td>
    `;

    tr.querySelector('.view-cli-details').addEventListener('click', () => {
      openDetailsModal('client', client.id);
    });

    tr.querySelector('.edit-cli-btn').addEventListener('click', () => {
      openEditClient(client);
    });

    clientsTbody.appendChild(tr);
  });

  renderPagination();
}

function openEditClient(client) {
  state.editingClientId = client.id;
  clientModalTitle.textContent = 'Edit Client';
  populateForm(clientForm, {
    name: client.name,
    email: client.email || '',
    phone: client.phone || '',
    address: client.address || '',
    city: client.city || '',
    state: client.state || '',
    postal_code: client.postal_code || '',
    country: client.country || '',
    status: client.status || 'active',
  });
  openModal('client-modal');
}

function renderPagination() {
  clientsPagination.innerHTML = '';
  
  if (state.clientTotalPages <= 1) return;

  const ul = document.createElement('ul');
  ul.className = 'pagination-list';

  // Prev
  const prevLi = document.createElement('li');
  prevLi.innerHTML = `<button class="btn btn-ghost" ${state.clientPage === 1 ? 'disabled' : ''}>← Prev</button>`;
  prevLi.addEventListener('click', () => {
    if (state.clientPage > 1) {
      state.clientPage--;
      loadClientsDirectory();
    }
  });
  ul.appendChild(prevLi);

  // Page Numbers
  for (let i = 1; i <= state.clientTotalPages; i++) {
    const li = document.createElement('li');
    li.innerHTML = `<button class="btn ${state.clientPage === i ? 'btn-purple' : 'btn-ghost'}">${i}</button>`;
    li.addEventListener('click', () => {
      state.clientPage = i;
      loadClientsDirectory();
    });
    ul.appendChild(li);
  }

  // Next
  const nextLi = document.createElement('li');
  nextLi.innerHTML = `<button class="btn btn-ghost" ${state.clientPage === state.clientTotalPages ? 'disabled' : ''}>Next →</button>`;
  nextLi.addEventListener('click', () => {
    if (state.clientPage < state.clientTotalPages) {
      state.clientPage++;
      loadClientsDirectory();
    }
  });
  ul.appendChild(nextLi);

  clientsPagination.appendChild(ul);
}

// ── DETAILS & INTERACTIONS LOGIC ──────────────────────────────

async function openDetailsModal(type, id) {
  state.activeDetailId = id;
  state.activeDetailType = type;
  
  // Reset interaction form fields
  interactionForm.reset();
  
  // Set target IDs in interaction form
  const leadIdInput = document.getElementById('interaction_lead_id');
  const clientIdInput = document.getElementById('interaction_client_id');
  
  if (type === 'lead') {
    leadIdInput.value = id;
    clientIdInput.value = '';
    
    // Fetch details
    const lead = await getLead(id);
    detailsModalTitle.textContent = `Lead Profile: ${lead.name}`;
    
    const ownerName = lead.assigned_emp ? lead.assigned_emp.full_name : 'Unassigned';
    
    // Detail Card HTML
    detailsInfoCard.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start;">
        <div>
          <h4 style="margin:0 0 6px; font-size:16px;">${lead.name}</h4>
          <span style="font-size:12px; color:var(--muted);">
            ${lead.designation || 'Lead'} ${lead.company ? `@ ${lead.company}` : ''}
          </span>
          <div style="font-size:13px; margin-top:8px; display:flex; flex-direction:column; gap:4px;">
            <span>✉️ <strong>Email:</strong> ${lead.email}</span>
            <span>📞 <strong>Phone:</strong> ${lead.phone || 'Not specified'}</span>
            <span>🏢 <strong>Industry:</strong> ${lead.industry || 'Not specified'}</span>
          </div>
        </div>
        <div style="text-align:right;">
          <span class="status ${lead.status === 'won' ? 'active' : lead.status === 'lost' ? 'inactive' : 'pending'}">
            ${lead.status.toUpperCase()}
          </span>
          <div style="margin-top:12px; font-size:12px; color:var(--muted);">
            <strong>Owner:</strong> ${ownerName}<br>
            <strong>Source:</strong> ${lead.source || 'Direct'}
          </div>
          ${lead.status !== 'won' ? `
            <button class="btn btn-purple btn-sm mt-4" id="btn-convert-client" type="button" style="padding:6px 12px; font-size:12px;">
              Convert to Client
            </button>
          ` : ''}
        </div>
      </div>
    `;

    // Convert to Client trigger
    const convertBtn = document.getElementById('btn-convert-client');
    if (convertBtn) {
      convertBtn.addEventListener('click', async () => {
        const confirmed = await confirm({
          title: 'Convert Lead to Client',
          message: `Are you sure you want to convert ${lead.name} to a client? This will create a client record and mark the lead as WON.`,
          confirmText: 'Convert',
          confirmClass: 'btn-purple'
        });
        if (confirmed) {
          try {
            // Create Client
            await createClient({
              name: lead.company ? `${lead.company} (${lead.name})` : lead.name,
              email: lead.email,
              phone: lead.phone,
            });
            // Update Lead Status to Won
            await updateLeadStatus(lead.id, 'won');
            toast.success('Lead successfully converted to Client!');
            closeModal('details-modal');
            loadLeadsPipeline();
          } catch (err) {
            toast.error(err.message);
          }
        }
      });
    }

  } else {
    leadIdInput.value = '';
    clientIdInput.value = id;
    
    // Fetch details
    const client = await getClient(id);
    detailsModalTitle.textContent = `Client Profile: ${client.name}`;
    
    // Detail Card HTML
    detailsInfoCard.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start;">
        <div>
          <h4 style="margin:0 0 6px; font-size:16px;">${client.name}</h4>
          <div style="font-size:13px; display:flex; flex-direction:column; gap:4px; margin-top:8px;">
            <span>✉️ <strong>Email:</strong> ${client.email || 'Not specified'}</span>
            <span>📞 <strong>Phone:</strong> ${client.phone || 'Not specified'}</span>
            <span>📍 <strong>Location:</strong> ${[client.address, client.city, client.state, client.country].filter(Boolean).join(', ') || 'Not specified'}</span>
          </div>
        </div>
        <div style="text-align:right;">
          <span class="status ${client.status === 'active' ? 'active' : 'inactive'}">
            ${client.status.toUpperCase()}
          </span>
          <div style="margin-top:12px; font-size:12px; color:var(--muted);">
            <strong>Client ID:</strong> ${client.id.substring(0,8)}<br>
            <strong>Joined:</strong> ${formatDate(client.created_at)}
          </div>
        </div>
      </div>
    `;
  }

  // Load Interactions List
  await loadInteractions(type, id);
  openModal('details-modal');
}

async function loadInteractions(type, id) {
  interactionHistoryList.innerHTML = '<div style="padding:16px; text-align:center; color:var(--muted); font-size:12px;">Loading interactions...</div>';
  
  try {
    const payload = {};
    if (type === 'lead') payload.leadId = id;
    else payload.clientId = id;

    const list = await getInteractions(payload);
    
    interactionHistoryList.innerHTML = '';
    if (list.length === 0) {
      interactionHistoryList.innerHTML = '<div style="padding:16px; text-align:center; color:var(--muted-light); font-size:12px;">No historical interactions logged.</div>';
      return;
    }

    list.forEach(item => {
      const div = document.createElement('div');
      div.className = 'interaction-item';
      
      const creatorName = item.created_by_emp ? item.created_by_emp.full_name : 'System';
      const outcomeStr = item.outcome ? `<div>🎯 <strong>Outcome:</strong> ${item.outcome}</div>` : '';
      const nextStepsStr = item.next_steps ? `<div>➡️ <strong>Next Steps:</strong> ${item.next_steps}</div>` : '';

      div.innerHTML = `
        <div class="interaction-header">
          <span class="interaction-subject">${item.subject}</span>
          <span class="interaction-date">${formatDate(item.interaction_date)}</span>
        </div>
        <span class="status active" style="font-size:9px; padding:1px 4px; display:inline-block; margin-bottom:4px;">${item.interaction_type}</span>
        <div class="interaction-body">
          ${item.notes || 'No description provided.'}
          ${outcomeStr || nextStepsStr ? `
            <div style="margin-top:8px; border-top:1px dashed var(--line); padding-top:4px; font-size:11px; color:var(--muted);">
              ${outcomeStr}
              ${nextStepsStr}
            </div>
          ` : ''}
        </div>
        <div class="interaction-meta">Logged by ${creatorName}</div>
      `;

      interactionHistoryList.appendChild(div);
    });
  } catch (err) {
    interactionHistoryList.innerHTML = `<div style="padding:16px; text-align:center; color:var(--red); font-size:12px;">Failed to load timeline: ${err.message}</div>`;
  }
}

// Helper Debounce
function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// Execute initial load
init();
