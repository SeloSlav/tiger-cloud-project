'use client';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import Link from 'next/link';
import {
  Snowflake,
  ArrowUpRight,
  Box,
  Radio,
  Thermometer,
  ArrowRight,
  Database,
  Clock3,
  Play,
  Pause,
  SkipBack,
  Download,
  Info,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { TemperatureChart } from '@/components/temperature-chart';
import {
  ZONES,
  EVENTS,
  summarize,
  colorFor,
  timeLabel,
  type Metric,
  type Snapshot,
  type ZoneId,
} from '@/lib/telemetry';
import rawData from '@/data/telemetry.json';
const Warehouse = lazy(() => import('@/components/warehouse'));
const data = rawData as Snapshot;
const INITIAL_INDEX = 222;

type ModelTool = {
  name: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (input: unknown) => unknown;
};
type ModelDocument = Document & {
  modelContext?: {
    registerTool: (
      tool: ModelTool,
      options: { signal: AbortSignal },
    ) => void | Promise<void>;
  };
};

export default function Home() {
  const [metric, setMetric] = useState<Metric>('temperature');
  const [selected, setSelected] = useState<ZoneId>('B2');
  const [index, setIndex] = useState(INITIAL_INDEX);
  const [playing, setPlaying] = useState(false);
  const latest = useRef({ index, selected, metric });
  useEffect(() => {
    latest.current = { index, selected, metric };
  }, [index, selected, metric]);
  const summaries = useMemo(
    () => ZONES.map((z) => ({ ...z, ...summarize(data.zones[z.id], index) })),
    [index],
  );
  const current = summaries.find((z) => z.id === selected)!;
  const valid = summaries.filter((z) => z.temperature !== null);
  const average = valid.length
    ? valid.reduce((sum, z) => sum + z.temperature!, 0) / valid.length
    : null;
  const above = summaries.filter(
    (z) => z.temperature !== null && z.temperature > 5,
  ).length;
  const totalDebt = summaries.reduce((sum, z) => sum + z.debt, 0);
  const time = timeLabel(data.zones.A1[index].time, true);
  const atEnd = index === 287;
  const selectTime = (next: number) => {
    setPlaying(false);
    setIndex(next);
  };
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(
      () =>
        setIndex((i) => {
          if (i >= 287) {
            setPlaying(false);
            return 287;
          }
          return i + 1;
        }),
      130,
    );
    return () => window.clearInterval(timer);
  }, [playing]);
  useEffect(() => {
    const context = (document as ModelDocument).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const tools: ModelTool[] = [
      {
        name: 'inspect_frostline',
        description:
          'Read the visible replay position, selected zone and thermal exposure. Data is synthetic historical telemetry, not live monitoring.',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        execute() {
          const state = latest.current;
          return {
            ...state,
            ...summarize(data.zones[state.selected], state.index),
            source: data.source,
          };
        },
      },
      {
        name: 'set_frostline_replay',
        description:
          'Set the visible warehouse zone, replay bucket (0–287), and temperature or debt view. Pauses playback. Changes local page state only.',
        inputSchema: {
          type: 'object',
          properties: {
            zone: { type: 'string', enum: ZONES.map((z) => z.id) },
            index: { type: 'integer', minimum: 0, maximum: 287 },
            metric: { type: 'string', enum: ['temperature', 'debt'] },
          },
          required: ['zone', 'index', 'metric'],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute(input) {
          if (!input || typeof input !== 'object' || Array.isArray(input))
            throw new Error('Expected a replay configuration.');
          const v = input as Record<string, unknown>;
          if (
            Object.keys(v).some(
              (k) => !['zone', 'index', 'metric'].includes(k),
            ) ||
            !ZONES.some((z) => z.id === v.zone) ||
            !Number.isInteger(v.index) ||
            Number(v.index) < 0 ||
            Number(v.index) > 287 ||
            !['temperature', 'debt'].includes(String(v.metric))
          )
            throw new Error('Invalid zone, index or metric.');
          flushSync(() => {
            setSelected(v.zone as ZoneId);
            setIndex(Number(v.index));
            setMetric(v.metric as Metric);
            setPlaying(false);
          });
          return {
            ...latest.current,
            ...summarize(data.zones[v.zone as ZoneId], Number(v.index)),
          };
        },
      },
    ];
    for (const tool of tools) {
      try {
        Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(() => {});
      } catch {
        /* The standard is optional. */
      }
    }
    return () => lifecycle.abort();
  }, []);
  function exportCsv() {
    const lines = [
      'bucket_start_utc,bucket_end_utc,zone,temperature_c,observed_sensors',
    ];
    for (let i = 0; i <= index; i++) {
      const p = data.zones[selected][i];
      lines.push(
        [
          p.time,
          new Date(Date.parse(p.time) + 300000).toISOString(),
          selected,
          p.temperature ?? '',
          p.sensors,
        ].join(','),
      );
    }
    const url = URL.createObjectURL(
      new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `frostline-${selected}-${time.replace(':', '')}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <main className="app-shell">
      <header className="topbar">
        <Link href="/" className="brand">
          <Snowflake className="brand-mark" size={27} />
          frostline<span className="brand-tag">OPERATIONS</span>
        </Link>
        <div className="topbar-right">
          <span className="demo-pill">
            <span />
            {data.source === 'tiger' ? 'TIGER DATA SNAPSHOT' : 'SIMULATED DATA'}
          </span>
          <a
            className="source-link"
            aria-label="View project source on GitHub"
            href="https://github.com/SeloSlav/tiger-cloud-project"
            target="_blank"
            rel="noreferrer"
          >
            View source <ArrowUpRight size={16} />
          </a>
        </div>
      </header>
      <section className="page-heading">
        <div>
          <p className="eyebrow">
            COLD-CHAIN INTELLIGENCE <span>/</span> FACILITY 01
          </p>
          <h1>Keep your cool.</h1>
          <p className="subtitle">
            A clearer view of what your temperature data is telling you.
          </p>
        </div>
        <div className="facility">
          <span className="status-dot" />
          North Dock · Zagreb
          <small>
            04 SEP 2026 <span>REPLAY / UTC</span>
          </small>
        </div>
      </section>
      <section
        className="metrics"
        aria-label="Facility summary at replay position"
      >
        {[
          {
            icon: Thermometer,
            label: 'Average temperature',
            value: average === null ? '—' : average.toFixed(1),
            unit: '°C',
            note: `${valid.length} reporting zones · target 2–5 °C`,
          },
          {
            icon: Box,
            label: 'Zones above limit',
            value: String(above).padStart(2, '0'),
            unit: '/ 06',
            note: above
              ? 'Select a warm zone to investigate'
              : 'All reporting zones below the upper limit',
          },
          {
            icon: Clock3,
            label: 'Thermal debt',
            value: Math.round(totalDebt).toLocaleString('en-US'),
            unit: '°C·min',
            note: 'Observed exposure across all zones',
          },
          {
            icon: Radio,
            label: 'Sensor coverage',
            value: String(summaries.reduce((n, z) => n + z.sensors, 0)),
            unit: '/ 24',
            note: `Completed 5-minute bucket · ${time} UTC`,
          },
        ].map((m) => (
          <article className="metric" key={m.label}>
            <p>
              <m.icon size={16} />
              {m.label}
            </p>
            <div>
              {m.value}
              <span>{m.unit}</span>
            </div>
            <small>{m.note}</small>
          </article>
        ))}
      </section>
      <div className="workspace">
        <section className="map-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">THE BIG PICTURE</p>
              <h2>Your warehouse, in context.</h2>
            </div>
            <Tabs value={metric} onValueChange={(v) => setMetric(v as Metric)}>
              <TabsList
                className="metric-tabs"
                aria-label="Warehouse color metric"
              >
                <TabsTrigger value="temperature">Temperature</TabsTrigger>
                <TabsTrigger value="debt">Thermal debt</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <Suspense
            fallback={
              <div className="warehouse-loading">
                Preparing the warehouse view…
              </div>
            }
          >
            <Warehouse
              zones={summaries}
              metric={metric}
              selected={selected}
              onSelect={setSelected}
            />
          </Suspense>
          <div className="zone-selector" aria-label="Select warehouse zone">
            {summaries.map((z) => (
              <button
                key={z.id}
                aria-pressed={selected === z.id}
                aria-label={`${z.name}, zone ${z.id}, ${z.temperature === null ? 'no data' : z.temperature.toFixed(1) + ' degrees Celsius'}`}
                onClick={() => setSelected(z.id)}
              >
                <i
                  style={{
                    background: colorFor(z.temperature, z.debt, metric),
                  }}
                />
                <span>{z.id}</span>
                <strong>
                  {z.temperature === null
                    ? '—'
                    : metric === 'debt'
                      ? Math.round(z.debt)
                      : z.temperature.toFixed(1)}
                  <small>{metric === 'debt' ? '' : '°'}</small>
                </strong>
              </button>
            ))}
          </div>
          <div className="map-footer">
            <span>
              <i className="legend-dot mint" />
              {metric === 'debt' ? 'No exposure' : '≤ 5 °C'}
            </span>
            <span>
              <i className="legend-dot amber" />
              {metric === 'debt' ? '1–150 °C·min' : '5–7 °C'}
            </span>
            <span>
              <i className="legend-dot hot" />
              {metric === 'debt' ? '> 150 °C·min' : '> 7 °C'}
            </span>
            <span>
              <i className="legend-dot unknown" />
              Unknown
            </span>
            <small>SCHEMATIC</small>
          </div>
        </section>
        <aside className="insight-panel" aria-label="Selected zone details">
          <p className="eyebrow">ZONE SPOTLIGHT</p>
          <div className="zone-title">
            <h2>{current.name}</h2>
            <span className="zone-code">{selected}</span>
          </div>
          <p className="zone-subtitle">{current.cargo} · 4 sensors</p>
          <div className="large-temp">
            {current.temperature === null
              ? '—'
              : current.temperature.toFixed(1)}
            <span>°C</span>
          </div>
          <p
            className={`alert-label ${current.temperature !== null && current.temperature <= 5 ? 'healthy' : ''}`}
          >
            {current.temperature === null
              ? 'Telemetry unavailable in this bucket'
              : current.temperature > 5
                ? '↑ Above the 5 °C upper limit'
                : current.temperature < 2
                  ? '↓ Below the 2 °C lower target'
                  : 'Within the 2–5 °C target range'}
          </p>
          <div className="debt-callout">
            <span>Thermal debt</span>
            <strong>
              {current.debt.toFixed(1)}
              <small> °C·min</small>
            </strong>
          </div>
          <dl className="zone-facts">
            <div>
              <dt>Time above 5 °C</dt>
              <dd>{current.aboveMinutes} min</dd>
            </div>
            <div>
              <dt>Peak zone average</dt>
              <dd>{current.peak?.toFixed(1) ?? '—'} °C</dd>
            </div>
            <div>
              <dt>Unobserved time</dt>
              <dd className={current.unknownMinutes ? 'gap-value' : ''}>
                {current.unknownMinutes} min
              </dd>
            </div>
          </dl>
          <div className="insight-rule" />
          <p className="eyebrow">THE SIGNAL BEHIND THE NUMBER</p>
          <h3>
            {current.debt > 0 &&
            current.temperature !== null &&
            current.temperature <= 5 ? (
              <>
                Back in range.
                <br />
                The exposure remains.
              </>
            ) : (
              <>
                Temperature recovers.
                <br />
                Exposure adds up.
              </>
            )}
          </h3>
          <p className="explanation">
            Thermal debt combines how warm a zone gets with how long it stays
            warm. Compare zones before a normal reading hides an excursion.
          </p>
          <div className="insight-note">
            <Clock3 size={19} />
            <p>
              {current.unknownMinutes
                ? 'Sensor gaps are excluded. Total exposure may be higher.'
                : 'An operational signal, not a product safety or shelf-life prediction.'}
            </p>
          </div>
        </aside>
      </div>
      <section
        className="replay-panel"
        aria-label="Temperature history and incident replay"
      >
        <div className="replay-heading">
          <div>
            <p className="eyebrow">EVERY EXCURSION HAS A STORY</p>
            <h2>Rewind. Follow the heat.</h2>
            <p className="replay-description">
              {current.name} · zone {selected} · mean temperature per 5-minute
              bucket
            </p>
          </div>
          <div className="replay-actions">
            <button className="text-button" onClick={exportCsv}>
              <Download size={16} /> Export visible data
            </button>
            <span className="replay-time">
              {time}
              <small> UTC</small>
            </span>
          </div>
        </div>
        <TemperatureChart
          points={data.zones[selected]}
          index={index}
          zone={current.name}
        />
        <div className="playback-row">
          <button
            className="play-button"
            onClick={() => {
              if (atEnd) setIndex(0);
              setPlaying((v) => !v);
            }}
            aria-label={playing ? 'Pause replay' : 'Play replay'}
          >
            {playing ? (
              <Pause size={16} fill="currentColor" />
            ) : (
              <Play size={16} fill="currentColor" />
            )}
          </button>
          <button
            className="reset-button"
            aria-label="Replay from start"
            onClick={() => selectTime(0)}
          >
            <SkipBack size={16} />
          </button>
          <div className="timeline">
            <Slider
              value={[index]}
              min={0}
              max={287}
              step={1}
              aria-label="Replay time"
              onValueChange={(v) => selectTime(Array.isArray(v) ? v[0] : v)}
              aria-valuetext={`${time} UTC`}
            />
          </div>
          <span className="playback-speed">5 MIN / STEP</span>
          <button
            className="end-button"
            onClick={() => {
              selectTime(287);
              setMetric('debt');
            }}
          >
            See the aftermath <ArrowRight size={15} />
          </button>
        </div>
        <div className="event-list">
          {EVENTS.map((event, n) => (
            <button
              className={`event ${index >= event.index ? 'reached' : ''}`}
              key={event.index}
              onClick={() => {
                selectTime(event.index);
                setSelected(event.zone);
              }}
            >
              <span className="event-number">0{n + 1}</span>
              <div>
                <p>
                  <time>{event.time}</time>
                  {event.title}
                </p>
                <span>{event.detail}</span>
              </div>
              <ArrowUpRight size={17} />
            </button>
          ))}
        </div>
      </section>
      <footer className="page-footer">
        <span>
          <Snowflake size={14} />
          FROSTLINE <span> / </span> Synthetic telemetry · real Timescale
          queries
        </span>
        <div className="footer-links">
          <Dialog>
            <DialogTrigger className="text-button">
              <Info size={14} />
              About this data
            </DialogTrigger>
            <DialogContent className="data-dialog">
              <DialogTitle>Small demo. Real time-series workflow.</DialogTitle>
              <DialogDescription>
                The warehouse, products and incident are fictional. This is a
                fixed historical replay, not a live operational dashboard.
              </DialogDescription>
              <div className="data-details">
                <p>
                  <strong>
                    {data.rawReadings.toLocaleString('en-US')} synthetic
                    readings
                  </strong>{' '}
                  from 24 sensors, covering 4 September 2026 in UTC.
                </p>
                <p>
                  <strong>
                    {data.source === 'tiger' ? data.engine : 'Local fixture'}
                  </strong>
                  {data.source === 'tiger'
                    ? ' stored the raw data in a hypertable and materialized the five-minute rollup used by this replay.'
                    : ' generated this deterministic offline dataset.'}
                </p>
                <p>
                  <strong>
                    Thermal debt = Σ max(mean °C − 5, 0) × 5 minutes.
                  </strong>{' '}
                  Only completed buckets with all four sensors count. Missing
                  buckets stay unknown; they are not filled with zeroes.
                </p>
                <p>
                  The 2–5 °C target and debt colors are illustrative operating
                  thresholds. This metric does not estimate spoilage, shelf life
                  or product safety. Zone means can hide individual sensor
                  peaks.
                </p>
                <p className="snapshot-stamp">
                  Snapshot exported{' '}
                  {new Date(data.generatedAt)
                    .toISOString()
                    .replace('T', ' ')
                    .slice(0, 19)}{' '}
                  UTC
                </p>
                <a
                  href="https://github.com/SeloSlav/tiger-cloud-project#the-tiger-data-workflow"
                  target="_blank"
                  rel="noreferrer"
                >
                  Explore the SQL and setup <ArrowUpRight size={15} />
                </a>
              </div>
            </DialogContent>
          </Dialog>
          <a
            href="https://www.tigerdata.com/docs"
            target="_blank"
            rel="noreferrer"
          >
            <Database size={14} /> Built for TimescaleDB{' '}
            <ArrowRight size={14} />
          </a>
        </div>
      </footer>
    </main>
  );
}
