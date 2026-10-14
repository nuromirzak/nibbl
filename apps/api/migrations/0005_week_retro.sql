-- Retro crowns for weeks before the weekly snapshot existed (decision 0017): no real weekly gain is known,
-- so `gain` holds the pet's total xp at the first snapshot and the site labels the row as retro.
ALTER TABLE week_winners ADD COLUMN retro INTEGER NOT NULL DEFAULT 0;
