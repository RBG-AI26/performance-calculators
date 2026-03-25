# Scenario Sync Setup

This app syncs named scenarios only. Live unsaved form state remains local to each device.

## 1. Create the table

Run this SQL in Supabase:

```sql
create table if not exists public.scenarios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  saved_at timestamptz not null default now(),
  app_version text,
  state jsonb not null,
  linked_weight_overrides jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scenarios_user_name_unique unique (user_id, name)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists scenarios_set_updated_at on public.scenarios;
create trigger scenarios_set_updated_at
before update on public.scenarios
for each row
execute function public.set_updated_at();
```

## 2. Turn on row-level security

```sql
alter table public.scenarios enable row level security;
```

## 3. Add policies

```sql
create policy "Users can read their own scenarios"
on public.scenarios
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert their own scenarios"
on public.scenarios
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update their own scenarios"
on public.scenarios
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete their own scenarios"
on public.scenarios
for delete
to authenticated
using (auth.uid() = user_id);
```

## 4. Configure auth

In Supabase Auth:

- enable email sign-in / magic links
- add your app URL to the redirect URLs

For example:

- `https://your-app-url.example`
- `http://localhost:8000`

## 5. Add project settings to the app

Edit [sync-config.js](/Users/russellgillson/Documents/MyApps/787%20Perf%20Calculators/sync-config.js) and fill in:

```js
window.SYNC_CONFIG = {
  supabaseUrl: "https://YOUR_PROJECT.supabase.co",
  supabaseAnonKey: "YOUR_SUPABASE_ANON_KEY",
};
```

The anon key is safe to ship in the client. Keep the service role key out of the app.

## 6. Use it

- enter your email in `Scenario Sync`
- tap `Send Sign-In Link`
- open the magic link on that device
- the app will sign in and sync named scenarios
