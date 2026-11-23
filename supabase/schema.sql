-- =====================================================================
-- LEDGER · Esquema completo para Supabase (PostgreSQL)
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query > Run
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------- ENUMS ----------
do $$ begin
  create type obligation_type   as enum ('subscription', 'debt');
  exception when duplicate_object then null; end $$;
do $$ begin
  create type billing_cycle     as enum ('weekly', 'biweekly', 'monthly', 'yearly', 'one_time');
  exception when duplicate_object then null; end $$;
do $$ begin
  create type obligation_status as enum ('active', 'paused', 'paid_off');
  exception when duplicate_object then null; end $$;
do $$ begin
  create type lent_status       as enum ('pending', 'partial', 'settled');
  exception when duplicate_object then null; end $$;

-- ---------- UTILIDAD: updated_at ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------- TABLA: obligations (suscripciones y deudas) ----------
create table if not exists public.obligations (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title                text not null,
  type                 obligation_type not null,
  category             text,
  total_amount         numeric(14,2) check (total_amount is null or total_amount >= 0),
  installment_amount   numeric(14,2) not null check (installment_amount >= 0),
  currency             varchar(3) not null default 'USD',
  billing_cycle        billing_cycle not null default 'monthly',
  next_due_date        timestamptz not null,
  reminder_days_before int not null default 2 check (reminder_days_before >= 0),
  status               obligation_status not null default 'active',
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- ---------- TABLA: payment_logs (bitácora) ----------
create table if not exists public.payment_logs (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  obligation_id  uuid references public.obligations(id) on delete set null,
  amount_paid    numeric(14,2) not null check (amount_paid >= 0),
  payment_method text,
  paid_at        timestamptz not null default now(),
  receipt_note   text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ---------- TABLA: lent_money (préstamos otorgados) ----------
create table if not exists public.lent_money (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null default auth.uid() references auth.users(id) on delete cascade,
  person_name          text not null,
  amount_lent          numeric(14,2) not null check (amount_lent > 0),
  amount_returned      numeric(14,2) not null default 0 check (amount_returned >= 0),
  lent_at              timestamptz not null default now(),
  expected_return_date timestamptz,
  payment_method       text,
  status               lent_status not null default 'pending',
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- ---------- TABLA: lent_repayments (abonos recibidos) ----------
-- Nota: se añade user_id (no estaba en el diseño original) para que la RLS sea simple y rápida.
create table if not exists public.lent_repayments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  lent_id     uuid not null references public.lent_money(id) on delete cascade,
  amount      numeric(14,2) not null check (amount > 0),
  received_at timestamptz not null default now(),
  method      text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------- ÍNDICES ----------
create index if not exists idx_obligations_user_due    on public.obligations (user_id, status, next_due_date);
create index if not exists idx_payment_logs_user_paid  on public.payment_logs (user_id, paid_at desc);
create index if not exists idx_payment_logs_obligation on public.payment_logs (obligation_id);
create index if not exists idx_lent_user_status        on public.lent_money (user_id, status);
create index if not exists idx_repayments_lent         on public.lent_repayments (lent_id, received_at desc);

-- ---------- TRIGGERS updated_at ----------
drop trigger if exists trg_obligations_updated on public.obligations;
create trigger trg_obligations_updated before update on public.obligations
  for each row execute function public.set_updated_at();

drop trigger if exists trg_payment_logs_updated on public.payment_logs;
create trigger trg_payment_logs_updated before update on public.payment_logs
  for each row execute function public.set_updated_at();

drop trigger if exists trg_lent_updated on public.lent_money;
create trigger trg_lent_updated before update on public.lent_money
  for each row execute function public.set_updated_at();

drop trigger if exists trg_repayments_updated on public.lent_repayments;
create trigger trg_repayments_updated before update on public.lent_repayments
  for each row execute function public.set_updated_at();

-- ---------- LÓGICA: estado automático de préstamos ----------
create or replace function public.lent_compute_status()
returns trigger language plpgsql as $$
begin
  new.status := (case
    when new.amount_returned >= new.amount_lent then 'settled'
    when new.amount_returned > 0                then 'partial'
    else 'pending'
  end)::lent_status;
  return new;
end $$;

drop trigger if exists trg_lent_status on public.lent_money;
create trigger trg_lent_status before insert or update on public.lent_money
  for each row execute function public.lent_compute_status();

-- Mantiene lent_money.amount_returned = suma de abonos
create or replace function public.sync_lent_returned()
returns trigger language plpgsql as $$
declare
  v_id  uuid := coalesce(new.lent_id, old.lent_id);
  v_sum numeric;
begin
  select coalesce(sum(amount), 0) into v_sum from public.lent_repayments where lent_id = v_id;
  update public.lent_money set amount_returned = v_sum where id = v_id;
  return null;
end $$;

drop trigger if exists trg_sync_lent on public.lent_repayments;
create trigger trg_sync_lent after insert or update or delete on public.lent_repayments
  for each row execute function public.sync_lent_returned();

-- ---------- LÓGICA: próxima fecha según ciclo ----------
create or replace function public.advance_due(d timestamptz, c billing_cycle)
returns timestamptz language sql immutable as $$
  select case c
    when 'weekly'   then d + interval '7 days'
    when 'biweekly' then d + interval '14 days'
    when 'monthly'  then d + interval '1 month'
    when 'yearly'   then d + interval '1 year'
    else d
  end
$$;

-- ---------- RPC: registrar pago + recalcular vencimiento (atómico) ----------
create or replace function public.register_payment(
  p_obligation_id uuid,
  p_amount        numeric,
  p_method        text,
  p_paid_at       timestamptz,
  p_note          text default null
) returns public.payment_logs
language plpgsql security invoker as $$
declare
  o      public.obligations;
  v_log  public.payment_logs;
  v_paid numeric;
begin
  select * into o from public.obligations
   where id = p_obligation_id and user_id = auth.uid()
   for update;
  if not found then
    raise exception 'Obligación no encontrada';
  end if;

  insert into public.payment_logs (user_id, obligation_id, amount_paid, payment_method, paid_at, receipt_note)
  values (auth.uid(), o.id, p_amount, p_method, coalesce(p_paid_at, now()), p_note)
  returning * into v_log;

  select coalesce(sum(amount_paid), 0) into v_paid
    from public.payment_logs where obligation_id = o.id;

  if o.billing_cycle = 'one_time'
     or (o.type = 'debt' and o.total_amount is not null and v_paid >= o.total_amount) then
    update public.obligations set status = 'paid_off' where id = o.id;
  else
    update public.obligations
       set next_due_date = public.advance_due(o.next_due_date, o.billing_cycle)
     where id = o.id;
  end if;

  return v_log;
end $$;

-- ---------- ROW LEVEL SECURITY ----------
alter table public.obligations     enable row level security;
alter table public.payment_logs    enable row level security;
alter table public.lent_money      enable row level security;
alter table public.lent_repayments enable row level security;

-- obligations
drop policy if exists "own_obligations" on public.obligations;
create policy "own_obligations" on public.obligations
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- payment_logs (si referencia una obligación, debe ser del mismo usuario)
drop policy if exists "own_payment_logs" on public.payment_logs;
create policy "own_payment_logs" on public.payment_logs
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (obligation_id is null or exists (
      select 1 from public.obligations o where o.id = obligation_id and o.user_id = auth.uid()))
  );

-- lent_money
drop policy if exists "own_lent_money" on public.lent_money;
create policy "own_lent_money" on public.lent_money
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- lent_repayments
drop policy if exists "own_lent_repayments" on public.lent_repayments;
create policy "own_lent_repayments" on public.lent_repayments
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.lent_money m where m.id = lent_id and m.user_id = auth.uid())
  );

-- Permisos explícitos (los anónimos no tocan nada)
revoke all on public.obligations, public.payment_logs, public.lent_money, public.lent_repayments from anon;
grant select, insert, update, delete on public.obligations, public.payment_logs,
      public.lent_money, public.lent_repayments to authenticated;
grant execute on function public.register_payment(uuid, numeric, text, timestamptz, text) to authenticated;
