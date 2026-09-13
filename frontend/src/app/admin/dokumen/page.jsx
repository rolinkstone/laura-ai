'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Upload,
  FileText,
  Pencil,
  Trash2,
  RefreshCw,
  Brain,
  Eye,
  EyeOff,
  Loader2,
  X,
  Globe
} from 'lucide-react';
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

const EMPTY_FORM = {
  title: '',
  description: '',
  category_id: '',
  source_id: '',
  document_date: '',
  effective_date: ''
};

const statusColor = {
  ready: 'green',
  processing: 'amber',
  failed: 'red',
  draft: 'slate',
  uploaded: 'blue'
};

export default function DokumenPage() {
  const [documents, setDocuments] = useState([]);
  const [categories, setCategories] = useState([]);
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [showUrl, setShowUrl] = useState(false);
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlForm, setUrlForm] = useState({ url: '', title: '', description: '', category_id: '', source_id: '' });

  const load = useCallback(async () => {
    try {
      const token = getToken();
      const [docRes, catRes, srcRes] = await Promise.all([
        api('/documents', { token }),
        api('/categories', { token }),
        api('/sources', { token })
      ]);
      setDocuments(docRes.data);
      setCategories(catRes.data);
      setSources(srcRes.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const upload = async (e) => {
    e.preventDefault();
    const file = e.target.file?.files?.[0];
    if (!file) return setError('Pilih file PDF terlebih dahulu');

    const fd = new FormData();
    fd.append('file', file);
    fd.append('title', form.title);
    if (form.description) fd.append('description', form.description);
    if (form.category_id) fd.append('category_id', form.category_id);
    if (form.source_id) fd.append('source_id', form.source_id);
    if (form.document_date) fd.append('document_date', form.document_date);
    if (form.effective_date) fd.append('effective_date', form.effective_date);

    setUploading(true);
    setError('');
    try {
      await api('/documents/upload', {
        method: 'POST',
        body: fd,
        isForm: true,
        token: getToken()
      });
      setForm(EMPTY_FORM);
      e.target.reset();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const toggleActive = async (doc) => {
    setBusyId(doc.id);
    try {
      await api(`/documents/${doc.id}`, {
        method: 'PATCH',
        body: { is_active: doc.is_active === 1 ? 0 : 1 },
        token: getToken()
      });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const reprocess = async (doc) => {
    if (!confirm(`Proses ulang dokumen "${doc.title}"? Chunk lama akan diganti.`)) return;
    setBusyId(doc.id);
    setError('');
    try {
      await api(`/documents/${doc.id}/reprocess`, { method: 'POST', token: getToken() });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const reembed = async (doc) => {
    setBusyId(doc.id);
    setError('');
    try {
      await api(`/documents/${doc.id}/reembed`, { method: 'POST', token: getToken() });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (doc) => {
    if (!confirm(`Hapus dokumen "${doc.title}"? Tindakan ini permanen.`)) return;
    setBusyId(doc.id);
    try {
      await api(`/documents/${doc.id}`, { method: 'DELETE', token: getToken() });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const submitUrl = async (e) => {
    e.preventDefault();
    setUrlLoading(true);
    setError('');
    try {
      await api('/documents/from-url', {
        method: 'POST',
        body: {
          url: urlForm.url,
          title: urlForm.title || undefined,
          description: urlForm.description || undefined,
          category_id: urlForm.category_id || null,
          source_id: urlForm.source_id || null
        },
        token: getToken()
      });
      setShowUrl(false);
      setUrlForm({ url: '', title: '', description: '', category_id: '', source_id: '' });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setUrlLoading(false);
    }
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    try {
      await api(`/documents/${editing.id}`, {
        method: 'PUT',
        body: {
          title: editing.title,
          description: editing.description,
          category_id: editing.category_id || null,
          source_id: editing.source_id || null,
          document_date: editing.document_date || null,
          effective_date: editing.effective_date || null
        },
        token: getToken()
      });
      setEditing(null);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="Dokumen"
        subtitle="Upload PDF / URL dan kelola dokumen Knowledge Base"
        actions={
          <Button variant="outline" onClick={() => setShowUrl(true)}>
            <Globe size={16} /> Tambah dari URL
          </Button>
        }
      />

      <ErrorBox message={error} />

      <div className="grid lg:grid-cols-3 gap-6 mb-8">
        {/* Upload */}
        <Card className="p-5 lg:col-span-1 h-fit">
          <h2 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Upload size={16} /> Upload PDF
          </h2>
          <form onSubmit={upload} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">File PDF *</label>
              <input
                type="file"
                name="file"
                accept="application/pdf,.pdf"
                className="block w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-brand-50 file:text-brand-700 file:text-sm file:font-medium hover:file:bg-brand-100"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Judul *</label>
              <Input value={form.title} onChange={set('title')} required placeholder="Judul dokumen" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Deskripsi</label>
              <Textarea rows={2} value={form.description} onChange={set('description')} placeholder="Deskripsi singkat" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Kategori</label>
                <Select value={form.category_id} onChange={set('category_id')}>
                  <option value="">- Pilih -</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Sumber</label>
                <Select value={form.source_id} onChange={set('source_id')}>
                  <option value="">- Pilih -</option>
                  {sources.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tgl Dokumen</label>
                <Input type="date" value={form.document_date} onChange={set('document_date')} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tgl Berlaku</label>
                <Input type="date" value={form.effective_date} onChange={set('effective_date')} />
              </div>
            </div>
            <Button type="submit" disabled={uploading} className="w-full justify-center">
              {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              {uploading ? 'Mengunggah & memproses...' : 'Upload & Proses'}
            </Button>
          </form>
        </Card>

        {/* Daftar dokumen */}
        <Card className="lg:col-span-2 overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900 flex items-center gap-2">
              <FileText size={16} /> Daftar Dokumen ({documents.length})
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-slate-400 border-b border-slate-100">
                  <th className="px-5 py-3">Judul</th>
                  <th className="px-3 py-3">Kategori</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Aktif</th>
                  <th className="px-3 py-3">Chunk</th>
                  <th className="px-5 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {documents.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-slate-400">
                      Belum ada dokumen. Upload PDF pertama Anda.
                    </td>
                  </tr>
                )}
                {documents.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <p className="font-medium text-slate-800">{d.title}</p>
                      <p className="text-xs text-slate-400">{d.file_type} · {d.metadata?.numPages || '-'} hal</p>
                    </td>
                    <td className="px-3 py-3 text-slate-600">{d.category_name || '-'}</td>
                    <td className="px-3 py-3">
                      <Badge color={statusColor[d.status] || 'slate'}>{d.status}</Badge>
                    </td>
                    <td className="px-3 py-3">
                      <button
                        onClick={() => toggleActive(d)}
                        className="text-slate-400 hover:text-slate-700"
                        title={d.is_active === 1 ? 'Nonaktifkan' : 'Aktifkan'}
                      >
                        {d.is_active === 1 ? <Eye size={16} /> : <EyeOff size={16} />}
                      </button>
                    </td>
                    <td className="px-3 py-3 text-slate-600">{d.metadata?.chunkCount || 0}</td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1">
                        {busyId === d.id ? (
                          <Loader2 size={16} className="animate-spin text-slate-400" />
                        ) : (
                          <>
                            <button className="p-1.5 rounded hover:bg-slate-100 text-slate-500" title="Edit metadata" onClick={() => setEditing({ ...d, document_date: d.document_date || '', effective_date: d.effective_date || '' })}>
                              <Pencil size={15} />
                            </button>
                            <button className="p-1.5 rounded hover:bg-slate-100 text-slate-500" title="Re-process" onClick={() => reprocess(d)}>
                              <RefreshCw size={15} />
                            </button>
                            <button className="p-1.5 rounded hover:bg-slate-100 text-slate-500" title="Re-embedding" onClick={() => reembed(d)}>
                              <Brain size={15} />
                            </button>
                            <button className="p-1.5 rounded hover:bg-rose-50 text-rose-500" title="Hapus" onClick={() => remove(d)}>
                              <Trash2 size={15} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Modal edit */}
      {editing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900">Edit Metadata</h3>
              <button onClick={() => setEditing(null)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={saveEdit} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Judul</label>
                <Input
                  value={editing.title}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Deskripsi</label>
                <Textarea
                  rows={2}
                  value={editing.description || ''}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Kategori</label>
                  <Select
                    value={editing.category_id || ''}
                    onChange={(e) => setEditing({ ...editing, category_id: e.target.value })}
                  >
                    <option value="">- Pilih -</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Sumber</label>
                  <Select
                    value={editing.source_id || ''}
                    onChange={(e) => setEditing({ ...editing, source_id: e.target.value })}
                  >
                    <option value="">- Pilih -</option>
                    {sources.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Tgl Dokumen</label>
                  <Input
                    type="date"
                    value={editing.document_date || ''}
                    onChange={(e) => setEditing({ ...editing, document_date: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Tgl Berlaku</label>
                  <Input
                    type="date"
                    value={editing.effective_date || ''}
                    onChange={(e) => setEditing({ ...editing, effective_date: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" type="button" onClick={() => setEditing(null)}>
                  Batal
                </Button>
                <Button type="submit">Simpan</Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Modal tambah dari URL */}
      {showUrl && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                <Globe size={16} /> Tambah Dokumen dari URL
              </h3>
              <button onClick={() => setShowUrl(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-4 -mt-2">
              Sistem akan membuka URL, mengambil teks (HTML/PDF), lalu memprosesnya menjadi chunk + embedding agar bisa dicari di RAG.
            </p>
            <form onSubmit={submitUrl} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">URL *</label>
                <Input
                  type="url"
                  value={urlForm.url}
                  onChange={(e) => setUrlForm({ ...urlForm, url: e.target.value })}
                  placeholder="https://..."
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Judul (opsional)</label>
                <Input
                  value={urlForm.title}
                  onChange={(e) => setUrlForm({ ...urlForm, title: e.target.value })}
                  placeholder="Kosongkan untuk memakai judul halaman"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Deskripsi</label>
                <Textarea
                  rows={2}
                  value={urlForm.description}
                  onChange={(e) => setUrlForm({ ...urlForm, description: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Kategori</label>
                  <Select
                    value={urlForm.category_id}
                    onChange={(e) => setUrlForm({ ...urlForm, category_id: e.target.value })}
                  >
                    <option value="">- Pilih -</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Sumber</label>
                  <Select
                    value={urlForm.source_id}
                    onChange={(e) => setUrlForm({ ...urlForm, source_id: e.target.value })}
                  >
                    <option value="">- Auto buat -</option>
                    {sources.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </Select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" type="button" onClick={() => setShowUrl(false)}>
                  Batal
                </Button>
                <Button type="submit" disabled={urlLoading}>
                  {urlLoading && <Loader2 size={16} className="animate-spin" />}
                  {urlLoading ? 'Memproses URL...' : 'Proses URL'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
