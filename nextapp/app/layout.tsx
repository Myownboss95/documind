import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'DocuMind — Next.js',
  description: 'RAG knowledge base — App Router demo',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ maxWidth: 760, margin: '2rem auto', padding: '0 1rem' }}>{children}</body>
    </html>
  );
}
