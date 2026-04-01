import type { Metadata } from 'next'
import { Plus_Jakarta_Sans } from 'next/font/google'
/** Tokens + classes do mockup: import direto no layout (mais fiável que @import dentro do globals no pipeline do Next). */
import '@/styles/gege-mockup.css'
import './globals.css'
import AppShell from '@/components/layout/AppShell'

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-gege-sans',
})

export const metadata: Metadata = {
  title: 'gegê — Recrutamento',
  description: 'Recrutamento inteligente para food service',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={plusJakarta.variable}>
      <body className={plusJakarta.className}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
