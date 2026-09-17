import type {Metadata} from 'next';
import './globals.css'; // Global styles

export const metadata: Metadata = {
  title: 'Ю-Терм. Протоколы совещаний',
  description: 'Сервис расшифровки аудиозаписей встреч с нормализацией текста и автоматической подготовкой структурированных протоколов совещаний.',
  openGraph: {
    title: 'Ю-Терм. Протоколы совещаний',
    description: 'Сервис расшифровки аудиозаписей встреч с нормализацией текста и автоматической подготовкой структурированных протоколов совещаний.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Ю-Терм. Протоколы совещаний',
    description: 'Сервис расшифровки аудиозаписей встреч с нормализацией текста и автоматической подготовкой структурированных протоколов совещаний.',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="ru">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
