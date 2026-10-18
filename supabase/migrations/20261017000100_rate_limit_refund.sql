-- Give back counts a job could not use (an AI Studio job that failed returns its credits).

create or replace function public.rate_limit_refund(p_key text, p_amount integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_key is null or length(p_key) > 128 or p_amount < 1 then
    raise exception 'invalid rate limit arguments';
  end if;
  update private.rate_limits set count = greatest(0, count - p_amount) where key = p_key;
end;
$$;

revoke all on function public.rate_limit_refund(text, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_refund(text, integer) to service_role;
