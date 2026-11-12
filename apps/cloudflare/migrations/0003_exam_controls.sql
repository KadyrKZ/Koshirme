ALTER TABLE exams ADD COLUMN allowed_urls TEXT NOT NULL DEFAULT '[]';
UPDATE exams SET allowed_urls = json_array(allowed_url);
ALTER TABLE exams ADD COLUMN paused INTEGER NOT NULL DEFAULT 0;
