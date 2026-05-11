/* SVG chart components — no external deps */
import { useMemo as cuM } from 'react';
import {
  PRIORITIES, PROJECTS, addDays, startOfWeek, toISODate, todayISO,
} from './data.js';

/* ─── 14-day completion area chart ───────────────────────────────────── */
function PulseChart({ tasks }) {
  const data = cuM(() => {
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = addDays(new Date(), -i);
      const key = toISODate(d);
      const dueTasks = tasks.filter(t => t.due === key);
      const done = dueTasks.filter(t => t.status === 'done').length;
      days.push({ key, total: dueTasks.length, done, isToday: key === todayISO() });
    }
    return days;
  }, [tasks]);

  const W = 320, H = 110;
  const padX = 8, padTop = 10, padBot = 22;
  const max = Math.max(2, ...data.map(d => Math.max(d.total, d.done)));
  const stepX = (W - padX * 2) / (data.length - 1);
  const y = v => padTop + (1 - v / max) * (H - padTop - padBot);
  const x = i => padX + i * stepX;

  const linePts = data.map((d, i) => `${x(i)},${y(d.done)}`).join(' ');
  const areaPts = `${padX},${y(0)} ` + linePts + ` ${x(data.length - 1)},${y(0)}`;
  const totalPts = data.map((d, i) => `${x(i)},${y(d.total)}`).join(' ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block' }}>
      <defs>
        <linearGradient id="pulse-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%"   stopColor="var(--accent)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* grid lines */}
      {[0.25, 0.5, 0.75].map(p => (
        <line key={p} x1={padX} x2={W - padX} y1={padTop + p * (H - padTop - padBot)} y2={padTop + p * (H - padTop - padBot)}
              stroke="var(--olive)" strokeOpacity="0.07" strokeDasharray="2 3" />
      ))}
      {/* total trail */}
      <polyline points={totalPts} fill="none" stroke="var(--olive)" strokeOpacity="0.25" strokeWidth="1" strokeDasharray="3 3" />
      {/* done area */}
      <polygon points={areaPts} fill="url(#pulse-fill)" />
      <polyline points={linePts} fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      {/* dots */}
      {data.map((d, i) => (
        <circle key={d.key} cx={x(i)} cy={y(d.done)} r={d.isToday ? 4.5 : 2.4}
                fill={d.isToday ? 'var(--cream)' : 'var(--accent)'}
                stroke={d.isToday ? 'var(--accent)' : 'none'}
                strokeWidth={d.isToday ? 2.4 : 0} />
      ))}
      {/* axis labels */}
      {data.filter((_, i) => i === 0 || i === 6 || i === 13).map((d, idx, arr) => {
        const i = data.indexOf(d);
        const label = d.isToday ? 'TODAY' : new Date(d.key).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toUpperCase();
        const anchor = idx === 0 ? 'start' : idx === arr.length - 1 ? 'end' : 'middle';
        return (
          <text key={d.key} x={x(i)} y={H - 6} textAnchor={anchor}
                fontSize="9" fontFamily="var(--font-mono)" letterSpacing="0.06em"
                fill={d.isToday ? 'var(--accent)' : 'var(--olive-soft)'}
                fontWeight={d.isToday ? 700 : 400}>
            {label}
          </text>
        );
      })}
    </svg>
  );
}

/* ─── Project donut (replaces categories) ────────────────────────────── */
function ProjectDonut({ tasks, size = 150 }) {
  const data = cuM(() => {
    const counts = {};
    tasks.forEach(t => { counts[t.project] = (counts[t.project] || 0) + 1; });
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return { counts, total };
  }, [tasks]);

  if (data.total === 0) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: size, fontSize: 12, color: 'var(--olive-soft)' }}>no tasks this week</div>;
  }

  const r = size / 2 - 2;
  const cx = size / 2, cy = size / 2;
  const stroke = 18;
  const inner = r - stroke;

  let start = -Math.PI / 2;
  const segs = PROJECTS
    .filter(p => data.counts[p.id])
    .map(p => {
      const portion = data.counts[p.id] / data.total;
      const angle = portion * Math.PI * 2;
      const end = start + angle;
      const large = angle > Math.PI ? 1 : 0;
      const x1 = cx + Math.cos(start) * r, y1 = cy + Math.sin(start) * r;
      const x2 = cx + Math.cos(end) * r,   y2 = cy + Math.sin(end) * r;
      const x3 = cx + Math.cos(end) * inner,   y3 = cy + Math.sin(end) * inner;
      const x4 = cx + Math.cos(start) * inner, y4 = cy + Math.sin(start) * inner;
      const path = `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${inner} ${inner} 0 ${large} 0 ${x4} ${y4} Z`;
      start = end;
      return { id: p.id, label: p.label, count: data.counts[p.id], path, color: p.color };
    });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        {segs.map(s => (<path key={s.id} d={s.path} fill={s.color} />))}
        <circle cx={cx} cy={cy} r={inner - 2} fill="var(--cream)" />
        <text x={cx} y={cy - 2} textAnchor="middle"
              fontSize="26" fontWeight="800" fontFamily="var(--font-display)" fill="var(--ink)"
              letterSpacing="-0.03em">
          {data.total}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle"
              fontSize="9" fontFamily="var(--font-mono)" letterSpacing="0.1em" fill="var(--olive-soft)">
          TASKS
        </text>
      </svg>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
        {segs.map(s => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
            <span style={{ flex: 1, color: 'var(--ink)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.label}</span>
            <span className="mono" style={{ color: 'var(--olive-soft)', fontWeight: 600 }}>{s.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Priority stacked bar (rounded) ─────────────────────────────────── */
function PriorityStack({ tasks }) {
  const counts = cuM(() => {
    const c = { low: 0, med: 0, high: 0, crit: 0 };
    tasks.forEach(t => { c[t.priority] = (c[t.priority] || 0) + 1; });
    return c;
  }, [tasks]);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) return <div style={{ fontSize: 12, color: 'var(--olive-soft)' }}>nothing open</div>;
  const palette = { low: 'var(--olive-soft)', med: 'var(--accent)', high: 'var(--warn)', crit: 'var(--danger)' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', height: 10, borderRadius: 6, overflow: 'hidden', background: 'color-mix(in oklab, var(--olive) 8%, transparent)' }}>
        {PRIORITIES.map(p => {
          const w = (counts[p.id] / total) * 100;
          if (w === 0) return null;
          return <div key={p.id} title={`${p.label}: ${counts[p.id]}`} style={{ width: `${w}%`, background: palette[p.id] }} />;
        })}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {PRIORITIES.map(p => (
          <div key={p.id} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 9, color: 'var(--olive-soft)', letterSpacing: '0.06em', fontWeight: 600 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: palette[p.id] }} />
              {p.label}
            </span>
            <span style={{ fontSize: 18, color: 'var(--ink)', fontWeight: 800, letterSpacing: '-0.02em' }}>{counts[p.id]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── 4-week × 7-day completion heatmap (rounded cells) ─────────────── */
function CompletionHeatmap({ tasks }) {
  const data = cuM(() => {
    const start = startOfWeek(addDays(new Date(), -7 * 3));
    const cells = [];
    const todayKey = todayISO();
    for (let w = 0; w < 4; w++) {
      const row = [];
      for (let d = 0; d < 7; d++) {
        const date = addDays(start, w * 7 + d);
        const key = toISODate(date);
        const done = tasks.filter(t => t.due === key && t.status === 'done').length;
        const total = tasks.filter(t => t.due === key).length;
        row.push({ key, done, total, future: key > todayKey, isToday: key === todayKey });
      }
      cells.push(row);
    }
    return cells;
  }, [tasks]);
  const maxDone = Math.max(1, ...data.flat().map(c => c.done));

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {data.map((row, wi) => (
          <div key={wi} style={{ display: 'flex', gap: 4 }}>
            {row.map(cell => {
              const ratio = cell.done / maxDone;
              const bg = cell.future
                ? 'transparent'
                : cell.done === 0
                  ? 'color-mix(in oklab, var(--olive) 6%, transparent)'
                  : `color-mix(in oklab, var(--accent) ${22 + ratio * 70}%, var(--cream))`;
              return (
                <div key={cell.key}
                  title={`${cell.key} · ${cell.done}/${cell.total} done`}
                  style={{
                    flex: 1, aspectRatio: '1',
                    background: bg,
                    borderRadius: 6,
                    outline: cell.isToday ? '2px solid var(--accent)' : 'none',
                    outlineOffset: 1,
                    border: cell.future ? '1px dashed color-mix(in oklab, var(--olive) 18%, transparent)' : 'none',
                  }} />
              );
            })}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, fontSize: 9, color: 'var(--olive-soft)', letterSpacing: '0.06em', fontWeight: 600 }}>
        <span>4 WEEKS AGO</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
          {[0.1, 0.3, 0.55, 0.85].map(r => (
            <span key={r} style={{ width: 9, height: 9, borderRadius: 3, background: `color-mix(in oklab, var(--accent) ${22 + r * 70}%, var(--cream))` }} />
          ))}
        </span>
        <span>TODAY</span>
      </div>
    </div>
  );
}

export { PulseChart, ProjectDonut, PriorityStack, CompletionHeatmap };
