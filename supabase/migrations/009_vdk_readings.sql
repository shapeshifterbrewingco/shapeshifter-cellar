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


curl -H "x-api-key: t5il7nka6tpjy4rcl9jox02w66f03sk40h44hz54" \
  https://xtm0vu1op0.execute-api.ap-southeast-2.amazonaws.com/Prod/asset/list

curl -s -H "x-api-key: t5il7nka6tpjy4rcl9jox02w66f03sk40h44hz54" \
  https://xtm0vu1op0.execute-api.ap-southeast-2.amazonaws.com/Prod/asset/list \
  | jq '[.[] | select(.reference != null) | {reference, id}]'

curl -s -H "x-api-key: t5il7nka6tpjy4rcl9jox02w66f03sk40h44hz54" \
  https://xtm0vu1op0.execute-api.ap-southeast-2.amazonaws.com/Prod/asset/list \
  | python3 -c "import json,sys; [print(x.get('reference',''), x.get('id','')) for x in json.load(sys.stdin) if x.get('reference')]"

git remote add origin https://github.com/shapeshifterbrewingco/shapeshifter-cellar.git
git push -u origin main