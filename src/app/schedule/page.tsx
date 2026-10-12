import { redirect } from 'next/navigation'

// The brewery keeps one schedule, the Brewery Schedule Google Calendar, and
// the Planner is where the app shows it. Old links to this page go there.
export default function SchedulePage() {
  redirect('/planner')
}
