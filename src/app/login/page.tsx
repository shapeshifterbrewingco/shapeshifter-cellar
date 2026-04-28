'use client'

import { createClient } from '@/lib/supabase/client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

export default function LoginPage() {
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  async function signInWithGoogle() {
    setLoading(true)
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${location.origin}/auth/callback`,
        queryParams: { hd: 'shapeshifterbrewing.com.au' },
      },
    })
  }

  async function signInWithEmail(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    })
    setLoading(false)
    if (error) {
      setError(error.message)
    } else {
      setSent(true)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="bg-white border border-gray-200 rounded-2xl p-10 flex flex-col items-center gap-6 w-full max-w-sm shadow-sm">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Shapeshifter Cellar</h1>
          <p className="text-sm text-gray-500 mt-1">Sign in to continue</p>
        </div>

        <Button
          onClick={signInWithGoogle}
          disabled={loading}
          className="w-full font-medium h-11"
        >
          {loading ? 'Redirecting…' : 'Sign in with Google'}
        </Button>

        <div className="w-full flex items-center gap-3">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs text-gray-400">or</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        {sent ? (
          <div className="text-center">
            <p className="text-sm font-medium text-gray-900">Check your email</p>
            <p className="text-xs text-gray-500 mt-1">We sent a magic link to <strong>{email}</strong></p>
          </div>
        ) : (
          <form onSubmit={signInWithEmail} className="w-full flex flex-col gap-3">
            <input
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            {error && <p className="text-xs text-red-500">{error}</p>}
            <Button type="submit" variant="outline" disabled={loading} className="w-full h-11 font-medium">
              {loading ? 'Sending…' : 'Send magic link'}
            </Button>
          </form>
        )}

        <p className="text-xs text-gray-400 text-center">
          Access restricted to @shapeshifterbrewing.com.au accounts
        </p>
      </div>
    </div>
  )
}
