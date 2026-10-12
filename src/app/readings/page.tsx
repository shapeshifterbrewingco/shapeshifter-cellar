import { redirect } from 'next/navigation'

// Readings now live under History. Old links and bookmarks land in the right place.
export default function ReadingsPage() {
  redirect('/history?view=readings')
}
