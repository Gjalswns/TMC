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

    console.log(`📡 Broadcasting event: ${eventType} for game ${gameId}`)

    // Create channel with unique name to avoid conflicts
    const channelName = `game-${gameId}-broadcast-${Date.now()}`
    const channel = supabaseClient.channel(channelName)
    
    // Subscribe to channel first, then send
    await new Promise((resolve, reject) => {
      channel
        .on('broadcast', { event: '*' }, () => {}) // Listen to any broadcast
        .subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            console.log(`✅ Channel subscribed: ${channelName}`)
            
            try {
              // Send broadcast message
              const sendResult = await channel.send({
                type: 'broadcast',
                event: eventType,
                payload: {
                  gameId,
                  timestamp: new Date().toISOString(),
                  data,
                  targetUsers
                }
              })
              
              console.log(`📤 Broadcast sent:`, sendResult)
              
              // Clean up channel after sending
              setTimeout(async () => {
                await supabaseClient.removeChannel(channel)
                console.log(`🧹 Channel cleaned up: ${channelName}`)
              }, 100)
              
              resolve(sendResult)
            } catch (error) {
              console.error(`❌ Failed to send broadcast:`, error)
              reject(error)
            }
          } else if (status === 'CHANNEL_ERROR') {
            console.error(`❌ Channel subscription error`)
            reject(new Error('Failed to subscribe to channel'))
          } else if (status === 'TIMED_OUT') {
            console.error(`⏰ Channel subscription timeout`)
            reject(new Error('Channel subscription timed out'))
          }
        })
    })

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Event broadcasted successfully',
        gameId,
        eventType,
        timestamp: new Date().toISOString()
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('❌ Error broadcasting game event:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Failed to broadcast event',
        details: error.message,
        stack: error.stack
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
