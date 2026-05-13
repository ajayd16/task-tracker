/* Views — Today / Week / Calendar / All */
import { useState as vuS, useMemo as vuM } from 'react';
import {
  PROJECTS, PEOPLE, PRIORITIES, STATUSES,
  addDays, dayName, projectById, startOfMonth, startOfWeek, toISODate, todayISO,
} from './data.js';
import { TaskRow, TaskChip } from './components.jsx';
import { PulseChart, ProjectDonut, PriorityStack } from './charts.jsx';

/* When dateMode = 'created', use the task's creation date for all bucketing/
   filtering. When 'due', use the due date (original behavior). createdAt is
   a full ISO timestamp; we trim to the date portion. */
function dateKey(task, mode) {
  if (mode === 'created') return (task.createdAt || '').slice(0, 10);
  return task.due || '';
}

/* ─── Section header (softer) ──────────────────────────────────────────── */
function SectionHeader({ title, count, defaultOpen = true, onToggle, open, accent }) {
  return (
    <button
      onClick={onToggle}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 4px', margin: '14px 0 6px',
        background: 'transparent', border: 'none', borderBottom: '1px solid color-mix(in oklab, var(--olive) 12%, transparent)',
        cursor: 'pointer', textAlign: 'left',
      }}
    >
      <span style={{ fontSize: 11, color: 'var(--olive-soft)', width: 14, transition: 'transform 140ms ease', transform: open ? 'rotate(90deg)' : 'rotate(0)' }}>▸</span>
      <span style={{ fontSize: 18, fontWeight: 800, color: accent ? 'var(--danger)' : 'var(--ink)', letterSpacing: '-0.015em' }}>{title}</span>
      <span className="mono" style={{ fontSize: 11, color: 'var(--olive-soft)', fontWeight: 600 }}>
        {String(count).padStart(2, '0')}
      </span>
    </button>
  );
}

function Empty({ msg, tiny }) {
  return (
    <div style={{
      padding: tiny ? 12 : 24, textAlign: 'center',
      color: 'var(--olive-soft)', fontSize: tiny ? 12 : 14, fontStyle: 'italic',
    }}>{msg}</div>
  );
}

function SidebarBlock({ title, accent, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 10, color: accent ? 'var(--danger)' : 'var(--olive-soft)', letterSpacing: '0.1em', fontWeight: 700 }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

/* Sidebar Up Next: the most relevant open tasks. Sorted by priority desc,
   then by due date asc. Replaces the older "ACTIVITY · 4 WEEKS" heatmap. */
function UpNextList({ tasks, onEdit }) {
  const items = vuM(() => {
    const today = todayISO();
    const open = tasks.filter(t => t.status !== 'done');
    const priorityRank = (id) => (PRIORITIES.find(p => p.id === id) || PRIORITIES[1]).rank;
    open.sort((a, b) => {
      const r = priorityRank(b.priority) - priorityRank(a.priority);
      if (r !== 0) return r;
      // Treat tasks with no due date as "later"
      const ad = a.due || '9999-12-31';
      const bd = b.due || '9999-12-31';
      return ad.localeCompare(bd);
    });
    return open.slice(0, 5).map(t => {
      const overdue = t.due && t.due < today;
      return { ...t, overdue };
    });
  }, [tasks]);

  if (items.length === 0) {
    return (
      <div style={{
        padding: '14px 12px', background: 'var(--cream)', borderRadius: 10,
        fontSize: 12, color: 'var(--olive-soft)', fontStyle: 'italic',
      }}>nothing on deck — all clear</div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {items.map((t, i) => {
        const pr = PRIORITIES.find(p => p.id === t.priority) || PRIORITIES[1];
        const prColor = pr.id === 'crit' ? 'var(--danger)' : pr.id === 'high' ? 'var(--warn)' : pr.id === 'med' ? 'var(--accent)' : 'var(--olive-soft)';
        return (
          <button
            key={t.id}
            onClick={() => onEdit(t)}
            style={{
              display: 'grid', gridTemplateColumns: '3px 1fr auto', gap: 10,
              alignItems: 'center', padding: '8px 10px',
              background: 'var(--cream)', border: 'none', borderRadius: 10,
              cursor: 'pointer', textAlign: 'left',
              transition: 'background 140ms ease, transform 140ms ease',
              animation: `slidein 240ms ease ${i * 40}ms both`,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--cream-2)'; e.currentTarget.style.transform = 'translateX(2px)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--cream)'; e.currentTarget.style.transform = 'translateX(0)'; }}
          >
            <span style={{ width: 3, height: 22, background: prColor, borderRadius: 2 }} />
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
              <span style={{
                fontSize: 12, fontWeight: 600, color: 'var(--ink)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{t.title}</span>
              <span style={{ fontSize: 10, color: t.overdue ? 'var(--danger)' : 'var(--olive-soft)', fontWeight: 500 }}>
                {t.due
                  ? (t.overdue ? `overdue · ${t.due}` : t.due === todayISO() ? 'today' : t.due)
                  : 'no due date'}
                {' · '}{projectById(t.project).label}
              </span>
            </span>
            <span style={{
              fontSize: 9, fontWeight: 700, color: prColor,
              letterSpacing: '0.06em', fontFamily: 'var(--font-mono)',
            }}>{pr.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ─── Today view ───────────────────────────────────────────────────────── */
function TodayView({ tasks, allTasks, onChange, onDelete, onEdit, anchorDate, dateMode }) {
  const iso = toISODate(anchorDate);
  const todays = vuM(() => tasks.filter(t => dateKey(t, dateMode) === iso), [tasks, iso, dateMode]);
  // "Overdue" only meaningful for due dates. In created mode it's hidden.
  const overdue = vuM(() => dateMode === 'due'
    ? tasks.filter(t => t.due < iso && t.status !== 'done').sort((a,b) => a.due.localeCompare(b.due))
    : [], [tasks, iso, dateMode]);

  const doing = todays.filter(t => t.status === 'doing');
  const todo  = todays.filter(t => t.status === 'todo');
  const done  = todays.filter(t => t.status === 'done');

  const [openSections, setOpenSections] = vuS({ doing: true, todo: true, done: true });
  const tog = (k) => setOpenSections(s => ({ ...s, [k]: !s[k] }));

  const pct = todays.length ? Math.round((done.length / todays.length) * 100) : 0;

  /* sidebar data using the FULL task list so charts reflect everything, not just search-filtered */
  const fullTasks = allTasks || tasks;
  const weekStart = startOfWeek(new Date());
  const weekEnd = addDays(weekStart, 6);
  const sWeek = toISODate(weekStart), eWeek = toISODate(weekEnd);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 0, minHeight: 0 }}>
      <section style={{ padding: '6px 32px 40px' }}>
        {/* Hero progress */}
        <div style={{ padding: '10px 0 22px', borderBottom: '1px solid color-mix(in oklab, var(--olive) 12%, transparent)', marginBottom: 8 }}>
          <div className="serif" style={{ fontSize: 64, fontStyle: 'italic', lineHeight: 1, color: 'var(--ink)', letterSpacing: '-0.025em' }}>
            {todays.length === 0
              ? 'a blank slate.'
              : pct === 100
                ? "you're done."
                : doing.length > 0
                  ? `${doing.length} in flight.`
                  : `${todo.length} ahead of you.`}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 18 }}>
            <span style={{ fontSize: 48, fontWeight: 800, letterSpacing: '-0.035em', color: 'var(--ink)' }}>{pct}<span style={{ fontSize: 22, fontWeight: 600, color: 'var(--olive-soft)' }}>%</span></span>
            <span style={{ fontSize: 13, color: 'var(--olive-soft)', fontWeight: 600 }}>
              {done.length} of {todays.length} complete · {doing.length} doing
            </span>
          </div>
          <div style={{ marginTop: 14, height: 6, background: 'color-mix(in oklab, var(--olive) 8%, transparent)', borderRadius: 6, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', borderRadius: 6, transition: 'width 500ms ease' }} />
          </div>
        </div>

        {overdue.length > 0 && (
          <>
            <SectionHeader title="Overdue" count={overdue.length} accent open={openSections.overdue ?? true} onToggle={() => tog('overdue')} />
            {(openSections.overdue ?? true) && overdue.map(t => (
              <TaskRow key={t.id} task={t} onChange={onChange} onDelete={onDelete} onEdit={onEdit} />
            ))}
          </>
        )}

        <SectionHeader title="In progress" count={doing.length} open={openSections.doing} onToggle={() => tog('doing')} />
        {openSections.doing && (doing.length === 0 ? <Empty msg="nothing in flight" /> : doing.map(t => (
          <TaskRow key={t.id} task={t} onChange={onChange} onDelete={onDelete} onEdit={onEdit} />
        )))}

        <SectionHeader title="To do" count={todo.length} open={openSections.todo} onToggle={() => tog('todo')} />
        {openSections.todo && (todo.length === 0 ? <Empty msg="nothing queued for today" /> : todo.map(t => (
          <TaskRow key={t.id} task={t} onChange={onChange} onDelete={onDelete} onEdit={onEdit} />
        )))}

        <SectionHeader title="Done" count={done.length} open={openSections.done} onToggle={() => tog('done')} />
        {openSections.done && (done.length === 0 ? <Empty msg="ship something!" /> : done.map(t => (
          <TaskRow key={t.id} task={t} onChange={onChange} onDelete={onDelete} onEdit={onEdit} />
        )))}
      </section>

      <aside style={{ padding: '12px 28px 40px', background: 'color-mix(in oklab, var(--cream-2) 55%, var(--cream))' }}>
        <SidebarBlock title="PULSE · 14 DAYS">
          <PulseChart tasks={fullTasks} />
        </SidebarBlock>

        <SidebarBlock title="PROJECT MIX · THIS WEEK">
          <ProjectDonut tasks={fullTasks.filter(t => t.due >= sWeek && t.due <= eWeek)} />
        </SidebarBlock>

        <SidebarBlock title="PRIORITY · ALL OPEN">
          <PriorityStack tasks={fullTasks.filter(t => t.status !== 'done')} />
        </SidebarBlock>

        <SidebarBlock title="UP NEXT · TOP 5">
          <UpNextList tasks={fullTasks} onEdit={onEdit} />
        </SidebarBlock>
      </aside>
    </div>
  );
}

/* ─── Week view ────────────────────────────────────────────────────────── */
function WeekView({ tasks, onChange, onDelete, onEdit, anchorDate, onQuickAdd, dateMode }) {
  const start = startOfWeek(anchorDate);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const todayKey = todayISO();

  return (
    <div style={{ padding: '14px 32px 40px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 10 }}>
        {days.map(d => {
          const key = toISODate(d);
          const isToday = key === todayKey;
          const dayTasks = tasks.filter(t => dateKey(t, dateMode) === key);
          const doneCt = dayTasks.filter(t => t.status === 'done').length;
          return (
            <div key={key} style={{
              minHeight: 460, padding: 14, borderRadius: 14,
              background: isToday ? 'color-mix(in oklab, var(--accent) 7%, var(--cream))' : 'var(--cream-2)',
              outline: isToday ? '2px solid var(--accent)' : 'none',
              outlineOffset: -2,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: isToday ? 'var(--accent)' : 'var(--olive-soft)' }}>
                    {dayName(d)}
                  </div>
                  <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-0.025em', lineHeight: 1 }}>{d.getDate()}</div>
                </div>
                <span className="mono" style={{ fontSize: 10, color: 'var(--olive-soft)', fontWeight: 600 }}>
                  {doneCt}/{dayTasks.length}
                </span>
              </div>
              {dayTasks.length === 0 ? (
                <div style={{ fontSize: 11, color: 'var(--olive-soft)', fontStyle: 'italic', padding: '8px 0' }}>—</div>
              ) : dayTasks.map(t => (
                <TaskChip key={t.id} task={t} onChange={onChange} onEdit={onEdit} />
              ))}
              <button
                onClick={() => onQuickAdd(key)}
                style={{
                  marginTop: 6, width: '100%', padding: '7px 10px', textAlign: 'left',
                  background: 'transparent', border: '1px dashed color-mix(in oklab, var(--olive) 18%, transparent)',
                  borderRadius: 8, color: 'var(--olive-soft)', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em',
                }}
              >+ ADD TASK</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Calendar view ────────────────────────────────────────────────────── */
function CalendarView({ tasks, onEdit, anchorDate, onDayFocus, dateMode }) {
  const monthStart = startOfMonth(anchorDate);
  const gridStart = startOfWeek(monthStart);
  const todayKey = todayISO();
  const monthIdx = monthStart.getMonth();

  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

  return (
    <div style={{ padding: '14px 32px 40px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 8 }}>
        {['MON','TUE','WED','THU','FRI','SAT','SUN'].map(d => (
          <div key={d} style={{ padding: '6px 12px', fontSize: 10, fontWeight: 700, color: 'var(--olive-soft)', letterSpacing: '0.08em' }}>{d}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
        {cells.map((d, idx) => {
          const key = toISODate(d);
          const dayTasks = tasks.filter(t => dateKey(t, dateMode) === key);
          const inMonth = d.getMonth() === monthIdx;
          const isToday = key === todayKey;
          const doneCt = dayTasks.filter(t => t.status === 'done').length;
          return (
            <div
              key={idx}
              onClick={() => onDayFocus(d)}
              style={{
                minHeight: 110, padding: 10, borderRadius: 12, cursor: 'pointer',
                background: isToday ? 'color-mix(in oklab, var(--accent) 8%, var(--cream))' : inMonth ? 'var(--cream-2)' : 'color-mix(in oklab, var(--cream-2) 55%, var(--cream))',
                opacity: inMonth ? 1 : 0.55,
                outline: isToday ? '2px solid var(--accent)' : 'none',
                outlineOffset: -2,
                transition: 'transform 140ms ease',
              }}
              onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                <span style={{ fontSize: 18, fontWeight: 800, color: isToday ? 'var(--accent)' : 'var(--ink)', letterSpacing: '-0.02em' }}>{d.getDate()}</span>
                {dayTasks.length > 0 && (
                  <span className="mono" style={{ fontSize: 9, color: 'var(--olive-soft)', fontWeight: 600 }}>{doneCt}/{dayTasks.length}</span>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {dayTasks.slice(0, 3).map(t => {
                  const p = projectById(t.project);
                  return (
                    <div key={t.id} title={t.title} style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      fontSize: 10.5, fontWeight: 600,
                      color: t.status === 'done' ? 'var(--olive-soft)' : 'var(--ink)',
                      textDecoration: t.status === 'done' ? 'line-through' : 'none',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
                      {t.title}
                    </div>
                  );
                })}
                {dayTasks.length > 3 && (
                  <span className="mono" style={{ fontSize: 9, color: 'var(--olive-soft)', fontWeight: 600 }}>+{dayTasks.length - 3} more</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── All view ─────────────────────────────────────────────────────────── */
function AllView({ tasks, onChange, onDelete, onEdit, dateMode }) {
  const [range, setRange] = vuS('all');
  const [status, setStatus] = vuS('all');
  const [project, setProject] = vuS('all');
  const [priority, setPriority] = vuS('all');
  const [person, setPerson] = vuS('all');
  const [sort, setSort] = vuS(dateMode === 'created' ? 'created' : 'due-asc');

  const filtered = vuM(() => {
    const today = todayISO();
    const weekStart = toISODate(startOfWeek(new Date()));
    const weekEnd = toISODate(addDays(startOfWeek(new Date()), 6));
    const key = (t) => dateKey(t, dateMode);
    let out = tasks.slice();
    if (range === 'today') out = out.filter(t => key(t) === today);
    else if (range === 'week') out = out.filter(t => key(t) >= weekStart && key(t) <= weekEnd);
    else if (range === 'overdue') out = out.filter(t => dateMode === 'due' && t.due < today && t.status !== 'done');
    if (status !== 'all') out = out.filter(t => t.status === status);
    if (project !== 'all') out = out.filter(t => t.project === project);
    if (priority !== 'all') out = out.filter(t => t.priority === priority);
    if (person !== 'all') out = out.filter(t => (t.collaborators || []).includes(person));
    out.sort((a, b) => {
      if (sort === 'due-asc')  return (a.due || '').localeCompare(b.due || '');
      if (sort === 'due-desc') return (b.due || '').localeCompare(a.due || '');
      if (sort === 'priority') return (PRIORITIES.find(p => p.id === b.priority).rank) - (PRIORITIES.find(p => p.id === a.priority).rank);
      if (sort === 'created')  return (b.createdAt || '').localeCompare(a.createdAt || '');
      return 0;
    });
    return out;
  }, [tasks, range, status, project, priority, person, sort, dateMode]);

  // Hide "Overdue" filter button in created mode since it doesn't apply.
  const whenOpts = dateMode === 'due'
    ? [['all','All'],['today','Today'],['week','This week'],['overdue','Overdue']]
    : [['all','All'],['today','Today'],['week','This week']];

  return (
    <div style={{ padding: '14px 32px 40px' }}>
      {/* Filter row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18, alignItems: 'center' }}>
        <FilterGroup label="WHEN" value={range} onChange={setRange}
          opts={whenOpts} />
        <FilterGroup label="STATUS" value={status} onChange={setStatus}
          opts={[['all','All'], ...STATUSES.map(s => [s.id, s.label])]} />
        <FilterDropdown label="PROJECT" value={project} onChange={setProject}
          opts={[['all','All projects'], ...PROJECTS.map(p => [p.id, p.label])]} />
        <FilterDropdown label="PRIORITY" value={priority} onChange={setPriority}
          opts={[['all','Any'], ...PRIORITIES.map(p => [p.id, p.label])]} />
        <FilterDropdown label="WITH" value={person} onChange={setPerson}
          opts={[['all','Anyone'], ...PEOPLE.map(p => [p.id, p.name])]} />
        <span style={{ flex: 1 }} />
        <FilterDropdown label="SORT" value={sort} onChange={setSort}
          opts={[['due-asc','Due ↑'],['due-desc','Due ↓'],['priority','Priority'],['created','Recently created']]} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>
          {filtered.length} {filtered.length === 1 ? 'task' : 'tasks'}
        </div>
      </div>

      {filtered.length === 0 ? <Empty msg="no tasks match these filters" /> :
        filtered.map(t => <TaskRow key={t.id} task={t} onChange={onChange} onDelete={onDelete} onEdit={onEdit} />)
      }
    </div>
  );
}

function FilterGroup({ label, value, onChange, opts }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--olive-soft)', letterSpacing: '0.08em' }}>{label}</span>
      <div style={{ display: 'flex', background: 'var(--cream-2)', borderRadius: 10, padding: 3 }}>
        {opts.map(([v, l]) => {
          const active = v === value;
          return (
            <button key={v} onClick={() => onChange(v)} style={{
              padding: '6px 11px', fontSize: 11, fontWeight: 700, letterSpacing: '0.02em',
              border: 'none', borderRadius: 7,
              background: active ? 'var(--ink)' : 'transparent',
              color: active ? 'var(--cream)' : 'var(--olive-soft)',
            }}>{l}</button>
          );
        })}
      </div>
    </div>
  );
}
function FilterDropdown({ label, value, onChange, opts }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--olive-soft)', letterSpacing: '0.08em' }}>{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} style={{
        padding: '7px 12px', borderRadius: 10, border: 'none',
        background: 'var(--cream-2)', fontSize: 12, fontWeight: 700, color: 'var(--ink)',
      }}>
        {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}

export { TodayView, WeekView, CalendarView, AllView };
