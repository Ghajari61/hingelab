-- Phase 4: Free-plan limits enforced in the database, so they hold for every client.
-- Keep the numbers and feature lists in sync with lib/plans.ts.

create function public.enforce_plan_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  user_plan text;
  n int;
begin
  select plan into user_plan from public.profiles where id = new.user_id;
  if coalesce(user_plan, 'free') = 'pro' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    select count(*) into n from public.projects where user_id = new.user_id;
    if n >= 3 then
      raise exception using errcode = 'P0001',
        message = 'The Free plan keeps up to 3 cloud projects. Upgrade to Pro for unlimited projects, or delete one.';
    end if;
  end if;

  if new.product = 'hinge-box'
     and (tg_op = 'INSERT' or new.params is distinct from old.params)
     and (coalesce(new.params ->> 'shape', 'rect') <> 'rect'
          or coalesce(new.params ->> 'pattern', 'straight') <> 'straight') then
    raise exception using errcode = 'P0001',
      message = 'Pill, polygon and cylinder boxes and the wave, relief and serpentine patterns are Pro features.';
  end if;

  if new.product = 'parametric' then
    raise exception using errcode = 'P0001', message = 'Parametric projects are a Pro feature.';
  end if;

  return new;
end;
$$;

create trigger projects_plan_limits
  before insert or update on public.projects
  for each row execute function public.enforce_plan_limits();
