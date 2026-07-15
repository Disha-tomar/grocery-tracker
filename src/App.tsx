import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Mascot } from './components/Mascot'
import { TabBar } from './components/TabBar'
import { useHousehold, useProfile, useSession } from './hooks/useAuth'
import { useItems, usePurchasesByItem, useRealtimeSync } from './hooks/useData'
import { isLow } from './lib/stock'
import { isSupabaseConfigured } from './lib/supabase'
import { AddScreen } from './screens/AddScreen'
import { AuthScreen } from './screens/AuthScreen'
import { HouseholdScreen } from './screens/HouseholdScreen'
import { ItemDetailScreen } from './screens/ItemDetailScreen'
import { LowScreen } from './screens/LowScreen'
import { PantryScreen } from './screens/PantryScreen'
import { SettingsScreen } from './screens/SettingsScreen'

function Splash({ message }: { message?: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-8 text-center">
      <Mascot />
      {message && <p className="font-bold text-ink-soft">{message}</p>}
    </div>
  )
}

export default function App() {
  const { session, loading } = useSession()
  const { data: profile, isLoading: profileLoading } = useProfile(session?.user.id)
  const householdId = profile?.household_id ?? null
  const { data: household } = useHousehold(householdId)
  const { data: items } = useItems(householdId)
  const purchasesByItem = usePurchasesByItem(householdId)
  useRealtimeSync(householdId)

  if (!isSupabaseConfigured) {
    return (
      <Splash message="Almost there! Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file, then restart." />
    )
  }
  if (loading) return <Splash />
  if (!session) return <AuthScreen />
  if (profileLoading) return <Splash />
  if (!householdId) return <HouseholdScreen />
  if (!household || !profile) return <Splash />

  const allItems = items ?? []
  const lowCount = allItems.filter(isLow).length

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            <PantryScreen
              items={allItems}
              purchasesByItem={purchasesByItem}
              householdName={household.name}
            />
          }
        />
        <Route
          path="/add"
          element={
            <AddScreen items={allItems} purchasesByItem={purchasesByItem} householdId={household.id} />
          }
        />
        <Route
          path="/low"
          element={
            <LowScreen items={allItems} purchasesByItem={purchasesByItem} householdId={household.id} />
          }
        />
        <Route
          path="/item/:id"
          element={
            <ItemDetailScreen
              items={allItems}
              purchasesByItem={purchasesByItem}
              householdId={household.id}
            />
          }
        />
        <Route path="/settings" element={<SettingsScreen household={household} profile={profile} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <TabBar lowCount={lowCount} />
    </BrowserRouter>
  )
}
