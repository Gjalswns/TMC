import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create a Supabase client with the Auth context of the function
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    const { gameId, eventType, data, targetUsers } = await req.json()

    if (!gameId || !eventType) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: gameId, eventType' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Broadcast the event to all connected clients for this game
    const channel = supabaseClient.channel(`game-${gameId}`)
    
    const broadcastResult = await channel.send({
      type: 'broadcast',
      event: eventType,
      payload: {
        gameId,
        timestamp: new Date().toISOString(),
        data,
        targetUsers
      }
    })

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Event broadcasted successfully',
        result: broadcastResult
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Error broadcasting game event:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Failed to broadcast event',
        details: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
