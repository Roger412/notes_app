'use client'

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex items-center justify-center min-h-[60vh] flex-col gap-4">
      <h1 className="text-6xl font-bold text-red-400">500</h1>
      <p className="text-gray-400">Something went wrong</p>
      <button onClick={reset} className="text-indigo-400 hover:underline">Try again</button>
    </div>
  )
}
