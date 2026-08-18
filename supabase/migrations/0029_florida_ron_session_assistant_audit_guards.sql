create or replace function prevent_florida_ron_session_assistant_event_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Florida RON session assistant audit events are append-only';
end;
$$;

drop trigger if exists florida_ron_session_assistant_events_append_only on florida_ron_session_assistant_events;
create trigger florida_ron_session_assistant_events_append_only
before update or delete on florida_ron_session_assistant_events
for each row execute function prevent_florida_ron_session_assistant_event_mutation();

create or replace function prevent_nonprepared_florida_ron_session_assistant_parameter_updates()
returns trigger
language plpgsql
as $$
begin
  if old.state <> 'prepared'
    and (new.parameters is distinct from old.parameters
      or new.module_versions is distinct from old.module_versions
      or new.stop_reason is distinct from old.stop_reason) then
    raise exception 'Only prepared Florida RON session assistant attempts may be edited';
  end if;
  return new;
end;
$$;

drop trigger if exists florida_ron_session_assistant_prepared_only_updates on florida_ron_session_assistant_sessions;
create trigger florida_ron_session_assistant_prepared_only_updates
before update on florida_ron_session_assistant_sessions
for each row execute function prevent_nonprepared_florida_ron_session_assistant_parameter_updates();
