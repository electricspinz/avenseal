# Database Proposal

## Principles

- UUID primary keys.
- `created_at` and `updated_at` on all mutable records.
- `organization_id` on every business-owned record.
- Foreign keys for ownership and relationships.
- Typed enums or equivalent check constraints for status and categories.
- RLS enabled on all business-owned tables.
- Public submission path creates only the minimum required records.
- Admin changes are audited.

## Enums

Appointment status:

- `awaiting_review`
- `awaiting_payment`
- `confirmed`
- `ready`
- `completed`
- `cancelled`
- `declined`
- `follow_up_required`

Document category:

- `affidavit`
- `power_of_attorney`
- `estate_planning`
- `business_document`
- `consent_or_authorization`
- `real_estate_related`
- `school_or_travel`
- `other`
- `not_sure`

Urgency:

- `same_day`
- `next_available`
- `specific_date`
- `not_urgent`

## Core Tables

`organizations`

- `id uuid primary key`
- `name text not null`
- `slug text unique not null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

`user_profiles`

- `id uuid primary key references auth.users(id)`
- `full_name text`
- `email text`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

`organization_users`

- `id uuid primary key`
- `organization_id uuid references organizations(id)`
- `user_id uuid references user_profiles(id)`
- `role text check role in ('owner', 'admin', 'staff')`
- `created_at timestamptz not null`
- unique organization/user pair

`customers`

- `id uuid primary key`
- `organization_id uuid references organizations(id)`
- `full_name text not null`
- `email text not null`
- `mobile_phone text not null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`
- indexes on organization, email, phone

`appointment_requests`

- `id uuid primary key`
- `organization_id uuid references organizations(id)`
- `customer_id uuid references customers(id)`
- `status appointment_status not null default 'awaiting_review'`
- `document_category document_category not null`
- `document_count integer not null`
- `signer_count integer not null`
- `estimated_notarizations integer`
- `notarizations_not_sure boolean not null default false`
- `has_witness_lines boolean`
- `witnesses_available boolean`
- `signer_location text not null`
- `all_signers_have_government_id boolean not null`
- `preferred_date date not null`
- `preferred_time time not null`
- `urgency urgency not null`
- `administrative_notes text`
- `reviewed_at timestamptz`
- `confirmed_at timestamptz`
- `completed_at timestamptz`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`
- indexes on organization/status/date/customer

`appointment_signers`

- `id uuid primary key`
- `organization_id uuid references organizations(id)`
- `appointment_request_id uuid references appointment_requests(id)`
- `position integer not null`
- `current_location text`
- `has_government_id boolean`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

`appointment_documents`

- `id uuid primary key`
- `organization_id uuid references organizations(id)`
- `appointment_request_id uuid references appointment_requests(id)`
- `category document_category not null`
- `document_count integer not null`
- `notes text`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

`availability_rules`

- `id uuid primary key`
- `organization_id uuid references organizations(id)`
- `weekday smallint not null check weekday between 0 and 6`
- `start_time time not null`
- `end_time time not null`
- `slot_minutes integer not null default 30`
- `is_active boolean not null default true`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

`availability_exceptions`

- `id uuid primary key`
- `organization_id uuid references organizations(id)`
- `exception_date date not null`
- `start_time time`
- `end_time time`
- `is_available boolean not null`
- `reason text`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

`internal_notes`

- `id uuid primary key`
- `organization_id uuid references organizations(id)`
- `appointment_request_id uuid references appointment_requests(id)`
- `customer_id uuid references customers(id)`
- `author_user_id uuid references user_profiles(id)`
- `body text not null`
- `created_at timestamptz not null`

`status_history`

- `id uuid primary key`
- `organization_id uuid references organizations(id)`
- `appointment_request_id uuid references appointment_requests(id)`
- `from_status appointment_status`
- `to_status appointment_status not null`
- `changed_by_user_id uuid references user_profiles(id)`
- `reason text`
- `created_at timestamptz not null`

`consent_records`

- `id uuid primary key`
- `organization_id uuid references organizations(id)`
- `appointment_request_id uuid references appointment_requests(id)`
- `customer_id uuid references customers(id)`
- `privacy_policy_version text not null`
- `terms_version text not null`
- `consented_at timestamptz not null`
- `ip_hash text`
- `user_agent text`
- `created_at timestamptz not null`

`communication_records`

- `id uuid primary key`
- `organization_id uuid references organizations(id)`
- `appointment_request_id uuid references appointment_requests(id)`
- `customer_id uuid references customers(id)`
- `channel text not null check channel in ('manual_email', 'manual_phone', 'manual_sms', 'system_placeholder')`
- `direction text not null check direction in ('inbound', 'outbound', 'internal')`
- `summary text not null`
- `created_by_user_id uuid references user_profiles(id)`
- `created_at timestamptz not null`

`audit_logs`

- `id uuid primary key`
- `organization_id uuid references organizations(id)`
- `actor_user_id uuid references user_profiles(id)`
- `action text not null`
- `entity_type text not null`
- `entity_id uuid not null`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null`

`business_settings`

- `id uuid primary key`
- `organization_id uuid references organizations(id) unique`
- `business_name text not null`
- `support_email text`
- `support_phone text`
- `privacy_policy_version text not null`
- `terms_version text not null`
- `timezone text not null default 'America/New_York'`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

## Seed Data

- Organization: Avenseal, slug `avenseal`.
- Business settings with legal-review placeholder policy versions.
- Sample weekday availability rules.
- Optional demo admin user instructions, but no hard-coded production credentials.

## RLS Strategy

- Organization users can read records for organizations where they are members.
- Organization users can mutate records according to role.
- Public anonymous users cannot read business records.
- Public appointment creation should use a tightly scoped server-side function or route using the service role, not broad anonymous table policies.
- Audit logs are append-only for application code and read-only for admins.

