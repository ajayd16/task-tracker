/* Main app — state, view routing, global search, keyboard, modal */
import React, { useState as uS, useEffect as uE, useMemo as uM, useCallback as uC, useRef as uR } from 'react';
import { createRoot } from 'react-dom/client';
import {
  PROJECTS,
  addDays, downloadBlob, fmtLong, fmtShort, loadContacts, loadTasks, personById, projectById,
  upsertTask, deleteTask,
  startOfMonth, startOfWeek, toCSV, toISODate,
} from './data.js';
import { Header, StatStrip, TaskModal } from './components.jsx';
import { TodayView, WeekView, CalendarView, AllView } from './views.jsx';
import { AuthGate, signOut } from './AuthGate.jsx';

function App() {
  const [tasks, setTasks] = uS([]);
  const [loading, setLoading] = uS(true);
  const [view, setView] = uS('today');
  const [anchor, setAnchor] = uS(() => new Date());
  const [modalTask, setModalTask] = uS(null);
  const [search, setSearch] = uS('');
  const searchRef = uR(null);

  /* Initial load: contacts first (so PEOPLE is populated before any task
     renders), then tasks. */
  uE(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadContacts();
        const t = await loadTasks();
        if (!cancelled) setTasks(t);
      } catch (e) {
        console.error('Load failed:', e);
        alert('Failed to load data: ' + (e.message || e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /* CRUD — local state updates optimistically, then write to Supabase.
     On error we surface it but don't roll back; for a single-user app this
     trade-off is fine. Add rollback if/when sync conflicts become real. */
  const upsert = uC(async (t) => {
    try {
      const saved = await upsertTask(t);
      setTasks(prev => prev.some(x => x.id === saved.id)
        ? prev.map(x => x.id === saved.id ? saved : x)
        : [...prev, saved]);
      setModalTask(null);
    } catch (e) {
      console.error('Save failed:', e);
      alert('Save failed: ' + (e.message || e));
    }
  }, []);

  const update = uC(async (t) => {
    setTasks(prev => prev.map(x => x.id === t.id ? t : x)); // optimistic
    try { await upsertTask(t); }
    catch (e) { console.error('Update failed:', e); alert('Update failed: ' + (e.message || e)); }
  }, []);

  const remove = uC(async (id) => {
    setTasks(prev => prev.filter(x => x.id !== id)); // optimistic
    setModalTask(null);
    try { await deleteTask(id); }
    catch (e) { console.error('Delete failed:', e); alert('Delete failed: ' + (e.message || e)); }
  }, []);

  const openNew = uC((dueOverride) => {
    setModalTask({
      id: '', title: '', description: '',
      project: 'inbox', collaborators: ['me'],
      priority: 'med', status: 'todo',
      due: dueOverride || toISODate(anchor),
      comments: [],
      createdAt: '', completedAt: null,
    });
  }, [anchor]);
  const openEdit = uC((task) => setModalTask({ ...task, collaborators: task.collaborators || ['me'], comments: task.comments || [] }), []);

  /* Date nav ------------------------------------------------------------- */
  const stepDays = { today: 1, week: 7, calendar: 0, all: 0 }[view];
  const goPrev = () => {
    if (view === 'calendar') { const d = new Date(anchor); d.setMonth(d.getMonth() - 1); setAnchor(d); }
    else if (stepDays) setAnchor(addDays(anchor, -stepDays));
  };
  const goNext = () => {
    if (view === 'calendar') { const d = new Date(anchor); d.setMonth(d.getMonth() + 1); setAnchor(d); }
    else if (stepDays) setAnchor(addDays(anchor, stepDays));
  };
  const goToday = () => setAnchor(new Date());

  /* Keyboard ------------------------------------------------------------- */
  uE(() => {
    const onKey = (e) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); searchRef.current?.focus(); searchRef.current?.select(); return; }
      const tag = (e.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') {
        if (e.key === 'Escape') { if (modalTask) setModalTask(null); else e.target.blur(); }
        return;
      }
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openNew(); }
      else if (e.key === 'Escape') setModalTask(null);
      else if (e.key === '1') setView('today');
      else if (e.key === '2') setView('week');
      else if (e.key === '3') setView('calendar');
      else if (e.key === '4') setView('all');
      else if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'ArrowRight') goNext();
      else if (e.key === 't' || e.key === 'T') goToday();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, anchor, modalTask, openNew]);

  /* Export --------------------------------------------------------------- */
  const [exportOpen, setExportOpen] = uS(false);
  const doExport = (kind) => {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    if (kind === 'json') downloadBlob(`task-tracker-${ts}.json`, JSON.stringify(tasks, null, 2), 'application/json');
    if (kind === 'csv')  downloadBlob(`task-tracker-${ts}.csv`,  toCSV(tasks), 'text/csv');
    if (kind === 'week-md' || kind === 'month-md') {
      const today = new Date();
      const start = kind === 'week-md' ? startOfWeek(today) : startOfMonth(today);
      const end = kind === 'week-md' ? addDays(start, 7) : (() => { const x = new Date(start); x.setMonth(x.getMonth() + 1); return x; })();
      const subset = tasks.filter(t => { const d = new Date(t.due); return d >= start && d < end; });
      const md = renderMarkdownReview(subset, start, end, kind === 'week-md' ? 'Weekly' : 'Monthly');
      downloadBlob(`review-${kind === 'week-md' ? 'week' : 'month'}-${ts}.md`, md, 'text/markdown');
    }
    setExportOpen(false);
  };

  /* Header label --------------------------------------------------------- */
  const dateLabel = uM(() => {
    if (view === 'today') return fmtLong(anchor);
    if (view === 'week') { const s = startOfWeek(anchor); return `${fmtShort(s)} → ${fmtShort(addDays(s, 6))}`; }
    if (view === 'calendar') return new Date(anchor).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    return '';
  }, [view, anchor]);

  /* Global search filtering --------------------------------------------- */
  const filteredTasks = uM(() => {
    if (!search.trim()) return tasks;
    const q = search.toLowerCase();
    return tasks.filter(t => {
      const p = projectById(t.project).label.toLowerCase();
      const people = (t.collaborators || []).map(id => personById(id).name.toLowerCase()).join(' ');
      const cmts = (t.comments || []).map(c => c.text).join(' ').toLowerCase();
      return t.title.toLowerCase().includes(q)
        || (t.description || '').toLowerCase().includes(q)
        || p.includes(q) || people.includes(q) || cmts.includes(q);
    });
  }, [tasks, search]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {loading && (
        <div className="boot" style={{ position: 'fixed', inset: 0, background: 'var(--cream)', zIndex: 100 }}>
          › loading tasks<span className="blink">_</span>
        </div>
      )}
      <Header
        view={view} setView={setView}
        onNew={() => openNew()}
        onExport={() => setExportOpen(true)}
        dateLabel={dateLabel}
        onPrev={goPrev} onNext={goNext} onToday={goToday}
        showNav={view !== 'all'}
        search={search} setSearch={setSearch} searchRef={searchRef}
      />
      <StatStrip tasks={tasks} />

      <main style={{ flex: 1 }}>
        {view === 'today'    && <TodayView    tasks={filteredTasks} allTasks={tasks} onChange={update} onDelete={remove} onEdit={openEdit} anchorDate={anchor} />}
        {view === 'week'     && <WeekView     tasks={filteredTasks} onChange={update} onDelete={remove} onEdit={openEdit} anchorDate={anchor} onQuickAdd={(iso) => openNew(iso)} />}
        {view === 'calendar' && <CalendarView tasks={filteredTasks} onEdit={openEdit} anchorDate={anchor} onDayFocus={(d) => { setAnchor(d); setView('today'); }} />}
        {view === 'all'      && <AllView      tasks={filteredTasks} onChange={update} onDelete={remove} onEdit={openEdit} />}
      </main>

      <Footer tasks={tasks} />

      {modalTask && (
        <TaskModal task={modalTask} onSave={upsert} onClose={() => setModalTask(null)} onDelete={remove} />
      )}
      {exportOpen && <ExportSheet onClose={() => setExportOpen(false)} onPick={doExport} />}

      {/* Floating FAB */}
      <button
        onClick={() => openNew()}
        aria-label="Add task"
        style={{
          position: 'fixed', right: 28, bottom: 28, zIndex: 30,
          width: 58, height: 58, padding: 0, borderRadius: '50%',
          background: 'var(--accent)', color: 'white',
          border: 'none', boxShadow: '0 10px 24px color-mix(in oklab, var(--accent) 45%, transparent)',
          fontSize: 28, lineHeight: 1, fontWeight: 300,
          transition: 'transform 140ms ease, box-shadow 140ms ease',
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px) scale(1.04)'; }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0) scale(1)'; }}
      >+</button>
    </div>
  );
}

/* ─── Footer ──────────────────────────────────────────────────────────── */
function Footer({ tasks }) {
  const completed = tasks.filter(t => t.status === 'done').length;
  return (
    <footer style={{
      background: 'transparent',
      padding: '14px 32px 22px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em',
      color: 'var(--olive-soft)',
    }}>
      <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--done)' }} />
          SYNCED · LOCAL
        </span>
        <span>{String(tasks.length).padStart(3, '0')} TASKS · {String(completed).padStart(3, '0')} DONE</span>
      </div>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <KeyHint k="N" v="new" />
        <KeyHint k="⌘K" v="search" />
        <KeyHint k="1-4" v="views" />
        <KeyHint k="←→" v="nav" />
        <KeyHint k="T" v="today" />
        <button
          onClick={signOut}
          style={{
            padding: '2px 8px', background: 'transparent', border: 'none',
            color: 'var(--olive-soft)', fontFamily: 'inherit', fontSize: 10,
            letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer',
          }}
        >sign out</button>
      </div>
    </footer>
  );
}
function KeyHint({ k, v }) {
  return (
    <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}>
      <span style={{ padding: '2px 6px', background: 'var(--cream-2)', borderRadius: 4, color: 'var(--olive)', fontWeight: 600 }}>{k}</span>
      <span>{v}</span>
    </span>
  );
}

/* ─── Export sheet ────────────────────────────────────────────────────── */
function ExportSheet({ onClose, onPick }) {
  const items = [
    { id: 'json',     label: 'JSON',                hint: 'full backup · all fields incl comments',  glyph: '{ }' },
    { id: 'csv',      label: 'CSV',                 hint: 'spreadsheet · Excel / Sheets',            glyph: '⌗' },
    { id: 'week-md',  label: 'Weekly review .md',   hint: 'AI-ready summary for this week',          glyph: '◧' },
    { id: 'month-md', label: 'Monthly review .md',  hint: 'AI-ready summary for this month',         glyph: '▦' },
  ];
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'color-mix(in oklab, var(--olive-deep) 55%, transparent)',
      backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20,
      animation: 'fadein 160ms ease',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 540, maxWidth: '100%',
        background: 'var(--cream)', borderRadius: 18,
        boxShadow: '0 24px 60px color-mix(in oklab, var(--olive-deep) 35%, transparent)',
        animation: 'slidein 220ms ease both',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '16px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="mono" style={{ fontSize: 11, color: 'var(--olive-soft)', letterSpacing: '0.08em', fontWeight: 600 }}>EXPORT</span>
          <button onClick={onClose} style={{
            width: 30, height: 30, padding: 0, border: 'none', borderRadius: 8, background: 'var(--cream-2)', color: 'var(--olive)', fontSize: 16,
          }}>✕</button>
        </div>
        <div style={{ padding: '0 22px 22px' }}>
          <div style={{ fontSize: 26, fontWeight: 800, marginBottom: 16, color: 'var(--ink)', letterSpacing: '-0.02em' }}>
            How would you like to export?
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {items.map(it => (
              <button
                key={it.id} onClick={() => onPick(it.id)}
                style={{
                  textAlign: 'left', padding: 16,
                  border: 'none', background: 'var(--cream-2)', borderRadius: 12,
                  display: 'flex', flexDirection: 'column', gap: 6,
                  transition: 'transform 140ms ease, background 140ms ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'color-mix(in oklab, var(--accent) 12%, var(--cream))'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--cream-2)'; e.currentTarget.style.transform = 'translateY(0)'; }}
              >
                <span className="mono" style={{ fontSize: 18, color: 'var(--accent)' }}>{it.glyph}</span>
                <span style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-0.01em' }}>{it.label}</span>
                <span style={{ fontSize: 11, color: 'var(--olive-soft)', fontWeight: 500 }}>{it.hint}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Markdown review (AI-ready: includes description + comments) ─────── */
function renderMarkdownReview(tasks, start, end, kind) {
  const fmt = (d) => new Date(d).toISOString().slice(0,10);
  const lines = [];
  lines.push(`# ${kind} Review · ${fmt(start)} → ${fmt(new Date(end.getTime() - 86400000))}`);
  lines.push('');
  const done = tasks.filter(t => t.status === 'done');
  const open = tasks.filter(t => t.status !== 'done');
  lines.push(`**Total:** ${tasks.length}  ·  **Completed:** ${done.length}  ·  **Open:** ${open.length}  ·  **Completion:** ${tasks.length ? Math.round(done.length / tasks.length * 100) : 0}%`);
  lines.push('');

  const byProj = {};
  tasks.forEach(t => { (byProj[t.project] = byProj[t.project] || []).push(t); });

  lines.push('## By Project Bucket');
  PROJECTS.forEach(p => {
    if (!byProj[p.id]) return;
    const list = byProj[p.id];
    const d = list.filter(t => t.status === 'done').length;
    lines.push('');
    lines.push(`### ${p.label} — ${d}/${list.length} done`);
    list.forEach(t => {
      const check = t.status === 'done' ? 'x' : ' ';
      const collabs = (t.collaborators || []).map(id => personById(id).name).join(', ');
      lines.push(`- [${check}] **${t.title}**  ·  _${t.due}_  ·  _${t.priority}_  ·  with: ${collabs}`);
      if (t.description) lines.push(`    > ${t.description}`);
      (t.comments || []).forEach(c => {
        lines.push(`    - 💬 _${personById(c.author).name}_: ${c.text}`);
      });
    });
  });

  return lines.join('\n');
}

/* mount */
const root = createRoot(document.getElementById('root'));
root.render(
  <AuthGate>
    <App />
  </AuthGate>
);
