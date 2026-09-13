/**
 * Diagnosa penyedia pencarian: apa yang SEBENARNYA dikembalikan DuckDuckGo
 * (tanpa API key)? Dipakai saat hasil web selalu kosong.
 *
 * Jalankan: node src/scripts/diagWebProvider.js "jam layanan bpom"
 */

const UA = 'Mozilla/5.0 (compatible; BBPOM-LAURA-Diag/1.0)';

(async () => {
  const query = process.argv.slice(2).join(' ') || 'jam layanan bpom';

  // Bentuk query sama seperti yang dikirim pipeline (site: dibatasi lingkup)
  const scoped = `${query} (site:pom.go.id OR site:bbpom.go.id)`;
  const body = new URLSearchParams({ q: scoped, kl: 'id-id' }).toString();

  const res = await fetch('https://html.duckduckgo.com/html/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': UA,
      Accept: 'text/html'
    },
    body
  });

  const html = await res.text();
  console.log('status       :', res.status, res.statusText);
  console.log('content-type :', res.headers.get('content-type'));
  console.log('panjang html :', html.length);
  console.log('jumlah .result:', (html.match(/class="result(__a|__snippet)?/g) || []).length);
  console.log('penanda blokir:', /anomaly|unusual traffic|challenge|captcha|robot/i.test(html) ? 'YA' : 'tidak');
  console.log('judul halaman:', (html.match(/<title>([^<]*)<\/title>/i) || [])[1] || '-');
  console.log('\ncuplikan:\n', html.replace(/\s+/g, ' ').slice(0, 400));
})();
