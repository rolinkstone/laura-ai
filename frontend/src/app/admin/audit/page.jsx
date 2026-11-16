'use client';

import { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, RefreshCw, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { api, getToken } from '../../../lib/api';
import { Card, Spinner, ErrorBox, PageHeader } from '../../../components/admin/ui';

const PAGE_SIZE = 50;

// Warna badge per kategori aksi supaya pola mencurigakan cepat terlihat.
const ACTION_STYLE = (action = '') => {
  if (action.includes('delete')) return 'bg-rose-50 text-rose-700 border-rose-200';
  if (action.includes('create') || action.includes('upload')) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (action.includes('update') || action.includes('config')) return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-slate-50 text-slate-600 border-slate-200';
};

export default function AuditPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [action, setAction] = useState('');
  const [stack, setStack] = useState([]); // riwayat before_id untuk tombol "sebelumnya"
  const [hasMore, setHasMore] = useState(false);
  const [nextBeforeId, setNextBeforeId] = useState(null);

  const load = useCallback(async (beforeId = null) => {
    setLoading(true);
    try {
      let url = `/admin/audit?limit=${PAGE_SIZE}`;
      if (beforeId) url += `&before_id=${beforeId}`;
      if (action.trim()) url += `&action=${encodeURIComponent(action.trim())}`;
      const res = await api(url, { token: getToken() });
      const data = res.data || [];
      setRows(data);
      setHasMore(data.length === PAGE_SIZE);
      setNextBeforeId(data.length ? data[data.length - 1].id : null);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [action]);

  useEffect(() => {
    setStack([]);
    load();
  }, [load]);

  const nextPage = () => {
    if (!nextBeforeId) return;
    setStack((prev) => [...prev, nextBeforeId]);
    load(nextBeforeId);
  };

  const prevPage = () => {
    const copy = [...stack];
    copy.pop();
    setStack(copy);
    load(copy.length ? copy[copy.length - 1] : null);
  };

  if (loading && rows.length === 0) return <Spinner />;

  return (
    <div>
      <PageHeader title="Audit Log" subtitle="Jejak tindakan penting: siapa, kapan, dari IP mana" />

      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1 max-w-sm">
          <ShieldCheck size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={action}
            onChange={(e) => setAction(e.target.value)}
            placeholder="Filter aksi (mis. document.delete)"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
          />
        </div>
        <button
          onClick={() => load()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Muat ulang
        </button>
      </div>

      <ErrorBox message={error} />

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-slate-400 border-b border-slate-100">
              <th className="px-5 py-3">Waktu</th>
              <th className="px-3 py-3">Aktor</th>
              <th className="px-3 py-3">Aksi</th>
              <th className="px-3 py-3">Entitas</th>
              <th className="px-3 py-3">Detail</th>
              <th className="px-5 py-3">IP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-slate-400">
                  Belum ada jejak audit untuk filter ini.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50 align-top">
                <td className="px-5 py-3 text-slate-500 text-xs whitespace-nowrap">
                  {new Date(r.created_at).toLocaleString('id-ID')}
                </td>
                <td className="px-3 py-3">
                  <p className="text-slate-800 font-medium">{r.actor || 'sistem'}</p>
                  <p className="text-[11px] text-slate-400">{r.role || '-'}</p>
                </td>
                <td className="px-3 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded border text-[11px] font-medium ${ACTION_STYLE(r.action)}`}>
                    {r.action}
                  </span>
                </td>
                <td className="px-3 py-3 text-slate-600 text-xs">
                  {r.entity || '-'}{r.entity_id ? ` #${r.entity_id}` : ''}
                </td>
                <td className="px-3 py-3 text-slate-500 text-xs max-w-xs">
                  <code className="break-all">{r.detail ? JSON.stringify(r.detail) : '-'}</code>
                </td>
                <td className="px-5 py-3 text-slate-400 text-xs whitespace-nowrap">{r.ip || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
        <span>{rows.length} baris</span>
        <div className="flex items-center gap-2">
          <button
            onClick={prevPage}
            disabled={stack.length === 0 || loading}
            className="inline-flex items-center gap-1 px-3 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            <ChevronLeft size={14} /> Sebelumnya
          </button>
          <button
            onClick={nextPage}
            disabled={!hasMore || loading}
            className="inline-flex items-center gap-1 px-3 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : null}
            Berikutnya <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
