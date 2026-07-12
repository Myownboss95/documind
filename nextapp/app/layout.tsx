import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'DocuMind — Next.js',
  description: 'RAG knowledge base — App Router demo',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav className="nav">
          <div className="nav-inner">
            <a href="/" className="brand">
              <span className="logo" aria-hidden />
              DocuMind
            </a>
            <div className="nav-links">
              <a href="/">Search</a>
              <a href="/chat">Chat</a>
            </div>
          </div>
        </nav>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
