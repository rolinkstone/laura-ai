import './globals.css';
import Providers from '../components/Providers';

export const metadata = {
  title: 'BBPOM AI Assistant',
  description: 'Asisten virtual Balai Besar/Balai POM Palangka Raya'
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
