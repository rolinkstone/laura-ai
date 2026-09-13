'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Link2 } from 'lucide-react';
import { api, getToken } from '../../../lib/api';
import {
  Card,
  Button,
  Input,
  Textarea,
  Select,
  Badge,
  Spinner,
  ErrorBox,
  PageHeader
} from '../../../components/admin/ui';

const EMPTY = { name: '', type: 'url', url: '', description: '' };

export default function SumberPage() {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await api('/sources', { token: getToken() });
      setSources(res.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (editingId) {
        await api(`/sources/${editingId}`, { method: 'PUT', body: form, token: getToken() });
      } else {
        await api('/sources', { method: 'POST', body: form, token: getToken() });
      }
      setForm(EMPTY);
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async (s) => {
    if (!confirm(`Hapus sumber "${s.name}"?`)) return;
    try {
      await api(`/sources/${s.id}`, { method: 'DELETE', token: getToken() });
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const edit = (s) => {
    setEditingId(s.id);
    setForm({ name: s.name, type: s.type, url: s.url || '', description: s.description || '' });
  };

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader title="Sumber" subtitle="Sumber referensi dokumen (URL, PDF, regulasi, dll)" />

      <ErrorBox message={error} />

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="p-5 h-fit lg:col-span-1">
          <h2 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Plus size={16} /> {editingId ? 'Edit Sumber' : 'Tambah Sumber'}
          </h2>
          <form onSubmit={submit} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nama *</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tipe</label>
              <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {['url', 'pdf', 'docx', 'regulasi', 'lainnya'].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">URL</label>
              <Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://..." />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Deskripsi</label>
              <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="flex gap-2">
              <Button type="submit">{editingId ? 'Simpan' : 'Tambah'}</Button>
              {editingId && (
                <Button variant="outline" type="button" onClick={() => { setEditingId(null); setForm(EMPTY); }}>
                  Batal
                </Button>
              )}
            </div>
          </form>
        </Card>

        <Card className="lg:col-span-2 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-slate-400 border-b border-slate-100">
                <th className="px-5 py-3">Nama</th>
                <th className="px-3 py-3">Tipe</th>
                <th className="px-3 py-3">URL</th>
                <th className="px-5 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sources.length === 0 && (
                <tr><td colSpan={4} className="px-5 py-8 text-center text-slate-400">Belum ada sumber.</td></tr>
              )}
              {sources.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <p className="font-medium text-slate-800 flex items-center gap-2">
                      <Link2 size={14} className="text-slate-400" /> {s.name}
                    </p>
                  </td>
                  <td className="px-3 py-3"><Badge color="blue">{s.type}</Badge></td>
                  <td className="px-3 py-3 text-slate-500 truncate max-w-[220px]">{s.url || '-'}</td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-1">
                      <button className="p-1.5 rounded hover:bg-slate-100 text-slate-500" onClick={() => edit(s)}>
                        <Pencil size={15} />
                      </button>
                      <button className="p-1.5 rounded hover:bg-rose-50 text-rose-500" onClick={() => remove(s)}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
