/* Main app — state, view routing, global search, keyboard, modal */
import React, { useState as uS, useEffect as uE, useMemo as uM, useCallback as uC, useRef as uR } from 'react';
import { createRoot } from 'react-dom/client';
import {
  PROJECTS, PEOPLE,
  addDays, downloadBlob, fmtLong, fmtShort, loadContacts, loadProjects, loadTasks, personById, projectById,
  upsertTask, deleteTask, updateContact, createContact, deleteContact,
  createProject, updateProject, deleteProject,
  startOfMonth, startOfWeek, toCSV, toISODate,
} from './data.js';
import { Header, StatStrip, TaskModal } from './components.jsx';
import { TodayView, WeekView, CalendarView, AllView } from './views.jsx';
import { AuthGate, signOut } from './AuthGate.jsx';
import { confirm, ConfirmHost } from './Confirm.jsx';

function App() {
  const [tasks, setTasks] = uS([]);
  const [loading, setLoading] = uS(true);
  const [view, setView] = uS('today');
  const [anchor, setAnchor] = uS(() => new Date());
  const [modalTask, setModalTask] = uS(null);
  const [search, setSearch] = uS('');
  const searchRef = uR(null);
  // Date organization mode: 'created' (default) groups tasks by creation
  // date; 'due' uses the original due-date logic. Persisted across reloads.
  const [dateMode, setDateModeRaw] = uS(() => {
    try { return localStorage.getItem('task.tracker.dateMode') || 'created'; }
    catch { return 'created'; }
  });
  const setDateMode = uC((v) => {
    setDateModeRaw(v);
    try { localStorage.setItem('task.tracker.dateMode', v); } catch {}
  }, []);

  /* Initial load: contacts first (so PEOPLE is populated before any task
     renders), then tasks. */
  uE(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadContacts();
        // Projects load is best-effort: if the table doesn't exist yet
        // (migration not run), fall back to hardcoded defaults.
        try { await loadProjects(); }
        catch (e) { console.warn('Projects table not ready:', e.message); }
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
  const [contactsOpen, setContactsOpen] = uS(false);
  const [contactsBump, setContactsBump] = uS(0); // forces re-render after rename
  const [projectsOpen, setProjectsOpen] = uS(false);
  const [projectsBump, setProjectsBump] = uS(0);
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
    // contactsBump/projectsBump invalidate this memo when labels change, so
    // search by collaborator or project name reflects renames immediately.
    void contactsBump; void projectsBump;
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
  }, [tasks, search, contactsBump, projectsBump]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {loading && (
        <div className="boot" style={{ position: 'fixed', inset: 0, background: 'var(--cream)', zIndex: 100 }}>
          › loading tasks<span className="blink">_</span>
        </div>
      )}
      <div style={{
        position: 'sticky', top: 0, zIndex: 25,
        background: 'var(--cream)',
        boxShadow: '0 1px 0 color-mix(in oklab, var(--olive) 10%, transparent)',
      }}>
        <Header
          view={view} setView={setView}
          onNew={() => openNew()}
          onExport={() => setExportOpen(true)}
          dateLabel={dateLabel}
          onPrev={goPrev} onNext={goNext} onToday={goToday}
          showNav={view !== 'all'}
          search={search} setSearch={setSearch} searchRef={searchRef}
          dateMode={dateMode} setDateMode={setDateMode}
        />
      </div>
      <StatStrip tasks={tasks} dateMode={dateMode} />

      <main style={{ flex: 1 }}>
        <div key={view + ':' + dateMode} style={{ animation: 'viewfade 280ms cubic-bezier(0.16, 1, 0.3, 1) both' }}>
          {view === 'today'    && <TodayView    tasks={filteredTasks} allTasks={tasks} onChange={update} onDelete={remove} onEdit={openEdit} anchorDate={anchor} dateMode={dateMode} />}
          {view === 'week'     && <WeekView     tasks={filteredTasks} onChange={update} onDelete={remove} onEdit={openEdit} anchorDate={anchor} onQuickAdd={(iso) => openNew(iso)} dateMode={dateMode} />}
          {view === 'calendar' && <CalendarView tasks={filteredTasks} onEdit={openEdit} anchorDate={anchor} onDayFocus={(d) => { setAnchor(d); setView('today'); }} dateMode={dateMode} />}
          {view === 'all'      && <AllView      tasks={filteredTasks} onChange={update} onDelete={remove} onEdit={openEdit} dateMode={dateMode} />}
        </div>
      </main>

      <div style={{
        position: 'sticky', bottom: 0, zIndex: 25,
        background: 'var(--cream)',
        boxShadow: '0 -1px 0 color-mix(in oklab, var(--olive) 10%, transparent)',
      }}>
        <Footer
          tasks={tasks}
          onOpenContacts={() => setContactsOpen(true)}
          onOpenProjects={() => setProjectsOpen(true)}
        />
      </div>

      {modalTask && (
        <TaskModal task={modalTask} onSave={upsert} onClose={() => setModalTask(null)} onDelete={remove} />
      )}
      {exportOpen && <ExportSheet onClose={() => setExportOpen(false)} onPick={doExport} />}
      {contactsOpen && <ContactsSheet onClose={() => setContactsOpen(false)} onSaved={() => setContactsBump(n => n + 1)} />}
      {projectsOpen && <ProjectsSheet
        onClose={() => setProjectsOpen(false)}
        onSaved={() => setProjectsBump(n => n + 1)}
        onDeleted={(deletedId) => {
          // Re-home local tasks to inbox so the UI stays in sync without a refresh.
          setTasks(prev => prev.map(t => t.project === deletedId ? { ...t, project: 'inbox' } : t));
          setProjectsBump(n => n + 1);
        }}
      />}

      {/* Floating FAB */}
      <button
        onClick={() => openNew()}
        aria-label="Add task"
        style={{
          position: 'fixed', right: 28, bottom: 84, zIndex: 30,
          width: 58, height: 58, padding: 0, borderRadius: '50%',
          background: 'var(--accent)', color: 'white',
          border: 'none', boxShadow: '0 10px 24px color-mix(in oklab, var(--accent) 45%, transparent)',
          fontSize: 28, lineHeight: 1, fontWeight: 300,
          transition: 'transform 180ms cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 180ms ease',
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px) scale(1.06)'; e.currentTarget.style.boxShadow = '0 14px 30px color-mix(in oklab, var(--accent) 55%, transparent)'; }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0) scale(1)'; e.currentTarget.style.boxShadow = '0 10px 24px color-mix(in oklab, var(--accent) 45%, transparent)'; }}
        onMouseDown={e => { e.currentTarget.style.transform = 'translateY(-1px) scale(0.96)'; }}
        onMouseUp={e => { e.currentTarget.style.transform = 'translateY(-3px) scale(1.06)'; }}
      >+</button>

      <ConfirmHost />
    </div>
  );
}

/* ─── Footer ──────────────────────────────────────────────────────────── */
function Footer({ tasks, onOpenContacts, onOpenProjects }) {
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
        <FooterLink onClick={onOpenProjects}>projects</FooterLink>
        <FooterLink onClick={onOpenContacts}>contacts</FooterLink>
        <FooterLink onClick={signOut}>sign out</FooterLink>
      </div>
    </footer>
  );
}

function FooterLink({ onClick, children }) {
  const [hover, setHover] = uS(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: '2px 8px', background: 'transparent', border: 'none',
        color: hover ? 'var(--accent)' : 'var(--olive-soft)',
        fontFamily: 'inherit', fontSize: 10,
        letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer',
        transition: 'color 140ms ease',
      }}
    >{children}</button>
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

/* ─── Contacts sheet ──────────────────────────────────────────────────── */
function ContactsSheet({ onClose, onSaved }) {
  // Snapshot PEOPLE into local editable state. PEOPLE itself is the source
  // of truth elsewhere; we only mutate it via updateContact/createContact/deleteContact.
  const [rows, setRows] = uS(() => PEOPLE.map(p => ({ ...p })));
  const [savingId, setSavingId] = uS(null);
  const [busy, setBusy] = uS(false);
  const [err, setErr] = uS('');

  const setField = (id, key, value) => {
    setRows(rs => rs.map(r => r.id === id ? { ...r, [key]: value } : r));
  };

  const save = async (row) => {
    setErr(''); setSavingId(row.id);
    try {
      const original = PEOPLE.find(p => p.id === row.id);
      const patch = {};
      if (row.name !== original.name) patch.name = row.name.trim();
      if (row.initials !== original.initials) patch.initials = row.initials.trim().toUpperCase().slice(0, 3);
      if (row.color !== original.color) patch.color = row.color;
      if (Object.keys(patch).length === 0) { setSavingId(null); return; }
      await updateContact(row.id, patch);
      onSaved && onSaved();
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setSavingId(null);
    }
  };

  const add = async () => {
    setErr(''); setBusy(true);
    try {
      const c = await createContact({ name: 'New contact' });
      setRows(rs => [...rs, { ...c, _justAdded: true }]);
      onSaved && onSaved();
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    const ok = await confirm({
      title: 'Delete this contact?',
      body: 'They will be removed from all your tasks. This can\u2019t be undone.',
      confirmText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    setErr(''); setBusy(true);
    try {
      await deleteContact(id);
      setRows(rs => rs.filter(r => r.id !== id));
      onSaved && onSaved();
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'color-mix(in oklab, var(--olive-deep) 55%, transparent)',
      backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20,
      animation: 'fadein 160ms ease',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 600, maxWidth: '100%', maxHeight: '85vh', overflowY: 'auto',
        background: 'var(--cream)', borderRadius: 18,
        boxShadow: '0 24px 60px color-mix(in oklab, var(--olive-deep) 35%, transparent)',
        animation: 'slidein 220ms ease both',
      }}>
        <div style={{ padding: '16px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="mono" style={{ fontSize: 11, color: 'var(--olive-soft)', letterSpacing: '0.08em', fontWeight: 600 }}>
            CONTACTS · {rows.length}
          </span>
          <button onClick={onClose} style={{
            width: 30, height: 30, padding: 0, border: 'none', borderRadius: 8, background: 'var(--cream-2)', color: 'var(--olive)', fontSize: 16,
          }}>✕</button>
        </div>
        <div style={{ padding: '0 22px 22px' }}>
          <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 6, color: 'var(--ink)', letterSpacing: '-0.02em' }}>
            Edit collaborators
          </div>
          <div style={{ fontSize: 12, color: 'var(--olive-soft)', marginBottom: 16 }}>
            Rename, recolor, add, or remove people. Changes apply across all your tasks.
          </div>
          {err && (
            <div style={{
              marginBottom: 12, padding: '8px 12px', fontSize: 12,
              background: 'color-mix(in oklab, var(--danger) 12%, var(--cream-2))',
              color: 'var(--danger)', borderRadius: 8,
            }}>{err}</div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rows.map((r, i) => {
              const dirty = (() => {
                const o = PEOPLE.find(p => p.id === r.id);
                return o && (o.name !== r.name || o.initials !== r.initials || o.color !== r.color);
              })();
              const canDelete = r.id !== 'me';
              return (
                <div key={r.id} style={{
                  display: 'grid',
                  gridTemplateColumns: '34px 1fr 64px 32px auto 28px',
                  gap: 8, alignItems: 'center',
                  padding: 10, background: 'var(--cream-2)', borderRadius: 12,
                  animation: r._justAdded ? 'slidein 260ms ease both' : `slidein 260ms ease ${Math.min(i * 28, 280)}ms both`,
                }}>
                  <span style={{
                    width: 30, height: 30, borderRadius: '50%',
                    background: r.color, color: 'white',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
                    transition: 'background 200ms ease',
                  }}>{r.initials}</span>
                  <input
                    value={r.name}
                    onChange={e => setField(r.id, 'name', e.target.value)}
                    style={inlineInput}
                  />
                  <input
                    value={r.initials}
                    maxLength={3}
                    onChange={e => setField(r.id, 'initials', e.target.value.toUpperCase())}
                    style={{ ...inlineInput, textAlign: 'center', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}
                  />
                  <input
                    type="color"
                    value={r.color}
                    onChange={e => setField(r.id, 'color', e.target.value)}
                    style={{ width: 32, height: 32, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}
                  />
                  <button
                    onClick={() => save(r)}
                    disabled={!dirty || savingId === r.id}
                    style={{
                      padding: '6px 12px', border: 'none', borderRadius: 8,
                      background: dirty ? 'var(--accent)' : 'transparent',
                      color: dirty ? 'white' : 'var(--olive-soft)',
                      fontSize: 12, fontWeight: 700,
                      cursor: dirty ? 'pointer' : 'default',
                      opacity: savingId === r.id ? 0.6 : 1,
                      transition: 'background 160ms ease, transform 120ms ease',
                    }}
                  >{savingId === r.id ? '…' : 'Save'}</button>
                  {canDelete ? (
                    <button
                      onClick={() => remove(r.id)}
                      title="Delete contact"
                      style={{
                        width: 28, height: 28, padding: 0,
                        background: 'transparent', border: 'none', borderRadius: 6,
                        color: 'var(--olive-soft)', fontSize: 14, cursor: 'pointer',
                        transition: 'background 140ms ease, color 140ms ease',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'color-mix(in oklab, var(--danger) 14%, transparent)'; e.currentTarget.style.color = 'var(--danger)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--olive-soft)'; }}
                    >✕</button>
                  ) : <span />}
                </div>
              );
            })}
          </div>
          <button
            onClick={add}
            disabled={busy}
            style={{
              marginTop: 12, width: '100%', padding: '12px 16px',
              background: 'transparent',
              border: '1px dashed color-mix(in oklab, var(--olive) 30%, transparent)',
              borderRadius: 12,
              color: 'var(--olive-soft)', fontSize: 13, fontWeight: 600,
              cursor: busy ? 'default' : 'pointer',
              transition: 'background 140ms ease, border-color 140ms ease, color 140ms ease',
            }}
            onMouseEnter={e => { if (!busy) { e.currentTarget.style.background = 'var(--cream-2)'; e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.borderColor = 'var(--accent)'; } }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--olive-soft)'; e.currentTarget.style.borderColor = 'color-mix(in oklab, var(--olive) 30%, transparent)'; }}
          >+ Add contact</button>
        </div>
      </div>
    </div>
  );
}
const inlineInput = {
  padding: '8px 10px',
  background: 'var(--cream)', border: 'none', borderRadius: 8,
  fontSize: 14, color: 'var(--ink)', minWidth: 0,
};

/* ─── Projects sheet ──────────────────────────────────────────────────── */
function ProjectsSheet({ onClose, onSaved, onDeleted }) {
  const [rows, setRows] = uS(() => PROJECTS.map(p => ({ ...p })));
  const [savingId, setSavingId] = uS(null);
  const [busy, setBusy] = uS(false);
  const [err, setErr] = uS('');

  const setField = (id, key, value) => {
    setRows(rs => rs.map(r => r.id === id ? { ...r, [key]: value } : r));
  };

  const save = async (row) => {
    setErr(''); setSavingId(row.id);
    try {
      const original = PROJECTS.find(p => p.id === row.id);
      const patch = {};
      if (row.label !== original.label) patch.label = row.label.trim();
      if (row.color !== original.color) patch.color = row.color;
      if (Object.keys(patch).length === 0) { setSavingId(null); return; }
      await updateProject(row.id, patch);
      onSaved && onSaved();
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setSavingId(null);
    }
  };

  const add = async () => {
    setErr(''); setBusy(true);
    try {
      const p = await createProject({ label: 'New project' });
      // Insert before any 'inbox' row in local state.
      setRows(rs => {
        const inboxIdx = rs.findIndex(r => r.id === 'inbox');
        const justAdded = { ...p, _justAdded: true };
        if (inboxIdx >= 0) return [...rs.slice(0, inboxIdx), justAdded, ...rs.slice(inboxIdx)];
        return [...rs, justAdded];
      });
      onSaved && onSaved();
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    const ok = await confirm({
      title: 'Delete this project?',
      body: 'Tasks tagged with it will be moved to Inbox. This can\u2019t be undone.',
      confirmText: 'Delete',
      danger: true,
    });
    if (!ok) return;
    setErr(''); setBusy(true);
    try {
      await deleteProject(id);
      setRows(rs => rs.filter(r => r.id !== id));
      onDeleted && onDeleted(id);
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'color-mix(in oklab, var(--olive-deep) 55%, transparent)',
      backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 20,
      animation: 'fadein 160ms ease',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 560, maxWidth: '100%', maxHeight: '85vh', overflowY: 'auto',
        background: 'var(--cream)', borderRadius: 18,
        boxShadow: '0 24px 60px color-mix(in oklab, var(--olive-deep) 35%, transparent)',
        animation: 'slidein 220ms ease both',
      }}>
        <div style={{ padding: '16px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="mono" style={{ fontSize: 11, color: 'var(--olive-soft)', letterSpacing: '0.08em', fontWeight: 600 }}>
            PROJECTS · {rows.length}
          </span>
          <button onClick={onClose} style={{
            width: 30, height: 30, padding: 0, border: 'none', borderRadius: 8, background: 'var(--cream-2)', color: 'var(--olive)', fontSize: 16,
          }}>✕</button>
        </div>
        <div style={{ padding: '0 22px 22px' }}>
          <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 6, color: 'var(--ink)', letterSpacing: '-0.02em' }}>
            Edit project buckets
          </div>
          <div style={{ fontSize: 12, color: 'var(--olive-soft)', marginBottom: 16 }}>
            Rename, recolor, add, or remove buckets. Deleting moves any tasks in that bucket to Inbox.
          </div>
          {err && (
            <div style={{
              marginBottom: 12, padding: '8px 12px', fontSize: 12,
              background: 'color-mix(in oklab, var(--danger) 12%, var(--cream-2))',
              color: 'var(--danger)', borderRadius: 8,
            }}>{err}</div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rows.map((r, i) => {
              const dirty = (() => {
                const o = PROJECTS.find(p => p.id === r.id);
                return o && (o.label !== r.label || o.color !== r.color);
              })();
              const canDelete = r.id !== 'inbox';
              return (
                <div key={r.id} style={{
                  display: 'grid',
                  gridTemplateColumns: '14px 1fr 32px auto 28px',
                  gap: 10, alignItems: 'center',
                  padding: 10, background: 'var(--cream-2)', borderRadius: 12,
                  animation: r._justAdded ? 'slidein 260ms ease both' : `slidein 260ms ease ${Math.min(i * 28, 280)}ms both`,
                }}>
                  <span style={{
                    width: 12, height: 12, borderRadius: 3, background: r.color,
                    transition: 'background 200ms ease',
                  }} />
                  <input
                    value={r.label}
                    onChange={e => setField(r.id, 'label', e.target.value)}
                    style={inlineInput}
                  />
                  <input
                    type="color"
                    value={r.color}
                    onChange={e => setField(r.id, 'color', e.target.value)}
                    style={{ width: 32, height: 32, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}
                  />
                  <button
                    onClick={() => save(r)}
                    disabled={!dirty || savingId === r.id}
                    style={{
                      padding: '6px 12px', border: 'none', borderRadius: 8,
                      background: dirty ? 'var(--accent)' : 'transparent',
                      color: dirty ? 'white' : 'var(--olive-soft)',
                      fontSize: 12, fontWeight: 700,
                      cursor: dirty ? 'pointer' : 'default',
                      opacity: savingId === r.id ? 0.6 : 1,
                      transition: 'background 160ms ease, transform 120ms ease',
                    }}
                  >{savingId === r.id ? '…' : 'Save'}</button>
                  {canDelete ? (
                    <button
                      onClick={() => remove(r.id)}
                      title="Delete project"
                      style={{
                        width: 28, height: 28, padding: 0,
                        background: 'transparent', border: 'none', borderRadius: 6,
                        color: 'var(--olive-soft)', fontSize: 14, cursor: 'pointer',
                        transition: 'background 140ms ease, color 140ms ease',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'color-mix(in oklab, var(--danger) 14%, transparent)'; e.currentTarget.style.color = 'var(--danger)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--olive-soft)'; }}
                    >✕</button>
                  ) : <span />}
                </div>
              );
            })}
          </div>
          <button
            onClick={add}
            disabled={busy}
            style={{
              marginTop: 12, width: '100%', padding: '12px 16px',
              background: 'transparent',
              border: '1px dashed color-mix(in oklab, var(--olive) 30%, transparent)',
              borderRadius: 12,
              color: 'var(--olive-soft)', fontSize: 13, fontWeight: 600,
              cursor: busy ? 'default' : 'pointer',
              transition: 'background 140ms ease, border-color 140ms ease, color 140ms ease',
            }}
            onMouseEnter={e => { if (!busy) { e.currentTarget.style.background = 'var(--cream-2)'; e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.borderColor = 'var(--accent)'; } }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--olive-soft)'; e.currentTarget.style.borderColor = 'color-mix(in oklab, var(--olive) 30%, transparent)'; }}
          >+ Add project</button>
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
