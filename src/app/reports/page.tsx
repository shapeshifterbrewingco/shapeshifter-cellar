import { redirect } from 'next/navigation'

// Reports now lives on the History page
export default function Page() {
  redirect('/history')
}
