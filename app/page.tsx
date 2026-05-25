import { redirect } from 'next/navigation'

// Root → redirect straight to dashboard
export default function Home() {
  redirect('/dashboard')
}
