export default function Loading() {
  return (
    <main className="min-h-screen bg-background px-6 py-6" aria-busy="true" aria-label="Loading">
      <div className="h-7 w-48 rounded-lg bg-gray-200/70 animate-pulse" />
      <div className="mt-6 grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="h-40 rounded-xl bg-gray-200/50 animate-pulse" />
        ))}
      </div>
    </main>
  )
}
