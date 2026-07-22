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
  'florida_remote_online_notarial_act',
  'Remote Online Notarial Act',
  'One Florida remote online notarial act. No separate technology fee, coordination fee, same-day surcharge, after-hours surcharge, or weekend surcharge.',
  2500,
  'usd',
  30,
  true,
  1,
  'remote'
)
on conflict (organization_id, internal_name) do update
set
  customer_name = excluded.customer_name,
  description = excluded.description,
  base_price_cents = excluded.base_price_cents,
  currency = excluded.currency,
  default_duration_minutes = excluded.default_duration_minutes,
  is_active = excluded.is_active,
  display_order = excluded.display_order,
  delivery_type = excluded.delivery_type,
  updated_at = now();

update organization_services
set is_active = false, updated_at = now()
where organization_id = '00000000-0000-4000-8000-000000000001'
  and internal_name = 'remote_online_notarization';

insert into appointment_rule_settings (
  organization_id,
  default_duration_minutes,
  same_day_enabled,
  automatic_approval_enabled,
  same_day_payment_window_minutes,
  future_payment_window_minutes,
  complimentary_reschedule_count,
  reschedule_notice_minutes,
  late_cancellation_cutoff_minutes,
  late_cancellation_retained_cents,
  no_show_grace_minutes
)
values (
  '00000000-0000-4000-8000-000000000001',
  30,
  true,
  false,
  30,
  720,
  1,
  120,
  120,
  1500,
  10
)
on conflict (organization_id) do update
set
  default_duration_minutes = excluded.default_duration_minutes,
  same_day_enabled = excluded.same_day_enabled,
  automatic_approval_enabled = excluded.automatic_approval_enabled,
  same_day_payment_window_minutes = excluded.same_day_payment_window_minutes,
  future_payment_window_minutes = excluded.future_payment_window_minutes,
  complimentary_reschedule_count = excluded.complimentary_reschedule_count,
  reschedule_notice_minutes = excluded.reschedule_notice_minutes,
  late_cancellation_cutoff_minutes = excluded.late_cancellation_cutoff_minutes,
  late_cancellation_retained_cents = excluded.late_cancellation_retained_cents,
  no_show_grace_minutes = excluded.no_show_grace_minutes,
  updated_at = now();

insert into organization_integrations (organization_id, provider, status, account_label)
values
  ('00000000-0000-4000-8000-000000000001', 'google_calendar', 'disconnected', null),
  ('00000000-0000-4000-8000-000000000001', 'stripe', 'test_mode', 'Stripe test mode'),
  ('00000000-0000-4000-8000-000000000001', 'gmail_smtp', 'disconnected', 'Gmail SMTP')
on conflict (organization_id, provider) do update
set
  status = excluded.status,
  account_label = excluded.account_label,
  updated_at = now();
