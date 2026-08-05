-- The application invokes this security-definer function through the server-only
-- Supabase service-role client. Keep it unavailable to public browser roles.
grant execute on function public.consume_rate_limit(text, text, integer, integer) to service_role;
