// ─── CONFIG ───────────────────────────────────────────────────────────────────
// Replace these with your Google Cloud Console credentials.
// See README.md for setup instructions.
const GOOGLE_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID';
const GOOGLE_API_KEY   = 'YOUR_GOOGLE_API_KEY';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/drive.file',
].join(' ');

// ─── STATE ────────────────────────────────────────────────────────────────────
let tasks = JSON.parse(localStorage.getItem('kanban-tasks') || '[]');
let gapiReady = false;
let tokenClient = null;
let accessToken = null;
let currentUser = null;
let dragSrcId = null;

// ─── PERSISTENCE ──────────────────────────────────────────────────────────────
function saveTasks() {
  localStorage.setItem('kanban-tasks', JSON.stringify(tasks));
}

// ─── GOOGLE API INIT ──────────────────────────────────────────────────────────
function gapiLoaded() {
  gapi.load('client', async () => {
    const initOpts = { discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest'] };
    if (GOOGLE_API_KEY !== 'YOUR_GOOGLE_API_KEY') initOpts.apiKey = GOOGLE_API_KEY;
    try {
      await gapi.client.init(initOpts);
    } catch (e) {
      console.warn('GAPI init error:', e.message);
    }
    gapiReady = true;

    // Restore stored token
    const stored = sessionStorage.getItem('gtoken');
    if (stored) {
      try {
        accessToken = JSON.parse(stored);
        gapi.client.setToken(accessToken);
        fetchUserInfo();
      } catch {}
    }
  });
}

function initTokenClient() {
  if (!window.google?.accounts?.oauth2) return;
  if (GOOGLE_CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID') return;
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: SCOPES,
    callback: async (resp) => {
      if (resp.error) { showToast('Sign-in failed: ' + resp.error, 'error'); return; }
      accessToken = resp;
      gapi.client.setToken(accessToken);
      sessionStorage.setItem('gtoken', JSON.stringify(accessToken));
      await fetchUserInfo();
      showToast('Signed in to Google!', 'success');
    },
  });
}

async function fetchUserInfo() {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken.access_token}` },
    });
    const info = await res.json();
    if (info.sub) {
      currentUser = info;
      document.getElementById('user-avatar').src = info.picture || '';
      document.getElementById('user-name').textContent = (info.name || '').split(' ')[0];
      document.getElementById('user-info').classList.remove('hidden');
      document.getElementById('btn-signin').classList.add('hidden');
    }
  } catch {}
}

function signIn() {
  if (GOOGLE_CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID') {
    showToast('Add your Google Client ID in app.js to enable Google integration', 'info');
    return;
  }
  if (!tokenClient) initTokenClient();
  if (tokenClient) tokenClient.requestAccessToken({ prompt: '' });
}

function signOut() {
  if (accessToken?.access_token) {
    google.accounts.oauth2.revoke(accessToken.access_token, () => {});
  }
  accessToken = null;
  currentUser = null;
  gapi.client.setToken(null);
  sessionStorage.removeItem('gtoken');
  document.getElementById('user-info').classList.add('hidden');
  document.getElementById('btn-signin').classList.remove('hidden');
  showToast('Signed out', 'info');
}

// ─── RENDER ───────────────────────────────────────────────────────────────────
function renderBoard() {
  const statuses = ['TODO', 'DOING', 'DONE'];
  statuses.forEach(status => {
    const col = document.getElementById(`tasks-${status}`);
    const filtered = tasks.filter(t => t.status === status);
    document.getElementById(`count-${status}`).textContent = filtered.length;

    col.innerHTML = '';
    if (filtered.length === 0) {
      col.innerHTML = '<div class="empty-state">No tasks</div>';
      return;
    }
    filtered.forEach(task => {
      col.appendChild(createCardEl(task));
    });
  });
}

function createCardEl(task) {
  const div = document.createElement('div');
  div.className = 'card';
  div.dataset.id = task.id;
  div.draggable = true;
  div.style.borderLeft = `3px solid ${task.color || '#6366f1'}`;

  div.addEventListener('dragstart', onCardDragStart);
  div.addEventListener('dragend', onCardDragEnd);
  div.addEventListener('click', () => openEditModal(task.id));

  const deadline = task.deadline ? new Date(task.deadline) : null;
  const now = new Date();
  const isOverdue = deadline && deadline < now && task.status !== 'DONE';
  const isToday = deadline && deadline.toDateString() === now.toDateString();
  const deadlineClass = isOverdue ? 'overdue' : isToday ? 'today' : '';
  const attachCount = (task.attachments || []).length;

  div.innerHTML = `
    <div class="card-top">
      <span class="prio-tag ${task.priority || 'medium'}">${capitalize(task.priority || 'medium')}</span>
      ${attachCount ? `<span class="card-attach"><svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M13.5 7.5l-6 6a4 4 0 01-5.657-5.657l6.5-6.5a2.5 2.5 0 013.536 3.536l-6.5 6.5a1 1 0 01-1.414-1.414l5.5-5.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>${attachCount}</span>` : ''}
    </div>
    <div class="card-title">${escHtml(task.title)}</div>
    ${task.description ? `<div class="card-desc">${escHtml(task.description)}</div>` : ''}
    <div class="card-footer">
      ${deadline ? `<span class="card-meta ${deadlineClass}"><svg width="11" height="11" viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="12" height="12" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M5 1v2M11 1v2M2 7h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>${formatDate(deadline)}</span>` : ''}
      ${task.estimate_hours ? `<span class="card-meta"><svg width="11" height="11" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.5"/><path d="M8 5v3.5l2 1.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>${task.estimate_hours}h</span>` : ''}
    </div>
  `;
  return div;
}

// ─── DRAG & DROP ──────────────────────────────────────────────────────────────
function onCardDragStart(e) {
  dragSrcId = e.currentTarget.dataset.id;
  e.currentTarget.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragSrcId);
}
function onCardDragEnd(e) { e.currentTarget.classList.remove('dragging'); }

function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.classList.add('drag-over');
}
function onDragLeave(e) { e.currentTarget.classList.remove('drag-over'); }
function onDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  const newStatus = e.currentTarget.dataset.status;
  if (!dragSrcId || !newStatus) return;
  const task = tasks.find(t => t.id === dragSrcId);
  if (task && task.status !== newStatus) {
    task.status = newStatus;
    saveTasks();
    renderBoard();
    updateCalendarEvent(task).catch(() => {});
  }
  dragSrcId = null;
}

// ─── MODAL STATE ──────────────────────────────────────────────────────────────
let modalTaskId = null;
let currentColor = '#6366f1';
let uploadingFiles = false;

function openCreateModal() {
  modalTaskId = null;
  resetForm();
  document.getElementById('modal-title').textContent = 'New Task';
  document.getElementById('btn-save').textContent = 'Create Task';
  document.getElementById('btn-delete').classList.add('hidden');
  document.getElementById('status-field').style.display = 'none';
  document.getElementById('attach-section').style.display = 'none';
  document.getElementById('new-task-hint').style.display = 'block';
  document.getElementById('task-modal').classList.remove('hidden');
  setTimeout(() => document.getElementById('f-title').focus(), 50);
}

function openEditModal(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  modalTaskId = id;

  document.getElementById('task-id').value = id;
  document.getElementById('f-title').value = task.title;
  document.getElementById('f-desc').value = task.description || '';
  document.getElementById('f-deadline').value = task.deadline ? task.deadline.slice(0, 16) : '';
  document.getElementById('f-estimate').value = task.estimate_hours || '';
  document.getElementById('f-status').value = task.status;

  setPriority(task.priority || 'medium');
  setColor(task.color || '#6366f1');
  renderAttachments(task.attachments || []);

  document.getElementById('modal-title').textContent = 'Edit Task';
  document.getElementById('btn-save').textContent = 'Save Changes';
  document.getElementById('btn-delete').classList.remove('hidden');
  document.getElementById('status-field').style.display = 'flex';
  document.getElementById('attach-section').style.display = 'flex';
  document.getElementById('new-task-hint').style.display = 'none';
  updateDropzoneState();

  document.getElementById('task-modal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('task-modal').classList.add('hidden');
  modalTaskId = null;
}

function handleOverlayClick(e) {
  if (e.target === e.currentTarget) closeModal();
}

function resetForm() {
  document.getElementById('task-form').reset();
  document.getElementById('task-id').value = '';
  setPriority('medium');
  setColor('#6366f1');
  renderAttachments([]);
  document.getElementById('attach-hint').textContent = '';
}

// ─── FORM SUBMIT ──────────────────────────────────────────────────────────────
async function handleFormSubmit(e) {
  e.preventDefault();
  const title = document.getElementById('f-title').value.trim();
  if (!title) return;

  const saveBtn = document.getElementById('btn-save');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  const data = {
    title,
    description: document.getElementById('f-desc').value.trim(),
    priority: document.getElementById('f-priority').value,
    color: document.getElementById('f-color').value,
    deadline: document.getElementById('f-deadline').value || null,
    estimate_hours: parseFloat(document.getElementById('f-estimate').value) || null,
    status: document.getElementById('f-status').value || 'TODO',
  };

  try {
    if (modalTaskId) {
      // Update
      const task = tasks.find(t => t.id === modalTaskId);
      Object.assign(task, data, { updatedAt: new Date().toISOString() });
      saveTasks();
      renderBoard();
      showToast('Task updated');
      updateCalendarEvent(task).catch(() => {});
      closeModal();
    } else {
      // Create
      const id = crypto.randomUUID();
      const task = { id, ...data, status: 'TODO', attachments: [], createdAt: new Date().toISOString() };
      tasks.unshift(task);
      saveTasks();
      renderBoard();

      let toastMsg = 'Task created';
      if (accessToken) {
        const eventId = await createCalendarEvent(task);
        if (eventId) { task.calendarEventId = eventId; saveTasks(); toastMsg += ' + Calendar event added'; }
      }
      showToast(toastMsg);
      closeModal();
    }
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = modalTaskId ? 'Save Changes' : 'Create Task';
  }
}

function handleDelete() {
  if (!modalTaskId) return;
  if (!confirm('Delete this task?')) return;
  const task = tasks.find(t => t.id === modalTaskId);
  if (task?.calendarEventId && accessToken) deleteCalendarEvent(task.calendarEventId).catch(() => {});
  tasks = tasks.filter(t => t.id !== modalTaskId);
  saveTasks();
  renderBoard();
  closeModal();
  showToast('Task deleted');
}

// ─── PRIORITY ─────────────────────────────────────────────────────────────────
function setPriority(p) {
  document.getElementById('f-priority').value = p;
  document.querySelectorAll('.prio-btn').forEach(btn => {
    btn.classList.toggle('prio-btn-active', btn.dataset.p === p);
  });
}

// ─── COLOR ────────────────────────────────────────────────────────────────────
function setColor(c) {
  currentColor = c;
  document.getElementById('f-color').value = c;
  document.getElementById('color-preview-btn').style.background = c;
  document.getElementById('color-hex').textContent = c;
  document.getElementById('f-color-input').value = c;
  document.querySelectorAll('.cs').forEach(s => s.classList.toggle('active', s.style.background === hexToRgb(c) || s.style.background === c));
  document.getElementById('color-picker').classList.add('hidden');
}

function toggleColorPicker() {
  document.getElementById('color-picker').classList.toggle('hidden');
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgb(${r}, ${g}, ${b})`;
}

// ─── FILE ATTACHMENTS ─────────────────────────────────────────────────────────
function updateDropzoneState() {
  const dz = document.getElementById('dropzone');
  const hint = document.getElementById('attach-hint');
  if (!accessToken) {
    dz.classList.add('disabled');
    hint.textContent = '— sign in with Google to upload';
  } else {
    dz.classList.remove('disabled');
    hint.textContent = '';
  }
}

function handleDropzoneClick() {
  if (!accessToken) { showToast('Sign in with Google to upload files', 'info'); return; }
  document.getElementById('file-input').click();
}

function handleFileDragOver(e) {
  e.preventDefault();
  if (!accessToken) return;
  document.getElementById('dropzone').classList.add('drag-over');
}
function handleFileDragLeave() {
  document.getElementById('dropzone').classList.remove('drag-over');
}
function handleFileDrop(e) {
  e.preventDefault();
  document.getElementById('dropzone').classList.remove('drag-over');
  if (!accessToken) { showToast('Sign in with Google first', 'info'); return; }
  uploadFiles(e.dataTransfer.files);
}
function handleFileSelect(e) { uploadFiles(e.target.files); e.target.value = ''; }

async function uploadFiles(fileList) {
  if (!fileList || fileList.length === 0) return;
  if (!modalTaskId) return;
  if (!accessToken) { showToast('Sign in with Google to upload files', 'info'); return; }

  const dz = document.getElementById('dropzone');
  dz.innerHTML = `<div class="uploading-overlay"><div class="spinner"></div>Uploading ${fileList.length} file(s) to Google Drive...</div>`;
  dz.classList.add('disabled');

  const task = tasks.find(t => t.id === modalTaskId);
  const results = [];

  try {
    const folderId = await getOrCreateDriveFolder();
    for (const file of Array.from(fileList)) {
      const uploaded = await uploadToDrive(file, folderId);
      if (uploaded) {
        const attach = {
          id: crypto.randomUUID(),
          name: file.name,
          driveFileId: uploaded.id,
          driveViewLink: uploaded.webViewLink,
          mimeType: file.type,
          size: file.size,
        };
        task.attachments = task.attachments || [];
        task.attachments.push(attach);
        results.push(attach);
      }
    }
    saveTasks();
    renderAttachments(task.attachments);
    renderBoard();
    showToast(`${results.length} file(s) uploaded to Google Drive`);
  } catch (err) {
    showToast('Upload failed: ' + (err.message || 'unknown error'), 'error');
  } finally {
    dz.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Drop files or click to upload to Google Drive</span>`;
    dz.classList.remove('disabled');
    updateDropzoneState();
  }
}

async function getOrCreateDriveFolder() {
  const FOLDER_NAME = 'Kanban Todo App';
  const searchRes = await gapi.client.request({
    path: 'https://www.googleapis.com/drive/v3/files',
    method: 'GET',
    params: {
      q: `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id)',
    },
  });
  if (searchRes.result.files?.length > 0) return searchRes.result.files[0].id;

  const createRes = await gapi.client.request({
    path: 'https://www.googleapis.com/drive/v3/files',
    method: 'POST',
    body: { name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' },
  });
  return createRes.result.id;
}

async function uploadToDrive(file, folderId) {
  const metadata = { name: file.name, parents: [folderId] };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', file);

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken.access_token}` },
      body: form,
    }
  );
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function renderAttachments(attachments) {
  const list = document.getElementById('attachments-list');
  if (!list) return;
  list.innerHTML = '';
  (attachments || []).forEach(a => {
    const item = document.createElement('div');
    item.className = 'attach-item';
    item.innerHTML = `
      <div class="attach-icon" style="background:${fileIconBg(a.mimeType)}">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M4 4h5l3 3v5a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1z" stroke="${fileIconColor(a.mimeType)}" stroke-width="1.2"/><path d="M9 4v3h3" stroke="${fileIconColor(a.mimeType)}" stroke-width="1.2" stroke-linecap="round"/></svg>
      </div>
      <div class="attach-info">
        ${a.driveViewLink
          ? `<a class="attach-name" href="${a.driveViewLink}" target="_blank" rel="noreferrer">${escHtml(a.name)}</a>`
          : `<span class="attach-name">${escHtml(a.name)}</span>`}
        <span class="attach-size">${formatBytes(a.size)}</span>
      </div>
      <button class="attach-del" title="Remove" onclick="removeAttachment('${a.id}')">
        <svg width="11" height="11" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      </button>
    `;
    list.appendChild(item);
  });
}

async function removeAttachment(attachId) {
  if (!confirm('Remove this file?')) return;
  const task = tasks.find(t => t.id === modalTaskId);
  if (!task) return;

  const attach = (task.attachments || []).find(a => a.id === attachId);
  if (!attach) return;

  if (accessToken && attach.driveFileId) {
    try {
      await fetch(`https://www.googleapis.com/drive/v3/files/${attach.driveFileId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken.access_token}` },
      });
    } catch {}
  }

  task.attachments = task.attachments.filter(a => a.id !== attachId);
  saveTasks();
  renderAttachments(task.attachments);
  renderBoard();
  showToast('File removed');
}

// ─── GOOGLE CALENDAR ──────────────────────────────────────────────────────────
async function createCalendarEvent(task) {
  if (!accessToken || !gapiReady) return null;
  try {
    const start = task.deadline ? new Date(task.deadline) : new Date(Date.now() + 7*24*60*60*1000);
    const end = new Date(start.getTime() + (task.estimate_hours || 1) * 3600000);
    const res = await gapi.client.calendar.events.insert({
      calendarId: 'primary',
      resource: {
        summary: `[Kanban] ${task.title}`,
        description: `Priority: ${task.priority}\n\n${task.description || ''}`,
        start: { dateTime: start.toISOString() },
        end:   { dateTime: end.toISOString() },
        colorId: prioToCalColor(task.priority),
      },
    });
    return res.result.id;
  } catch (e) {
    console.warn('Calendar create failed:', e.message);
    return null;
  }
}

async function updateCalendarEvent(task) {
  if (!task.calendarEventId || !accessToken || !gapiReady) return;
  try {
    const start = task.deadline ? new Date(task.deadline) : new Date(Date.now() + 7*24*60*60*1000);
    const end = new Date(start.getTime() + (task.estimate_hours || 1) * 3600000);
    await gapi.client.calendar.events.patch({
      calendarId: 'primary',
      eventId: task.calendarEventId,
      resource: {
        summary: `[Kanban] ${task.title}`,
        description: `Priority: ${task.priority}\nStatus: ${task.status}\n\n${task.description || ''}`,
        start: { dateTime: start.toISOString() },
        end:   { dateTime: end.toISOString() },
        colorId: prioToCalColor(task.priority),
      },
    });
  } catch (e) {
    console.warn('Calendar update failed:', e.message);
  }
}

async function deleteCalendarEvent(eventId) {
  if (!accessToken || !gapiReady) return;
  try {
    await gapi.client.calendar.events.delete({ calendarId: 'primary', eventId });
  } catch {}
}

function prioToCalColor(p) {
  return { low:'2', medium:'5', high:'6', critical:'11' }[p] || '5';
}

// ─── UTILS ────────────────────────────────────────────────────────────────────
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatDate(d) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

function formatBytes(b) {
  if (!b) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b/1024).toFixed(1)} KB`;
  return `${(b/1048576).toFixed(1)} MB`;
}

function fileIconBg(mime = '') {
  if (mime.startsWith('image/')) return 'rgba(16,185,129,.15)';
  if (mime === 'application/pdf') return 'rgba(239,68,68,.15)';
  if (mime.includes('word') || mime.includes('document')) return 'rgba(59,130,246,.15)';
  return 'rgba(99,102,241,.15)';
}

function fileIconColor(mime = '') {
  if (mime.startsWith('image/')) return '#10b981';
  if (mime === 'application/pdf') return '#ef4444';
  if (mime.includes('word') || mime.includes('document')) return '#3b82f6';
  return '#6366f1';
}

let toastTimer = null;
function showToast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast ${type}`;
  el.classList.remove('hidden');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3200);
}

// ─── KEYBOARD ─────────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); openCreateModal(); }
});

// ─── BOOT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  renderBoard();

  // Try to set up token client once GSI is ready
  const gsiInterval = setInterval(() => {
    if (window.google?.accounts?.oauth2) {
      clearInterval(gsiInterval);
      initTokenClient();
    }
  }, 200);

  // Show config notice if credentials not set
  if (GOOGLE_CLIENT_ID === 'YOUR_GOOGLE_CLIENT_ID') {
    setTimeout(() => {
      showToast('Add Google credentials in app.js to enable Calendar & Drive', 'info');
    }, 800);
  }
});
