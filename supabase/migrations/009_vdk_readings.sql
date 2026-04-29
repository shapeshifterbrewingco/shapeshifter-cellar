CREATE TABLE vdk_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brew_id uuid NOT NULL REFERENCES brews(id) ON DELETE CASCADE,
  tank_id uuid NOT NULL REFERENCES tanks(id),
  result text NOT NULL CHECK (result IN ('high', 'medium', 'low', 'pass')),
  recorded_by text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  notes text
);

CREATE INDEX vdk_readings_brew_id_idx ON vdk_readings(brew_id);