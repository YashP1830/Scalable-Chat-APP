import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { axiosInstance } from "../lib/axios.js";
import {
  Activity,
  ArrowLeft,
  Database,
  Server,
  Users,
  Zap,
  Gauge,
} from "lucide-react";

const POLL_MS = 2000;
const HISTORY = 40; // samples kept for sparklines

// Tiny inline SVG sparkline (no chart lib needed).
function Sparkline({ data, color = "#22d3ee", height = 40 }) {
  if (!data || data.length < 2) {
    return <div style={{ height }} className="text-slate-600 text-xs flex items-center">collecting…</div>;
  }
  const w = 240;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const step = w / (data.length - 1);
  const pts = data
    .map((v, i) => `${(i * step).toFixed(1)},${(height - ((v - min) / range) * height).toFixed(1)}`)
    .join(" ");
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="block">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Card({ icon: Icon, label, value, sub, accent = "text-cyan-400" }) {
  return (
    <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4">
      <div className="flex items-center gap-2 text-slate-400 text-xs uppercase tracking-wide">
        <Icon className="size-4" /> {label}
      </div>
      <div className={`mt-2 text-3xl font-semibold ${accent}`}>{value}</div>
      {sub && <div className="text-slate-500 text-xs mt-1">{sub}</div>}
    </div>
  );
}

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);
  const [rateHist, setRateHist] = useState([]);
  const [lagHist, setLagHist] = useState([]);
  const prev = useRef(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const { data } = await axiosInstance.get("/metrics/summary");
        if (!alive) return;
        setError(null);

        // messages/sec from the delta between two samples
        if (prev.current) {
          const dt = (data.timestamp - prev.current.timestamp) / 1000 || 1;
          const dProduced = data.counters.messages_produced - prev.current.counters.messages_produced;
          const rate = Math.max(0, dProduced / dt);
          setRateHist((h) => [...h, +rate.toFixed(2)].slice(-HISTORY));
        }
        setLagHist((h) => [...h, data.lag.db ?? 0].slice(-HISTORY));
        prev.current = data;
        setSummary(data);
      } catch (e) {
        if (alive) setError(e.response?.data?.message || e.message);
      }
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const c = summary?.counters || {};
  const instances = summary?.instances || {};
  const totalReq = Object.values(instances).reduce((a, b) => a + Number(b), 0) || 0;
  const rateNow = rateHist.length ? rateHist[rateHist.length - 1] : 0;
  const hitPct = c.cache_hit_ratio != null ? `${(c.cache_hit_ratio * 100).toFixed(0)}%` : "—";

  return (
    <div className="w-full max-w-6xl h-[800px] overflow-y-auto bg-slate-900/70 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100 flex items-center gap-2">
            <Activity className="size-6 text-cyan-400" /> System Observability
          </h1>
          <p className="text-slate-500 text-sm">Live metrics · refreshes every {POLL_MS / 1000}s</p>
        </div>
        <Link to="/" className="flex items-center gap-2 text-slate-300 hover:text-white bg-slate-800/60 border border-slate-700/50 px-3 py-2 rounded-lg">
          <ArrowLeft className="size-4" /> Back to chat
        </Link>
      </div>

      {error && (
        <div className="mb-4 text-amber-400 text-sm bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
          Metrics unavailable: {error}. Is the backend running?
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card icon={Users} label="Online users" value={summary?.online ?? "—"} accent="text-emerald-400" />
        <Card icon={Zap} label="Messages / sec" value={rateNow} sub="produced to Kafka" />
        <Card icon={Gauge} label="Cache hit ratio" value={hitPct} sub={`${c.cache_hits || 0} hits / ${c.cache_misses || 0} misses`} accent="text-fuchsia-400" />
        <Card
          icon={Database}
          label="DB consumer lag"
          value={summary?.lag?.db ?? "—"}
          sub="messages behind"
          accent={(summary?.lag?.db || 0) > 50 ? "text-red-400" : "text-cyan-400"}
        />
      </div>

      <div className="grid md:grid-cols-2 gap-4 mt-4">
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4">
          <div className="text-slate-300 text-sm mb-2 flex items-center gap-2"><Zap className="size-4 text-cyan-400" /> Throughput (msgs/sec)</div>
          <Sparkline data={rateHist} color="#22d3ee" />
        </div>
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4">
          <div className="text-slate-300 text-sm mb-2 flex items-center gap-2"><Database className="size-4 text-amber-400" /> DB consumer lag</div>
          <Sparkline data={lagHist} color="#f59e0b" />
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mt-4">
        {/* Pipeline totals */}
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4">
          <div className="text-slate-300 text-sm mb-3">Message pipeline (cumulative)</div>
          <Row label="Produced → Kafka" value={c.messages_produced || 0} />
          <Row label="Persisted → MongoDB" value={c.messages_persisted || 0} />
          <Row label="Pending (produced − persisted)" value={Math.max(0, (c.messages_produced || 0) - (c.messages_persisted || 0))} accent="text-amber-400" />
          <Row label="Analytics lag" value={summary?.lag?.analytics ?? "—"} />
        </div>

        {/* Load balancer distribution */}
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4">
          <div className="text-slate-300 text-sm mb-3 flex items-center gap-2"><Server className="size-4 text-cyan-400" /> Requests per API instance</div>
          {Object.keys(instances).length === 0 && <div className="text-slate-500 text-xs">no traffic yet</div>}
          {Object.entries(instances)
            .sort()
            .map(([inst, count]) => {
              const pct = totalReq ? (Number(count) / totalReq) * 100 : 0;
              return (
                <div key={inst} className="mb-2">
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>{inst}</span>
                    <span>{count} ({pct.toFixed(0)}%)</span>
                  </div>
                  <div className="h-2 bg-slate-700/50 rounded">
                    <div className="h-2 bg-cyan-500 rounded" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          <p className="text-slate-600 text-[11px] mt-2">
            With nginx <code>ip_hash</code>, one client sticks to one instance — spread appears across different users.
          </p>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, accent = "text-slate-200" }) {
  return (
    <div className="flex justify-between py-1 border-b border-slate-700/30 last:border-0">
      <span className="text-slate-400 text-sm">{label}</span>
      <span className={`font-medium ${accent}`}>{value}</span>
    </div>
  );
}
