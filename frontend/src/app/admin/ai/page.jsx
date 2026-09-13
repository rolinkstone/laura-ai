'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Cpu,
  Search,
  Loader2,
  ShieldCheck,
  KeyRound,
  Save,
  Check,
  Trash2,
  AlertTriangle,
  PlayCircle,
  Wifi
} from 'lucide-react';
import { api, getToken, getUserRole } from '../../../lib/api';
import {
  Card,
  Button,
  Input,
  Badge,
  Spinner,
  ErrorBox,
  PageHeader
} from '../../../components/admin/ui';

// Provider tunggal: 9Router (AI gateway OpenAI-compatible) — 1 API key untuk semua model
const PROVIDERS = [{ name: 'ninerouter', label: '9Router' }];

// Nama tampilan ramah untuk model 9Router yang dikenal (nilai asli tetap model ID untuk API)
const MODEL_LABELS = {
  'kr/auto': 'Kiro Auto (otomatis)',
  'kr/claude-sonnet-4.5': 'Claude Sonnet 4.5 (Kiro)',
  'kr/deepseek-3.2': 'DeepSeek 3.2 (Kiro)',
  'kr/glm-5': 'GLM-5 (Kiro)',
  'kimi/kimi-k2.7-code': 'Kimi K2.7 Code',
  'cx/gpt-5.4-mini': 'GPT-5.4 Mini (Codex)',
  'cu/gemini-3.6-flash-medium': 'Gemini 3.6 Flash (Cursor)',
  'ag/gemini-3.7-flash-medium': 'Gemini 3.7 Flash (AG)',
  'gemini/gemini-3.6-flash': 'Gemini 3.6 Flash'
};
const modelLabel = (id) => MODEL_LABELS[id] || id || '-';

// Opsi model 9Router (dari /v1/models) — biar mudah dipilih di form (tampil sebagai saran, nilai tetap bisa diketik manual)
const MODEL_OPTIONS = [
  { id: 'kr/auto', label: 'Kiro Auto — otomatis pilih yang tersedia' },
  { id: 'kr/claude-sonnet-4.5', label: 'Claude Sonnet 4.5 (Kiro)' },
  { id: 'kr/deepseek-3.2', label: 'DeepSeek 3.2 (Kiro)' },
  { id: 'kr/glm-5', label: 'GLM-5 (Kiro)' },
  { id: 'kimi/kimi-k2.7-code', label: 'Kimi K2.7 Code' },
  { id: 'cx/gpt-5.4-mini', label: 'GPT-5.4 Mini (Codex)' },
  { id: 'cu/gemini-3.6-flash-medium', label: 'Gemini 3.6 Flash (Cursor)' },
  { id: 'ag/gemini-3.7-flash-medium', label: 'Gemini 3.7 Flash (AG)' }
];

export default function AiPage() {
  const router = useRouter();
  const [config, setConfig] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState('');
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');
  // Diagnosa model gateway (9Router): daftar model resmi + uji model
  const [gateway, setGateway] = useState(null);
  const [gatewayLoading, setGatewayLoading] = useState(false);
  const [testModelId, setTestModelId] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);
  // Scan banyak model sekaligus (cari model yang bisa dipakai SEBELUM dipasang)
  const [scanResult, setScanResult] = useState(null);
  const [scanning, setScanning] = useState(false);

  const scanModels = async () => {
    setScanning(true);
    setScanResult(null);
    setError('');
    try {
      const res = await api('/admin/llm-test-batch', {
        method: 'POST',
        token: getToken(),
        body: { mode: 'sample', limit: 12 }
      });
      setScanResult(res.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setScanning(false);
    }
  };

  /** Pasang model yang lulus uji sebagai model aktif (langsung berlaku). */
  const useModel = async (model) => {
    setSaving(true);
    setError('');
    setSaved('');
    try {
      const res = await api('/admin/llm-config', {
        method: 'POST',
        token: getToken(),
        body: { ninerouter_model: model }
      });
      setForm((f) => ({ ...f, models: { ...f.models, ninerouter: model } }));
      setConfig((c) => ({ ...c, models: res.data?.models || c?.models }));
      setTestModelId(model);
      setSaved(`Model aktif sekarang: ${model} — langsung berlaku tanpa restart backend.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const loadGatewayModels = async () => {
    setGatewayLoading(true);
    try {
      const res = await api('/admin/llm-models', { token: getToken() });
      setGateway(res.data);
      setTestModelId((current) => current || res.data?.configuredModel || '');
    } catch (err) {
      setGateway({ models: [], count: 0, error: err.message, baseUrl: '' });
    } finally {
      setGatewayLoading(false);
    }
  };

  const runModelTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api('/admin/llm-test', {
        method: 'POST',
        token: getToken(),
        body: { model: testModelId }
      });
      setTestResult(res.data);
    } catch (err) {
      setTestResult({ ok: false, model: testModelId, error: err.message });
    } finally {
      setTesting(false);
    }
  };

  const load = () => {
    // Endpoint tunggal pengaturan LLM/API key: GET /admin/llm-config (baca & tulis).
    // /admin/config hanya untuk status embedding/RAG (read-only).
    Promise.all([
      api('/admin/llm-config', { token: getToken() }),
      api('/admin/config', { token: getToken() })
    ])
      .then(([llmRes, ragRes]) => {
        const data = {
          ...ragRes.data, // embedding_model, search_min_score, search_result_limit, node_env
          ...llmRes.data, // enabled, providerOrder, models, configured
          configured: llmRes.data.configured
        };
        setConfig(data);
        setForm({
          enabled: data.enabled,
          baseUrl: data.baseUrl || '',
          models: data.models || {},
          keys: { ninerouter: '' }
        });
      })
      .catch((err) => setError(err.message));
  };

  useEffect(() => {
    // Halaman AI (API key) khusus admin — arahkan non-admin ke Dashboard
    if (getUserRole() !== 'admin') {
      router.replace('/admin');
      return;
    }
    load();
    loadGatewayModels();
  }, []);

  const saveLlm = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSaved('');
    try {
      const body = {
        enabled: form.enabled,
        ninerouter_model: form.models.ninerouter,
        ninerouter_base_url: form.baseUrl
      };
      // API key baru hanya dikirim bila diisi (hapus key pakai tombol terpisah)
      for (const p of PROVIDERS) {
        if (form.keys[p.name]) body[`${p.name}_api_key`] = form.keys[p.name];
      }
      await api('/admin/llm-config', { method: 'POST', body, token: getToken() });
      setSaved('Pengaturan LLM disimpan & langsung berlaku.');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Hapus API key → nonaktifkan provider (override .env), langsung tanpa tombol simpan
  const removeKey = async (name) => {
    const label = name.toUpperCase();
    if (
      !confirm(
        `Hapus API key ${label}? Provider akan dinonaktifkan (mengabaikan nilai .env). Anda bisa mengisi ulang key baru kapan saja.`
      )
    ) {
      return;
    }
    setSaving(true);
    setError('');
    setSaved('');
    try {
      await api('/admin/llm-config', {
        method: 'POST',
        body: { [`${name}_api_key`]: '' },
        token: getToken()
      });
      setSaved(`API key ${label} dihapus. Provider ${label} dinonaktifkan.`);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const runSearch = async (e) => {
    e.preventDefault();
    setSearching(true);
    setResults(null);
    setError('');
    try {
      const res = await api('/rag/search', {
        method: 'POST',
        body: { query, limit: 5 },
        token: getToken()
      });
      setResults(res.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setSearching(false);
    }
  };

  if (error && !config) {
    return (
      <div>
        <PageHeader title="AI — Model & RAG" subtitle="Kelola LLM dan uji coba retrieval" />
        <ErrorBox message={error} />
        <div className="mt-4">
          <Button variant="outline" onClick={load}>
            Coba Lagi
          </Button>
        </div>
      </div>
    );
  }

  if (!config || !form) return <Spinner />;

  return (
    <div>
      <PageHeader title="AI — Model & RAG" subtitle="Kelola LLM dan uji coba retrieval" />

      <ErrorBox message={error} />
      {saved && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg px-4 py-3 text-sm mb-4 flex items-center gap-2">
          <Check size={16} /> {saved}
        </div>
      )}

      {/* ===== Pengaturan LLM ===== */}
      <Card className="p-5 mb-8">
        <h2 className="font-semibold text-slate-900 mb-5 flex items-center gap-2">
          <Cpu size={16} /> Pengaturan LLM
          <Badge color={form.enabled ? 'green' : 'red'}>{form.enabled ? 'Aktif' : 'Nonaktif'}</Badge>
        </h2>

        <form onSubmit={saveLlm} className="space-y-6">
          {/* Toggle aktif/nonaktif */}
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
            <div>
              <p className="font-medium text-slate-800 flex items-center gap-2">
                <AlertTriangle size={15} className="text-amber-500" />
                Aktifkan LLM (jawaban AI)
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                Nonaktifkan untuk sementara: chat tetap berjalan dengan sumber Knowledge Base tanpa jawaban model AI.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, enabled: !f.enabled }))}
              className={`relative w-12 h-7 rounded-full transition shrink-0 ${
                form.enabled ? 'bg-emerald-500' : 'bg-slate-300'
              }`}
            >
              <span
                className={`absolute top-0.5 h-6 w-6 bg-white rounded-full shadow transition-transform ${
                  form.enabled ? 'translate-x-5' : 'left-0.5'
                }`}
              />
            </button>
          </div>

          {/* Base URL 9Router */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Base URL 9Router <span className="text-slate-400">(endpoint OpenAI-compatible)</span>
            </label>
            <Input
              value={form.baseUrl}
              onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
              placeholder="https://router.bbpompky.id/v1"
            />
            <p className="text-xs text-slate-400 mt-1">
              Disimpan ke database dan langsung berlaku tanpa restart. Satu API key cukup untuk semua
              model (mis. <code>kr/auto</code> atau <code>gemini/gemini-3.6-flash</code>).
            </p>
          </div>

          {/* Per provider */}
          <div className="space-y-4">
            <datalist id="ninerouter-model-options">
              {(gateway?.models?.length
                ? gateway.models.map((id) => ({ id, label: modelLabel(id) }))
                : MODEL_OPTIONS
              ).map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </datalist>
            {PROVIDERS.map((p) => {
              const configured = config.configured?.[p.name];
              return (
                <div key={p.name} className="border border-slate-200 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="font-medium text-slate-800">{p.label}</p>
                    <Badge color={configured ? 'green' : 'red'}>
                      {configured ? '✓ API key tersimpan' : 'Belum ada API key'}
                    </Badge>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Model</label>
                      <Input
                        list={p.name === 'ninerouter' ? 'ninerouter-model-options' : undefined}
                        value={form.models[p.name] || ''}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            models: { ...f.models, [p.name]: e.target.value }
                          }))
                        }
                      />
                      {form.models[p.name] && (
                        <p className="text-[11px] text-slate-400 mt-1">{modelLabel(form.models[p.name])}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">API Key</label>
                      <div className="flex gap-1.5">
                        <Input
                          type="password"
                          value={form.keys[p.name]}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              keys: { ...f.keys, [p.name]: e.target.value }
                            }))
                          }
                          placeholder={
                            configured ? '•••••••• (biarkan kosong = tidak diubah)' : 'Isi API key baru...'
                          }
                        />
                        {configured && (
                          <button
                            type="button"
                            onClick={() => removeKey(p.name)}
                            className="px-2.5 rounded-lg border border-rose-200 text-rose-500 hover:bg-rose-50"
                            title="Hapus API key (nonaktifkan provider)"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {saving ? 'Menyimpan...' : 'Simpan Pengaturan'}
            </Button>
            <span className="text-xs text-slate-400">
              Berlaku langsung tanpa restart server.
            </span>
          </div>
        </form>
      </Card>

      {/* ===== Model gateway (9Router) ===== */}
      <Card className="p-5 mb-8">
        <h2 className="font-semibold text-slate-900 mb-1 flex items-center gap-2">
          <Wifi size={16} /> Model Gateway (9Router)
          {gateway && !gateway.error && <Badge color="blue">{gateway.count} model terdaftar</Badge>}
        </h2>
        <p className="text-xs text-slate-500 mb-4 leading-relaxed">
          Gateway yang dipakai backend: <b>{gateway?.baseUrl || config.baseUrl || '-'}</b>. 9Router hanya
          bisa merutekan model yang <b>terdaftar di gateway ini</b> dan provider-nya punya kredensial aktif —
          model di luar daftar akan ditolak (<code>model_not_found</code> / "No active credentials").
        </p>

        {gateway?.error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-lg px-3 py-2 text-sm mb-4">
            Gagal memuat daftar model: {gateway.error}
          </div>
        )}

        {gateway && !gateway.error && gateway.models.length > 0 &&
          !gateway.models.includes(config.models?.ninerouter) && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2 text-sm mb-4">
              Model tersimpan <b>{config.models?.ninerouter}</b> TIDAK ada di daftar gateway — permintaan akan
              ditolak. Pilih salah satu model dari daftar di bawah.
            </div>
          )}

        <div className="flex flex-col sm:flex-row sm:items-end gap-2">
          <div className="flex-1">
            <label className="block text-xs font-medium text-slate-500 mb-1">Model yang diuji</label>
            <Input
              list="ninerouter-model-options"
              value={testModelId}
              onChange={(e) => setTestModelId(e.target.value)}
              placeholder="kr/auto"
            />
          </div>
          <Button type="button" onClick={runModelTest} disabled={testing}>
            {testing ? <Loader2 size={15} className="animate-spin" /> : <PlayCircle size={15} />}
            {testing ? 'Menguji...' : 'Uji Model'}
          </Button>
          <Button type="button" variant="outline" onClick={loadGatewayModels} disabled={gatewayLoading}>
            {gatewayLoading ? 'Memuat...' : 'Muat Ulang Daftar'}
          </Button>
        </div>

        {testResult && (
          <div
            className={`mt-4 text-sm rounded-lg px-3 py-2 border break-words ${
              testResult.ok
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-700'
            }`}
          >
            {testResult.ok ? (
              <>
                ✓ <b>{testResult.model}</b> menjawab: “{testResult.answer}” ({testResult.ms} ms)
              </>
            ) : (
              <>
                ✗ <b>{testResult.model}</b>: {testResult.error}
              </>
            )}
          </div>
        )}

        {/* ===== Scan: cari model yang bisa dipakai sebelum dipasang ===== */}
        <div className="mt-5 pt-4 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <Button type="button" onClick={scanModels} disabled={scanning}>
              {scanning ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
              {scanning ? 'Menguji model...' : 'Scan Model yang Bisa Dipakai'}
            </Button>
            <span className="text-xs text-slate-400">
              Menguji 1 varian dasar per penyedia (maks 12 model, berurutan) — bisa 1-2 menit.
            </span>
          </div>

          {scanResult?.error && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2 text-sm mb-3">
              {scanResult.error}
            </div>
          )}

          {scanResult && scanResult.results?.length > 0 && (
            <div>
              <p className={`text-sm mb-2 ${scanResult.working?.length ? 'text-emerald-700' : 'text-rose-600'}`}>
                {scanResult.working?.length ? (
                  <>
                    {scanResult.working.length} model bisa dipakai — klik <b>Pakai</b> untuk memasangnya
                    (langsung berlaku):
                  </>
                ) : (
                  'Tidak ada model yang berhasil diuji (lihat kolom alasan).'
                )}
              </p>
              <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-80 overflow-y-auto">
                {scanResult.results.map((r) => (
                  <div key={r.model} className="flex items-center gap-2 px-3 py-2 text-xs">
                    <span className={`shrink-0 font-bold ${r.ok ? 'text-emerald-600' : 'text-rose-500'}`}>
                      {r.ok ? '✓' : '✗'}
                    </span>
                    <span className="font-mono shrink-0 max-w-[42%] truncate" title={r.model}>
                      {r.model}
                    </span>
                    <span className="shrink-0 text-slate-400">{r.ms} ms</span>
                    <span className="min-w-0 flex-1 truncate text-slate-400" title={r.ok ? r.answer : r.error}>
                      {r.ok ? `“${r.answer}”` : r.error}
                    </span>
                    {r.ok && (
                      <button
                        type="button"
                        onClick={() => useModel(r.model)}
                        disabled={saving}
                        className="shrink-0 rounded-md border border-brand-200 bg-brand-50 px-2 py-0.5 font-medium text-brand-700 hover:bg-brand-100 disabled:opacity-50"
                      >
                        Pakai
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {gateway && gateway.models.length > 0 && (
          <details className="mt-4">
            <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-700">
              Lihat {gateway.count} model yang tersedia
            </summary>
            <div className="mt-2 flex flex-wrap gap-1.5 max-h-52 overflow-y-auto p-1">
              {gateway.models.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTestModelId(id)}
                  className={`rounded-md border px-2 py-0.5 text-[11px] transition ${
                    testModelId === id
                      ? 'border-brand-300 bg-brand-50 text-brand-700'
                      : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                  title="Klik untuk memilih model ini"
                >
                  {id}
                </button>
              ))}
            </div>
          </details>
        )}
      </Card>

      {/* ===== Status ===== */}
      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        <Card className="p-5">
          <h2 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <KeyRound size={16} /> Status LLM
          </h2>
          <div className="space-y-3 text-sm">
            <Row label="Status" value={form.enabled ? 'Aktif' : 'Nonaktif'} badge={form.enabled ? 'Aktif' : 'Nonaktif'} badgeColor={form.enabled ? 'green' : 'red'} />
            <Row label="Base URL" value={config.baseUrl || '-'} />
            {PROVIDERS.map((p) => (
              <Row
                key={p.name}
                label={`${p.label}`}
                value={modelLabel(config.models?.[p.name])}
                badge={config.configured?.[p.name] ? '✓ Key' : '✗ Tanpa key'}
                badgeColor={config.configured?.[p.name] ? 'green' : 'red'}
              />
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <ShieldCheck size={16} /> Konfigurasi Embedding / RAG
          </h2>
          <div className="space-y-3 text-sm">
            <Row label="Model Embedding" value={config.embedding_model} />
            <Row label="Min Score" value={String(config.search_min_score)} />
            <Row label="Limit Hasil" value={String(config.search_result_limit)} />
            <Row label="Environment" value={config.node_env} />
          </div>
        </Card>
      </div>

      {/* ===== Uji RAG ===== */}
      <Card className="p-5">
        <h2 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Search size={16} /> Uji Vector Search (RAG)
        </h2>
        <form onSubmit={runSearch} className="flex gap-2 max-w-xl">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tulis pertanyaan, mis. Bagaimana cara melakukan pengaduan?"
            required
          />
          <Button type="submit" disabled={searching}>
            {searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            Cari
          </Button>
        </form>

        {results && (
          <div className="mt-4">
            <p className="text-sm text-slate-500 mb-3">
              {results.count} chunk ditemukan dalam {results.duration_ms} ms
            </p>
            <div className="space-y-3">
              {results.results.map((r) => (
                <div key={r.id} className="border border-slate-200 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium text-slate-800">{r.document_title}</p>
                    <Badge color="blue">{Math.round(r.score * 100)}%</Badge>
                  </div>
                  {r.section && (
                    <p className="text-xs text-slate-400 mb-1">
                      Section: {r.section} · Halaman {r.page_number || '-'}
                    </p>
                  )}
                  <p className="text-sm text-slate-600 line-clamp-3">{r.content}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function Row({ label, value, badge, badgeColor = 'green' }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{label}</span>
      <div className="flex items-center gap-2">
        <span className="font-medium text-slate-800">{value}</span>
        {badge && <Badge color={badgeColor}>{badge}</Badge>}
      </div>
    </div>
  );
}
