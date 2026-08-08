import { supabase } from './supabaseClient'

export async function listTrades(userId) {
  const { data, error } = await supabase
    .from('trades')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function createTrade({ userId, symbol, direction, capital, leverage, entryPrice }) {
  const { data, error } = await supabase
    .from('trades')
    .insert({
      user_id: userId,
      symbol,
      direction,
      capital,
      leverage,
      entry_price: entryPrice,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function closeTrade(id, { closePrice, liquidated }) {
  const { data, error } = await supabase
    .from('trades')
    .update({
      status: liquidated ? 'liquidated' : 'closed',
      close_price: closePrice,
      close_date: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}
