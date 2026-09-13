/**
 * Diagnosa sementara: apakah endpoint DataTables cekbpom bisa dipakai untuk
 * mencari produk berdasarkan nomor registrasi (NIE)?
 *
 * Yang dibutuhkan halaman: cookie sesi + header X-CSRF-TOKEN (meta csrf-token),
 * lalu POST ke window.dataTableUrl (mis. /produk-dt/01).
 *
 * Jalankan: node src/scripts/diagCekBpomApi.js
 */

const BASE = 'https://cekbpom.pom.go.id';
const PAGE = `${BASE}/produk-obat`;
const NIE = process.env.DIAG_NIE || 'GKL1713713144A1';

const UA = 'Mozilla/5.0 (compatible; BBPOM-LAURA-Diag/1.0)';

const getCookieHeader = (res) => {
  const raw = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : null;
  if (raw && raw.length) return raw.map((c) => c.split(';')[0]).join('; ');
  const single = res.headers.get('set-cookie');
  return single ? single.split(',').map((c) => c.split(';')[0]).join('; ') : '';
};

(async () => {
  console.log(`NIE diuji: ${NIE}\n`);

  const pageRes = await fetch(PAGE, { headers: { 'User-Agent': UA } });
  const html = await pageRes.text();
  const cookie = getCookieHeader(pageRes);
  const csrf = (html.match(/name="csrf-token"\s+content="([^"]+)"/i) || [])[1] || null;
  const dataTableUrl = (html.match(/window\.dataTableUrl\s*=\s*"([^"]+)"/i) || [])[1] || null;

  console.log('status halaman :', pageRes.status);
  console.log('cookie sesi    :', cookie ? `${cookie.slice(0, 40)}... (${cookie.length} char)` : '(tidak ada)');
  console.log('csrf token     :', csrf ? `${csrf.slice(0, 12)}...` : '(tidak ditemukan)');
  console.log('dataTableUrl   :', dataTableUrl);
  console.log('detailUrl      :', (html.match(/window\.detailUrl\s*=\s*"([^"]+)"/i) || [])[1] || '-');

  if (!dataTableUrl) return;

  const url = dataTableUrl.replace(/\\\//g, '/');
  const body = new URLSearchParams({
    draw: '1',
    start: '0',
    length: '10',
    'search[value]': NIE,
    'search[regex]': 'false',
    'order[0][column]': '0',
    'order[0][dir]': 'asc'
  });

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      Accept: 'application/json, text/javascript, */*; q=0.01',
      Referer: PAGE,
      Origin: BASE,
      ...(csrf ? { 'X-CSRF-TOKEN': csrf } : {}),
      ...(cookie ? { Cookie: cookie } : {})
    },
    body
  });

  const text = await res.text();
  console.log('\nPOST', url, '->', res.status, `${text.length} char`);
  console.log('cuplikan:', text.slice(0, 800));

  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    console.log('(respons bukan JSON)');
  }
  if (parsed) {
    console.log('jumlah baris:', Array.isArray(parsed.data) ? parsed.data.length : '-', '| recordsTotal:', parsed.recordsTotal);
    if (Array.isArray(parsed.data) && parsed.data[0]) {
      console.log('contoh baris:', JSON.stringify(parsed.data[0]).slice(0, 600));
    }
  }
})();
