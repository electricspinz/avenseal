update organizations
set
  name = 'Avenseal',
  display_name = 'Avenseal',
  legal_name = 'Avenseal',
  business_mode = 'solo',
  timezone = 'America/New_York',
  default_delivery_method = 'remote_online_notarization',
  updated_at = now()
where id = '00000000-0000-4000-8000-000000000001';

update business_settings
set
  business_name = 'Avenseal',
  support_email = coalesce(support_email, 'hello@avenseal.com'),
  support_phone = coalesce(support_phone, '(407) 555-0100'),
  website = coalesce(website, 'https://avenseal.com'),
  description = coalesce(description, 'Florida remote online notary appointments with concierge-level booking support.'),
  timezone = 'America/New_York',
  default_delivery_method = 'remote_online_notarization',
  updated_at = now()
where organization_id = '00000000-0000-4000-8000-000000000001';

insert into organization_availability_schedules (organization_id, name, timezone, is_primary)
values ('00000000-0000-4000-8000-000000000001', 'Avenseal primary schedule', 'America/New_York', true)
on conflict (organization_id) do update
set name = excluded.name, timezone = excluded.timezone, is_primary = true, updated_at = now();

delete from organization_availability_intervals
where organization_id = '00000000-0000-4000-8000-000000000001';

insert into organization_availability_intervals (organization_id, schedule_id, weekday, start_time, end_time, display_order)
select
  '00000000-0000-4000-8000-000000000001',
  id,
  weekday,
  '09:30'::time,
  '18:00'::time,
  0
from organization_availability_schedules
cross join (values (1), (2), (3), (4), (5)) as days(weekday)
where organization_id = '00000000-0000-4000-8000-000000000001';

delete from availability_rules
where organization_id = '00000000-0000-4000-8000-000000000001';

insert into availability_rules (organization_id, weekday, start_time, end_time, slot_minutes)
values
  ('00000000-0000-4000-8000-000000000001', 1, '09:30', '18:00', 30),
  ('00000000-0000-4000-8000-000000000001', 2, '09:30', '18:00', 30),
  ('00000000-0000-4000-8000-000000000001', 3, '09:30', '18:00', 30),
  ('00000000-0000-4000-8000-000000000001', 4, '09:30', '18:00', 30),
  ('00000000-0000-4000-8000-000000000001', 5, '09:30', '18:00', 30);

insert into appointment_rule_settings (
  organization_id,
  default_duration_minutes,
  same_day_enabled,
  automatic_approval_enabled
)
values ('00000000-0000-4000-8000-000000000001', 30, true, false)
on conflict (organization_id) do update
set
  default_duration_minutes = excluded.default_duration_minutes,
  same_day_enabled = excluded.same_day_enabled,
  automatic_approval_enabled = excluded.automatic_approval_enabled,
  updated_at = now();

insert into organization_services (
  organization_id,
  internal_name,
  customer_name,
  description,
  base_price_cents,
  currency,
  default_duration_minutes,
  is_active,
  display_order,
  delivery_type
)
values (
  '00000000-0000-4000-8000-000000000001',
  'remote_online_notarization',
  'Remote online notarization appointment',
  'Pricing is configurable and should be finalized before public launch.',
  null,
  'USD',
  30,
  true,
  1,
  'remote'
)
on conflict (organization_id, internal_name) do update
set
  customer_name = excluded.customer_name,
  description = excluded.description,
  default_duration_minutes = excluded.default_duration_minutes,
  is_active = excluded.is_active,
  display_order = excluded.display_order,
  delivery_type = excluded.delivery_type,
  updated_at = now();

insert into communication_settings (
  organization_id,
  sender_name,
  reply_to_email,
  support_phone,
  email_reminders_enabled,
  sms_reminders_enabled,
  review_requests_enabled,
  confirmation_messaging_enabled
)
values (
  '00000000-0000-4000-8000-000000000001',
  'Avenseal',
  'hello@avenseal.com',
  '(407) 555-0100',
  false,
  false,
  false,
  false
)
on conflict (organization_id) do update
set
  sender_name = excluded.sender_name,
  reply_to_email = excluded.reply_to_email,
  support_phone = excluded.support_phone,
  updated_at = now();

insert into ai_concierge_settings (
  organization_id,
  concierge_enabled,
  display_name,
  tone_preset,
  human_support_destination,
  booking_assistance_enabled,
  faq_assistance_enabled
)
values (
  '00000000-0000-4000-8000-000000000001',
  true,
  'Ava',
  'professional_and_warm',
  'hello@avenseal.com',
  true,
  true
)
on conflict (organization_id) do update
set
  concierge_enabled = excluded.concierge_enabled,
  display_name = excluded.display_name,
  tone_preset = excluded.tone_preset,
  human_support_destination = excluded.human_support_destination,
  booking_assistance_enabled = excluded.booking_assistance_enabled,
  faq_assistance_enabled = excluded.faq_assistance_enabled,
  updated_at = now();
