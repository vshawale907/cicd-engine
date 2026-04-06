import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from 'recharts';
import { apiFetch } from '../utils/api';

export default function MetricsDashboard() {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 30000);
    return () => clearInterval(interval);
  }, []);

  async function fetchMetrics() {
    try {
      const res = await apiFetch('/api/metrics');
      if (!res.ok) {
        throw new Error('Failed to fetch metrics');
      }
      const data = await res.json();
      setMetrics(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <p className="text-slate-400 text-center py-20">Loading metrics...</p>;
  if (error) return <p className="text-red-400 text-center py-20">Error: {error}</p>;
  if (!metrics) return null;

  const getSuccessColor = (rate) => {
    if (rate >= 80) return 'text-emerald-400';
    if (rate >= 60) return 'text-amber-400';
    return 'text-red-400';
  };

  const formatDuration = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  };

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Metrics Dashboard</h1>

      {/* SECTION 1 - Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
          <div className="text-sm text-slate-400 mb-1">Total Runs</div>
          <div className="text-3xl font-bold">{metrics.summary.totalRuns}</div>
        </div>
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
          <div className="text-sm text-slate-400 mb-1">Success Rate</div>
          <div className={`text-3xl font-bold ${getSuccessColor(metrics.summary.successRate)}`}>
            {metrics.summary.successRate}%
          </div>
        </div>
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
          <div className="text-sm text-slate-400 mb-1">Failed Runs</div>
          <div className="text-3xl font-bold text-red-400">{metrics.summary.failedCount}</div>
        </div>
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
          <div className="text-sm text-slate-400 mb-1">Avg Duration</div>
          <div className="text-3xl font-bold">{formatDuration(metrics.summary.avgDurationSeconds)}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* SECTION 2 - Runs per day bar chart */}
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
          <h2 className="text-lg font-semibold mb-6">Runs per Day (30 Days)</h2>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={metrics.runsPerDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis 
                  dataKey="date" 
                  stroke="#94a3b8" 
                  fontSize={12}
                  tickFormatter={(val, i) => i % 5 === 0 ? val : ''}
                />
                <YAxis stroke="#94a3b8" fontSize={12} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }}
                  itemStyle={{ color: '#f8fafc' }}
                />
                <Bar dataKey="success" stackId="a" fill="#639922" name="Success" />
                <Bar dataKey="failed" stackId="a" fill="#E24B4A" name="Failed" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* SECTION 3 - Avg duration trend line chart */}
        <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
          <h2 className="text-lg font-semibold mb-6">Average Duration Trend</h2>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={metrics.durationTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis 
                  dataKey="date" 
                  stroke="#94a3b8" 
                  fontSize={12}
                  tickFormatter={(val, i) => i % 5 === 0 ? val : ''}
                />
                <YAxis stroke="#94a3b8" fontSize={12} label={{ value: 'seconds', angle: -90, position: 'insideLeft', fill: '#94a3b8' }} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }}
                />
                <Line type="monotone" dataKey="avgSeconds" stroke="#3b82f6" strokeWidth={2} name="Avg Seconds" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* SECTION 4 - Top pipelines table */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="p-5 border-b border-slate-700">
          <h2 className="text-lg font-semibold">Top Pipelines</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900/50 text-slate-400">
              <tr>
                <th className="px-5 py-3 font-medium">Repository</th>
                <th className="px-5 py-3 font-medium">Branch</th>
                <th className="px-5 py-3 font-medium">Total Runs</th>
                <th className="px-5 py-3 font-medium">Success Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {metrics.topPipelines.map(p => (
                <tr key={p.pipelineId} className="hover:bg-slate-700/20">
                  <td className="px-5 py-3 font-medium">{p.repoName}</td>
                  <td className="px-5 py-3 text-slate-400">{p.branch}</td>
                  <td className="px-5 py-3">{p.totalRuns}</td>
                  <td className={`px-5 py-3 font-medium ${getSuccessColor(p.successRate)}`}>
                    {p.successRate}%
                  </td>
                </tr>
              ))}
              {metrics.topPipelines.length === 0 && (
                <tr>
                  <td colSpan="4" className="px-5 py-8 text-center text-slate-500">No runs yet</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
