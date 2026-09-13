'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, HelpCircle } from 'lucide-react';
import { api, getToken } from '../../../lib/api';
import {
  Card,
  Button,
  Input,
  Select,
  Textarea,
  Badge,
  Spinner,
  ErrorBox,
  PageHeader
} from '../../../components/admin/ui';

const EMPTY = { question: '', answer: '', category: '' };

export default function FaqPage() {
  const [faqs, setFaqs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await api('/faq?all=1', { token: getToken() });
      setFaqs(res.data);
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
        await api(`/faq/${editingId}`, { method: 'PUT', body: form, token: getToken() });
      } else {
        await api('/faq', { method: 'POST', body: form, token: getToken() });
      }
      setForm(EMPTY);
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async (f) => {
    if (!confirm(`Hapus FAQ "${f.question}"?`)) return;
    try {
      await api(`/faq/${f.id}`, { method: 'DELETE', token: getToken() });
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const edit = (f) => {
    setEditingId(f.id);
    setForm({ question: f.question, answer: f.answer, category: f.category || '' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader title="FAQ" subtitle="Kelola pertanyaan yang sering diajukan" />

      <ErrorBox message={error} />

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="p-5 h-fit lg:col-span-1">
          <h2 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Plus size={16} /> {editingId ? 'Edit FAQ' : 'Tambah FAQ'}
          </h2>
          <form onSubmit={submit} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Pertanyaan *</label>
              <Input
                value={form.question}
                onChange={(e) => setForm({ ...form, question: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Jawaban *</label>
              <Textarea rows={5} value={form.answer} onChange={(e) => setForm({ ...form, answer: e.target.value })} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Kategori</label>
              <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="mis. Standar Pelayanan" />
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

        <div className="lg:col-span-2 space-y-3">
          {faqs.length === 0 && <p className="text-slate-400 text-sm">Belum ada FAQ.</p>}
          {faqs.map((f) => (
            <Card key={f.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex gap-3 min-w-0">
                  <div className="h-8 w-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                    <HelpCircle size={16} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800">{f.question}</p>
                    <p className="text-sm text-slate-500 mt-1 line-clamp-2">{f.answer}</p>
                    <div className="mt-2">
                      <Badge color="blue">{f.category || 'Umum'}</Badge>
                    </div>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button className="p-1.5 rounded hover:bg-slate-100 text-slate-500" onClick={() => edit(f)}>
                    <Pencil size={15} />
                  </button>
                  <button className="p-1.5 rounded hover:bg-rose-50 text-rose-500" onClick={() => remove(f)}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
