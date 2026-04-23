'use client'

import { useAuth } from './AuthProvider'
import { usePathname } from 'next/navigation'

const links = [
  { href: '/',           label: 'Home'       },
  { href: '/finance',    label: 'Finance'    },
  { href: '/notes',      label: 'Notes'      },
  { href: '/controller', label: 'Controller' },
]

export default function NavBar() {
  const { user, signOut } = useAuth()
  const pathname = usePathname()

  if (pathname === '/login') return null

  return (
    <nav className="flex items-center gap-6 px-6 py-4 bg-[#1e1e2e] border-b border-gray-700">
      <span className="font-bold text-lg text-indigo-400">NotesApp</span>

      <div className="flex gap-6 flex-1">
        {links.map(l => (
          <a
            key={l.href}
            href={l.href}
            className={`hover:text-white transition-colors ${pathname === l.href ? 'text-white' : 'text-gray-400'}`}
          >
            {l.label}
          </a>
        ))}
      </div>

      {user && (
        <div className="flex items-center gap-3 text-sm">
          <span className="text-gray-500 truncate max-w-[180px]">{user.email}</span>
          <button
            onClick={signOut}
            className="text-gray-400 hover:text-red-400 transition-colors"
          >
            Sign out
          </button>
        </div>
      )}
    </nav>
  )
}
