export default function NotFound() {
  return (
    <div className="flex items-center justify-center min-h-[60vh] flex-col gap-4">
      <h1 className="text-6xl font-bold text-indigo-400">404</h1>
      <p className="text-gray-400">Page not found</p>
      <a href="/" className="text-indigo-400 hover:underline">Go home</a>
    </div>
  )
}
