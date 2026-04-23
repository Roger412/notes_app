export default function Home() {
  const sections = [
    { href: '/finance', label: 'Finance', desc: 'Track income, expenses, and budgets' },
    { href: '/notes', label: 'Notes', desc: 'Password-protected rich text notes' },
    { href: '/controller', label: 'Controller', desc: 'WebSocket bridge to phone and ROS2' },
  ]

  return (
    <div className="max-w-2xl mx-auto mt-16 text-center">
      <h1 className="text-5xl font-bold text-indigo-400 mb-4">Notes App</h1>
      <p className="text-gray-400 mb-10">Your personal hub for notes, finances, and device control.</p>
      <div className="grid grid-cols-3 gap-4">
        {sections.map(card => (
          <a
            key={card.href}
            href={card.href}
            className="p-6 bg-[#1e1e2e] rounded-xl border border-gray-700 hover:border-indigo-500 transition-colors text-left"
          >
            <h2 className="font-semibold text-white mb-1">{card.label}</h2>
            <p className="text-sm text-gray-400">{card.desc}</p>
          </a>
        ))}
      </div>
    </div>
  )
}
