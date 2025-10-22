import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  
  // SSE 헤더 설정
  const headers = new Headers({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control',
  });

  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    start(controller) {
      console.log(`🔗 SSE connection started for session: ${sessionId}`);
      
      // 초기 데이터 전송
      const sendInitialData = async () => {
        try {
          const { data: session, error } = await supabase
            .from("score_steal_sessions")
            .select(`
              *,
              teams!score_steal_sessions_winner_team_id_fkey (
                id,
                team_name,
                team_number
              )
            `)
            .eq("id", sessionId)
            .single();

          if (!error && session) {
            // 현재 문제가 있다면 중앙 문제 관리에서 가져오기
            if (session.current_question_id) {
              const { data: question } = await supabase
                .from('central_questions')
                .select('id, title, question_image_url, correct_answer, points')
                .eq('id', session.current_question_id)
                .single();

              if (question) {
                session.score_steal_questions = question;
              }
            }

            const data = `data: ${JSON.stringify({ type: 'session_update', data: session })}\n\n`;
            try {
              controller.enqueue(encoder.encode(data));
            } catch (error) {
              console.log('🔌 SSE connection closed, cannot send data');
            }
          }
        } catch (error) {
          console.error('❌ Error sending initial data:', error);
        }
      };

      sendInitialData();

      // Supabase Realtime 구독
      const channel = supabase
        .channel(`sse_score_steal_${sessionId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'score_steal_sessions',
            filter: `id=eq.${sessionId}`,
          },
          async (payload) => {
            console.log('🔄 SSE: Session updated:', payload);
            
            try {
              // 전체 세션 데이터 다시 가져오기
              const { data: session, error } = await supabase
                .from("score_steal_sessions")
                .select(`
                  *,
                  teams!score_steal_sessions_winner_team_id_fkey (
                    id,
                    team_name,
                    team_number
                  )
                `)
                .eq("id", sessionId)
                .single();

              if (!error && session) {
                // 현재 문제가 있다면 중앙 문제 관리에서 가져오기
                if (session.current_question_id) {
                  const { data: question } = await supabase
                    .from('central_questions')
                    .select('id, title, question_image_url, correct_answer, points')
                    .eq('id', session.current_question_id)
                    .single();

                  if (question) {
                    session.score_steal_questions = question;
                  }
                }

                const data = `data: ${JSON.stringify({ type: 'session_update', data: session })}\n\n`;
                try {
                  controller.enqueue(encoder.encode(data));
                } catch (error) {
                  console.log('🔌 SSE connection closed, cannot send session update');
                }
              }
            } catch (error) {
              console.error('❌ Error processing session update:', error);
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'score_steal_attempts',
            filter: `session_id=eq.${sessionId}`,
          },
          (payload) => {
            console.log('🔄 SSE: New attempt:', payload);
            const data = `data: ${JSON.stringify({ type: 'new_attempt', data: payload.new })}\n\n`;
            try {
              controller.enqueue(encoder.encode(data));
            } catch (error) {
              console.log('🔌 SSE connection closed, cannot send attempt update');
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'teams',
          },
          (payload) => {
            console.log('🔄 SSE: Team score updated:', payload);
            const data = `data: ${JSON.stringify({ type: 'team_update', data: payload.new })}\n\n`;
            try {
              controller.enqueue(encoder.encode(data));
            } catch (error) {
              console.log('🔌 SSE connection closed, cannot send team update');
            }
          }
        )
        .subscribe((status) => {
          console.log('📡 SSE Realtime subscription status:', status);
          if (status === 'SUBSCRIBED') {
            const data = `data: ${JSON.stringify({ type: 'connection_status', status: 'connected' })}\n\n`;
            try {
              controller.enqueue(encoder.encode(data));
            } catch (error) {
              console.log('🔌 SSE connection closed, cannot send connection status');
            }
          }
        });

      // 연결 종료 처리
      let isClosed = false;
      
      const cleanup = () => {
        if (!isClosed) {
          isClosed = true;
          console.log('🔌 SSE connection closed');
          supabase.removeChannel(channel);
          try {
            controller.close();
          } catch (error) {
            // Controller already closed, ignore
          }
        }
      };
      
      request.signal.addEventListener('abort', cleanup);

      // Keep-alive ping (30초마다)
      const pingInterval = setInterval(() => {
        try {
          if (!controller.desiredSize && controller.desiredSize !== 0) {
            // Controller is closed
            clearInterval(pingInterval);
            supabase.removeChannel(channel);
            return;
          }
          const data = `data: ${JSON.stringify({ type: 'ping', timestamp: Date.now() })}\n\n`;
          controller.enqueue(encoder.encode(data));
        } catch (error) {
          console.log('🔌 SSE connection closed during ping');
          clearInterval(pingInterval);
          supabase.removeChannel(channel);
        }
      }, 30000);
    },
  });

  return new Response(stream, { headers });
}