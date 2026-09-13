'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, FolderTree, ChevronDown, ChevronRight } from 'lucide-react';
import { api, getToken } from '../../../lib/api';
import {
  Card,
  Button,
  Input,
  Textarea,
  Select,
  Spinner,
  ErrorBox,
  PageHeader
} from '../../../components/admin/ui';

const EMPTY = { name: '', description: '', parent_id: '' };

export default function KategoriPage() {
  const [tree, setTree] = useState([]);
  const [flat, setFlat] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [open, setOpen] = useState({});

  const load = useCallback(async () => {
    try {
      const token = getToken();
      const [treeRes, flatRes] = await Promise.all([
        api('/knowledge-base', { token }),
        api('/categories', { token })
      ]);
      setTree(treeRes.data);
      setFlat(flatRes.data);
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
      const body = {
        name: form.name,
        description: form.description,
        parent_id: form.parent_id ? Number(form.parent_id) : null
      };
      if (editingId) {
        await api(`/categories/${editingId}`, { method: 'PUT', body, token: getToken() });
      } else {
        await api('/categories', { method: 'POST', body, token: getToken() });
      }
      setForm(EMPTY);
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async (c) => {
    if (!confirm(`Hapus kategori "${c.name}"?`)) return;
    try {
      await api(`/categories/${c.id}`, { method: 'DELETE', token: getToken() });
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const edit = (c) => {
    setEditingId(c.id);
    setForm({ name: c.name, description: c.description || '', parent_id: c.parent_id || '' });
  };

  const renderNode = (node, depth = 0) => (
    <div key={node.id}>
      <div
        className="flex items-center justify-between py-2 px-2 hover:bg-slate-50 rounded-lg group"
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
      >
        <div className="flex items-center gap-2 min-w-0">
          {node.children?.length > 0 ? (
            <button onClick={() => setOpen((o) => ({ ...o, [node.id]: !o[node.id] }))} className="text-slate-400">
              {open[node.id] ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            </button>
          ) : (
            <span className="w-[15px]" />
          )}
          <FolderTree size={15} className="text-amber-500" />
          <span className="text-sm font-medium text-slate-800">{node.name}</span>
          <span className="text-xs text-slate-400">({node.document_count} dok)</span>
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100">
          <button className="p-1 rounded hover:bg-slate-100 text-slate-500" onClick={() => edit(node)}>
            <Pencil size={14} />
          </button>
          <button className="p-1 rounded hover:bg-rose-50 text-rose-500" onClick={() => remove(node)}>
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      {open[node.id] && node.children?.map((child) => renderNode(child, depth + 1))}
    </div>
  );

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader title="Kategori" subtitle="Struktur Knowledge Base (hierarki)" />

      <ErrorBox message={error} />

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="p-5 h-fit lg:col-span-1">
          <h2 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Plus size={16} /> {editingId ? 'Edit Kategori' : 'Tambah Kategori'}
          </h2>
          <form onSubmit={submit} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nama *</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Deskripsi</label>
              <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Parent</label>
              <Select value={form.parent_id} onChange={(e) => setForm({ ...form, parent_id: e.target.value })}>
                <option value="">- Tidak ada (kategori utama) -</option>
                {flat
                  .filter((c) => c.id !== editingId)
                  .map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
              </Select>
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

        <Card className="lg:col-span-2 p-4">
          <h2 className="font-semibold text-slate-900 mb-3 px-2">Tree Knowledge Base</h2>
          {tree.map((node) => renderNode(node, 0))}
        </Card>
      </div>
    </div>
  );
}
