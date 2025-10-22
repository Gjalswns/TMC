-- Cleanup script for participants table
-- Use this to reset check-ins before each game session

-- Delete all participants (this will reset all check-ins)
DELETE FROM participants;

-- Verify cleanup
SELECT 
  COUNT(*) as remaining_participants
FROM participants;

-- Show preregistered players that are ready for check-in
SELECT 
  COUNT(*) as total_active_players,
  COUNT(DISTINCT team_name) as total_teams
FROM preregistered_players
WHERE is_active = true;
