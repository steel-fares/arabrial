-- Update test user admin KYC status to approved to pass is_verified_account checks
update public.profiles
set kyc_status = 'approved',
    verification_status = 'verified'
where email = 'testuser_admin@arab-rial.com';
