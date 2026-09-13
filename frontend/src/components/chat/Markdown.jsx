'use client';

import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Penanda sitasi dari pipeline AI Agent: [1], [2], ...
 * Diubah menjadi tautan berskema `cite:n` agar dapat dirender sebagai chip
 * yang bisa diklik (menyorot kartu sumber terkait).
 */
const CITE_RE = /\[(\d{1,2})\]/g;

/**
 * Ubah `[n]` → `[n](cite:n)` TANPA menyentuh isi code fence / inline code.
 * @param {string} text
 * @returns {string}
 */
const linkifyCitations = (text) => {
  if (typeof text !== 'string' || !text.includes('[')) return text;
  // Potongan pada indeks ganjil = code fence / inline code → dibiarkan apa adanya
  const parts = text.split(/(```[\s\S]*?```|`[^`\n]*`)/g);
  return parts
    .map((part, i) => (i % 2 === 1 ? part : part.replace(CITE_RE, (m, n) => `[${n}](cite:${n})`)))
    .join('');
};

/**
 * Skema `cite:` adalah penanda internal (bukan URL sungguhan) sehingga tidak
 * lolos sanitasi default react-markdown — izinkan khusus skema ini.
 * @param {string} url
 * @returns {string}
 */
const urlTransform = (url) => (String(url).startsWith('cite:') ? url : defaultUrlTransform(url));

/**
 * @param {{children?: string, onCite?: (ref: number) => void}} props
 */
export default function Markdown({ children, onCite }) {
  const content = linkifyCitations(children);

  const components = {
    a: ({ node, href = '', children: label, ...props }) => {
      // Chip sitasi [n] → menyorot kartu sumber nomor n
      if (href.startsWith('cite:')) {
        const ref = href.slice(5);
        return (
          <button
            type="button"
            onClick={() => onCite?.(Number(ref))}
            className="cite-chip"
            title={`Lihat sumber [${ref}]`}
          >
            {ref}
          </button>
        );
      }

      const external = /^https?:\/\//i.test(href);
      return (
        <a
          href={href}
          target={external ? '_blank' : undefined}
          rel={external ? 'noreferrer noopener' : undefined}
          {...props}
        >
          {label}
        </a>
      );
    }
  };

  return (
    <div className="md-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={urlTransform}
        components={components}
      >
        {content || ''}
      </ReactMarkdown>
    </div>
  );
}
