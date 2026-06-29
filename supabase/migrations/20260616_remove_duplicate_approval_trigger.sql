-- Remove legacy trigger and trigger function causing duplicate wallet crediting on purchase request approvals
drop trigger if exists on_purchase_request_approved on public.purchase_requests;
drop function if exists public.handle_purchase_request_approval();
