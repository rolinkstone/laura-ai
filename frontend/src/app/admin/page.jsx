'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  FileText,
  HelpCircle,
  FolderTree,
  Link2,
  MessagesSquare,
  Activity,
  Cpu,
  Users
} from 'lucide-react';
import { api, getToken } from '../../lib/api';
import { Card, Spinner, PageHeader, Badge, ErrorBox, Button } from '../../components/admin/ui';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api('/admin/stats', { token: getToken() })
      .then((res) => setStats(res.data))
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error && !stats) {
    return (
      <div>
        <PageHeader title="Dashboard" subtitle="Ringkasan sistem BBPOM AI Assistant" />
        <ErrorBox message={error} />
        <div className="mt-4">
          <Button variant="outline" onClick={load}>
            Coba Lagi
          </Button>
        </div>
      </div>
    );
  }

  if (!stats) return <Spinner />;

  const cards = [
    { label: 'Dokumen', value: stats.counts.documents, active: stats.counts.activeDocuments, icon: FileText, color: 'bg-brand-50 text-brand-600' },
    { label: 'FAQ', value: stats.counts.faqs, icon: HelpCircle, color: 'bg-emerald-50 text-emerald-600' },
    { label: 'Kategori', value: stats.counts.categories, icon: FolderTree, color: 'bg-amber-50 text-amber-600' },
    { label: 'Sumber', value: stats.counts.sources, icon: Link2, color: 'bg-violet-50 text-violet-600' },
    { label: 'Sesi Chat', value: stats.counts.sessions, icon: MessagesSquare, color: 'bg-sky-50 text-sky-600' },
    { label: 'Pesan', value: stats.counts.messages, icon: Activity, color: 'bg-slate-100 text-slate-600' },
    { label: 'Log AI', value: stats.counts.aiLogs, icon: Cpu, color: 'bg-rose-50 text-rose-600' },
    { label: 'Pengguna', value: stats.counts.users, icon: Users, color: 'bg-teal-50 text-teal-600' }
  ];

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Ringkasan sistem BBPOM AI Assistant" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {cards.map((c) => (
          <Card key={c.label} className="p-5">
            <div className={`h-10 w-10 rounded-lg ${c.color} flex items-center justify-center mb-3`}>
              <c.icon size={20} />
            </div>
            <p className="text-2xl font-bold text-slate-900">{c.value}</p>
            <p className="text-sm text-slate-500">{c.label}</p>
            {c.active !== undefined && (
              <p className="text-xs text-emerald-600 mt-1">✓ {c.active} aktif di KB</p>
            )}
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-5">
          <h2 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
            <Cpu size={16} /> Log AI Terbaru
          </h2>
          {stats.recentLogs.length === 0 ? (
            <p className="text-sm text-slate-400">Belum ada log AI.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {stats.recentLogs.map((log) => (
                <li key={log.id} className="py-2.5 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm text-slate-800 truncate">{log.prompt}</p>
                    <p className="text-xs text-slate-400">{log.model} · {log.duration_ms} ms</p>
                  </div>
                  <Badge color={log.status === 'success' ? 'green' : 'red'}>{log.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
            <MessagesSquare size={16} /> Percakapan Terbaru
          </h2>
          {stats.recentSessions.length === 0 ? (
            <p className="text-sm text-slate-400">Belum ada percakapan.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {stats.recentSessions.map((s) => (
                <li key={s.id} className="py-2.5 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm text-slate-800 truncate">{s.title}</p>
                    <p className="text-xs text-slate-400">
                      {s.user_name || 'Tamu'} · {s.message_count} pesan
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
