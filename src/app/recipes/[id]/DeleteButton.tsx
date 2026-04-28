'use client'

import { useTransition } from 'react'
import { Trash2 } from 'lucide-react'

interface Props {
  recipeId: string
  deleteAction: (id: string) => Promise<void>
}

export function DeleteButton({ recipeId, deleteAction }: Props) {
  const [isPending, startTransition] = useTransition()

  function handleDelete() {
    if (!confirm('Delete this recipe? This cannot be undone.')) return
    startTransition(() => deleteAction(recipeId))
  }

  return (
    <button
      onClick={handleDelete}
      disabled={isPending}
      className="inline-flex items-center gap-1.5 border border-gray-200 text-gray-500 text-sm px-3 py-2 rounded-lg hover:border-red-200 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
    >
      <Trash2 className="h-3.5 w-3.5" />
      Delete
    </button>
  )
}
