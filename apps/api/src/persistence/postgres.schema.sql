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

-- The governed record of a Series canon. Locked by an accountable human, whose
-- account and time are kept together so a lock cannot half-exist.
create table if not exists story_bibles (
  series_id text primary key references series(id) on delete cascade,
  canon jsonb not null,
  locked_by_staff_account_id text,
  locked_at timestamptz,
  updated_at timestamptz not null default now(),
  check ((locked_by_staff_account_id is null) = (locked_at is null))
);

-- Who owns or licenses workflow material, where it may be used, for how long,
-- whether it may be modified, and whether it may be used in AI workflows. The
-- evidence is the grant somebody gave; a source URL is not one (ADR-0007).
create table if not exists rights_records (
  id text primary key,
  -- The order grants were written in, so "most recently recorded" is answerable
  -- even for two records sharing a timestamp.
  recorded_seq bigint generated always as identity,
  material_kind text not null check (material_kind in ('asset', 'dataset', 'reference', 'source-material')),
  material_id text not null,
  rights_owner text not null,
  scope jsonb not null,
  territories jsonb not null,
  granted_from timestamptz not null,
  granted_until timestamptz,
  modification_allowed boolean not null,
  ai_use_allowed boolean not null,
  evidence jsonb not null,
  recorded_by_staff_account_id text not null,
  recorded_at timestamptz not null,
  check (granted_until is null or granted_until > granted_from),
  -- A record cannot clear AI-workflow use while the grant refuses AI use.
  check (ai_use_allowed or not (scope @> '"ai-workflow"'::jsonb))
);

-- The lookup the rights gate makes: what covers this material?
create index if not exists rights_records_material_idx
  on rights_records (material_kind, material_id);

-- Chapters being written. There is deliberately no publicly_readable column:
-- reader-facing access runs through published_snapshots, so a draft has no
-- public route by construction rather than by a flag someone must remember.
create table if not exists chapter_drafts (
  id text primary key,
  series_id text not null references series(id) on delete cascade,
  chapter_number integer not null check (chapter_number > 0),
  title text not null,
  body text not null,
  creative_disclosure text not null check (creative_disclosure in ('Human', 'Hybrid', 'AI-Assisted')),
  -- Material cleared into this draft's workflow, each entry naming the Rights
  -- Record that cleared it.
  workflow_materials jsonb,
  rights_record_id text,
  provenance_ledger_entry_id text,
  -- What the Quality Gate concluded when it last ran: a verdict per condition,
  -- the conditions that block, and whether the draft is publicly publishable.
  -- A later run replaces it; what each run found is kept in the ledger.
  quality_gate jsonb,
  human_approval jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (series_id, chapter_number)
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

-- How content and AI workflow artifacts were created, evaluated, edited,
-- approved, revised, and published (ADR-0008). Append-only: nothing in the
-- application updates or deletes an entry, because lineage that can be
-- rewritten says nothing about how content was made.
create table if not exists provenance_ledger_entries (
  id text primary key,
  -- The order entries were written in, so "most recent" is answerable even for
  -- two entries sharing a timestamp.
  recorded_seq bigint generated always as identity,
  -- An accountable Staff Account, or the AI workflow run itself.
  source jsonb not null,
  action text not null,
  target_kind text not null check (target_kind in ('series', 'story-bible', 'chapter-draft', 'published-snapshot')),
  target_id text not null,
  -- Deliberately not a foreign key: lineage is evidence of what happened, so it
  -- has to outlive whatever it traces rather than cascade away with it.
  series_id text not null,
  -- What the traced artifact was at that moment, in its own terms.
  version jsonb not null,
  recorded_at timestamptz not null
);

create index if not exists provenance_ledger_entries_series_idx
  on provenance_ledger_entries (series_id, recorded_at desc, recorded_seq desc);

create index if not exists provenance_ledger_entries_target_idx
  on provenance_ledger_entries (series_id, target_kind, target_id, recorded_at desc, recorded_seq desc);

create table if not exists reader_accounts (
  id text primary key,
  created_at timestamptz not null default now()
);

create table if not exists anonymous_reader_sessions (
  id text primary key,
  upgraded_to_reader_account_id text references reader_accounts(id),
  created_at timestamptz not null default now()
);

create table if not exists series_follows (
  reader_account_id text not null references reader_accounts(id) on delete cascade,
  series_id text not null references series(id),
  followed_at timestamptz not null,
  primary key (reader_account_id, series_id)
);

create table if not exists reader_reading_progress (
  reader_account_id text not null references reader_accounts(id) on delete cascade,
  chapter_id text not null,
  series_id text not null references series(id),
  scroll_position integer not null check (scroll_position >= 0),
  updated_at timestamptz not null,
  primary key (reader_account_id, series_id, chapter_id)
);

-- Anonymous Reader Sessions hold lightweight progress only; no privileged data.
create table if not exists anonymous_reading_progress (
  anonymous_session_id text not null references anonymous_reader_sessions(id) on delete cascade,
  chapter_id text not null,
  series_id text not null references series(id),
  scroll_position integer not null check (scroll_position >= 0),
  updated_at timestamptz not null,
  primary key (anonymous_session_id, series_id, chapter_id)
);

create index if not exists reader_reading_progress_series_idx
  on reader_reading_progress (reader_account_id, series_id, updated_at desc);

-- Privileged staff operations, including refused attempts. Append-only:
-- nothing in the application updates or deletes a staff audit record.
create table if not exists staff_audit_records (
  id bigint generated always as identity primary key,
  actor jsonb not null,
  action text not null,
  target text not null,
  outcome text not null check (outcome in ('allowed', 'denied')),
  -- Why the operator said they did it, for operations that are only accountable
  -- when explained. This is what keeps a change to locked Canon non-silent.
  reason text,
  recorded_at timestamptz not null
);

create index if not exists staff_audit_records_recent_idx
  on staff_audit_records (recorded_at desc, id desc);
