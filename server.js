// Load environment variables
require('dotenv').config({ path: '.env.local' });

const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');
const { createClient } = require('@supabase/supabase-js');

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Supabase 클라이언트 (서버용)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

console.log('🚀 Starting TMC Game Platform with WebSocket support...');

app.prepare().then(() => {
  const httpServer = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('❌ Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  });

  // Socket.IO 서버 초기화
  const io = new Server(httpServer, {
    cors: {
      origin: dev ? 'http://localhost:3000' : process.env.CORS_ORIGIN || '*',
      methods: ['GET', 'POST'],
      credentials: true
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000
  });

  // Make Socket.IO instance globally accessible for API routes
  global.io = io;

  console.log('✅ Socket.IO server initialized');

  // 연결된 클라이언트 추적
  const connectedClients = new Map();

  // Socket.IO 이벤트 핸들러
  io.on('connection', (socket) => {
    const timestamp = new Date().toISOString();
    console.log(`✅ [${timestamp}] Client connected: ${socket.id}`);
    connectedClients.set(socket.id, { connectedAt: timestamp, rooms: [] });

    // ==================== Score Steal 이벤트 ====================
    
    // 세션 구독
    socket.on('subscribe:score-steal-session', async (sessionId) => {
      const ts = new Date().toISOString();
      console.log(`📡 [${ts}] [${socket.id}] Subscribing to Score Steal session: ${sessionId}`);
      
      socket.join(`score-steal:${sessionId}`);
      activeSubscriptions.sessions.set(sessionId, { type: 'score-steal', lastUpdate: Date.now() });
      
      const client = connectedClients.get(socket.id);
      if (client) {
        client.rooms.push(`score-steal:${sessionId}`);
      }

      // 초기 데이터 전송
      try {
        const { data: session, error } = await supabase
          .from('score_steal_sessions')
          .select(`
            *,
            teams!score_steal_sessions_winner_team_id_fkey (
              id,
              team_name,
              team_number
            )
          `)
          .eq('id', sessionId)
          .single();

        if (error) throw error;

        // 현재 문제 정보 가져오기
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

        socket.emit('score-steal:session-update', session);
        console.log(`✅ [${ts}] Initial session data sent to ${socket.id}`);
      } catch (error) {
        console.error(`❌ [${ts}] Error fetching session:`, error);
        socket.emit('error', { message: 'Failed to fetch session', error: error.message });
      }
    });

    // 세션 구독 해제
    socket.on('unsubscribe:score-steal-session', (sessionId) => {
      const ts = new Date().toISOString();
      console.log(`📡 [${ts}] [${socket.id}] Unsubscribing from Score Steal session: ${sessionId}`);
      socket.leave(`score-steal:${sessionId}`);
      
      // 해당 세션을 구독하는 클라이언트가 없으면 폴링 중지
      const room = io.sockets.adapter.rooms.get(`score-steal:${sessionId}`);
      if (!room || room.size === 0) {
        activeSubscriptions.sessions.delete(sessionId);
        console.log(`🛑 Stopped polling for Score Steal session: ${sessionId}`);
      }
      
      const client = connectedClients.get(socket.id);
      if (client) {
        client.rooms = client.rooms.filter(r => r !== `score-steal:${sessionId}`);
      }
    });

    // 시도 기록 업데이트 요청
    socket.on('score-steal:request-attempts', async (sessionId) => {
      try {
        const { data: attempts } = await supabase
          .from('score_steal_attempts')
          .select(`
            *,
            teams!score_steal_attempts_team_id_fkey (
              id,
              team_name,
              team_number
            )
          `)
          .eq('session_id', sessionId)
          .order('response_time_ms', { ascending: true });

        socket.emit('score-steal:attempts-update', attempts || []);
      } catch (error) {
        console.error('Error fetching attempts:', error);
      }
    });

    // ==================== Relay Quiz 이벤트 ====================
    
    // Relay Quiz 세션 구독
    socket.on('subscribe:relay-quiz-session', async (sessionId) => {
      const ts = new Date().toISOString();
      console.log(`📡 [${ts}] [${socket.id}] Subscribing to Relay Quiz session: ${sessionId}`);
      
      socket.join(`relay-quiz:${sessionId}`);
      activeSubscriptions.sessions.set(sessionId, { type: 'relay-quiz', lastUpdate: Date.now() });
      
      const client = connectedClients.get(socket.id);
      if (client) {
        client.rooms.push(`relay-quiz:${sessionId}`);
      }

      // 초기 데이터 전송
      try {
        const { data: session, error } = await supabase
          .from('relay_quiz_sessions')
          .select(`
            *,
            relay_quiz_team_progress (
              *,
              teams (
                id,
                team_name,
                team_number,
                score
              )
            )
          `)
          .eq('id', sessionId)
          .single();

        if (error) throw error;

        socket.emit('relay-quiz:session-update', session);
        console.log(`✅ [${ts}] Initial Relay Quiz session data sent to ${socket.id}`);
      } catch (error) {
        console.error(`❌ [${ts}] Error fetching Relay Quiz session:`, error);
        socket.emit('error', { message: 'Failed to fetch session', error: error.message });
      }
    });

    // Relay Quiz 세션 구독 해제
    socket.on('unsubscribe:relay-quiz-session', (sessionId) => {
      const ts = new Date().toISOString();
      console.log(`📡 [${ts}] [${socket.id}] Unsubscribing from Relay Quiz session: ${sessionId}`);
      socket.leave(`relay-quiz:${sessionId}`);
      
      // 해당 세션을 구독하는 클라이언트가 없으면 폴링 중지
      const room = io.sockets.adapter.rooms.get(`relay-quiz:${sessionId}`);
      if (!room || room.size === 0) {
        activeSubscriptions.sessions.delete(sessionId);
        console.log(`🛑 Stopped polling for Relay Quiz session: ${sessionId}`);
      }
      
      const client = connectedClients.get(socket.id);
      if (client) {
        client.rooms = client.rooms.filter(r => r !== `relay-quiz:${sessionId}`);
      }
    });

    // ==================== 게임 대기실 이벤트 ====================
    
    // 게임 대기실 구독
    socket.on('subscribe:game-waiting', async (gameId) => {
      const ts = new Date().toISOString();
      console.log(`📡 [${ts}] [${socket.id}] Subscribing to game waiting room: ${gameId}`);
      
      socket.join(`game-waiting:${gameId}`);
      activeSubscriptions.games.add(gameId); // 폴링 활성화
      
      const client = connectedClients.get(socket.id);
      if (client) {
        client.rooms.push(`game-waiting:${gameId}`);
      }

      // 초기 게임 상태 전송
      try {
        const { data: game, error } = await supabase
          .from('games')
          .select('*')
          .eq('id', gameId)
          .single();

        if (error) throw error;

        // 참가자 수 조회
        const { count: participantCount } = await supabase
          .from('participants')
          .select('*', { count: 'exact', head: true })
          .eq('game_id', gameId);

        socket.emit('game-waiting:update', {
          game,
          participantCount: participantCount || 0
        });
        
        console.log(`✅ [${ts}] Initial game waiting data sent to ${socket.id}`);
      } catch (error) {
        console.error(`❌ [${ts}] Error fetching game waiting data:`, error);
        socket.emit('error', { message: 'Failed to fetch game data', error: error.message });
      }
    });

    // 게임 대기실 구독 해제
    socket.on('unsubscribe:game-waiting', (gameId) => {
      const ts = new Date().toISOString();
      console.log(`📡 [${ts}] [${socket.id}] Unsubscribing from game waiting room: ${gameId}`);
      socket.leave(`game-waiting:${gameId}`);
      
      // 해당 게임을 구독하는 클라이언트가 없으면 폴링 중지
      const room = io.sockets.adapter.rooms.get(`game-waiting:${gameId}`);
      if (!room || room.size === 0) {
        activeSubscriptions.games.delete(gameId);
        console.log(`🛑 Stopped polling for game: ${gameId}`);
      }
      
      const client = connectedClients.get(socket.id);
      if (client) {
        client.rooms = client.rooms.filter(r => r !== `game-waiting:${gameId}`);
      }
    });

    // 팀 정보 요청
    socket.on('game-waiting:request-team-info', async ({ gameId, teamId }) => {
      try {
        const { data: team } = await supabase
          .from('teams')
          .select('team_name')
          .eq('id', teamId)
          .single();

        const { data: teammates } = await supabase
          .from('participants')
          .select('nickname')
          .eq('team_id', teamId);

        socket.emit('game-waiting:team-info', {
          teamName: team?.team_name,
          teamMembers: teammates?.map(t => t.nickname) || []
        });
      } catch (error) {
        console.error('Error fetching team info:', error);
      }
    });

    // ==================== 공통 이벤트 ====================
    
    // Ping-Pong (연결 상태 확인)
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: Date.now() });
    });

    // 연결 해제
    socket.on('disconnect', (reason) => {
      const ts = new Date().toISOString();
      console.log(`❌ [${ts}] Client disconnected: ${socket.id}, reason: ${reason}`);
      connectedClients.delete(socket.id);
    });

    // 에러 처리
    socket.on('error', (error) => {
      console.error(`❌ Socket error for ${socket.id}:`, error);
    });
  });

  // ==================== 데이터베이스 변경 감지 (폴링 기반) ====================
  
  // 활성 구독 추적
  const activeSubscriptions = {
    games: new Set(),
    sessions: new Map(), // sessionId -> { type, lastUpdate }
  };

  const setupDatabasePolling = () => {
    console.log('🔧 Setting up database polling for change detection...');

    // 게임 상태 폴링 (1초마다)
    setInterval(async () => {
      if (activeSubscriptions.games.size === 0) return;

      try {
        for (const gameId of activeSubscriptions.games) {
          const { data: game } = await supabase
            .from('games')
            .select('*')
            .eq('id', gameId)
            .single();

          if (game) {
            const { count: participantCount } = await supabase
              .from('participants')
              .select('*', { count: 'exact', head: true })
              .eq('game_id', gameId);

            io.to(`game-waiting:${gameId}`).emit('game-waiting:update', {
              game,
              participantCount: participantCount || 0
            });
          }
        }
      } catch (error) {
        console.error('❌ Game polling error:', error);
      }
    }, 1000);

    // Score Steal 세션 폴링 (500ms마다 - 빠른 반응 필요)
    setInterval(async () => {
      const scoreStealSessions = Array.from(activeSubscriptions.sessions.entries())
        .filter(([_, data]) => data.type === 'score-steal');

      if (scoreStealSessions.length === 0) return;

      try {
        for (const [sessionId, _] of scoreStealSessions) {
          // 세션 데이터 조회
          const { data: session } = await supabase
            .from('score_steal_sessions')
            .select(`
              *,
              teams!score_steal_sessions_winner_team_id_fkey (
                id,
                team_name,
                team_number
              )
            `)
            .eq('id', sessionId)
            .single();

          if (session) {
            // 현재 문제 정보 추가
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

            io.to(`score-steal:${sessionId}`).emit('score-steal:session-update', session);

            // 시도 기록도 함께 조회
            const { data: attempts } = await supabase
              .from('score_steal_attempts')
              .select(`
                *,
                teams!score_steal_attempts_team_id_fkey (
                  id,
                  team_name,
                  team_number
                )
              `)
              .eq('session_id', sessionId)
              .order('response_time_ms', { ascending: true });

            if (attempts) {
              io.to(`score-steal:${sessionId}`).emit('score-steal:attempts-update', attempts);
            }
          }
        }
      } catch (error) {
        console.error('❌ Score Steal polling error:', error);
      }
    }, 500);

    // Relay Quiz 세션 폴링 (1초마다)
    setInterval(async () => {
      const relayQuizSessions = Array.from(activeSubscriptions.sessions.entries())
        .filter(([_, data]) => data.type === 'relay-quiz');

      if (relayQuizSessions.length === 0) return;

      try {
        for (const [sessionId, _] of relayQuizSessions) {
          const { data: session } = await supabase
            .from('relay_quiz_sessions')
            .select(`
              *,
              relay_quiz_team_progress (
                *,
                teams (
                  id,
                  team_name,
                  team_number,
                  score
                )
              )
            `)
            .eq('id', sessionId)
            .single();

          if (session) {
            io.to(`relay-quiz:${sessionId}`).emit('relay-quiz:session-update', session);
          }
        }
      } catch (error) {
        console.error('❌ Relay Quiz polling error:', error);
      }
    }, 1000);

    console.log('✅ Database polling set up successfully');
  };

  setupDatabasePolling();

  // 서버 상태 모니터링
  setInterval(() => {
    const connectedCount = connectedClients.size;
    const rooms = io.sockets.adapter.rooms;
    console.log(`📊 Server Status: ${connectedCount} clients connected, ${rooms.size} rooms active`);
  }, 60000); // 1분마다

  httpServer
    .once('error', (err) => {
      console.error('❌ Server error:', err);
      process.exit(1);
    })
    .listen(port, hostname, () => {
      console.log(`✅ Server ready on http://${hostname}:${port}`);
      console.log(`✅ Environment: ${dev ? 'development' : 'production'}`);
      console.log(`✅ WebSocket support: enabled`);
    });
});
