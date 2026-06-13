-- Create a pre-verified admin user for testing
insert into auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  invited_at,
  confirmation_token,
  confirmation_sent_at,
  recovery_token,
  recovery_sent_at,
  email_change_token_new,
  email_change,
  email_change_sent_at,
  last_sign_in_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  created_at,
  updated_at,
  phone,
  phone_confirmed_at,
  phone_change,
  phone_change_token,
  phone_change_sent_at,
  email_change_token_current,
  email_change_confirm_status,
  banned_until,
  reauthentication_token,
  reauthentication_sent_at,
  is_sso_user,
  deleted_at
) values (
  'd8d0c75c-5f85-48b9-a9a3-5c8208271be5',
  '00000000-0000-0000-0000-000000000000',
  'testuser_admin@arab-rial.com',
  '$2a$10$C8Y.3w8RbeZ0u7sYwXGzI.0rOshFm3i7sB8i3n7zN5f.o9Q3P4G4O', -- Password123!
  now(),
  null,
  '',
  null,
  '',
  null,
  '',
  '',
  null,
  now(),
  '{"provider": "email", "providers": ["email"]}'::jsonb,
  '{"full_name": "Test Admin User", "phone": "+96899999999"}'::jsonb,
  false,
  now(),
  now(),
  null,
  null,
  '',
  '',
  null,
  '',
  0,
  null,
  '',
  null,
  false,
  null
) on conflict (id) do nothing;

-- Update the user profile to be admin and verified
update public.profiles
set role = 'admin',
    verification_status = 'verified'
where email = 'testuser_admin@arab-rial.com';

-- Ensure user's wallet is funded with some OMR and USDT for exchange test
update public.wallets
set arbr_balance = 10000,
    usdt_balance = 5000,
    updated_at = now()
where user_id = 'd8d0c75c-5f85-48b9-a9a3-5c8208271be5';
