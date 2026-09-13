import './globals.css';
import Providers from '../components/Providers';

export const metadata = {
  title: 'BBPOM AI Assistant',
  description: 'Asisten virtual Balai Besar/Balai POM Palangka Raya',
  // Ikon dideklarasikan EKSPLISIT (bukan konvensi src/app/favicon.ico) supaya
  // URL-nya bisa diberi versi. Favicon sangat agresif di-cache browser: URL
  // yang pernah 404 akan "diingat" lama, dan refresh biasa tidak menolong.
  // ➜ Ganti ikon: timpa public/icon-256.png lalu naikkan angka ?v=
  icons: {
    icon: [{ url: '/icon-256.png?v=1', type: 'image/png', sizes: '256x256' }],
    apple: [{ url: '/images/icon.png', sizes: '180x180' }]
  }
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
