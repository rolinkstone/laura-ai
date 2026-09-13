'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Link2, Globe, ShieldCheck, Save, RotateCcw, Search, X } from 'lucide-react';
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

/** Normalisasi input domain (sama dengan backend). */
const normalizeDomain = (raw) => {
  let v = String(raw || '').trim().toLowerCase();
  if (!v) return '';
  v = v.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  v = v.split('/')[0].split('?')[0].split('#')[0].replace(/:\d+$/, '');
  return v.replace(/^www\./, '').replace(/\.$/, '');
};

const isValidDomain = (value) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(normalizeDomain(value));

/** Toggle sederhana bergaya admin console. */
function Toggle({ checked, onChange, title, desc, badge }) {
  return (
    <div className="flex items-start justify-between gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
      <div className="min-w-0">
        <p className="font-medium text-slate-800 flex flex-wrap items-center gap-2">
          {title}
          {badge}
        </p>
        <p className="text-xs text-slate-500 mt-1 leading-relaxed">{desc}</p>
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        aria-pressed={checked}
        className={`relative w-12 h-7 rounded-full transition shrink-0 ${
          checked ? 'bg-emerald-500' : 'bg-slate-300'
        }`}
      >
        <span
          className={`absolute top-0.5 h-6 w-6 bg-white rounded-full shadow transition-transform ${
            checked ? 'translate-x-5' : 'left-0.5'
          }`}
        />
      </button>
    </div>
  );
}

/** Chip daftar domain dengan tombol hapus opsional. */
function ChipList({ items, onRemove, emptyLabel, tone = 'slate' }) {
  if (!items || items.length === 0) return <p className="text-xs text-slate-400 italic">{emptyLabel}</p>;
  const tones = {
    slate: 'bg-slate-100 border-slate-200 text-slate-700',
    green: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    blue: 'bg-blue-50 border-blue-200 text-blue-800'
  };
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span
          key={item}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${tones[tone]}`}
        >
          {item}
          {onRemove && (
            <button
              type="button"
              onClick={() => onRemove(item)}
              className="text-slate-400 hover:text-rose-600"
              title={`Hapus ${item}`}
            >
              <X size={12} />
            </button>
          )}
        </span>
      ))}
    </div>
  );
}

export default function SumberPage() {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  // ===== Ruang lingkup pencarian web (diturunkan dari daftar Sumber ini) =====
  const [scope, setScope] = useState(null);
  const [scopeForm, setScopeForm] = useState(null);
  const [scopeSaving, setScopeSaving] = useState(false);
  const [scopeSaved, setScopeSaved] = useState('');
  const [domainInput, setDomainInput] = useState('');
  const [testUrl, setTestUrl] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);

  const applyScope = (data) => {
    setScope(data);
    setScopeForm({
      useSources: data.useSources !== false,
      strictScope: !!data.strictScope,
      allowGovSuffix: !!data.allowGovSuffix,
      officialOnly: data.officialOnly !== false,
      domains: data.domains || []
    });
  };

  const load = useCallback(async () => {
    try {
      const [sourcesRes, scopeRes] = await Promise.all([
        api('/sources', { token: getToken() }),
        api('/admin/web-search-config', { token: getToken() })
      ]);
      setSources(sourcesRes.data);
      applyScope(scopeRes.data);
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

  // ===== Aksi ruang lingkup =====
  const addDomain = () => {
    const raw = domainInput.trim();
    if (!raw) return;
    if (!isValidDomain(raw)) {
      setError(`Domain "${raw}" tidak valid. Contoh: pom.go.id`);
      return;
    }
    const clean = normalizeDomain(raw);
    if (scopeForm.domains.includes(clean)) {
      setError(`Domain ${clean} sudah ada.`);
      return;
    }
    setScopeForm({ ...scopeForm, domains: [...scopeForm.domains, clean] });
    setDomainInput('');
    setError('');
  };

  const saveScope = async () => {
    setScopeSaving(true);
    setError('');
    setScopeSaved('');
    try {
      const res = await api('/admin/web-search-config', {
        method: 'POST',
        token: getToken(),
        body: {
          useSources: scopeForm.useSources,
          strictScope: scopeForm.strictScope,
          allowGovSuffix: scopeForm.allowGovSuffix,
          officialOnly: scopeForm.officialOnly,
          domains: scopeForm.domains
        }
      });
      applyScope(res.data);
      setScopeSaved(res.message || 'Ruang lingkup disimpan.');
    } catch (err) {
      setError(err.message);
    } finally {
      setScopeSaving(false);
    }
  };

  const resetScope = async () => {
    if (!confirm('Kembalikan ruang lingkup ke pengaturan bawaan (.env)?')) return;
    setScopeSaving(true);
    setError('');
    setScopeSaved('');
    try {
      const res = await api('/admin/web-search-config', {
        method: 'POST',
        token: getToken(),
        body: { reset: true }
      });
      applyScope(res.data);
      setScopeSaved('Ruang lingkup dikembalikan ke bawaan (.env).');
    } catch (err) {
      setError(err.message);
    } finally {
      setScopeSaving(false);
    }
  };

  const testLink = async (e) => {
    e.preventDefault();
    if (!testUrl.trim()) return;
    setTesting(true);
    setTestResult(null);
    setError('');
    try {
      const res = await api('/admin/web-search-config/check', {
        method: 'POST',
        token: getToken(),
        body: { url: testUrl.trim() }
      });
      setTestResult(res.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setTesting(false);
    }
  };

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="Sumber"
        subtitle="Daftar link/sumber referensi — sekaligus menjadi ruang lingkup pencarian web LAURA"
      />

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

      {/* ===== Ruang lingkup pencarian web (mengikuti link di daftar Sumber) ===== */}
      {scopeForm && (
        <Card className="p-5 mt-6">
          <h2 className="font-semibold text-slate-900 mb-1 flex items-center gap-2">
            <Globe size={16} /> Ruang lingkup pencarian web
            <Badge color="green">{scope?.effective?.domains?.length || 0} domain aktif</Badge>
          </h2>
          <p className="text-xs text-slate-500 mb-4 leading-relaxed">
            LAURA hanya boleh mengambil sumber web dari domain di bawah. Domain terdeteksi{' '}
            <b>otomatis dari URL pada daftar Sumber di atas</b>, jadi cukup masukkan link-nya sekali di
            form kiri.
            {scope?.provider ? ` Penyedia pencarian: ${scope.provider}.` : ''}
          </p>

          {scopeSaved && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg px-4 py-3 text-sm mb-4 flex items-center gap-2">
              <Check size={16} /> {scopeSaved}
            </div>
          )}

          <div className="grid lg:grid-cols-2 gap-5">
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-slate-500 mb-2">
                  Domain dari daftar Sumber (otomatis):
                </p>
                <ChipList
                  items={scope?.registeredDomains || []}
                  tone="green"
                  emptyLabel="Belum ada URL pada daftar Sumber."
                />
              </div>

              <div className="pt-4 border-t border-slate-100">
                <p className="text-xs font-medium text-slate-500 mb-2">
                  Domain tambahan (opsional) — untuk domain yang belum ada link spesifiknya:
                </p>
                <div className="flex gap-2 mb-3">
                  <Input
                    value={domainInput}
                    onChange={(e) => setDomainInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addDomain();
                      }
                    }}
                    placeholder="contoh.go.id"
                  />
                  <Button type="button" variant="outline" onClick={addDomain} className="shrink-0">
                    <Plus size={15} /> Tambah
                  </Button>
                </div>
                <ChipList
                  items={scopeForm.domains}
                  tone="blue"
                  onRemove={(d) =>
                    setScopeForm({ ...scopeForm, domains: scopeForm.domains.filter((x) => x !== d) })
                  }
                  emptyLabel="Tanpa domain tambahan."
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-medium text-slate-500 mb-2">
                  Domain yang BENAR-BENAR dipakai saat ini:
                </p>
                <p className="text-xs text-slate-700 break-words">
                  {(scope?.effective?.domains || []).join(', ') || '-'}
                </p>
                <p className="text-[11px] text-slate-400 mt-2">
                  Filter tambahan pada query mencari: {(scope?.effective?.searchDomains || []).join(', ') || '-'}
                </p>
              </div>

              <Toggle
                checked={scopeForm.useSources}
                onChange={(v) => setScopeForm({ ...scopeForm, useSources: v })}
                title="Pakai link dari daftar Sumber"
                desc="Domain pada tabel Sumber di atas otomatis masuk ruang lingkup. Matikan bila ingin lingkup hanya dari daftar tambahan."
              />

              <Toggle
                checked={scopeForm.strictScope}
                onChange={(v) => setScopeForm({ ...scopeForm, strictScope: v })}
                title="Hanya pakai daftar ini (abaikan bawaan sistem)"
                desc="Nyalakan bila ruang lingkup harus persis sama dengan link yang Anda masukkan — domain bawaan (.env) tidak dipakai."
              />

              <Toggle
                checked={scopeForm.officialOnly}
                onChange={(v) => setScopeForm({ ...scopeForm, officialOnly: v })}
                badge={scope?.source?.officialOnly === 'env' ? <Badge color="slate">ikut .env</Badge> : null}
                title="Batasi hasil ke domain dalam lingkup"
                desc="Jika dimatikan, hasil pencarian dari domain mana pun bisa dipakai sebagai sumber web (tidak disarankan)."
              />

              <Toggle
                checked={scopeForm.allowGovSuffix}
                onChange={(v) => setScopeForm({ ...scopeForm, allowGovSuffix: v })}
                badge={scope?.source?.allowGovSuffix === 'env' ? <Badge color="slate">ikut .env</Badge> : null}
                title="Izinkan semua situs pemerintah (*.go.id)"
                desc="Keluarkan bila ingin membuka akses ke seluruh situs .go.id (mis. peraturan.bpk.go.id)."
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 mt-5 pt-4 border-t border-slate-100">
            <Button type="button" onClick={saveScope} disabled={scopeSaving}>
              <Save size={16} /> {scopeSaving ? 'Menyimpan...' : 'Simpan & Terapkan'}
            </Button>
            <Button type="button" variant="outline" onClick={resetScope} disabled={scopeSaving}>
              <RotateCcw size={16} /> Reset ke bawaan
            </Button>
            <span className="text-xs text-slate-400">
              Berlaku langsung untuk chat berikutnya — tanpa restart backend.
            </span>
          </div>

          <div className="mt-5 pt-4 border-t border-slate-100">
            <p className="text-sm font-medium text-slate-800 flex items-center gap-2 mb-1">
              <Search size={15} /> Uji link
            </p>
            <p className="text-xs text-slate-500 mb-3">
              Tempel tautan untuk memeriksa apakah termasuk ruang lingkup yang boleh dipakai.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                value={testUrl}
                onChange={(e) => setTestUrl(e.target.value)}
                placeholder="https://cekbpom.pom.go.id/cek-produk"
              />
              <Button type="button" variant="outline" onClick={testLink} disabled={testing} className="shrink-0">
                {testing ? 'Memeriksa...' : 'Periksa'}
              </Button>
            </div>
            {testResult && (
              <div
                className={`mt-3 flex flex-wrap items-center gap-2 text-sm rounded-lg px-3 py-2 border ${
                  testResult.allowed
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-rose-50 border-rose-200 text-rose-700'
                }`}
              >
                {testResult.allowed ? <Check size={15} /> : <X size={15} />}
                <span className="font-medium break-all">{testResult.url}</span>
                <span>— {testResult.reason}</span>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
