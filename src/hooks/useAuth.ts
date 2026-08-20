import type { Session } from '@supabase/supabase-js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { disablePush } from '../lib/push'
import { supabase } from '../lib/supabase'
import type { Household, Profile } from '../lib/types'

export function useSession() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setLoading(false)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  return { session, loading }
}

export function useProfile(userId: string | undefined) {
  return useQuery({
    queryKey: ['profile', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<Profile | null> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId!)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })
}

export function useHousehold(householdId: string | null | undefined) {
  return useQuery({
    queryKey: ['household', householdId],
    enabled: Boolean(householdId),
    queryFn: async (): Promise<Household | null> => {
      const { data, error } = await supabase
        .from('households')
        .select('*')
        .eq('id', householdId!)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })
}

export function useHouseholdMembers(householdId: string | null | undefined) {
  return useQuery({
    queryKey: ['members', householdId],
    enabled: Boolean(householdId),
    queryFn: async (): Promise<Profile[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('household_id', householdId!)
      if (error) throw error
      return data ?? []
    },
  })
}

export function useInvalidateOnSignOut() {
  const queryClient = useQueryClient()
  return async () => {
    // A push subscription belongs to this browser, not this account, so it
    // must be torn down before the session goes away — deleting the row
    // needs the current user's RLS context. Sign-out must always succeed even
    // if this fails (offline, transient error), so any failure is swallowed.
    await disablePush().catch((err) => console.warn('Could not disable push on sign-out', err))
    await supabase.auth.signOut()
    queryClient.clear()
  }
}
