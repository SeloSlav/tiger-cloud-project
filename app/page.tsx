'use client';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import Link from 'next/link';
import Image from 'next/image';
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
import { RollupIntegrityPanel } from '@/components/rollup-integrity';
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
import { useLiveMonitor } from '@/components/use-live-monitor';
import { emptyLiveHistory, monitorIsStale } from '@/lib/live-monitor';
const Warehouse = lazy(() => import('@/components/warehouse'));
const archive = rawData as Snapshot;
const emptyHistory = emptyLiveHistory();
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
  const [mode, setMode] = useState<'live' | 'archive'>('live');
  const isLive = mode === 'live';
  const { monitor: live, error: liveError, now } = useLiveMonitor(isLive);
  const stale = monitorIsStale(live, now);
  const data = isLive ? (live?.history ?? emptyHistory) : archive;
  const [metric, setMetric] = useState<Metric>('temperature');
  const [selected, setSelected] = useState<ZoneId>('B2');
  const [focusedZone, setFocusedZone] = useState<ZoneId | null>(null);
  const [focusRevision, setFocusRevision] = useState(0);
  const [replayIndex, setIndex] = useState(INITIAL_INDEX);
  const index = isLive ? 287 : replayIndex;
  const [playing, setPlaying] = useState(false);
  const latest = useRef({
    index,
    selected,
    metric,
    focusedZone,
    mode,
    data,
    live,
    stale,
  });
  useEffect(() => {
    latest.current = {
      index,
      selected,
      metric,
      focusedZone,
      mode,
      data,
      live,
      stale,
    };
  }, [index, selected, metric, focusedZone, mode, data, live, stale]);
  const summaries = ZONES.map((z) => ({
    ...z,
    ...summarize(data.zones[z.id], index),
    ...(isLive
      ? {
          temperature: stale ? null : (live?.current[z.id].temperature ?? null),
          sensors: stale ? 0 : (live?.current[z.id].sensors ?? 0),
        }
      : {}),
  }));
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
  const readingTime = live?.latestReadingAt
    ? timeLabel(live.latestReadingAt)
    : '—';
  const liveStatus = liveError
    ? 'Updates interrupted'
    : !live
      ? 'Connecting to the sensor feed…'
      : stale
        ? 'Sensor feed delayed'
        : live.collector?.scheduled === false
          ? 'Sensor feed paused'
          : 'Receiving sensor readings';
  const selectTime = (next: number) => {
    setPlaying(false);
    setIndex(next);
  };
  const selectZone = (zone: ZoneId) => {
    setSelected(zone);
    setFocusedZone(zone);
    setFocusRevision((value) => value + 1);
  };
  useEffect(() => {
    if (!playing || isLive) return;
    const timer = window.setTimeout(() => {
      if (index >= 286) setPlaying(false);
      setIndex(Math.min(index + 1, 287));
    }, 130);
    return () => window.clearTimeout(timer);
  }, [playing, index, isLive]);
  useEffect(() => {
    const context = (document as ModelDocument).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const tools: ModelTool[] = [
      {
        name: 'inspect_frostline',
        description:
          'Read the visible mode, selected zone, temperature and thermal exposure. Live mode queries Tiger; all sensor inputs are simulated.',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        execute() {
          const state = latest.current;
          return {
            mode: state.mode,
            index: state.index,
            selected: state.selected,
            metric: state.metric,
            ...summarize(state.data.zones[state.selected], state.index),
            ...(state.mode === 'live'
              ? {
                  ...state.live?.current[state.selected],
                  temperature: state.stale
                    ? null
                    : (state.live?.current[state.selected].temperature ?? null),
                  sensors: state.stale
                    ? 0
                    : (state.live?.current[state.selected].sensors ?? 0),
                }
              : {}),
            source: state.data.source,
          };
        },
      },
      {
        name: 'set_frostline_replay',
        description:
          'Set the visible sushi production zone, replay bucket (0–287), and temperature or debt view. Pauses playback. Changes local page state only.',
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
            setMode('archive');
            setSelected(v.zone as ZoneId);
            setFocusedZone(v.zone as ZoneId);
            setFocusRevision((value) => value + 1);
            setIndex(Number(v.index));
            setMetric(v.metric as Metric);
            setPlaying(false);
          });
          return {
            mode: 'archive',
            index: Number(v.index),
            selected: v.zone,
            ...summarize(archive.zones[v.zone as ZoneId], Number(v.index)),
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
          <Image
            className="brand-logo"
            src="./frostline-logo.png"
            alt="Frostline"
            width={1983}
            height={793}
            unoptimized
            priority
          />
          <span className="brand-tag">OPERATIONS</span>
        </Link>
        <div className="topbar-right">
          <span className="demo-pill">
            <span />
            {isLive ? 'SIMULATED SENSORS' : 'SHIFT ARCHIVE'}
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
            SUSHI PRODUCTION <span>/</span> FACILITY 01
          </p>
          <h1>Production monitoring.</h1>
          <p className="subtitle">
            Current conditions, temperature incidents and a history of every
            zone.
          </p>
        </div>
        <div className="facility">
          <span className="status-dot" />
          Nori Works · Zagreb
          <small>
            {isLive
              ? live
                ? new Date(live.queriedAt).toISOString().slice(0, 10)
                : 'NORI WORKS'
              : '04 SEP 2026'}
            <span>{isLive ? 'MONITORING / UTC' : 'REPLAY / UTC'}</span>
          </small>
        </div>
      </section>
      <div className="monitor-toolbar">
        <Tabs
          value={mode}
          onValueChange={(v) => {
            setMode(v as 'live' | 'archive');
            setPlaying(false);
          }}
        >
          <TabsList className="metric-tabs" aria-label="Monitoring mode">
            <TabsTrigger value="live">Live monitoring</TabsTrigger>
            <TabsTrigger value="archive">Shift archive</TabsTrigger>
          </TabsList>
        </Tabs>
        <output
          className={`feed-status ${isLive && (stale || liveError) ? 'delayed' : ''}`}
        >
          <Radio size={15} />
          {isLive ? liveStatus : '4 September 2026 · recorded shift'}
          {isLive && live && <span>Last reading {readingTime} UTC</span>}
        </output>
      </div>
      <section
        className="metrics"
        aria-label={
          isLive
            ? 'Current facility conditions'
            : 'Facility summary at replay position'
        }
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
              ? `${above} of 6 production zones above 5 °C`
              : 'All reporting zones at or below 5 °C',
          },
          {
            icon: Clock3,
            label: 'Thermal debt',
            value: Math.round(totalDebt).toLocaleString('en-US'),
            unit: '°C·min',
            note: isLive
              ? 'Observed exposure · rolling 24 hours'
              : 'Observed exposure across all zones',
          },
          {
            icon: Radio,
            label: 'Sensor coverage',
            value: String(summaries.reduce((n, z) => n + z.sensors, 0)),
            unit: '/ 24',
            note: isLive
              ? `One-minute sensor readings · ${readingTime} UTC`
              : `Completed 5-minute bucket · ${time} UTC`,
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
              <p className="eyebrow">THE PRODUCTION FLOOR</p>
              <h2>Six zones. One continuous craft.</h2>
            </div>
            <Tabs value={metric} onValueChange={(v) => setMetric(v as Metric)}>
              <TabsList
                className="metric-tabs"
                aria-label="Facility color metric"
              >
                <TabsTrigger value="temperature">Temperature</TabsTrigger>
                <TabsTrigger value="debt">Thermal debt</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <Suspense
            fallback={
              <div className="warehouse-loading">
                Preparing the production floor…
              </div>
            }
          >
            <Warehouse
              zones={summaries}
              metric={metric}
              focusedZone={focusedZone}
              focusRevision={focusRevision}
              onOverview={() => setFocusedZone(null)}
              onSelect={selectZone}
            />
          </Suspense>
          <div className="zone-selector" aria-label="Select production zone">
            {summaries.map((z) => (
              <button
                key={z.id}
                aria-pressed={focusedZone === z.id}
                aria-label={`${z.name}, zone ${z.id}, ${z.temperature === null ? 'no data' : z.temperature.toFixed(1) + ' degrees Celsius'}`}
                onClick={() => selectZone(z.id)}
              >
                <i
                  style={{
                    background: colorFor(z.temperature, z.debt, metric),
                  }}
                />
                <span className="zone-button-code">{z.id}</span>
                <strong>
                  {z.temperature === null
                    ? '—'
                    : metric === 'debt'
                      ? Math.round(z.debt)
                      : z.temperature.toFixed(1)}
                  <small>{metric === 'debt' ? '' : '°'}</small>
                </strong>
                <span className="zone-button-name">{z.name}</span>
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
              {metric === 'debt' ? '> 0–150 °C·min' : '> 5–7 °C'}
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
              ? isLive
                ? 'Waiting for a complete, recent sensor reading'
                : 'Telemetry unavailable in this bucket'
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
          <p className="eyebrow">LINE STATUS</p>
          <h3>
            {current.temperature === null
              ? 'Awaiting sensor readings.'
              : current.temperature > 5
                ? 'Temperature excursion.'
                : current.temperature < 2
                  ? 'Below temperature target.'
                  : current.debt > 0
                    ? 'Cooling recovered.'
                    : 'Holding steady.'}
          </h3>
          <p className="explanation">
            {current.temperature === null
              ? `${current.name} has ${current.sensors} of 4 sensors reporting in this interval.`
              : current.debt > 0
                ? `${current.name} has recorded ${current.aboveMinutes} minutes above 5 °C ${isLive ? 'in the last 24 hours' : 'this shift'}, with a peak bucket mean of ${current.peak?.toFixed(1)} °C.`
                : `${current.name} has recorded ${current.observedMinutes} minutes at or below 5 °C ${isLive ? 'in the last 24 hours' : 'this shift'}.`}
          </p>
          <div className="insight-note">
            <Clock3 size={19} />
            <p>
              {current.sensors} / 4 sensors reporting
              <br />
              <span>
                {isLive
                  ? `Last reading ${readingTime}`
                  : `Interval ending ${time}`}{' '}
                UTC · {current.cargo}
              </span>
            </p>
          </div>
        </aside>
      </div>
      {isLive && (
        <section className="incident-panel" aria-label="Temperature incidents">
          <div className="replay-heading">
            <div>
              <p className="eyebrow">TEMPERATURE INCIDENTS</p>
              <h2>Open issues and recent recoveries.</h2>
            </div>
            <span className="incident-count">
              {live?.incidents.filter((i) => !i.resolvedAt).length ?? '—'} open
            </span>
          </div>
          {!live ? (
            <p className="incident-empty">
              {liveError
                ? 'Incident history is temporarily unavailable.'
                : 'Loading incident history…'}
            </p>
          ) : live.incidents.length === 0 ? (
            <p className="incident-empty">
              No temperature incidents recorded in the last 24 hours.
            </p>
          ) : (
            <div className="incident-list">
              {live.incidents.map((incident) => (
                <button
                  key={incident.id}
                  className="incident-row"
                  onClick={() => selectZone(incident.zoneId)}
                >
                  <span
                    className={`incident-state ${incident.resolvedAt ? 'resolved' : ''}`}
                  >
                    {incident.resolvedAt ? 'Recovered' : 'Open'}
                  </span>
                  <strong>
                    {ZONES.find((z) => z.id === incident.zoneId)?.name}
                  </strong>
                  <span>Started {timeLabel(incident.startedAt)} UTC</span>
                  <span>Peak {incident.peakTemperature.toFixed(1)} °C</span>
                  <span>
                    {incident.resolvedAt
                      ? `Recovered ${timeLabel(incident.resolvedAt)} UTC`
                      : 'Above limit for 3 consecutive readings'}
                  </span>
                  <ArrowUpRight size={16} />
                </button>
              ))}
            </div>
          )}
        </section>
      )}
      <section
        className="replay-panel"
        aria-label="Temperature history and incident replay"
      >
        <div className="replay-heading">
          <div>
            <p className="eyebrow">
              {isLive
                ? 'TEMPERATURE HISTORY / ROLLING 24 HOURS'
                : 'SHIFT ARCHIVE / 04 SEP 2026'}
            </p>
            <h2>{isLive ? 'The last 24 hours.' : 'A day on the line.'}</h2>
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
        {!isLive && (
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
              Shift totals <ArrowRight size={15} />
            </button>
          </div>
        )}
        {!isLive && (
          <div className="event-list">
            {EVENTS.map((event, n) => (
              <button
                className={`event ${index >= event.index ? 'reached' : ''}`}
                key={event.index}
                onClick={() => {
                  selectTime(event.index);
                  selectZone(event.zone);
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
        )}
        {isLive && (
          <p className="history-note">
            Completed five-minute intervals through {time} UTC. Gaps indicate
            incomplete coverage. Updates every 30 seconds.
          </p>
        )}
      </section>
      {isLive && (
        <RollupIntegrityPanel
          monitor={live}
          now={now}
          interrupted={Boolean(liveError)}
          onSelect={selectZone}
        />
      )}
      <footer className="page-footer">
        <span>
          <Snowflake size={14} />
          FROSTLINE <span> / </span> Nori Works · production monitoring
        </span>
        <div className="footer-links">
          <Dialog>
            <DialogTrigger className="text-button">
              <Info size={14} />
              About this data
            </DialogTrigger>
            <DialogContent className="data-dialog">
              <DialogTitle>
                Nori Works · {isLive ? 'live monitoring' : 'shift archive'}
              </DialogTitle>
              <DialogDescription>
                {isLive
                  ? '24 simulated sensors at a fictional sushi facility in Zagreb. Readings, history and incidents are stored in Tiger Data.'
                  : 'Synthetic production telemetry from a fictional sushi facility in Zagreb, backed by a Tiger Data snapshot.'}
              </DialogDescription>
              <div className="data-details">
                <p>
                  <strong>
                    {data.rawReadings.toLocaleString('en-US')} synthetic
                    readings
                  </strong>{' '}
                  from 24 sensors,{' '}
                  {isLive
                    ? 'covering the last 24 hours in UTC.'
                    : 'covering 4 September 2026 in UTC.'}
                </p>
                <p>
                  <strong>
                    {data.source === 'tiger' ? data.engine : 'Local fixture'}
                  </strong>
                  {isLive
                    ? ' collects readings every minute and serves this view through a read-only database API. Incidents open after three consecutive readings above 5 °C and recover after two at or below 4.5 °C.'
                    : data.source === 'tiger'
                      ? ' stored the raw data in a hypertable and materialized the five-minute rollup used by this replay.'
                      : ' generated this deterministic offline dataset.'}
                </p>
                <p>
                  <strong>
                    Thermal debt = Σ max(mean °C − 5, 0) × 5 minutes.
                  </strong>{' '}
                  {isLive
                    ? 'Calculated from completed intervals with all 20 expected samples. Older raw readings move into columnar storage after one day; raw history is retained for seven days and rollups for thirty.'
                    : 'Calculated from completed intervals with four sensor readings. The archive includes a 25-minute sensor gap in nigiri assembly.'}
                </p>
                <p className="snapshot-stamp">
                  {isLive ? 'Database queried' : 'Snapshot exported'}{' '}
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
