/* Data layer — Supabase CRUD, helpers, constants */
import { supabase } from './supabaseClient.js';

/* Constants that don't depend on the user --------------------------------- */
const PROJECTS = [
  { id: 'dashboard', label: 'Dashboard v1',  color: '#2E5BFF' },
  { id: 'okrs',      label: 'Q3 OKRs',        color: '#7A3FE0' },
  { id: 'reading',   label: 'Reading',        color: '#1F8A5B' },
  { id: 'health',    label: 'Health Reset',   color: '#E07A1F' },
  { id: 'home',      label: 'Home & Admin',   color: '#C13B3B' },
  { id: 'inbox',     label: 'Inbox',          color: '#4A5E80' },
];

const PRIORITIES = [
  { id: 'low',  label: 'LOW',  rank: 1 },
  { id: 'med',  label: 'MED',  rank: 2 },
  { id: 'high', label: 'HIGH', rank: 3 },
  { id: 'crit', label: 'CRIT', rank: 4 },
];

const STATUSES = [
  { id: 'todo',  label: 'TODO' },
  { id: 'doing', label: 'DOING' },
  { id: 'done',  label: 'DONE' },
];

/* PEOPLE (contacts) is loaded from the DB at startup. Until then it holds a
   fallback so personById() doesn't crash during the first render. The array
   reference is mutated in place so existing imports of `PEOPLE` stay live. */
const PEOPLE = [{ id: 'me', name: 'You', initials: 'YO', color: '#0B1F3D' }];
function setPeople(list) {
  PEOPLE.length = 0;
  PEOPLE.push(...list);
}

/* date helpers ------------------------------------------------------------ */
function toISODate(d) {
  const x = new Date(d);
  x.setHours(0,0,0,0);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function todayISO() { return toISODate(new Date()); }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function startOfWeek(d) {
  const x = new Date(d); x.setHours(0,0,0,0);
  const day = x.getDay();
  const diff = (day + 6) % 7;
  x.setDate(x.getDate() - diff);
  return x;
}
function startOfMonth(d) { const x = new Date(d); x.setHours(0,0,0,0); x.setDate(1); return x; }
function fmtLong(d) { return new Date(d).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }); }
function fmtShort(d) { return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
function dayName(d) { return new Date(d).toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase(); }
function relTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function uid(prefix = 'T') { return prefix + '-' + Math.random().toString(36).slice(2, 7).toUpperCase(); }

function personById(id) { return PEOPLE.find(p => p.id === id) || PEOPLE[0]; }
function projectById(id) { return PROJECTS.find(p => p.id === id) || PROJECTS[PROJECTS.length - 1]; }

/* Row -> app-shape converter. Components were built around this shape, so we
   keep it identical to the localStorage version. */
function rowToTask(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    project: row.project,
    priority: row.priority,
    status: row.status,
    due: row.due,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    collaborators: (row.task_collaborators || []).map(r => r.contact_id),
    comments: (row.task_comments || [])
      .slice()
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .map(c => ({ id: c.id, author: c.author_id, text: c.text, at: c.created_at })),
  };
}

/* Loading ----------------------------------------------------------------- */
async function loadContacts() {
  const { data, error } = await supabase
    .from('contacts')
    .select('id, name, initials, color')
    .order('created_at', { ascending: true });
  if (error) throw error;
  setPeople(data.map(c => ({ id: c.id, name: c.name, initials: c.initials, color: c.color })));
  return data;
}

async function loadTasks() {
  const { data, error } = await supabase
    .from('tasks')
    .select('*, task_collaborators(contact_id), task_comments(id, author_id, text, created_at)')
    .order('due', { ascending: true });
  if (error) throw error;
  return data.map(rowToTask);
}

async function updateContact(id, fields) {
  // Auto-derive initials if name changed and no initials passed
  const patch = { ...fields };
  if (patch.name && !patch.initials) {
    patch.initials = patch.name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '··';
  }
  const { data, error } = await supabase
    .from('contacts').update(patch).eq('id', id).select().single();
  if (error) throw error;
  // Keep in-memory PEOPLE in sync
  const idx = PEOPLE.findIndex(p => p.id === id);
  if (idx >= 0) PEOPLE[idx] = { id: data.id, name: data.name, initials: data.initials, color: data.color };
  return PEOPLE[idx];
}

/* Writes — per task, not bulk -------------------------------------------- */
async function upsertTask(task) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const isNew = !task.id;
  const id = task.id || uid();
  const row = {
    id,
    owner_id: user.id,
    title: task.title,
    description: task.description || '',
    project: task.project,
    priority: task.priority,
    status: task.status,
    due: task.due,
    completed_at: task.status === 'done' ? (task.completedAt || new Date().toISOString()) : null,
  };
  if (isNew) row.created_at = new Date().toISOString();

  const { error: taskErr } = await supabase.from('tasks').upsert(row);
  if (taskErr) throw taskErr;

  // Reconcile collaborators: delete-then-insert. Volume per task is tiny.
  const collaborators = task.collaborators && task.collaborators.length ? task.collaborators : ['me'];
  const { error: delErr } = await supabase.from('task_collaborators').delete().eq('task_id', id);
  if (delErr) throw delErr;
  const { error: insErr } = await supabase
    .from('task_collaborators')
    .insert(collaborators.map(cid => ({ task_id: id, contact_id: cid, owner_id: user.id })));
  if (insErr) throw insErr;

  // Insert any new comments. Comments aren't editable, so we just upsert by id.
  // Existing ones are no-ops; new ones get inserted with the timestamp from
  // the client (the DB default would overwrite it otherwise on new inserts,
  // but we let the client-supplied timestamp through for consistency).
  const comments = task.comments || [];
  if (comments.length) {
    const rows = comments.map(c => ({
      id: c.id,
      task_id: id,
      author_id: c.author,
      text: c.text,
      created_at: c.at,
      owner_id: user.id,
    }));
    const { error: cErr } = await supabase.from('task_comments').upsert(rows);
    if (cErr) throw cErr;
  }

  return { ...task, id };
}

async function deleteTask(id) {
  // ON DELETE CASCADE handles collaborators + comments.
  const { error } = await supabase.from('tasks').delete().eq('id', id);
  if (error) throw error;
}

async function addComment(taskId, authorId, text) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  const row = { id: uid('C'), task_id: taskId, author_id: authorId, text, owner_id: user.id };
  const { data, error } = await supabase.from('task_comments').insert(row).select().single();
  if (error) throw error;
  return { id: data.id, author: data.author_id, text: data.text, at: data.created_at };
}

/* Export helpers (unchanged from local version) -------------------------- */
function toCSV(tasks) {
  const cols = ['id','title','project','priority','status','due','collaborators','createdAt','completedAt','description','comments'];
  const escape = v => {
    if (v == null) return '';
    if (Array.isArray(v)) v = v.map(x => typeof x === 'object' ? JSON.stringify(x) : x).join(' | ');
    const s = String(v).replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };
  const head = cols.join(',');
  const rows = tasks.map(t => cols.map(c => escape(t[c])).join(','));
  return [head, ...rows].join('\n');
}
function downloadBlob(filename, contents, mime) {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
}

export {
  PROJECTS, PEOPLE, PRIORITIES, STATUSES,
  toISODate, todayISO, addDays, startOfWeek, startOfMonth, fmtLong, fmtShort, dayName, relTime,
  uid,
  loadContacts, loadTasks, upsertTask, deleteTask, addComment, updateContact,
  toCSV, downloadBlob,
  personById, projectById,
};
