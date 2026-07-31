create table if not exists series (
  id text primary key,
  title text not null,
  synopsis text not null,
  creative_disclosure text not null check (creative_disclosure in ('Human', 'Hybrid', 'AI-Assisted')),
  taxonomy jsonb not null,
  status text not null check (status in ('draft', 'active', 'completed', 'hiatus')),
  takedown_state text not null default 'available',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists published_snapshots (
  id text primary key,
  chapter_id text not null,
  series_id text not null references series(id),
  chapter_number integer not null check (chapter_number > 0),
  title text not null,
  body text not null,
  version integer not null check (version > 0),
  creative_disclosure text not null check (creative_disclosure in ('Human', 'Hybrid', 'AI-Assisted')),
  provenance_ledger_entry_id text not null,
  rights_record_id text not null,
  published_at timestamptz not null,
  published_by_staff_account_id text not null,
  publicly_readable boolean not null default true,
  unique (chapter_id, version)
);

create index if not exists published_snapshots_public_lookup_idx
  on published_snapshots (series_id, chapter_id, version desc)
  where publicly_readable = true;
