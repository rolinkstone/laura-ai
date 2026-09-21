'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Upload,
  FileText,
  Pencil,
  Trash2,
  Download,
  RefreshCw,
  Brain,
  Eye,
  EyeOff,
  Loader2,
  X,
  Globe,
  Search,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { api, getToken, downloadFile } from '../../../lib/api';
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

// Jumlah dokumen per halaman (permintaan: tampilkan 10 saja per halaman)
const PAGE_SIZE = 10;

// Harus sama dengan `MAX_UPLOAD_MB` di backend/src/config/multer.js
const MAX_UPLOAD_MB = 50;

// Berapa nomor halaman yang ditampilkan sekaligus di navigasi
const PAGE_WINDOW = 5;

export default function DokumenPage() {
  const [documents, setDocuments] = useState([]);
  const [categories, setCategories] = useState([]);
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [meta, setMeta] = useState({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 });
  const [listLoading, setListLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);
  const [showUrl, setShowUrl] = useState(false);
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlForm, setUrlForm] = useState({ url: '', title: '', description: '', category_id: '', source_id: '' });

  // Kategori & sumber hanya dipakai untuk pilihan di form — cukup diambil sekali.
  useEffect(() => {
    (async () => {
      try {
        const token = getToken();
        const [catRes, srcRes] = await Promise.all([
          api('/categories', { token }),
          api('/sources', { token })
        ]);
        setCategories(catRes.data || []);
        setSources(srcRes.data || []);
      } catch (err) {
        setError(err.message);
      }
    })();
  }, []);

  // Daftar dokumen: 10 baris per halaman + kata kunci pencarian.
  // `silent` dipakai saat refresh otomatis (polling) agar tabel tidak berkedip.
  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setListLoading(true);
    try {
      const token = getToken();
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (search) params.set('search', search);

      const docRes = await api(`/documents?${params.toString()}`, { token });
      setDocuments(docRes.data || []);

      const nextMeta = docRes.meta || {
        page: 1,
        limit: PAGE_SIZE,
        total: (docRes.data || []).length,
        totalPages: 1
      };
      setMeta(nextMeta);
      // Backend menjepit nomor halaman (mis. halaman terakhir jadi kosong
      // setelah data dihapus) — samakan state agar penanda halaman konsisten.
      if (nextMeta.page && nextMeta.page !== page) setPage(nextMeta.page);
    } catch (err) {
      setError(err.message);
    } finally {
      setListLoading(false);
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    load();
  }, [load]);

  // Ketik kata kunci → tunggu 350 ms baru dikirim ke server (hindari
  // satu request per ketukan), lalu kembali ke halaman 1.
  useEffect(() => {
    const term = searchInput.trim();
    if (term === search) return;
    const timer = setTimeout(() => {
      setPage(1);
      setSearch(term);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput, search]);

  // Dokumen diproses di latar belakang (status 'processing'), jadi daftar
  // di-refresh berkala sampai semua selesai — tanpa perlu reload manual.
  useEffect(() => {
    if (!documents.some((d) => d.status === 'processing')) return;
    const timer = setTimeout(() => load({ silent: true }), 4000);
    return () => clearTimeout(timer);
  }, [documents, load]);

  // Nomor halaman yang ditampilkan (maksimal PAGE_WINDOW, mengikuti halaman aktif)
  const pageNumbers = useMemo(() => {
    const totalPages = Math.max(1, meta.totalPages || 1);
    const current = meta.page || 1;
    let start = Math.max(1, current - Math.floor(PAGE_WINDOW / 2));
    const end = Math.min(totalPages, start + PAGE_WINDOW - 1);
    start = Math.max(1, end - PAGE_WINDOW + 1);
    const list = [];
    for (let p = start; p <= end; p++) list.push(p);
    return list;
  }, [meta.page, meta.totalPages]);

  const firstRow = meta.total === 0 ? 0 : (meta.page - 1) * meta.limit + 1;
  const lastRow = Math.min(meta.total, (meta.page - 1) * meta.limit + documents.length);
  const goToPage = (p) => {
    const totalPages = Math.max(1, meta.totalPages || 1);
    setPage(Math.min(Math.max(1, p), totalPages));
  };

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const upload = async (e) => {
    e.preventDefault();
    const file = e.target.file?.files?.[0];
    if (!file) return setError('Pilih file PDF terlebih dahulu');

    const maxBytes = MAX_UPLOAD_MB * 1024 * 1024;
    if (file.size > maxBytes) {
      return setError(
        `Ukuran file ${(file.size / 1024 / 1024).toFixed(1)} MB melebihi batas ${MAX_UPLOAD_MB} MB`
      );
    }
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
      return setError('Hanya file PDF yang diperbolehkan');
    }

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

  // Toggle aktif/nonaktif dokumen.
  // Endpoint backend khusus untuk ini adalah PATCH /documents/:id/active
  // (PATCH /documents/:id tidak terdaftar → "Route tidak ditemukan").
  const toggleActive = async (doc) => {
    setBusyId(doc.id);
    try {
      await api(`/documents/${doc.id}/active`, {
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

  // Unduh PDF asli dokumen (file tersimpan di server)
  const download = async (doc) => {
    setDownloadingId(doc.id);
    setError('');
    try {
      const safeTitle = String(doc.title || 'dokumen').replace(/[\\/:*?"<>|]/g, '_');
      await downloadFile(`/documents/${doc.id}/file`, {
        token: getToken(),
        filename: `${safeTitle}.${doc.file_type || 'pdf'}`
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloadingId(null);
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
              <label className="block text-sm font-medium text-slate-700 mb-1">
                File PDF *
                <span className="ml-1 font-normal text-slate-400">(maksimal {MAX_UPLOAD_MB} MB)</span>
              </label>
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
              {uploading ? 'Mengunggah...' : 'Upload & Proses'}
            </Button>
          </form>
        </Card>

        {/* Daftar dokumen */}
        <Card className="lg:col-span-2 overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
            <h2 className="font-semibold text-slate-900 flex items-center gap-2">
              <FileText size={16} /> Daftar Dokumen ({meta.total})
            </h2>
            <div className="relative w-full sm:w-64">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Cari judul / deskripsi / kategori..."
                className="pl-9 pr-8"
                aria-label="Cari dokumen"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => setSearchInput('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-slate-700"
                  title="Bersihkan pencarian"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
          <div className={`overflow-x-auto ${listLoading ? 'opacity-60' : ''}`}>
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
                      {search
                        ? `Tidak ada dokumen yang cocok dengan "${search}".`
                        : 'Belum ada dokumen. Upload PDF pertama Anda.'}
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
                            {d.file_type !== 'url' && (
                              <button
                                className="p-1.5 rounded hover:bg-slate-100 text-slate-500 disabled:opacity-50"
                                title="Unduh PDF"
                                onClick={() => download(d)}
                                disabled={downloadingId === d.id}
                              >
                                {downloadingId === d.id ? (
                                  <Loader2 size={15} className="animate-spin" />
                                ) : (
                                  <Download size={15} />
                                )}
                              </button>
                            )}
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

          {/* Navigasi halaman — 10 dokumen per halaman */}
          <div className="px-5 py-3 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-xs text-slate-500">
              Menampilkan {firstRow}-{lastRow} dari {meta.total} dokumen
              {search ? ` (pencarian: "${search}")` : ''}
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => goToPage(meta.page - 1)}
                disabled={listLoading || meta.page <= 1}
                className="p-1.5 rounded border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent"
                title="Halaman sebelumnya"
              >
                <ChevronLeft size={15} />
              </button>
              {pageNumbers[0] > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => goToPage(1)}
                    className="min-w-8 px-2 py-1 rounded border border-slate-200 text-xs text-slate-600 hover:bg-slate-50"
                  >
                    1
                  </button>
                  {pageNumbers[0] > 2 && <span className="px-1 text-slate-400 text-xs">...</span>}
                </>
              )}
              {pageNumbers.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => goToPage(p)}
                  className={`min-w-8 px-2 py-1 rounded border text-xs ${
                    p === meta.page
                      ? 'bg-brand-600 border-brand-600 text-white'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {p}
                </button>
              ))}
              {pageNumbers[pageNumbers.length - 1] < meta.totalPages && (
                <>
                  {pageNumbers[pageNumbers.length - 1] < meta.totalPages - 1 && (
                    <span className="px-1 text-slate-400 text-xs">...</span>
                  )}
                  <button
                    type="button"
                    onClick={() => goToPage(meta.totalPages)}
                    className="min-w-8 px-2 py-1 rounded border border-slate-200 text-xs text-slate-600 hover:bg-slate-50"
                  >
                    {meta.totalPages}
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => goToPage(meta.page + 1)}
                disabled={listLoading || meta.page >= meta.totalPages}
                className="p-1.5 rounded border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent"
                title="Halaman berikutnya"
              >
                <ChevronRight size={15} />
              </button>
            </div>
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
