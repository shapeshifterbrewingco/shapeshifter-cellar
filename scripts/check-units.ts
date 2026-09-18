/** Sanity check on the ambiguous-unit heuristic against the real rows. */
import { isAmbiguousUnit, likelyUnit, convertUnits } from '../src/lib/costing'

const real: [string, number | null][] = [
  ['AEB Yeast Nutrient', 100], ['AEB Yeast Nutrient', 200],
  ['Antifoam', 50], ['Antifoam', 100],
  ['Poly Gel', 170], ['Servomyces', 15], ['Servomyces', 30],
  ['Valine', 100], ['Whirlfloc G', 15], ['Whirlfloc G', 60],
  ['Yeast Nutrient WP', 120],
  ['(yeast brick)', 1], ['(hop charge)', 5], ['(dry hop)', 250],
]

console.log('ambiguous "g/kg":', isAmbiguousUnit('g/kg'), ' plain "kg":', isAmbiguousUnit('kg'))
for (const [name, q] of real) {
  console.log(`  ${name.padEnd(22)} ${String(q).padStart(4)} g/kg -> ${likelyUnit('g/kg', q)}`)
}
console.log('\nconversions still behave:')
console.log('  100 g -> kg     =', convertUnits(100, 'g', 'kg'))
console.log('  2.5 kg -> 500g  =', convertUnits(2.5, 'kg', '500g'))
console.log('  300 mL -> kg    =', convertUnits(300, 'mL', 'kg'), '(null expected)')
console.log('  100 g/kg -> kg  =', convertUnits(100, 'g/kg', 'kg'), '(null expected)')
