create table debates (
  id uuid default gen_random_uuid() primary key,
  user_id text not null,
  question text not null,
  title text not null default '',
  depth text not null default 'standard',
  persona_ids jsonb not null default '[]',
  document_ids jsonb not null default '[]',
  result text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index debates_user_id_idx on debates(user_id);
create index debates_updated_at_idx on debates(updated_at desc);
