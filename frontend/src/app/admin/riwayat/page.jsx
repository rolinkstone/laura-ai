'use client';

import { useCallback, useEffect, useState } from 'react';
import { MessagesSquare, ChevronLeft, Bot, User, RefreshCw, Loader2, Search } from 'lucide-react';
import { api, getToken } from '../../../lib/api';
import { Card, Spinner, ErrorBox, PageHeader } from '../../../components/admin/ui';

const PAGE_SIZE = 25;

export default function RiwayatPage() {
  const [sessions, setSessions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextBeforeId, setNextBeforeId] = useState(null);
  const [keyword, setKeyword] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async (opts = {}) => {
    const { beforeId = null, append = false } = opts;
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      let url = `/chat/sessions?limit=${PAGE_SIZE}`;
      if (beforeId) url += `&before_id=${beforeId}`;
      const res = await api(url, { token: getToken() });
      const rows = res.data || [];
      setSessions((prev) => (append ? [...prev, ...rows] : rows));
      setHasMore(Boolean(res.meta?.hasMore));
      setNextBeforeId(res.meta?.nextBeforeId ?? null);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const open = async (s) => {
    setSelected(s);
    setError('');
    setMessages([]);
    try {
      const res = await api(`/chat/sessions/${s.id}`, { token: getToken() });
      setMessages(res.data.messages);
    } catch (err) {
      setError(err.message);
    }
  };

  // Filter lokal: hanya menyaring baris yang sudah dimuat (bukan seluruh DB).
  const visible = keyword.trim()
    ? sessions.filter((s) => {
        const k = keyword.trim().toLowerCase();
        return (s.title || '').toLowerCase().includes(k) || (s.user_name || 'Tamu').toLowerCase().includes(k);
      })
    : sessions;

  if (loading && sessions.length === 0) return <Spinner />;

  return (
    <div>
      <PageHeader title="Riwayat Percakapan" subtitle="Sesi chat dan pesannya" />

      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Cari judul atau user (yang sudah dimuat)"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
          />
        </div>
        <button
          onClick={() => { setRefreshing(true); load(); }}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Muat ulang
        </button>
      </div>

      <ErrorBox message={error} />

      {!selected ? (
        <>
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-slate-400 border-b border-slate-100">
                  <th className="px-5 py-3">Judul</th>
                  <th className="px-3 py-3">User</th>
                  <th className="px-3 py-3">Pesan</th>
                  <th className="px-3 py-3">Dibuat</th>
                  <th className="px-5 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-slate-400">
                      {keyword.trim() ? 'Tidak ada sesi yang cocok dengan pencarian.' : 'Belum ada percakapan.'}
                    </td>
                  </tr>
                )}
                {visible.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => open(s)}>
                    <td className="px-5 py-3">
                      <p className="font-medium text-slate-800 flex items-center gap-2">
                        <MessagesSquare size={14} className="text-slate-400" /> {s.title}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-slate-600">{s.user_name || 'Tamu'}</td>
                    <td className="px-3 py-3 text-slate-600">{s.message_count}</td>
                    <td className="px-3 py-3 text-slate-500 text-xs">{new Date(s.created_at).toLocaleString('id-ID')}</td>
                    <td className="px-5 py-3 text-right text-brand-600 text-xs font-medium">Lihat →</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
            <span>Menampilkan {visible.length} dari {sessions.length} sesi terbaru</span>
            {hasMore && (
              <button
                onClick={() => load({ beforeId: nextBeforeId, append: true })}
                disabled={loadingMore}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                {loadingMore ? <Loader2 size={14} className="animate-spin" /> : null}
                {loadingMore ? 'Memuat…' : 'Muat lebih banyak'}
              </button>
            )}
          </div>
        </>
      ) : (
        <div>
          <button
            onClick={() => { setSelected(null); setMessages([]); }}
            className="inline-flex items-center gap-1 text-sm text-brand-600 hover:underline mb-4"
          >
            <ChevronLeft size={16} /> Kembali ke daftar
          </button>

          <Card className="p-5 mb-4">
            <h2 className="font-semibold text-slate-900">{selected.title}</h2>
            <p className="text-xs text-slate-400 mt-1">
              {selected.user_name || 'Tamu'} · {selected.message_count} pesan
            </p>
          </Card>

          <div className="space-y-3">
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] ${m.role === 'user' ? '' : 'flex gap-2'}`}>
                  {m.role === 'assistant' && (
                    <div className="h-7 w-7 rounded-lg bg-brand-600 text-white flex items-center justify-center shrink-0">
                      <Bot size={15} />
                    </div>
                  )}
                  <div className={`px-4 py-2.5 text-sm rounded-2xl ${m.role === 'user' ? 'bg-brand-600 text-white rounded-br-sm' : 'bg-white border border-slate-200 rounded-tl-sm'}`}>
                    <p className="whitespace-pre-wrap">{m.content}</p>
                    {m.role === 'assistant' && m.sources && m.sources.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-slate-100">
                        <p className="text-xs font-semibold text-slate-500 mb-1">Sumber: {m.sources.length}</p>
                        {m.sources.map((s, i) => (
                          <p key={i} className="text-xs text-slate-400">
                            {s.title}{s.page ? ` · hal. ${s.page}` : ''}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                  {m.role === 'user' && <User size={15} className="text-slate-400 ml-2 self-end" />}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
