import { ClienteSlugProvider } from '@/lib/context/ClienteSlugContext'

export default async function ClienteSlugLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ clienteSlug: string }>
}) {
  const { clienteSlug } = await params

  return (
    <ClienteSlugProvider slug={clienteSlug}>
      {children}
    </ClienteSlugProvider>
  )
}
