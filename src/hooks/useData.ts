import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import type { Item, Purchase } from '../lib/types'

export function useItems(householdId: string | null | undefined) {
  return useQuery({
    queryKey: ['items', householdId],
    enabled: Boolean(householdId),
    queryFn: async (): Promise<Item[]> => {
      const { data, error } = await supabase
        .from('items')
        .select('*')
        .eq('household_id', householdId!)
        .order('name')
      if (error) throw error
      return data ?? []
    },
  })
}

/**
 * All recent purchases for the household in one query; screens derive
 * per-item history, "last bought" lines, and full-amount estimates from it.
 */
export function usePurchases(householdId: string | null | undefined) {
  return useQuery({
    queryKey: ['purchases', householdId],
    enabled: Boolean(householdId),
    queryFn: async (): Promise<Purchase[]> => {
      const { data, error } = await supabase
        .from('purchases')
        .select('*')
        .eq('household_id', householdId!)
        .order('purchased_at', { ascending: false })
        .limit(500)
      if (error) throw error
      return data ?? []
    },
  })
}

export function usePurchasesByItem(householdId: string | null | undefined) {
  const { data: purchases } = usePurchases(householdId)
  return useMemo(() => {
    const map = new Map<string, Purchase[]>()
    for (const p of purchases ?? []) {
      const list = map.get(p.item_id)
      if (list) list.push(p)
      else map.set(p.item_id, [p])
    }
    return map
  }, [purchases])
}

export function useItemMutations(householdId: string | null | undefined) {
  const queryClient = useQueryClient()
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['items', householdId] })
    queryClient.invalidateQueries({ queryKey: ['purchases', householdId] })
  }

  const upsertItem = useMutation({
    mutationFn: async (item: Partial<Item> & { name: string }) => {
      const { data, error } = await supabase
        .from('items')
        .upsert({ ...item, household_id: householdId! })
        .select()
        .single()
      if (error) throw error
      return data as Item
    },
    onSuccess: invalidate,
  })

  const deleteItem = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase.from('items').delete().eq('id', itemId)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const setItemQty = useMutation({
    mutationFn: async ({ itemId, qty }: { itemId: string; qty: number }) => {
      const { error } = await supabase
        .from('items')
        .update({ current_qty: qty })
        .eq('id', itemId)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const addPurchase = useMutation({
    mutationFn: async (purchase: {
      item_id: string
      qty: number
      price: number | null
      purchased_at?: string
    }) => {
      const { data: userData } = await supabase.auth.getUser()
      const { error } = await supabase.from('purchases').insert({
        ...purchase,
        household_id: householdId!,
        added_by: userData.user?.id,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  const deletePurchase = useMutation({
    mutationFn: async (purchaseId: string) => {
      const { error } = await supabase.from('purchases').delete().eq('id', purchaseId)
      if (error) throw error
    },
    onSuccess: invalidate,
  })

  return { upsertItem, deleteItem, setItemQty, addPurchase, deletePurchase }
}

/** Live family sync: any change to household data refreshes local queries. */
export function useRealtimeSync(householdId: string | null | undefined) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!householdId) return
    const channel = supabase
      .channel(`household-${householdId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'items', filter: `household_id=eq.${householdId}` },
        () => queryClient.invalidateQueries({ queryKey: ['items', householdId] }),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'purchases', filter: `household_id=eq.${householdId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['purchases', householdId] })
          queryClient.invalidateQueries({ queryKey: ['items', householdId] })
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [householdId, queryClient])
}
