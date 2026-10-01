-- P1-2 (docs/PRODUCT_ROADMAP.md): purchases paid in installments (תשלומים).
--
-- A fridge for ₪3,600 in 12 payments is charged ₪300 a month, but it was recorded as ₪3,600 in
-- one month: that month's budget burst and the next eleven never showed the real cost. Apple
-- Pay reports the full amount too, so most of these arrive whole and need splitting afterwards.
--
-- create_installments(transaction, count) splits an existing expense, all or nothing:
-- - the expense becomes payment 1: the total minus (count - 1) equal shares, so any agorot left
--   over go to the first payment and the payments always add up to the total exactly
-- - payments 2..count come from the recurring engine: a fixed monthly rule on the purchase's day
--   of month, from the next month, ending after the last payment. Each month posts on its own
--   day (31 clamps to short months), a missed run catches up, and a closed month gets its late
--   adjustment, all as for any recurring rule. Nothing is written into the future.
-- - splitting an older purchase posts the months already due at once (run_recurring), so the
--   total is right immediately rather than after the next nightly run.
-- recurring_rules gains installment_count and installment_first (payment 1's date), which is
-- how payment k of n is known: months from installment_first to its recurring_period, plus one.
-- search_transactions reports {"no", "count"} for each installment.

alter table public.recurring_rules
  add column installment_count smallint check (installment_count between 2 and 36),
  add column installment_first date,
  add constraint installment_pair check ((installment_count is null) = (installment_first is null));

create function public.create_installments(p_transaction_id uuid, p_count int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_household uuid := app.require_household();
  t public.transactions;
  v_tz text;
  v_first date;
  v_share bigint;
  v_first_amount bigint;
  v_start date;
  v_end date;
  v_rule uuid;
begin
  if p_count is null or p_count < 2 or p_count > 36 then
    raise exception 'installments must be between 2 and 36' using errcode = '22023';
  end if;

  select * into t from public.transactions x
  where x.id = p_transaction_id and x.household_id = v_household and x.deleted_at is null
  for update;
  if not found then
    raise exception 'unknown expense' using errcode = 'P0002';
  end if;
  if t.amount_minor <= 0 then
    raise exception 'a refund cannot be split into installments' using errcode = '22023';
  end if;
  if t.source = 'recurring' or t.recurring_rule_id is not null then
    raise exception 'this expense is already part of a recurring payment' using errcode = '22023';
  end if;
  if t.amount_minor < p_count then
    raise exception 'the amount is too small for that many payments' using errcode = '22023';
  end if;

  perform set_config('app.actor_type', 'user', true);
  v_tz := (select h.timezone from public.households h where h.id = v_household);
  v_first := (t.occurred_at at time zone v_tz)::date;
  v_share := t.amount_minor / p_count;
  v_first_amount := t.amount_minor - v_share * (p_count - 1);
  v_start := app.next_occurrence(v_first, 1, extract(day from v_first)::int);
  v_end := app.clamp_day((date_trunc('month', v_first) + make_interval(months => p_count - 1))::date,
                         extract(day from v_first)::int);

  insert into public.recurring_rules (household_id, title, merchant_id, category_id, amount_minor, currency,
                                      amount_kind, interval_months, day_of_month, start_date, end_date,
                                      next_run_date, created_by, installment_count, installment_first)
  values (v_household, left(t.title, 60), t.merchant_id, t.category_id, v_share, t.currency,
          'fixed', 1, extract(day from v_first)::int, v_start, v_end,
          v_start, auth.uid(), p_count, v_first)
  returning id into v_rule;

  update public.transactions
  set amount_minor = v_first_amount, recurring_rule_id = v_rule, recurring_period = v_first
  where id = t.id;

  -- months already due (an older purchase) are posted now
  perform app.run_recurring(v_household, app.local_today(v_household));

  return jsonb_build_object('rule_id', v_rule, 'count', p_count, 'first_minor', v_first_amount,
                            'share_minor', v_share, 'ends', v_end);
end $$;

revoke execute on function public.create_installments(uuid, int) from public, anon;
grant execute on function public.create_installments(uuid, int) to authenticated;

-- search_transactions (migration 29) also says which payment of how many each row is.
create or replace function public.search_transactions(
  p_query text default null,
  p_category uuid default null,
  p_before_at timestamptz default null,
  p_before_id uuid default null,
  p_limit int default 50,
  p_month date default null
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_household uuid := app.require_household();
  v_text text := nullif(btrim(p_query), '');
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_result jsonb;
begin
  execute format($sql$
    select coalesce(jsonb_agg(to_jsonb(p) order by p.occurred_at desc, p.id desc), '[]'::jsonb)
    from (
      select t.id, t.title, t.raw_merchant, t.amount_minor, t.currency, t.amount_base_minor, t.fx_rate, t.fx_source,
             t.occurred_at, t.budget_month, t.status, t.source, t.category_id, t.note, t.card_label, t.created_by,
             t.recurring_rule_id, t.classification,
             jsonb_build_object('name', c.name, 'sf_symbol', c.sf_symbol) as categories,
             case when r.installment_count is not null and t.recurring_period is not null then
               jsonb_build_object(
                 'no', (extract(year from t.recurring_period) * 12 + extract(month from t.recurring_period))
                     - (extract(year from r.installment_first) * 12 + extract(month from r.installment_first)) + 1,
                 'count', r.installment_count)
             end as installment
      from public.transactions t
      join public.categories c on c.id = t.category_id and c.household_id = $1
      left join public.recurring_rules r on r.id = t.recurring_rule_id and r.household_id = $1
      where t.household_id = $1 and t.deleted_at is null
        %s %s %s %s
      order by t.occurred_at desc, t.id desc
      limit $6
    ) p $sql$,
    case when p_category is not null then 'and t.category_id = $2' else '' end,
    case when v_text is not null then 'and (t.title ilike $3 or t.raw_merchant ilike $3)' else '' end,
    case when p_before_at is not null then 'and (t.occurred_at, t.id) < ($4, $5)' else '' end,
    case when p_month is not null then 'and t.budget_month = $7' else '' end)
  into v_result
  using v_household, p_category,
        '%' || replace(replace(replace(coalesce(v_text, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%',
        p_before_at, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid), v_limit,
        date_trunc('month', p_month)::date;
  return v_result;
end $$;
