'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Send,
  Bot,
  User,
  Sparkles,
  ThumbsUp,
  ThumbsDown,
  Copy,
  Check,
  Square,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  FileText,
  Search,
  PenLine,
  Clock3,
  BarChart3,
  Lightbulb,
  Quote,
  Scale,
  Landmark,
  Rocket,
  Accessibility,
  Cpu,
  Globe,
  AlertCircle
} from 'lucide-react';
import Markdown from './Markdown';
import {
  streamChat,
  api,
  getSessionId,
  setSessionId,
  getLocalHistory,
  setLocalHistory
} from '../../lib/api';

const LAURA_MENU = [
  { num: '1', icon: Search, label: 'Cek Produk & Izin Edar' },
  { num: '2', icon: FileText, label: 'Pengaduan & Laporan Produk' },
  { num: '3', icon: ShieldCheck, label: 'Informasi Konsultasi & Layanan Publik' },
  { num: '4', icon: PenLine, label: 'Tips Konsumsi Aman & Cek KLIK' }
];

const scoreColor = (score) => {
  if (score >= 0.7) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (score >= 0.4) return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-rose-50 text-rose-600 border-rose-200';
};

function TypingIndicator({ label }) {
  return (
    <div className="flex items-center gap-2 text-slate-400 py-1">
      <span className="flex gap-1">
        <span className="typing-dot" />
        <span className="typing-dot" />
        <span className="typing-dot" />
      </span>
      <span className="text-sm">{label}</span>
    </div>
  );
}

export default function Chat() {
  const [chatKey, setChatKey] = useState(0);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const abortRef = useRef(null);
  const bottomRef = useRef(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  const [activeSource, setActiveSource] = useState(null); // `${msgId}:${ref}` yang sedang disorot

  useEffect(() => {
    const saved = getLocalHistory();
    if (saved.length > 0) setMessages(saved);
  }, []);

  useEffect(() => {
    const sc = scrollRef.current;
    if (!sc) return;
    if (messages.length === 0) {
      // Mulai percakapan baru → kembali ke posisi paling atas agar rapi
      sc.scrollTo({ top: 0 });
    } else {
      // Scroll ke bawah HANYA di dalam kontainer pesan (jangan scroll ke halaman luar,
      // agar posisi kolom input tetap sama seperti saat home/empty state)
      sc.scrollTo({ top: sc.scrollHeight, behavior: 'smooth' });
    }
  }, [messages]);

  const send = async (text) => {
    const question = (text ?? input).trim();
    if (!question || loading) return;
    setInput('');

    const userId = Date.now();
    const asstId = userId + 1;

    setMessages((m) => [
      ...m,
      { id: userId, role: 'user', content: question },
      {
        id: asstId,
        role: 'assistant',
        content: '',
        sources: [],
        citations: [],
        streaming: true,
        phase: 'searching',
        phaseLabel: 'Mencari di basis pengetahuan...'
      }
    ]);
    setLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;
    let acc = '';

    try {
      await streamChat({
        question,
        sessionId: getSessionId(),
        signal: controller.signal,
        onEvent: (evt) => {
          if (evt.type === 'plan') {
            // AI Agent memutuskan kanal pencarian (RAG dan/atau web)
            setMessages((m) =>
              m.map((msg) =>
                msg.id === asstId
                  ? {
                      ...msg,
                      route: evt.route || null,
                      phaseLabel:
                        evt.route?.useWeb && !evt.route?.ragChunks
                          ? 'Mencari di situs resmi...'
                          : evt.route?.useWeb
                            ? 'Mencari di dokumen & situs resmi...'
                            : 'Mencari di basis pengetahuan...'
                    }
                  : msg
              )
            );
          } else if (evt.type === 'sources') {
            setMessages((m) =>
              m.map((msg) =>
                msg.id === asstId ? { ...msg, sources: evt.sources, phase: 'thinking' } : msg
              )
            );
          } else if (evt.type === 'token') {
            acc += evt.text;
            setMessages((m) =>
              m.map((msg) => (msg.id === asstId ? { ...msg, content: acc, phase: 'streaming' } : msg))
            );
          } else if (evt.type === 'citations') {
            setMessages((m) =>
              m.map((msg) => (msg.id === asstId ? { ...msg, citations: evt.citations } : msg))
            );
          } else if (evt.type === 'done') {
            if (evt.session_id) setSessionId(evt.session_id);
            setMessages((m) =>
              m.map((msg) =>
                msg.id === asstId
                  ? {
                      ...msg,
                      streaming: false,
                      phase: null,
                      phaseLabel: null,
                      model: evt.model,
                      llmError: evt.llm_error || null,
                      citations: evt.citations || msg.citations,
                      route: evt.route || msg.route
                    }
                  : msg
              )
            );
          } else if (evt.type === 'error') {
            setMessages((m) =>
              m.map((msg) =>
                msg.id === asstId
                  ? { ...msg, content: `⚠️ ${evt.message}`, streaming: false, phase: null }
                  : msg
              )
            );
          }
        }
      });
    } catch (err) {
      if (!controller.signal.aborted) {
        setMessages((m) =>
          m.map((msg) =>
            msg.id === asstId
              ? { ...msg, content: `⚠️ ${err.message}`, streaming: false, phase: null }
              : msg
          )
        );
      } else {
        // dihentikan user → selesaikan tanpa pesan error
        setMessages((m) =>
          m.map((msg) => (msg.id === asstId ? { ...msg, streaming: false, phase: null } : msg))
        );
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
      setMessages((m) => {
        const clean = m.map(({ streaming, phase, ...rest }) => rest);
        setLocalHistory(clean);
        return m;
      });
    }
  };

  const stop = () => abortRef.current?.abort();

  const copy = async (id, content) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // clipboard tidak tersedia
    }
  };

  /**
   * Sorot kartu sumber yang dirujuk chip sitasi [n] pada jawaban.
   * @param {number} msgId id pesan asisten
   * @param {number} ref nomor sitasi (1..N)
   */
  const focusSource = (msgId, ref) => {
    if (!ref) return;
    const key = `${msgId}:${ref}`;
    setActiveSource(key);
    const el = document.getElementById(`src-${msgId}-${ref}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    window.setTimeout(() => setActiveSource((cur) => (cur === key ? null : cur)), 1800);
  };

  const sendFeedback = async (rating) => {
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant' && !m.streaming);
    if (!lastAssistant) return;
    setMessages((m) =>
      m.map((msg) => (msg.id === lastAssistant.id ? { ...msg, feedback: rating } : msg))
    );
    try {
      await api('/public/feedback', {
        method: 'POST',
        body: {
          rating,
          comment: rating === 'up' ? 'Jawaban bermanfaat' : 'Jawaban kurang memuaskan'
        }
      });
    } catch {
      // abaikan error feedback
    }
  };

  const resetChat = () => {
    setMessages([]);
    setLocalHistory([]);
    // Remount bersih → tata letak sama persis seperti refresh halaman
    setChatKey((k) => k + 1);
  };

  return (
    <div
      key={chatKey}
      className="relative min-h-screen overflow-hidden bg-gradient-to-b from-[#e9f0fb] via-[#f7faff] to-[#e9f6ef]"
    >
      {/* Dekorasi latar (lembut, agar tidak polos) */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 -left-24 h-96 w-96 rounded-full bg-brand-300/25 blur-3xl" />
        <div className="absolute top-1/3 -right-32 h-[28rem] w-[28rem] rounded-full bg-navy-300/20 blur-3xl" />
        <div className="absolute -bottom-32 left-1/4 h-96 w-96 rounded-full bg-emerald-200/25 blur-3xl" />
        <div className="absolute bottom-20 right-1/4 h-64 w-64 rounded-full bg-sky-200/30 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage:
              'radial-gradient(circle, rgba(15, 23, 42, 0.3) 1px, transparent 1px)',
            backgroundSize: '28px 28px'
          }}
        />
      </div>

      {/* Maskot LAURA di sisi kanan, hanya muncul saat percakapan berlangsung (desktop lebar) */}
      {messages.length > 0 && (
        <div className="hidden xl:block fixed right-[calc(50%_-_36rem)] bottom-28 z-10 w-44 pointer-events-none select-none">
          <div className="overflow-hidden rounded-3xl bg-navy-900 shadow-2xl shadow-navy-900/30 ring-1 ring-black/20">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/maskot-bpom.png"
              alt="Maskot LAURA"
              className="w-full h-auto object-contain"
            />
          </div>
        </div>
      )}

      <div className="relative z-10 flex flex-col h-screen max-w-3xl mx-auto px-4">
        {/* Header */}
        <header className="sticky top-0 z-20 py-4 backdrop-blur-md bg-white/70 border-b border-slate-200/70 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative h-10 w-10 rounded-xl bg-gradient-to-br from-navy-900 to-brand-600 text-white flex items-center justify-center shadow-md shadow-navy-900/30 overflow-hidden">
              <Sparkles size={20} className="relative z-0" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/icon.png"
                alt="BBPOM"
                className="absolute inset-0 z-10 h-full w-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="font-bold text-slate-900 leading-tight">
                  LAURA <span className="font-medium text-brand-600">Assistant</span>
                </h1>
                <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[9px] font-extrabold tracking-widest text-emerald-700 ring-1 ring-emerald-200">
                  AI
                </span>
              </div>
              <p className="text-xs text-slate-500">Balai POM Palangka Raya</p>
            </div>
          </div>
          <button
            onClick={resetChat}
            className="text-slate-400 hover:text-brand-600 hover:bg-brand-50 p-2 rounded-lg transition"
            title="Mulai percakapan baru"
          >
            <RefreshCw size={18} />
          </button>
        </header>

        {/* Area pesan */}
        <div ref={scrollRef} className="relative flex-1 overflow-y-auto flex flex-col">
          {/* Watermark halus di pojok kanan-bawah area chat */}
          {messages.length > 0 && (
            <div aria-hidden className="pointer-events-none select-none absolute right-2 bottom-1 z-0">
              <span className="text-6xl sm:text-7xl font-black uppercase leading-none tracking-[0.18em] text-navy-900/[0.045]">
                laura
              </span>
            </div>
          )}
          {messages.length === 0 ? (
            <div className="m-auto w-full space-y-5 px-1 py-6 sm:py-8">
              {/* ===== Hero poster — brand LAURA (navy) ===== */}
              <section className="relative overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-navy-950 via-navy-800 to-blue-700 text-white shadow-2xl shadow-navy-900/25 ring-1 ring-navy-900/10">
                <div aria-hidden className="pointer-events-none absolute inset-0">
                  <div className="absolute -top-24 -right-12 h-64 w-64 rounded-full bg-sky-400/20 blur-3xl" />
                  <div className="absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-emerald-400/15 blur-3xl" />
                  <div
                    className="absolute inset-0 opacity-[0.08]"
                    style={{
                      backgroundImage:
                        'radial-gradient(circle, rgba(255,255,255,0.55) 1px, transparent 1px)',
                      backgroundSize: '26px 26px'
                    }}
                  />
                </div>

                <div className="relative grid min-h-[19rem] grid-cols-[minmax(0,1fr)_auto] sm:min-h-[21rem]">
                  {/* Teks kiri */}
                  <div className="flex flex-col justify-center py-7 pl-5 pr-3 sm:py-9 sm:pl-8">
                    <span className="inline-flex w-fit items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-sky-100 ring-1 ring-white/15">
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                      </span>
                      BPOM di Palangka Raya
                    </span>

                    <h1 className="mt-4 font-extrabold leading-[0.92] tracking-tight">
                      <span className="block text-5xl sm:text-6xl">LAURA</span>
                      <span className="mt-2 flex items-center gap-2 text-2xl font-bold text-sky-300 sm:text-[1.7rem]">
                        Assistant
                        <span className="rounded-md bg-emerald-400/20 px-1.5 py-0.5 text-[10px] font-extrabold tracking-widest text-emerald-300 ring-1 ring-emerald-300/40">
                          AI
                        </span>
                      </span>
                    </h1>

                    <p className="mt-4 max-w-sm text-sm leading-relaxed text-blue-100/90 sm:text-[15px]">
                      Layanan AI untuk{' '}
                      <span className="font-semibold text-white">Ulasan Regulasi</span> dan{' '}
                      <span className="font-semibold text-emerald-300">Analisis</span> yang akurat,
                      cepat, dan terpercaya.
                    </p>

                    <p className="mt-4 inline-flex w-fit items-center gap-2 rounded-xl bg-emerald-400/15 px-3 py-2 text-sm font-semibold text-emerald-200 ring-1 ring-emerald-300/30">
                      <Quote size={15} className="shrink-0 opacity-80" />
                      <span>“Bantu Telaah, Perkuat Analisis.”</span>
                    </p>
                  </div>

                  {/* Karakter + bubble sapaan */}
                  <div className="relative w-20 self-stretch sm:w-32">
                    <div className="absolute bottom-4 right-1 h-36 w-16 rounded-full bg-emerald-300/20 blur-2xl sm:right-3 sm:h-52 sm:w-24" />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/images/maskot-bpom.png"
                      alt="LAURA Assistant"
                      className="absolute bottom-0 right-0 h-full w-auto object-contain object-bottom drop-shadow-[0_12px_24px_rgba(3,10,32,0.45)]"
                    />

                    <div className="absolute -left-32 top-4 z-10 hidden w-44 sm:block">
                      <div className="relative rounded-2xl rounded-tr-sm bg-white px-3.5 py-2.5 text-left text-xs shadow-xl shadow-navy-950/40">
                        <p className="font-bold text-navy-900">Halo! Saya LAURA Assistant 👋</p>
                        <p className="mt-0.5 text-slate-500">Siap membantu Anda!</p>
                        <span className="absolute -bottom-1.5 left-4 h-3 w-3 rotate-45 rounded-[2px] bg-white" />
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* ===== 3 fitur utama (lingkaran) ===== */}
              <section className="grid gap-2.5 sm:grid-cols-3">
                {[
                  {
                    icon: Clock3,
                    tint: 'from-sky-500 to-blue-700',
                    title: 'Tinjau Regulasi Lebih Cepat',
                    desc: 'Ringkas, akurat, terpercaya'
                  },
                  {
                    icon: BarChart3,
                    tint: 'from-emerald-500 to-teal-600',
                    title: 'Analisis Lebih Dalam',
                    desc: 'Dukungan data dan insight relevan'
                  },
                  {
                    icon: Lightbulb,
                    tint: 'from-navy-700 to-brand-600',
                    title: 'Solusi untuk Keputusan Lebih Baik',
                    desc: 'Mendukung kebijakan yang berdampak'
                  }
                ].map((f, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white/95 p-3.5 shadow-sm sm:flex-col sm:items-center sm:gap-0 sm:px-4 sm:py-5 sm:text-center"
                  >
                    <span
                      className={`grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br text-white shadow-md ${f.tint}`}
                    >
                      <f.icon size={21} />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-[13px] font-bold text-navy-900 sm:mt-2.5 sm:text-sm">
                        {f.title}
                      </h3>
                      <p className="mt-0.5 text-xs text-slate-500 sm:mt-1">{f.desc}</p>
                    </div>
                  </div>
                ))}
              </section>

              {/* ===== Kotak tengah: AI + cakupan ===== */}
              <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm sm:p-5">
                <div className="pointer-events-none absolute -top-12 left-1/2 h-24 w-72 -translate-x-1/2 rounded-full bg-sky-200/50 blur-2xl" />
                <div className="relative flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-navy-900 to-brand-600 text-xs font-extrabold tracking-wide text-white shadow-md shadow-navy-900/20">
                    AI
                  </span>
                  <h2 className="text-base font-bold text-navy-900 sm:text-lg">
                    Untuk Pelayanan Publik yang Lebih Baik
                  </h2>
                </div>
                <div className="relative mt-3.5 flex flex-wrap items-center justify-center gap-2">
                  {[
                    { label: 'Regulasi', icon: Scale, cls: 'border-sky-200 bg-sky-50 text-sky-800' },
                    {
                      label: 'Analisis',
                      icon: BarChart3,
                      cls: 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    },
                    { label: 'Kebijakan', icon: Landmark, cls: 'border-navy-200 bg-navy-50 text-navy-800' },
                    {
                      label: 'Masa Depan',
                      icon: Rocket,
                      cls: 'border-brand-200 bg-brand-50 text-brand-700'
                    }
                  ].map((k) => (
                    <span
                      key={k.label}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${k.cls}`}
                    >
                      <k.icon size={13} />
                      {k.label.toUpperCase()}
                    </span>
                  ))}
                </div>
              </section>

              {/* ===== Menu mulai cepat ===== */}
              <section>
                <div className="mb-2.5 flex items-center justify-between px-1">
                  <h3 className="text-sm font-bold uppercase tracking-wide text-navy-900">
                    Mulai Percakapan
                  </h3>
                  <span className="hidden text-[11px] text-slate-400 sm:inline">
                    Balas angka 1 - 4 atau ketik pertanyaan langsung
                  </span>
                </div>
                <div className="flex flex-col gap-2.5">
                  {LAURA_MENU.map((m) => (
                    <button
                      key={m.num}
                      onClick={() => send(m.num)}
                      className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white/95 p-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md"
                    >
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-navy-900 to-brand-600 text-sm font-extrabold text-white shadow-sm">
                        {m.num}
                      </span>
                      <span className="flex min-w-0 items-center gap-2.5 text-sm text-slate-700">
                        <m.icon size={17} className="shrink-0 text-brand-600" />
                        <span className="font-medium group-hover:text-navy-900">{m.label}</span>
                      </span>
                      <span className="ml-auto text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-500">
                        →
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              {/* ===== Footer nilai — BPOM di Palangka Raya ===== */}
              <footer className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-navy-950 to-navy-800 px-4 py-4 text-white ring-1 ring-navy-900/20 sm:px-6">
                <div
                  aria-hidden
                  className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-emerald-400/15 blur-3xl"
                />
                <p className="relative text-center text-[11px] font-bold uppercase tracking-[0.22em] text-sky-300">
                  BPOM di Palangka Raya
                </p>
                <div className="relative mt-3 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
                  {[
                    { icon: ShieldCheck, t: 'Terpercaya', d: 'Untuk Pelayanan Publik' },
                    { icon: Accessibility, t: 'Mudah Diakses', d: 'Untuk Semua' },
                    { icon: Cpu, t: 'Cerdas', d: 'Dengan Teknologi AI' },
                    { icon: Globe, t: 'Berdampak', d: 'Untuk Indonesia yang Lebih Baik' }
                  ].map((v) => (
                    <div key={v.t} className="flex flex-col items-center text-center">
                      <span className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-emerald-300 ring-1 ring-white/15">
                        <v.icon size={15} />
                      </span>
                      <span className="mt-1.5 text-[11px] font-bold tracking-wide">{v.t}</span>
                      <span className="text-[10px] leading-tight text-sky-200/75">{v.d}</span>
                    </div>
                  ))}
                </div>
              </footer>
            </div>
            ) : (
              <div className="relative z-10 m-auto w-full py-6 space-y-5">
                {messages.map((msg) =>
            msg.role === 'user' ? (
              <div key={msg.id} className="msg-in flex items-end justify-end gap-2.5">
                <div className="max-w-[80%] flex flex-col items-end">
                  <div className="rounded-2xl rounded-br-md bg-gradient-to-br from-navy-900 via-navy-800 to-brand-700 px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap text-white shadow-lg shadow-navy-900/25 ring-1 ring-white/10">
                    {msg.content}
                  </div>
                </div>
                <div className="mb-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-600 text-white shadow-md shadow-brand-600/30 ring-2 ring-white">
                  <User size={15} />
                </div>
              </div>
            ) : (
              <div key={msg.id} className="msg-in flex items-start gap-2.5">
                <div className="relative mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-navy-900 to-brand-600 text-white shadow-lg shadow-navy-900/20 ring-2 ring-white/80">
                  <Bot size={18} className="relative z-0" />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/images/icon.png"
                    alt=""
                    className="absolute inset-0 z-10 h-full w-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                </div>
                <div className="max-w-[82%] min-w-0 flex-1">
                  <div className="rounded-2xl rounded-tl-md border border-slate-200/80 bg-white/95 px-4 py-3 shadow-md shadow-navy-900/[0.04] backdrop-blur-sm">
                    {msg.streaming ? (
                      <>
                        {msg.phase === 'searching' && (
                          <TypingIndicator label={msg.phaseLabel || 'Mencari di basis pengetahuan...'} />
                        )}
                        {msg.phase === 'thinking' && <TypingIndicator label="Menyusun jawaban..." />}
                        {msg.phase === 'streaming' && (
                          <span className="md-body">
                            <Markdown onCite={(ref) => focusSource(msg.id, ref)}>{msg.content}</Markdown>
                            <span className="stream-cursor" />
                          </span>
                        )}
                      </>
                    ) : msg.content ? (
                      <Markdown onCite={(ref) => focusSource(msg.id, ref)}>{msg.content}</Markdown>
                    ) : (
                      <TypingIndicator label="Mencari di basis pengetahuan..." />
                    )}

                    {/* Sumber & sitasi */}
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-slate-100">
                        {(() => {
                          const usedRefs = new Set(
                            (msg.citations || []).filter((c) => c.used).map((c) => c.ref)
                          );
                          const webCount = msg.sources.filter((s) => s.origin === 'web').length;
                          const docCount = msg.sources.length - webCount;

                          return (
                            <>
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-2 flex flex-wrap items-center gap-1.5">
                                <ExternalLink size={12} /> Sumber ({msg.sources.length})
                                {docCount > 0 && (
                                  <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">
                                    {docCount} dokumen
                                  </span>
                                )}
                                {webCount > 0 && (
                                  <span className="rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                                    {webCount} web resmi
                                  </span>
                                )}
                                {msg.sources.some((s) => s.weak) && (
                                  <span
                                    className="rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700"
                                    title="Sumber ini hanya menyinggung topik (relevansi rendah) — jawaban tidak bersandar padanya"
                                  >
                                    relevansi rendah
                                  </span>
                                )}
                              </p>
                              <div className="flex flex-col gap-1.5">
                                {msg.sources.map((s, i) => {
                                  const ref = s.ref || i + 1;
                                  const isUsed = usedRefs.has(ref);
                                  const isActive = activeSource === `${msg.id}:${ref}`;
                                  const meta = [
                                    s.origin === 'web' ? 'Situs resmi' : 'Dokumen internal',
                                    s.origin === 'web' ? s.domain : s.section,
                                    s.origin === 'web' ? null : s.page ? `hal. ${s.page}` : null
                                  ].filter(Boolean);

                                  return (
                                    <div
                                      key={`${msg.id}-${ref}`}
                                      id={`src-${msg.id}-${ref}`}
                                      className={`source-item ${isActive ? 'is-active' : ''} ${
                                        isUsed ? 'is-used' : ''
                                      }`}
                                    >
                                      <div className="flex items-start gap-2 min-w-0">
                                        <span className="source-ref">{ref}</span>
                                        <div className="min-w-0">
                                          {s.url ? (
                                            <a
                                              href={s.url}
                                              target="_blank"
                                              rel="noreferrer noopener"
                                              className="block truncate font-medium text-navy-900 hover:text-brand-600 hover:underline"
                                              title={s.url}
                                            >
                                              {s.title}
                                            </a>
                                          ) : (
                                            <p className="truncate font-medium text-slate-700">
                                              {s.title}
                                            </p>
                                          )}
                                          <p className="truncate text-[11px] text-slate-400">
                                            {meta.join(' · ')}
                                          </p>
                                        </div>
                                      </div>
                                      <span
                                        className={`shrink-0 px-1.5 py-0.5 rounded-md border text-[11px] font-medium ${scoreColor(
                                          s.score
                                        )}`}
                                      >
                                        {Math.round((s.score || 0) * 100)}%
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    )}
                  </div>

                  {/* Aksi: copy, feedback, model */}
                  {!msg.streaming && msg.content && msg.role === 'assistant' && (
                    <div className="mt-2 flex items-center gap-1 text-slate-400 pl-1">
                      <button
                        onClick={() => copy(msg.id, msg.content)}
                        className="p-1.5 rounded-lg hover:bg-slate-100 hover:text-slate-600 transition"
                        title="Salin jawaban"
                      >
                        {copiedId === msg.id ? (
                          <Check size={14} className="text-emerald-500" />
                        ) : (
                          <Copy size={14} />
                        )}
                      </button>
                      <button
                        onClick={() => sendFeedback('up')}
                        className={`p-1.5 rounded-lg hover:bg-emerald-50 hover:text-emerald-600 transition ${
                          msg.feedback === 'up' ? 'text-emerald-600 bg-emerald-50' : ''
                        }`}
                        title="Jawaban bermanfaat"
                      >
                        <ThumbsUp size={14} />
                      </button>
                      <button
                        onClick={() => sendFeedback('down')}
                        className={`p-1.5 rounded-lg hover:bg-rose-50 hover:text-rose-600 transition ${
                          msg.feedback === 'down' ? 'text-rose-600 bg-rose-50' : ''
                        }`}
                        title="Jawaban kurang memuaskan"
                      >
                        <ThumbsDown size={14} />
                      </button>
                      {msg.route && (
                        <span
                          className="text-[11px] flex items-center gap-1 text-slate-400"
                          title={`Kanal sumber: ${
                            msg.route.useWeb
                              ? msg.route.ragChunks
                                ? 'dokumen internal + situs resmi'
                                : 'situs resmi'
                              : 'dokumen internal'
                          }`}
                        >
                          {msg.route.useWeb ? <Globe size={12} /> : <FileText size={12} />}
                          {msg.route.useWeb ? (msg.route.ragChunks ? 'RAG + Web' : 'Web') : 'RAG'}
                        </span>
                      )}
                      {msg.llmError && (
                        <span
                          className="text-[11px] flex items-center gap-1 text-rose-600"
                          title={`Model AI gagal menjawab: ${msg.llmError}`}
                        >
                          <AlertCircle size={12} /> {msg.llmError}
                        </span>
                      )}
                      {msg.model && (
                        <span className="ml-auto text-[11px] flex items-center gap-1 text-slate-400">
                          <ShieldCheck size={12} /> {msg.model}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="pb-5 pt-1">
          <div className="flex items-end gap-2 bg-white border border-slate-200 rounded-2xl p-2 shadow-lg shadow-slate-200/60 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-500/20 transition">
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Ketik pertanyaan Anda..."
              className="flex-1 resize-none outline-none bg-transparent px-2 py-2 text-[15px] max-h-32"
            />
            {loading ? (
              <button
                onClick={stop}
                className="h-10 w-10 rounded-xl bg-rose-500 text-white flex items-center justify-center hover:bg-rose-600 transition shadow-sm"
                title="Hentikan"
              >
                <Square size={16} fill="currentColor" />
              </button>
            ) : (
              <button
                onClick={() => send()}
                disabled={!input.trim()}
                className="h-10 w-10 rounded-xl bg-gradient-to-br from-brand-600 to-brand-500 text-white flex items-center justify-center disabled:opacity-40 hover:brightness-110 transition shadow-sm"
              >
                <Send size={17} />
              </button>
            )}
          </div>
          <p className="text-center text-[11px] text-slate-400 mt-2">
            LAURA Assistant dapat membuat kesalahan. Verifikasi informasi penting pada sumber resmi.
          </p>
        </div>
      </div>
    </div>
  );
}
