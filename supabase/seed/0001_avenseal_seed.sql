insert into organizations (id, name, slug)
values ('00000000-0000-4000-8000-000000000001', 'Avenseal', 'avenseal')
on conflict (id) do nothing;

insert into business_settings (
  organization_id,
  business_name,
  support_email,
  support_phone,
  pricing_headline,
  pricing_note,
  privacy_policy_version,
  terms_version,
  timezone
)
values (
  '00000000-0000-4000-8000-000000000001',
  'Avenseal LLC',
  'hello@avenseal.com',
  '(407) 555-0100',
  'Clear pricing shown before your appointment is confirmed.',
  'Pricing content is awaiting business approval.',
  'legal-review-placeholder-2026-07',
  'legal-review-placeholder-2026-07',
  'America/New_York'
)
on conflict (organization_id) do nothing;

insert into availability_rules (organization_id, weekday, start_time, end_time, slot_minutes)
values
  ('00000000-0000-4000-8000-000000000001', 1, '09:00', '17:00', 30),
  ('00000000-0000-4000-8000-000000000001', 2, '09:00', '17:00', 30),
  ('00000000-0000-4000-8000-000000000001', 3, '09:00', '17:00', 30),
  ('00000000-0000-4000-8000-000000000001', 4, '09:00', '17:00', 30),
  ('00000000-0000-4000-8000-000000000001', 5, '09:00', '17:00', 30);

