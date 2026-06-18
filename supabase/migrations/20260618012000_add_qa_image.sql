-- Migration to add image_path to qa_questions.
alter table public.qa_questions add column if not exists image_path text;
