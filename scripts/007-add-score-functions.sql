-- Add helper functions for team score management

-- Function to increment team score
CREATE OR REPLACE FUNCTION increment_team_score(team_id UUID, points INTEGER)
RETURNS VOID AS $$
BEGIN
  UPDATE teams 
  SET score = score + points 
  WHERE id = team_id;
END;
$$ LANGUAGE plpgsql;

-- Function to decrement team score (with minimum of 0)
CREATE OR REPLACE FUNCTION decrement_team_score(team_id UUID, points INTEGER)
RETURNS VOID AS $$
BEGIN
  UPDATE teams 
  SET score = GREATEST(score - points, 0) 
  WHERE id = team_id;
END;
$$ LANGUAGE plpgsql;

-- Function to set team score to a specific value
CREATE OR REPLACE FUNCTION update_team_score(team_id UUID, new_score INTEGER)
RETURNS VOID AS $$
BEGIN
  UPDATE teams 
  SET score = GREATEST(new_score, 0) 
  WHERE id = team_id;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION increment_team_score(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION decrement_team_score(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION update_team_score(UUID, INTEGER) TO authenticated;
