import { redirect } from 'next/navigation'

// Packaging now lives on the History page
export default function Page() {
  redirect('/history')
}
