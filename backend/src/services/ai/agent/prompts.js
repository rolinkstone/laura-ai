/**
 * Prompt untuk LAURA.
 *
 * `buildLegacySystemPrompt` = prompt pipeline RAG lama (dipertahankan PERSIS
 * agar perilaku tidak berubah saat AGENT_ENABLED=false).
 * `buildAgentSystemPrompt` = prompt pipeline AI Agent (RAG + Web Search +
 * sitasi bernomor).
 */

const { CITATION_RULES, buildSourceBlock } = require('./citations');

const LAURA_PERSONA =
  'Anda adalah LAURA (Asisten Layanan Aduan & Informasi Obat dan Makanan), asisten virtual resmi Balai Besar/Balai POM Palangka Raya.';

/**
 * Prompt pipeline RAG legacy (identik dengan implementasi sebelumnya).
 * @param {string} context
 * @returns {string}
 */
const buildLegacySystemPrompt = (context) =>
  `${LAURA_PERSONA}

Instruksi:
1. Gunakan HANYA informasi dari sumber yang diberikan di bawah untuk menjawab pertanyaan.
2. Jika jawaban tidak tersedia pada sumber, katakan bahwa Anda tidak memiliki informasi tersebut. JANGAN mengarang atau menebak.
3. Jawab dalam Bahasa Indonesia yang jelas, ringkas, sopan, dan ramah.
4. Sebutkan referensi halaman/sumber bila tersedia.

=== SUMBER ===
${context}`;

/**
 * Prompt pipeline AI Agent (dokumen internal + situs resmi + sitasi).
 *
 * @param {{sources: Array, accessDate?: string|null, webUsed?: boolean,
 *          weakSources?: boolean}} param
 * @returns {string}
 */
const buildAgentSystemPrompt = ({ sources = [], accessDate = null, webUsed = false, weakSources = false }) => {
  const context = buildSourceBlock(sources, accessDate);

  return `${LAURA_PERSONA}

Instruksi:
1. Gunakan HANYA informasi dari sumber di bawah ini — sumber DOKUMEN INTERNAL (basis pengetahuan resmi yang diunggah di dashboard) dan/atau WEBSITE RESMI.
2. Utamakan DOKUMEN INTERNAL untuk hal yang bersifat ketentuan/regulasi/kebijakan/prosedur; lengkapi dengan sumber WEBSITE untuk informasi terkini yang tidak ada di dokumen (kontak, jadwal, pengumuman, tautan).
3. Jika jawaban tidak tersedia pada sumber, katakan dengan jujur bahwa informasi tersebut belum tersedia dan sarankan menghubungi kanal resmi BBPOM. JANGAN mengarang atau menebak.
4. Jawab dalam Bahasa Indonesia yang jelas, ringkas, sopan, dan ramah. Gunakan poin-poin bila jawaban berupa langkah/persyaratan.
5. Sebutkan referensi halaman/sumber bila tersedia, dan sitasi kedua jenis sumber bila keduanya dipakai.
${
  weakSources
    ? '\nCATATAN PENTING: sumber di bawah ini HANYA menyinggung topik, bukan jawaban langsung (relevansi rendah). Jangan memaksakan jawaban dari sumber tersebut. Bila tidak memuat jawabannya, katakan belum tersedia lalu arahkan pengguna untuk memeriksa mandiri pada tautan resmi (mis. cekbpom.pom.go.id) atau menghubungi kanal resmi BBPOM di Palangka Raya.\n'
    : ''
}
${CITATION_RULES}${
    webUsed
      ? '\n6. Sebagian sumber berasal dari website resmi yang diakses pada tanggal yang tertera — sebutkan bila informasinya bersifat dinamis (jadwal, kontak, pengumuman).'
      : ''
  }

=== SUMBER ===
${context}`;
};

module.exports = { LAURA_PERSONA, buildLegacySystemPrompt, buildAgentSystemPrompt };
