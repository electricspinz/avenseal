alter table florida_ron_session_assistant_sessions drop constraint if exists florida_ron_session_assistant_sessions_state_check;
alter table florida_ron_session_assistant_sessions add constraint florida_ron_session_assistant_sessions_state_check check (state in ('prepared','in_progress','final_review','completed','stopped','preview_completed'));
alter table florida_ron_session_assistant_sessions drop constraint if exists florida_ron_session_assistant_sessions_outcome_check;
alter table florida_ron_session_assistant_sessions add constraint florida_ron_session_assistant_sessions_outcome_check check (outcome in ('completed','stopped','preview_completed'));

create or replace function prevent_candidate_florida_ron_production_execution()
returns trigger language plpgsql as $$
begin
  if old.specification_status = 'candidate' and new.state in ('in_progress', 'completed', 'final_review') then
    raise exception 'Candidate Florida RON attempts cannot enter production ceremony execution';
  end if;
  if old.state in ('stopped', 'preview_completed') and new.state is distinct from old.state then
    raise exception 'Terminal Florida RON attempts cannot transition';
  end if;
  return new;
end;
$$;
drop trigger if exists florida_ron_session_assistant_candidate_execution_guard on florida_ron_session_assistant_sessions;
create trigger florida_ron_session_assistant_candidate_execution_guard before update on florida_ron_session_assistant_sessions for each row execute function prevent_candidate_florida_ron_production_execution();
