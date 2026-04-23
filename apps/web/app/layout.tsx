import type { Metadata } from 'next'
import './globals.css'
import AuthProvider from '@/components/AuthProvider'
import NavBar from '@/components/NavBar'

export const metadata: Metadata = {
  title: 'Notes App',
  description: 'Personal notes, finance, and controller hub',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#181825] text-[#cdd6f4]">
        <AuthProvider>
          <NavBar />
          <main className="p-6">{children}</main>
        </AuthProvider>
      </body>
    </html>
  )
}
