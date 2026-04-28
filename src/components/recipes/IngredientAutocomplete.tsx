'use client'

import { useState, useRef, useEffect, useTransition } from 'react'
import { Star } from 'lucide-react'
import type { IngredientCategory } from '@/types'
import { toggleFavourite } from '@/app/ingredients/actions'

export interface IngredientOption {
  id: string
  name: string
  category: IngredientCategory
  default_unit: string
  is_favourite: boolean
}

interface Props {
  value: string
  onChange: (value: string, option?: IngredientOption) => void
  ingredients: IngredientOption[]
  placeholder?: string
}

export function IngredientAutocomplete({ value, onChange, ingredients, placeholder }: Props) {
  const [open, setOpen] = useState(false)
  const [localIngredients, setLocalIngredients] = useState(ingredients)
  const [, startTransition] = useTransition()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setLocalIngredients(ingredients)
  }, [ingredients])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const filtered = value.trim().length === 0
    ? localIngredients.slice(0, 12)
    : localIngredients
        .filter((i) => i.name.toLowerCase().includes(value.toLowerCase()))
        .slice(0, 12)

  const sorted = [
    ...filtered.filter((i) => i.is_favourite),
    ...filtered.filter((i) => !i.is_favourite),
  ]

  function handleToggleFavourite(e: React.MouseEvent, ing: IngredientOption) {
    e.preventDefault()
    e.stopPropagation()
    const next = !ing.is_favourite
    setLocalIngredients((prev) =>
      prev.map((i) => (i.id === ing.id ? { ...i, is_favourite: next } : i))
    )
    startTransition(() => toggleFavourite(ing.id, next))
  }

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder ?? 'Ingredient name'}
        className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary"
      />
      {open && sorted.length > 0 && (
        <div className="absolute z-50 top-full left-0 mt-0.5 w-56 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          {sorted.map((ing) => (
            <div
              key={ing.id}
              className="flex items-center justify-between px-3 py-2 hover:bg-gray-50 cursor-pointer group"
              onMouseDown={(e) => {
                e.preventDefault()
                onChange(ing.name, ing)
                setOpen(false)
              }}
            >
              <span className="text-xs text-gray-800 truncate">{ing.name}</span>
              <button
                type="button"
                className="ml-2 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                onMouseDown={(e) => handleToggleFavourite(e, ing)}
              >
                <Star
                  className="h-3 w-3"
                  fill={ing.is_favourite ? '#f59e0b' : 'none'}
                  stroke={ing.is_favourite ? '#f59e0b' : '#9ca3af'}
                />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
