'use client'

interface StylePickerProps {
  name: string
  colour: string
  onNameChange: (v: string) => void
  onColourChange: (v: string) => void
}

const SWATCHES = [
  // Pale / straw
  '#F5EEB0', '#F2E270', '#EFD030', '#EABC20',
  // Gold / amber
  '#E09020', '#C87020', '#B05818', '#984010',
  // Copper / red
  '#882810', '#741808', '#5C1005', '#441005',
  // Brown / dark
  '#2E0803', '#1A0503', '#0D0302', '#E0B840',
]

export function StylePicker({ name, colour, onNameChange, onColourChange }: StylePickerProps) {
  return (
    <div className="mt-2 p-3 border border-gray-200 rounded-lg bg-gray-50 space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Style name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="e.g. Session Red Ale"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          autoFocus
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-2">Beer colour</label>
        <div className="flex items-center gap-3">
          <div className="grid grid-cols-8 gap-1.5">
            {SWATCHES.map((hex) => (
              <button
                key={hex}
                type="button"
                onClick={() => onColourChange(hex)}
                className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110"
                style={{
                  backgroundColor: hex,
                  borderColor: colour === hex ? '#1e3a3a' : 'transparent',
                  boxShadow: colour === hex ? '0 0 0 1px #1e3a3a' : 'none',
                }}
                title={hex}
              />
            ))}
          </div>
          {/* Preview */}
          <div
            className="flex-shrink-0 w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center text-[9px] font-bold overflow-hidden"
            style={{ backgroundColor: colour, color: isDarkHex(colour) ? '#fff' : '#1a1a1a' }}
          >
            {name ? name.slice(0, 3).toUpperCase() : '?'}
          </div>
        </div>
      </div>
    </div>
  )
}

function isDarkHex(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5
}
