import type { Metadata } from 'next'
import { Plus_Jakarta_Sans } from 'next/font/google'
/**
 * Ordem: primeiro Tailwind/globals (base do app), depois tokens e componentes do mockup.
 * Se o dev “sumir” com o CSS, rode `npm run dev:reset` na pasta frontend (cache .next).
 */
import './globals.css'
import '@/styles/gege-mockup.css'
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
  verification: {
    google: 'fBzvKVCJMA9a8-_OKBkHVOeHxBE30_dMSoe66Q6ioW4',
  },
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
