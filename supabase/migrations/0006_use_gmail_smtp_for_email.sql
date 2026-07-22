alter table communication_messages
  alter column provider set default 'gmail_smtp';

update organization_integrations
set provider = 'gmail_smtp',
    status = 'disconnected',
    account_label = 'Gmail SMTP',
    updated_at = now()
where provider = 'resend';

update communication_messages
set provider = 'gmail_smtp'
where provider = 'resend';
