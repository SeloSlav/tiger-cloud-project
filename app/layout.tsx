import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const iconBase =
  process.env.FROSTLINE_TARGET === 'pages' ? '/tiger-cloud-project' : '';

export const metadata: Metadata = {
  icons: {
    icon: [
      {
        url: `${iconBase}/favicon.ico?v=2`,
        sizes: '16x16 32x32 48x48',
        type: 'image/x-icon',
      },
      {
        url: `${iconBase}/favicon-32.png?v=2`,
        sizes: '32x32',
        type: 'image/png',
      },
      {
        url: `${iconBase}/favicon.svg?v=2`,
        sizes: 'any',
        type: 'image/svg+xml',
      },
    ],
  },
  title: 'Frostline — Nori Works, Zagreb',
  description:
    'Monitor Nori Works, a 3D sushi production facility in Zagreb. Track current temperatures, sustained incidents and rolling exposure with Tiger Data.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
