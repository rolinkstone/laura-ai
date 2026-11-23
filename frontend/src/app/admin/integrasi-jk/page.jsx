'use client';

/**
 * ADMIN — INTEGRASI JENDELA KINERJA
 * ---------------------------------
 * Satu menu untuk mengelola data JK yang masuk ke knowledge:
 *   1. Tempel link-link API dari dashboard JK (satu per baris) → Impor.
 *   2. Tabel endpoint: status sinkron terakhir, masa berlaku token, aksi.
 *   3. Sinkron per endpoint / semua sekaligus (data → chunk → embedding).
 *   4. Terbitkan / cabut token per endpoint (masa berlaku diatur per baris).
 */

import { useCallback, useEffect, useState } from 'react';
import { Plus, RefreshCw, Trash2, KeyRound, ClipboardPaste, Pencil, Ban, Download, Upload } from 'lucide-react';
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

const STATUS_BADGE = {
  sukses: 'green',
  gagal: 'red',
  belum: 'slate'
};

const TOKEN_BADGE = {
  aktif: 'green',
  segera_kedaluwarsa: 'amber',
  kedaluwarsa: 'red',
  belum_terbit: 'slate',
  tanpa_batas: 'blue'
};

export default function IntegrasiJkPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  // Form tempel link
  const [links, setLinks] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [imporResult, setImporResult] = useState(null);

  // Token Keycloak JK (untuk endpoint modul yang dijaga keycloakAuth)
  const [bearer, setBearer] = useState(null);
  const [bearerInput, setBearerInput] = useState('');

  // Edit endpoint
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});

  const load = useCallback(async () => {
    try {
      const res = await api('/integrations/jk', { token: getToken() });
      setData(res.data);
      setBaseUrl(res.data.base_url || '');
      // Status token Keycloak (hanya potongan, bukan isinya)
      const st = await api('/integrations/jk/bearer', { token: getToken() });
      setBearer(st.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** Simpan Bearer token Keycloak JK → settings.jk_bearer_token. */
  const simpanBearer = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    const token = bearerInput.trim();
    if (token.length < 20) {
      setError('Token terlalu pendek — pastikan menyalin token Keycloak utuh');
      return;
    }
    setBusy(true);
    try {
      const res = await api('/integrations/jk/bearer', {
        method: 'PUT',
        body: { token },
        token: getToken()
      });
      setBearer(res.data);
      setBearerInput('');
      setNotice('Token Keycloak tersimpan — endpoint modul sekarang bisa disinkron');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const impor = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setImporResult(null);
    const daftar = links.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!daftar.length) {
      setError('Tempel minimal satu link API');
      return;
    }
    setBusy(true);
    try {
      const res = await api('/integrations/jk/impor', {
        method: 'POST',
        body: { links: daftar, base_url: baseUrl || null, timpa: true },
        token: getToken()
      });
      setImporResult(res.data);
      setNotice(res.message);
      setLinks('');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const syncOne = async (ep) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await api(`/integrations/jk/${ep.id}/sync`, { method: 'POST', token: getToken() });
      setNotice(`${ep.kode}: ${res.message}`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const syncAll = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await api('/integrations/jk/sync-all', { method: 'POST', token: getToken() });
      setNotice(res.message);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const issueToken = async (ep) => {
    setError('');
    setNotice('');
    try {
      const res = await api(`/integrations/jk/${ep.id}/token`, { method: 'POST', body: {}, token: getToken() });
      try {
        await navigator.clipboard.writeText(res.data.token);
        setNotice(`${ep.kode}: token baru (${res.data.masa_berlaku_hari} hari) — sudah disalin ke clipboard. Kedaluwarsa: ${new Date(res.data.kedaluwarsa_pada).toLocaleString('id-ID')}`);
      } catch {
        setNotice(`${ep.kode}: token baru = ${res.data.token} (kedaluwarsa ${res.data.kedaluwarsa_pada}) — SALIN SEKARANG, tidak akan tampil lagi.`);
      }
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const revokeToken = async (ep) => {
    if (!confirm(`Cabut token ${ep.kode}?`)) return;
    try {
      await api(`/integrations/jk/${ep.id}/token`, { method: 'DELETE', token: getToken() });
      setNotice(`${ep.kode}: token dicabut`);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async (ep) => {
    if (!confirm(`Hapus endpoint ${ep.kode}? Dokumen knowledge-nya tidak ikut terhapus.`)) return;
    try {
      await api(`/integrations/jk/${ep.id}`, { method: 'DELETE', token: getToken() });
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const startEdit = (ep) => {
    setEditing(ep.id);
    setForm({
      nama: ep.nama,
      url_path: ep.url_path,
      auth_mode: ep.auth_mode,
      model_data: ep.model_data,
      aktif: ep.aktif,
      token_masa_berlaku_hari: ep.token_masa_berlaku_hari
    });
  };

  const saveEdit = async () => {
    setError('');
    try {
      await api(`/integrations/jk/${editing}`, { method: 'PUT', body: form, token: getToken() });
      setEditing(null);
      setNotice('Endpoint diperbarui');
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) return <Spinner />;
  if (error && !data) return <ErrorBox message={error} />;

  const eps = data?.endpoints || [];
  const ring = data?.ringkasan || {};

  return (
    <div className="space-y-6">
      <PageHeader
        title="Integrasi Jendela Kinerja"
        subtitle="Tarik data API Jendela Kinerja ke knowledge LAURA AI"
      />

      {error && <ErrorBox message={error} />}
      {notice && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
          {notice}
        </div>
      )}

      {/* ============ Ringkasan ============ */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'Total endpoint', nilai: eps.length, warna: 'text-foreground' },
          { label: 'Aktif', nilai: ring.aktif ?? 0, warna: 'text-blue-500' },
          { label: 'Sinkron sukses', nilai: ring.sukses ?? 0, warna: 'text-green-500' },
          { label: 'Gagal', nilai: ring.gagal ?? 0, warna: 'text-red-500' }
        ].map((s) => (
          <Card key={s.label} className="p-4">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className={`mt-1 text-2xl font-bold ${s.warna}`}>{s.nilai}</p>
          </Card>
        ))}
      </div>

      {/* ============ Token Keycloak JK ============ */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-2">
          <KeyRound size={16} className="text-muted-foreground" />
          <h2 className="text-sm font-semibold">Token Keycloak Jendela Kinerja</h2>
          {bearer?.terisi ? (
            <Badge color="green">terpasang — {bearer.potongan} ({bearer.panjang} char)</Badge>
          ) : (
            <Badge color="amber">belum diisi</Badge>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Endpoint modul JK (sampel, PBF, produksi) dijaga <code>keycloakAuth</code>, jadi butuh
          Bearer token Keycloak. Endpoint publik (rekap kinerja) tidak butuh. Ambil token dari
          sesi login JK Anda, lalu tempel di sini — tersimpan di server, tidak pernah dikirim balik
          ke browser.
        </p>
        <form onSubmit={simpanBearer} className="mt-3 flex flex-wrap items-start gap-2">
          <Input
            type="password"
            value={bearerInput}
            onChange={(e) => setBearerInput(e.target.value)}
            placeholder="eyJhbGciOiJSUzI1NiIsInR5cCI…"
            className="min-w-[320px] flex-1 font-mono text-xs"
            autoComplete="off"
          />
          <Button type="submit" disabled={busy || !bearerInput.trim()}>
            <KeyRound size={15} className="mr-1" />
            Simpan Token
          </Button>
        </form>
      </Card>

      {/* ============ Tempel link ============ */}
      <Card className="p-5">
        <div className="flex items-center gap-2">
          <ClipboardPaste size={16} className="text-muted-foreground" />
          <h2 className="text-sm font-semibold">Tempel Link API dari Jendela Kinerja</h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Salin link dari dashboard Jendela Kinerja → menu <strong>Integrasi Laura AI</strong>, lalu
          tempel di sini (satu link per baris). Link yang sudah ada akan diperbarui.
        </p>
        <form onSubmit={impor} className="mt-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Base URL API JK</label>
              <Input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://jendela-kinerja.bbpompky.id"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Link API (satu per baris)
              </label>
              <Textarea
                rows={4}
                value={links}
                onChange={(e) => setLinks(e.target.value)}
                placeholder={'https://jk.bbpompky.id/api/publik/kinerja/ringkasan?tahun=2026\nhttps://jk.bbpompky.id/api/publik/kinerja/sampel'}
                className="font-mono text-xs"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button type="submit" disabled={busy}>
              <Upload size={15} className="mr-1" />
              {busy ? 'Memproses…' : 'Impor Link'}
            </Button>
            <Button type="button" variant="outline" onClick={syncAll} disabled={busy || !eps.length}>
              <RefreshCw size={15} className={`mr-1 ${busy ? 'animate-spin' : ''}`} />
              Sinkron Semua
            </Button>
          </div>
        </form>

        {imporResult && (
          <div className="mt-3 rounded-lg border bg-muted/40 p-3 text-xs">
            {imporResult.hasil.map((h, i) => (
              <p key={i} className="flex items-center gap-2 py-0.5">
                <Badge color={h.status === 'gagal' ? 'red' : h.status === 'dilewati' ? 'slate' : 'green'}>
                  {h.status}
                </Badge>
                <span className="font-mono">{h.kode || h.link}</span>
                {h.alasan && <span className="text-muted-foreground">— {h.alasan}</span>}
              </p>
            ))}
          </div>
        )}
      </Card>

      {/* ============ Tabel endpoint ============ */}
      <Card className="overflow-hidden">
        <div className="border-b px-5 py-3">
          <h2 className="text-sm font-semibold">Endpoint API Jendela Kinerja ({eps.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-xs">
            <thead className="border-b bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Kode / Nama</th>
                <th className="px-3 py-2.5 font-semibold">Akses</th>
                <th className="px-3 py-2.5 font-semibold">Status Sinkron</th>
                <th className="px-3 py-2.5 font-semibold">Token</th>
                <th className="px-3 py-2.5 font-semibold">Berlaku</th>
                <th className="px-3 py-2.5 text-right font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {eps.map((ep) => (
                <tr key={ep.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 align-top">
                    <p className="font-mono text-[10px] text-muted-foreground">{ep.kode}</p>
                    {editing === ep.id ? (
                      <div className="mt-1 space-y-1.5">
                        <Input
                          className="h-7 text-xs"
                          value={form.nama}
                          onChange={(e) => setForm({ ...form, nama: e.target.value })}
                        />
                        <div className="grid grid-cols-2 gap-1.5">
                          <Select
                            className="h-7 text-xs"
                            value={form.model_data}
                            onChange={(e) => setForm({ ...form, model_data: e.target.value })}
                          >
                            <option value="ringkasan">ringkasan</option>
                            <option value="rekap_sampel">rekap_sampel</option>
                            <option value="daftar_sarana">daftar_sarana</option>
                            <option value="pilihan">pilihan</option>
                          </Select>
                          <Select
                            className="h-7 text-xs"
                            value={form.auth_mode}
                            onChange={(e) => setForm({ ...form, auth_mode: e.target.value })}
                          >
                            <option value="public">public</option>
                            <option value="bearer">bearer</option>
                          </Select>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="font-medium">{ep.nama}</p>
                        <p className="mt-0.5 max-w-[240px] truncate font-mono text-[10px] text-muted-foreground">
                          {ep.url_path}
                        </p>
                      </>
                    )}
                  </td>
                  <td className="px-3 py-3 align-top">
                    <Badge color={ep.auth_mode === 'bearer' ? 'amber' : 'blue'}>{ep.auth_mode}</Badge>
                  </td>
                  <td className="px-3 py-3 align-top">
                    <Badge color={STATUS_BADGE[ep.tersinkron_status] || 'slate'}>
                      {ep.tersinkron_status}
                    </Badge>
                    {ep.tersinkron_pada && (
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {new Date(ep.tersinkron_pada).toLocaleString('id-ID')}
                        {ep.jumlah_baris != null && ` · ${ep.jumlah_baris} chunk`}
                      </p>
                    )}
                    {ep.tersinkron_status === 'gagal' && ep.tersinkron_pesan && (
                      <p className="mt-1 max-w-[220px] text-[10px] text-red-500">{ep.tersinkron_pesan}</p>
                    )}
                  </td>
                  <td className="px-3 py-3 align-top">
                    <Badge color={TOKEN_BADGE[ep.token?.status] || 'slate'}>
                      {ep.token?.status?.replace('_', ' ')}
                    </Badge>
                  </td>
                  <td className="px-3 py-3 align-top">
                    {editing === ep.id ? (
                      <Input
                        type="number"
                        min="1"
                        className="h-7 w-20 text-xs"
                        value={form.token_masa_berlaku_hari}
                        onChange={(e) =>
                          setForm({ ...form, token_masa_berlaku_hari: Number(e.target.value) })
                        }
                      />
                    ) : (
                      <>
                        <span className="font-medium">{ep.token_masa_berlaku_hari} hari</span>
                        {ep.token?.sisa_hari != null && (
                          <p className="mt-0.5 text-[10px] text-muted-foreground">
                            sisa {ep.token.sisa_hari} hari
                          </p>
                        )}
                      </>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {editing === ep.id ? (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" onClick={saveEdit} disabled={busy}>Simpan</Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Batal</Button>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => syncOne(ep)} disabled={busy} title="Tarik data terbaru ke knowledge">
                          <RefreshCw size={13} />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => issueToken(ep)} title="Terbitkan token baru">
                          <KeyRound size={13} />
                        </Button>
                        {ep.token?.status !== 'belum_terbit' && (
                          <Button size="sm" variant="outline" onClick={() => revokeToken(ep)} title="Cabut token">
                            <Ban size={13} />
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => startEdit(ep)} title="Edit">
                          <Pencil size={13} />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => remove(ep)} title="Hapus">
                          <Trash2 size={13} className="text-red-500" />
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {!eps.length && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    Belum ada endpoint. Tempel link API di atas, atau ambil dari dashboard Jendela Kinerja.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ============ Penjelasan token ============ */}
      <Card className="p-5">
        <div className="flex items-center gap-2">
          <KeyRound size={15} className="text-muted-foreground" />
          <h2 className="text-sm font-semibold">Masa Berlaku Token</h2>
        </div>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-muted-foreground">
          <li>Token diterbitkan per endpoint (tombol gantung kunci). Token asli hanya tampil sekali — langsung disalin ke clipboard.</li>
          <li>Kolom <strong>Berlaku</strong> mengatur masa berlaku token berikutnya (hari). Setelah kedaluwarsa, permintaan dengan token lama ditolak.</li>
          <li>Token dicabut otomatis saat statusnya kedaluwarsa; cabut manual kapan pun dengan tombol larang.</li>
          <li>Endpoint <strong>bearer</strong> memakai token Keycloak untuk memanggil JK; endpoint <strong>public</strong> terbuka.</li>
        </ul>
      </Card>
    </div>
  );
}
