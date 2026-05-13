/* Shared UI components */
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  PROJECTS, PEOPLE, PRIORITIES, STATUSES,
  addDays, personById, projectById, relTime, startOfWeek, toISODate, todayISO, uid,
} from './data.js';
import { confirm } from './Confirm.jsx';

/* ─── Project chip ─────────────────────────────────────────────────────── */
function ProjectChip({ id, size = 'sm' }) {
  const p = projectById(id);
  const pad = size === 'sm' ? '3px 8px' : '5px 12px';
  const fs  = size === 'sm' ? 10 : 12;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: pad, fontSize: fs, fontWeight: 600,
      color: p.color,
      background: `color-mix(in oklab, ${p.color} 14%, var(--cream))`,
      border: `1px solid color-mix(in oklab, ${p.color} 35%, transparent)`,
      borderRadius: 999,
      letterSpacing: '-0.005em',
      whiteSpace: 'nowrap',
      transition: 'background 220ms ease, border-color 220ms ease, color 220ms ease',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: p.color, transition: 'background 220ms ease' }} />
      {p.label}
    </span>
  );
}

function PriorityBar({ id }) {
  const p = PRIORITIES.find(p => p.id === id) || PRIORITIES[1];
  const colors = { low: 'var(--olive-soft)', med: 'var(--accent)', high: 'var(--warn)', crit: 'var(--danger)' };
  return (
    <span title={`Priority: ${p.label}`} style={{ display: 'inline-flex', gap: 2, alignItems: 'center' }}>
      {[1,2,3,4].map(i => (
        <span key={i} style={{
          width: 3, height: 11, borderRadius: 2,
          background: i <= p.rank ? colors[id] : 'color-mix(in oklab, var(--olive) 14%, transparent)',
        }} />
      ))}
    </span>
  );
}

/* ─── Avatar stack ─────────────────────────────────────────────────────── */
function AvatarStack({ ids, size = 22, max = 4 }) {
  const visible = ids.slice(0, max);
  const extra = ids.length - visible.length;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center' }}>
      {visible.map((id, i) => {
        const p = personById(id);
        return (
          <span
            key={id}
            title={p.name}
            style={{
              width: size, height: size, borderRadius: '50%',
              background: p.color, color: 'white',
              border: '2px solid var(--cream)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: size * 0.42, fontWeight: 700, letterSpacing: '-0.02em',
              marginLeft: i === 0 ? 0 : -size * 0.36,
              boxShadow: '0 1px 2px rgba(11,31,61,0.18)',
            }}
          >{p.initials}</span>
        );
      })}
      {extra > 0 && (
        <span style={{
          width: size, height: size, borderRadius: '50%',
          background: 'var(--cream-2)', color: 'var(--olive)',
          border: '2px solid var(--cream)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: size * 0.36, fontWeight: 700,
          marginLeft: -size * 0.36,
        }}>+{extra}</span>
      )}
    </span>
  );
}

/* ─── Status toggle ────────────────────────────────────────────────────── */
function StatusToggle({ status, onChange, size = 22 }) {
  const next = status === 'todo' ? 'doing' : status === 'doing' ? 'done' : 'todo';
  const [popping, setPopping] = useState(false);
  const handleClick = (e) => {
    e.stopPropagation();
    setPopping(true);
    setTimeout(() => setPopping(false), 280);
    onChange(next);
  };
  return (
    <button
      onClick={handleClick}
      title={`${status.toUpperCase()} → click to cycle`}
      style={{
        width: size, height: size, padding: 0,
        background: status === 'done' ? 'var(--accent)' : status === 'doing' ? 'transparent' : 'transparent',
        border: `1.5px solid ${status === 'done' ? 'var(--accent)' : 'var(--olive)'}`,
        borderRadius: '50%',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
        transition: 'all 140ms ease',
        animation: popping ? 'pop 280ms ease' : undefined,
      }}
    >
      {status === 'doing' && (
        <span style={{ width: '55%', height: '55%', borderRadius: '50%', background: 'var(--accent)' }} />
      )}
      {status === 'done' && (
        <svg viewBox="0 0 16 16" width="65%" height="65%" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 8.5 L7 12 L13 4" />
        </svg>
      )}
    </button>
  );
}

/* ─── Task card (used in Today / All — softer, project-led) ────────────── */
function TaskRow({ task, onChange, onDelete, onEdit }) {
  const done = task.status === 'done';
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={() => onEdit(task)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto auto auto auto',
        alignItems: 'center',
        gap: 16,
        padding: '14px 18px',
        background: hover ? 'var(--cream-2)' : 'var(--cream)',
        borderRadius: 14,
        marginBottom: 8,
        cursor: 'pointer',
        transition: 'background 140ms ease, transform 160ms ease, box-shadow 160ms ease',
        boxShadow: hover ? '0 6px 18px color-mix(in oklab, var(--olive) 10%, transparent)' : 'none',
        transform: hover ? 'translateY(-1px)' : 'translateY(0)',
        animation: 'slidein 220ms ease both',
      }}
    >
      <StatusToggle status={task.status} onChange={(s) => onChange({ ...task, status: s, completedAt: s === 'done' ? new Date().toISOString() : null })} />

      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em',
          color: done ? 'color-mix(in oklab, var(--ink) 45%, transparent)' : 'var(--ink)',
          textDecoration: done ? 'line-through' : 'none',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{task.title}</div>
        {task.description && (
          <div style={{
            fontSize: 13, color: 'var(--olive-soft)', marginTop: 2,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{task.description}</div>
        )}
      </div>

      <ProjectChip id={task.project} />

      <AvatarStack ids={task.collaborators || ['me']} />

      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
        <PriorityBar id={task.priority} />
        <span className="mono" style={{ fontSize: 11, color: 'var(--olive-soft)', minWidth: 56, textAlign: 'right' }}>
          {task.due}
        </span>
        {(task.comments?.length || 0) > 0 && (
          <span className="mono" style={{ fontSize: 11, color: 'var(--olive-soft)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M2 3h12v8H6l-4 3V3z" />
            </svg>
            {task.comments.length}
          </span>
        )}
      </span>

      <button
        onClick={async (e) => {
          e.stopPropagation();
          const ok = await confirm({
            title: 'Delete this task?',
            body: task.title,
            confirmText: 'Delete',
            danger: true,
          });
          if (ok) onDelete(task.id);
        }}
        title="Delete task"
        style={{
          width: 28, height: 28, padding: 0,
          background: 'transparent', border: 'none', borderRadius: 8,
          color: 'var(--olive-soft)', fontSize: 14,
          opacity: hover ? 1 : 0.35,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 140ms ease',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'color-mix(in oklab, var(--danger) 14%, transparent)'; e.currentTarget.style.color = 'var(--danger)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--olive-soft)'; }}
      >✕</button>
    </div>
  );
}

/* ─── Compact chip (Week & Calendar) ───────────────────────────────────── */
function TaskChip({ task, onChange, onEdit }) {
  const p = projectById(task.project);
  const done = task.status === 'done';
  return (
    <div
      onClick={() => onEdit(task)}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 8px 6px 6px',
        background: done ? `color-mix(in oklab, ${p.color} 6%, var(--cream))` : 'var(--cream)',
        borderLeft: `3px solid ${p.color}`,
        borderRadius: 8,
        marginBottom: 5,
        cursor: 'pointer',
        fontSize: 11.5,
        boxShadow: '0 1px 2px color-mix(in oklab, var(--olive) 6%, transparent)',
        transition: 'transform 120ms ease',
      }}
      onMouseEnter={e => e.currentTarget.style.transform = 'translateX(2px)'}
      onMouseLeave={e => e.currentTarget.style.transform = 'translateX(0)'}
    >
      <StatusToggle status={task.status} size={14} onChange={(s) => onChange({ ...task, status: s, completedAt: s === 'done' ? new Date().toISOString() : null })} />
      <span style={{
        flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        textDecoration: done ? 'line-through' : 'none',
        color: done ? 'color-mix(in oklab, var(--ink) 55%, transparent)' : 'var(--ink)',
        fontWeight: 600, letterSpacing: '-0.005em',
      }}>{task.title}</span>
      {(task.collaborators?.length || 0) > 1 && (
        <AvatarStack ids={task.collaborators} size={14} max={3} />
      )}
    </div>
  );
}

/* ─── Modal: add / edit ────────────────────────────────────────────────── */
function TaskModal({ task, onSave, onClose, onDelete, onAddComment }) {
  const isNew = !task.id;
  const [draft, setDraft] = useState(task);
  const [commentDraft, setCommentDraft] = useState('');
  const inputRef = useRef(null);

  useEffect(() => { setDraft(task); }, [task]);
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 50); }, []);

  const set = (k, v) => setDraft(d => ({ ...d, [k]: v }));
  const toggleCollab = (id) => setDraft(d => {
    const has = (d.collaborators || []).includes(id);
    return { ...d, collaborators: has ? d.collaborators.filter(x => x !== id) : [...(d.collaborators || []), id] };
  });
  const addComment = () => {
    if (!commentDraft.trim()) return;
    const newC = { id: uid('C'), author: 'me', text: commentDraft.trim(), at: new Date().toISOString() };
    setDraft(d => ({ ...d, comments: [...(d.comments || []), newC] }));
    setCommentDraft('');
  };

  const submit = (e) => {
    e?.preventDefault();
    if (!draft.title.trim()) return;
    onSave({
      ...draft,
      id: draft.id || uid(),
      createdAt: draft.createdAt || new Date().toISOString(),
      completedAt: draft.status === 'done' ? (draft.completedAt || new Date().toISOString()) : null,
    });
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'color-mix(in oklab, var(--olive-deep) 50%, transparent)',
        backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'fadein 160ms ease',
        padding: 20,
      }}
    >
      <form
        onClick={e => e.stopPropagation()}
        onSubmit={submit}
        style={{
          width: 640, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto',
          background: 'var(--cream)',
          borderRadius: 18,
          boxShadow: '0 24px 60px color-mix(in oklab, var(--olive-deep) 35%, transparent)',
          animation: 'slidein 220ms ease both',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 22px', borderBottom: 'var(--border-thin)' }}>
          <span className="mono" style={{ fontSize: 11, color: 'var(--olive-soft)', letterSpacing: '0.08em' }}>
            {isNew ? 'NEW · TASK' : 'EDIT · TASK'}&nbsp;&nbsp;{draft.id && <span style={{ opacity: 0.6 }}>{draft.id}</span>}
          </span>
          <button type="button" onClick={onClose} style={{
            width: 30, height: 30, padding: 0, border: 'none', borderRadius: 8, background: 'var(--cream-2)', color: 'var(--olive)', fontSize: 16,
          }}>✕</button>
        </div>

        <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Header */}
          <input
            ref={inputRef}
            value={draft.title}
            onChange={e => set('title', e.target.value)}
            placeholder="Task header — what is this?"
            style={{
              width: '100%', padding: '8px 0',
              border: 'none', background: 'transparent', outline: 'none',
              fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em',
              fontFamily: 'var(--font-display)',
            }}
          />

          {/* Description */}
          <textarea
            value={draft.description || ''}
            onChange={e => set('description', e.target.value)}
            placeholder="Description — context, intent, scope…"
            rows={3}
            style={{
              width: '100%', padding: 12,
              border: '1px solid var(--cream-3)', background: 'var(--cream-2)',
              borderRadius: 10, outline: 'none', resize: 'vertical',
              fontSize: 14, lineHeight: 1.45, fontFamily: 'var(--font-display)', color: 'var(--ink)',
            }}
          />

          {/* Meta grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="DUE">
              <input type="date" value={draft.due} onChange={e => set('due', e.target.value)}
                style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--cream-3)', background: 'var(--cream)', borderRadius: 8, fontSize: 13, fontFamily: 'var(--font-mono)' }} />
            </Field>
            <Field label="STATUS">
              <SegmentedControl
                value={draft.status} onChange={v => set('status', v)}
                options={STATUSES.map(s => ({ value: s.id, label: s.label }))} />
            </Field>
            <Field label="PROJECT BUCKET">
              <select value={draft.project} onChange={e => set('project', e.target.value)}
                style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--cream-3)', background: 'var(--cream)', borderRadius: 8, fontSize: 13 }}>
                {PROJECTS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </Field>
            <Field label="PRIORITY">
              <SegmentedControl
                value={draft.priority} onChange={v => set('priority', v)}
                options={PRIORITIES.map(p => ({ value: p.id, label: p.label }))} />
            </Field>
          </div>

          {/* Collaborators */}
          <Field label="COLLABORATORS">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {PEOPLE.map(p => {
                const on = (draft.collaborators || []).includes(p.id);
                return (
                  <button
                    key={p.id} type="button"
                    onClick={() => toggleCollab(p.id)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '4px 10px 4px 4px',
                      borderRadius: 999,
                      border: on ? `1.5px solid ${p.color}` : '1.5px solid var(--cream-3)',
                      background: on ? `color-mix(in oklab, ${p.color} 12%, var(--cream))` : 'var(--cream)',
                      color: on ? p.color : 'var(--olive-soft)',
                      fontSize: 12, fontWeight: 600,
                    }}
                  >
                    <span style={{ width: 22, height: 22, borderRadius: '50%', background: p.color, color: 'white', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700 }}>
                      {p.initials}
                    </span>
                    {p.name}
                  </button>
                );
              })}
            </div>
          </Field>

          {/* Comments */}
          {!isNew && (
            <Field label={`COMMENTS · ${(draft.comments || []).length}`}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                {(draft.comments || []).map(c => {
                  const p = personById(c.author);
                  return (
                    <div key={c.id} style={{ display: 'flex', gap: 10, padding: 10, background: 'var(--cream-2)', borderRadius: 10 }}>
                      <span style={{ width: 26, height: 26, borderRadius: '50%', background: p.color, color: 'white', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{p.initials}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                          <span style={{ fontWeight: 700, fontSize: 13 }}>{p.name}</span>
                          <span className="mono" style={{ fontSize: 10, color: 'var(--olive-soft)' }}>{relTime(c.at)}</span>
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--ink)', marginTop: 2, lineHeight: 1.4 }}>{c.text}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={commentDraft}
                  onChange={e => setCommentDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addComment(); } }}
                  placeholder="Leave a note or comment…"
                  style={{ flex: 1, padding: '10px 12px', border: '1px solid var(--cream-3)', background: 'var(--cream)', borderRadius: 8, fontSize: 13, outline: 'none' }}
                />
                <button type="button" onClick={addComment} style={{
                  padding: '8px 14px', border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'white', fontWeight: 600, fontSize: 12,
                }}>POST</button>
              </div>
            </Field>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 22px', borderTop: 'var(--border-thin)', background: 'var(--cream-2)', borderBottomLeftRadius: 18, borderBottomRightRadius: 18 }}>
          <div>
            {!isNew && (
              <button
                type="button"
                onClick={async () => {
                  const ok = await confirm({
                    title: 'Delete this task?',
                    body: draft.title || 'Untitled task',
                    confirmText: 'Delete',
                    danger: true,
                  });
                  if (ok) onDelete(draft.id);
                }}
                style={{
                  padding: '9px 16px', border: 'none', borderRadius: 8, background: 'transparent', color: 'var(--danger)', fontWeight: 700, fontSize: 12, letterSpacing: '0.04em',
                  cursor: 'pointer',
                }}
              >DELETE</button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={onClose} style={{
              padding: '9px 16px', border: 'none', borderRadius: 8, background: 'transparent', color: 'var(--olive)', fontWeight: 700, fontSize: 12, letterSpacing: '0.04em',
            }}>CANCEL</button>
            <button type="submit" style={{
              padding: '9px 20px', border: 'none', borderRadius: 8, background: 'var(--ink)', color: 'var(--cream)', fontWeight: 700, fontSize: 12, letterSpacing: '0.04em',
            }}>{isNew ? 'CREATE ⏎' : 'SAVE ⏎'}</button>
          </div>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span className="mono" style={{ fontSize: 10, letterSpacing: '0.08em', color: 'var(--olive-soft)', fontWeight: 600 }}>{label}</span>
      {children}
    </label>
  );
}

function SegmentedControl({ value, onChange, options }) {
  return (
    <div style={{ display: 'flex', background: 'var(--cream-2)', padding: 3, borderRadius: 10, gap: 2 }}>
      {options.map(o => {
        const active = o.value === value;
        return (
          <button
            key={o.value} type="button"
            onClick={() => onChange(o.value)}
            style={{
              flex: 1, padding: '7px 8px',
              fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
              border: 'none', borderRadius: 7,
              background: active ? 'var(--ink)' : 'transparent',
              color: active ? 'var(--cream)' : 'var(--olive-soft)',
              fontFamily: 'var(--font-display)',
              transition: 'all 140ms ease',
            }}
          >{o.label}</button>
        );
      })}
    </div>
  );
}

/* ─── Header / View switcher / Search / Stat strip ─────────────────────── */
function Header({ view, setView, onNew, onExport, dateLabel, onPrev, onNext, onToday, showNav, search, setSearch, searchRef, dateMode, setDateMode }) {
  const views = [
    { id: 'today',    label: 'Today' },
    { id: 'week',     label: 'Week' },
    { id: 'calendar', label: 'Month' },
    { id: 'all',      label: 'All' },
  ];
  return (
    <header style={{ padding: '22px 32px 0', background: 'transparent' }}>
      {/* TOP ROW — brand + search + actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Mark />
          <span style={{
            fontWeight: 800, fontSize: 19, letterSpacing: '-0.02em',
            color: 'var(--ink)',
          }}>Task Tracker</span>
        </div>

        {/* Global search */}
        <div style={{ flex: 1, maxWidth: 520, position: 'relative' }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="var(--olive-soft)" strokeWidth="1.8"
               style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }}>
            <circle cx="7" cy="7" r="5" /><path d="M11 11l3 3" />
          </svg>
          <input
            ref={searchRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search tasks, projects, notes, people…"
            style={{
              width: '100%', padding: '11px 80px 11px 36px',
              border: 'none', background: 'var(--cream-2)', borderRadius: 12,
              fontSize: 14, outline: 'none', fontFamily: 'var(--font-display)',
              color: 'var(--ink)',
            }}
          />
          <span className="mono" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: 'var(--olive-soft)', padding: '2px 6px', background: 'var(--cream)', borderRadius: 5, letterSpacing: '0.04em' }}>
            ⌘K
          </span>
        </div>

        <button onClick={onExport} style={btnStyle('ghost')}>EXPORT</button>
        <button onClick={onNew} style={btnStyle('primary')}>
          <span style={{ fontSize: 16, lineHeight: 0 }}>+</span> NEW TASK
        </button>
      </div>

      {/* BOTTOM ROW — view tabs + date nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: 'var(--border-thin)', paddingBottom: 0 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {views.map(v => {
            const active = view === v.id;
            return (
              <button
                key={v.id}
                onClick={() => setView(v.id)}
                style={{
                  padding: '10px 18px',
                  background: 'transparent',
                  color: active ? 'var(--ink)' : 'var(--olive-soft)',
                  border: 'none',
                  fontWeight: active ? 800 : 600, fontSize: 14, letterSpacing: '-0.01em',
                  position: 'relative',
                  cursor: 'pointer',
                  transition: 'color 180ms ease',
                }}
              >
                {v.label}
                {active && (
                  <span style={{
                    position: 'absolute', bottom: -1, left: 14, right: 14, height: 2,
                    background: 'var(--accent)', borderRadius: 2,
                    animation: 'slidein 220ms ease both',
                  }} />
                )}
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, paddingBottom: 8 }}>
          {setDateMode && (
            <div style={{ display: 'inline-flex', background: 'var(--cream-2)', borderRadius: 9, padding: 3 }}>
              {[['created','Created'],['due','Due']].map(([v, l]) => {
                const active = dateMode === v;
                return (
                  <button
                    key={v}
                    onClick={() => setDateMode(v)}
                    title={`Organize by ${l.toLowerCase()} date`}
                    style={{
                      padding: '5px 10px', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
                      border: 'none', borderRadius: 7,
                      background: active ? 'var(--ink)' : 'transparent',
                      color: active ? 'var(--cream)' : 'var(--olive-soft)',
                      cursor: 'pointer',
                      transition: 'background 160ms ease, color 160ms ease',
                      textTransform: 'uppercase',
                    }}
                  >{l}</button>
                );
              })}
            </div>
          )}
          {showNav && (
            <>
              <span style={{
                fontFamily: 'var(--font-display)',
                fontSize: 17,
                fontWeight: 700,
                letterSpacing: '-0.02em',
                color: 'var(--ink)',
                fontVariantNumeric: 'tabular-nums',
              }}>{dateLabel}</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <NavBtn onClick={onPrev}>‹</NavBtn>
                <NavBtn onClick={onToday}>Today</NavBtn>
                <NavBtn onClick={onNext}>›</NavBtn>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function btnStyle(kind) {
  const base = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '9px 16px', borderRadius: 10,
    border: 'none', fontWeight: 700, letterSpacing: '0.02em', fontSize: 12,
    fontFamily: 'var(--font-display)', cursor: 'pointer',
    transition: 'all 140ms ease',
  };
  if (kind === 'primary') return { ...base, background: 'var(--ink)', color: 'var(--cream)' };
  return { ...base, background: 'transparent', color: 'var(--olive)' };
}

function NavBtn({ children, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: '6px 12px', minWidth: 32,
      background: 'transparent', color: 'var(--olive)',
      border: 'none', borderRadius: 8,
      fontSize: 13, fontWeight: 600,
      cursor: 'pointer', transition: 'background 140ms ease',
    }} onMouseEnter={e => e.currentTarget.style.background = 'var(--cream-2)'}
       onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >{children}</button>
  );
}

function Mark() {
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden>
      <rect x="0" y="0" width="34" height="34" rx="10" fill="var(--ink)" />
      {/* three stacked task rows */}
      <rect x="8" y="9"  width="4" height="4" rx="1.2" fill="var(--olive-soft)" />
      <rect x="14" y="10" width="13" height="2" rx="1" fill="var(--cream)" opacity="0.55" />

      <rect x="8" y="15" width="4" height="4" rx="1.2" fill="var(--accent)" />
      <rect x="14" y="16" width="13" height="2" rx="1" fill="var(--cream)" />
      {/* the active row's tick */}
      <path d="M8.8 17 L10.1 18.3 L12 16.2" stroke="white" strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round" />

      <rect x="8" y="21" width="4" height="4" rx="1.2" fill="var(--olive-soft)" />
      <rect x="14" y="22" width="9" height="2" rx="1" fill="var(--cream)" opacity="0.55" />
    </svg>
  );
}

function Ticker() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(t); }, []);
  return (
    <div style={{ fontSize: 13, color: 'var(--olive-soft)', fontWeight: 600, letterSpacing: '-0.005em' }}>
      {now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
    </div>
  );
}

function StatStrip({ tasks, dateMode = 'due' }) {
  const stats = useMemo(() => {
    const today = todayISO();
    const keyOf = (t) => dateMode === 'created' ? (t.createdAt || '').slice(0, 10) : t.due;
    const todayTasks = tasks.filter(t => keyOf(t) === today);
    const todayDone  = todayTasks.filter(t => t.status === 'done').length;
    const weekStart  = startOfWeek(new Date());
    const weekEnd    = addDays(weekStart, 7);
    const weekStartK = toISODate(weekStart);
    const weekEndK   = toISODate(weekEnd);
    const inWeek     = tasks.filter(t => { const k = keyOf(t); return k >= weekStartK && k < weekEndK; });
    const weekDone   = inWeek.filter(t => t.status === 'done').length;
    // Overdue is only meaningful in due mode. In created mode, swap for "month".
    const overdue    = tasks.filter(t => t.due < today && t.status !== 'done').length;
    const monthStartK = (() => { const d = new Date(); d.setDate(1); return toISODate(d); })();
    const monthCount = tasks.filter(t => keyOf(t) >= monthStartK).length;
    const doing      = tasks.filter(t => t.status === 'doing').length;
    const byDay = new Map();
    tasks.filter(t => t.status === 'done' && t.completedAt).forEach(t => {
      const k = toISODate(t.completedAt);
      byDay.set(k, (byDay.get(k) || 0) + 1);
    });
    let streak = 0; let cur = new Date(); cur.setHours(0,0,0,0);
    if (!byDay.has(toISODate(cur))) cur = addDays(cur, -1);
    while (byDay.has(toISODate(cur))) { streak++; cur = addDays(cur, -1); }

    return {
      todayPct: todayTasks.length ? Math.round((todayDone / todayTasks.length) * 100) : 0,
      todayDone, todayTotal: todayTasks.length,
      weekPct: inWeek.length ? Math.round((weekDone / inWeek.length) * 100) : 0,
      weekDone, weekTotal: inWeek.length,
      overdue, monthCount, doing, streak,
    };
  }, [tasks, dateMode]);

  return (
    <div style={{ padding: '6px 32px 22px', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
      <Stat label="Today" big={`${stats.todayPct}%`} sub={`${stats.todayDone} of ${stats.todayTotal} done`} bar={stats.todayPct} />
      <Stat label="This week" big={`${stats.weekPct}%`} sub={`${stats.weekDone} of ${stats.weekTotal} done`} bar={stats.weekPct} />
      <Stat label="In progress" big={stats.doing} sub="active now" />
      {dateMode === 'due'
        ? <Stat label="Overdue" big={stats.overdue} sub={stats.overdue ? 'needs attention' : 'all clear'} danger={stats.overdue > 0} />
        : <Stat label="This month" big={stats.monthCount} sub="created so far" />}
      <Stat label="Streak" big={`${stats.streak}d`} sub={stats.streak ? 'keep going' : 'start today'} />
    </div>
  );
}

function useTweenedNumber(target, duration = 500) {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const rafRef = useRef(null);
  useEffect(() => {
    const from = fromRef.current;
    const to = target;
    if (from === to) return;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      const v = from + (to - from) * eased;
      setValue(Number.isInteger(from) && Number.isInteger(to) ? Math.round(v) : v);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);
  return value;
}

function Stat({ label, big, sub, bar, danger }) {
  // Tween only when the value is a number; pass-through otherwise.
  const isNumber = typeof big === 'number' || (typeof big === 'string' && /^\d+$/.test(big));
  const targetNum = isNumber ? Number(big) : 0;
  const tweened = useTweenedNumber(targetNum);
  const display = isNumber ? tweened : big;
  return (
    <div style={{
      padding: '16px 18px', borderRadius: 14,
      background: danger ? 'color-mix(in oklab, var(--danger) 8%, var(--cream))' : 'var(--cream-2)',
      transition: 'background 200ms ease',
    }}>
      <div style={{ fontSize: 11, color: danger ? 'var(--danger)' : 'var(--olive-soft)', fontWeight: 600, letterSpacing: '0.02em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
        <span style={{ fontSize: 32, fontWeight: 800, color: danger ? 'var(--danger)' : 'var(--ink)', letterSpacing: '-0.025em', fontVariantNumeric: 'tabular-nums' }}>{display}</span>
        <span style={{ fontSize: 12, color: 'var(--olive-soft)' }}>{sub}</span>
      </div>
      {bar != null && (
        <div style={{ marginTop: 10, height: 4, background: 'color-mix(in oklab, var(--olive) 10%, transparent)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${bar}%`, background: 'var(--accent)', borderRadius: 4, transition: 'width 500ms cubic-bezier(0.16, 1, 0.3, 1)' }} />
        </div>
      )}
    </div>
  );
}

export {
  ProjectChip, PriorityBar, AvatarStack, StatusToggle, TaskRow, TaskChip,
  TaskModal, Header, StatStrip, Mark,
};
