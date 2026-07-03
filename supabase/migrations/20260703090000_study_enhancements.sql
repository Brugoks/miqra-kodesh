-- Study reading progress: track which readings a user has completed per series
CREATE TABLE IF NOT EXISTS study_reading_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  series_id TEXT NOT NULL,
  reading_ref TEXT NOT NULL,
  completed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, series_id, reading_ref)
);

ALTER TABLE study_reading_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own reading progress"
  ON study_reading_progress FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Study notes: personal notes attached to specific readings
CREATE TABLE IF NOT EXISTS study_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  series_id TEXT NOT NULL,
  reading_ref TEXT NOT NULL,
  note_text TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, series_id, reading_ref)
);

ALTER TABLE study_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own study notes"
  ON study_notes FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Add archived column to study_series for series archiving
ALTER TABLE study_series ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT FALSE;
