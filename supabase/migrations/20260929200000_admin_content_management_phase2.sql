-- ============================================================================
-- Migration: 20260929200000_admin_content_management_phase2.sql
-- Description: Admin Content Management Phase 2
--   1. Rooms extension: room_number (TEXT), floor_number (INTEGER) + deterministic backfill
--   2. Room Media table: public.room_media with IMAGE/VIDEO, sorting, cover selection
--   3. Room Private Details extension: door_access_code (TEXT NULL) for private door codes
--   4. Booking Access Credentials creation: idempotently created in finalize_verified_checkout_atomic
--   5. Admin Audit Logs table: public.admin_audit_logs (no secrets logged)
--   6. Storage Buckets: room-media & menu-media with public read and admin-only write/delete
--   7. Admin RPCs: trusted management of rooms, media, room access, and menu products
-- Security: SECURITY DEFINER, SET search_path = '', strict role enforcement (role = 'admin')
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Rooms Extension: room_number & floor_number
-- ----------------------------------------------------------------------------
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS room_number TEXT,
  ADD COLUMN IF NOT EXISTS floor_number INTEGER;

-- Deterministic backfill for existing legacy demo rooms
UPDATE public.rooms
SET
  room_number = COALESCE(
    substring(name from '[A-Z]+-(\d+)'),
    substring(id::text from 33 for 4)
  ),
  floor_number = COALESCE(
    (substring(substring(name from '[A-Z]+-(\d+)') from 1 for 1))::integer,
    1
  )
WHERE room_number IS NULL;

-- ----------------------------------------------------------------------------
-- 2. Room Media Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.room_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL CHECK (media_type IN ('IMAGE', 'VIDEO')),
  storage_path TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_cover BOOLEAN NOT NULL DEFAULT false,
  alt_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_room_media_room_sort ON public.room_media (room_id, sort_order ASC);
CREATE INDEX IF NOT EXISTS idx_room_media_room_cover ON public.room_media (room_id, is_cover);

ALTER TABLE public.room_media ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.room_media FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.room_media TO anon, authenticated, service_role;
GRANT ALL ON public.room_media TO service_role;

DROP POLICY IF EXISTS "Public can view room media" ON public.room_media;
CREATE POLICY "Public can view room media"
  ON public.room_media
  FOR SELECT
  USING (true);

-- Migrate existing image_paths into room_media IMAGE rows safely
INSERT INTO public.room_media (room_id, media_type, storage_path, sort_order, is_cover, alt_text)
SELECT
  r.id,
  'IMAGE',
  img_elem.val,
  (img_elem.idx - 1)::INT,
  (img_elem.idx = 1),
  r.name
FROM public.rooms r
CROSS JOIN LATERAL unnest(r.image_paths) WITH ORDINALITY AS img_elem(val, idx)
WHERE NOT EXISTS (
  SELECT 1 FROM public.room_media rm WHERE rm.room_id = r.id
)
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3. Room Private Details Extension: door_access_code
-- ----------------------------------------------------------------------------
ALTER TABLE public.room_private_details
  ADD COLUMN IF NOT EXISTS door_access_code TEXT NULL;

-- ----------------------------------------------------------------------------
-- 4. Admin Audit Logs
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at ON public.admin_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_entity ON public.admin_audit_logs (entity_type, entity_id);

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_audit_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.admin_audit_logs TO authenticated, service_role;

DROP POLICY IF EXISTS "Admin view audit logs" ON public.admin_audit_logs;
CREATE POLICY "Admin view audit logs"
  ON public.admin_audit_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admin insert audit logs" ON public.admin_audit_logs;
CREATE POLICY "Admin insert audit logs"
  ON public.admin_audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.staff_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- ----------------------------------------------------------------------------
-- 5. Storage Buckets & Policies
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('room-media', 'room-media', true),
       ('menu-media', 'menu-media', true)
ON CONFLICT (id) DO NOTHING;

-- storage.objects public read policies
DROP POLICY IF EXISTS "Public read room-media" ON storage.objects;
CREATE POLICY "Public read room-media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'room-media');

DROP POLICY IF EXISTS "Public read menu-media" ON storage.objects;
CREATE POLICY "Public read menu-media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'menu-media');

-- storage.objects admin write/delete policies
DROP POLICY IF EXISTS "Admin insert room-media" ON storage.objects;
CREATE POLICY "Admin insert room-media"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'room-media'
    AND EXISTS (
      SELECT 1 FROM public.staff_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admin update room-media" ON storage.objects;
CREATE POLICY "Admin update room-media"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'room-media'
    AND EXISTS (
      SELECT 1 FROM public.staff_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admin delete room-media" ON storage.objects;
CREATE POLICY "Admin delete room-media"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'room-media'
    AND EXISTS (
      SELECT 1 FROM public.staff_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admin insert menu-media" ON storage.objects;
CREATE POLICY "Admin insert menu-media"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'menu-media'
    AND EXISTS (
      SELECT 1 FROM public.staff_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admin update menu-media" ON storage.objects;
CREATE POLICY "Admin update menu-media"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'menu-media'
    AND EXISTS (
      SELECT 1 FROM public.staff_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admin delete menu-media" ON storage.objects;
CREATE POLICY "Admin delete menu-media"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'menu-media'
    AND EXISTS (
      SELECT 1 FROM public.staff_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- ----------------------------------------------------------------------------
-- 6. Upgrade finalize_verified_checkout_atomic to generate Booking Access Credential
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalize_verified_checkout_atomic(
  p_checkout_session_id UUID,
  p_verified_paid_amount_vnd BIGINT,
  p_verified_payment_reference TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session RECORD;
  v_booking_id UUID;
  v_existing_booking_id UUID;
  v_points_earned NUMERIC := 0;
  v_redemption_id UUID;
  v_redemption_expires_at TIMESTAMPTZ;
  v_redemption_discount BIGINT;
  v_voucher_is_active BOOLEAN;
  v_voucher_type TEXT;
  v_discount_percentage NUMERIC;
  v_max_eligible_base_vnd BIGINT;
  v_ent_discount_rec RECORD;
  v_expected_final_payable BIGINT;
  v_door_code TEXT;
  v_private_instructions TEXT;
  v_stay_start TIMESTAMPTZ;
  v_stay_end TIMESTAMPTZ;
BEGIN
  -- 1. Lock and retrieve checkout session
  SELECT *
  INTO v_session
  FROM public.checkout_sessions
  WHERE id = p_checkout_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'CHECKOUT_SESSION_NOT_FOUND');
  END IF;

  -- 2. Idempotency: if already completed, return existing booking
  IF v_session.status = 'COMPLETED' THEN
    SELECT id INTO v_existing_booking_id
    FROM public.bookings
    WHERE checkout_session_id = v_session.id;

    RETURN jsonb_build_object(
      'success', true,
      'idempotent', true,
      'booking_id', v_existing_booking_id
    );
  END IF;

  -- 3. Verify status allows finalization
  IF v_session.status <> 'CONFIRMED' THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_CHECKOUT_STATUS');
  END IF;

  -- 4. Verify payment reference matches canonical reference exactly
  IF v_session.payment_reference <> p_verified_payment_reference THEN
    RETURN jsonb_build_object('success', false, 'error', 'PAYMENT_REFERENCE_MISMATCH');
  END IF;

  -- 5. Check session expiration
  IF v_session.expires_at <= clock_timestamp() THEN
    RETURN jsonb_build_object('success', false, 'error', 'CHECKOUT_SESSION_EXPIRED');
  END IF;

  -- 6. Total Price Rule check
  v_expected_final_payable := (v_session.gross_amount_vnd - v_session.discount_amount_vnd) + COALESCE(v_session.menu_amount_vnd, 0);
  IF p_verified_paid_amount_vnd <> v_expected_final_payable
     OR v_session.final_payable_amount_vnd <> v_expected_final_payable THEN
    RETURN jsonb_build_object('success', false, 'error', 'AMOUNT_MISMATCH');
  END IF;

  -- 7. Double booking prevention lock
  IF v_session.check_in_at IS NOT NULL AND v_session.check_out_at IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.room_id = v_session.room_id
        AND LOWER(b.booking_status) IN ('confirmed', 'completed')
        AND (
          (b.check_in_at IS NOT NULL AND b.check_out_at IS NOT NULL
           AND b.check_in_at < v_session.check_out_at AND b.check_out_at > v_session.check_in_at)
          OR
          (b.check_in_at IS NULL
           AND b.check_in < (v_session.check_out_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
           AND b.check_out > (v_session.check_in_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)
        )
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'ROOM_NOT_AVAILABLE');
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.room_availability_blocks rab
      WHERE rab.room_id = v_session.room_id
        AND rab.starts_at < v_session.check_out_at
        AND rab.ends_at > v_session.check_in_at
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'ROOM_NOT_AVAILABLE');
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.room_id = v_session.room_id
        AND LOWER(b.booking_status) IN ('confirmed', 'completed')
        AND b.check_in < v_session.check_out
        AND b.check_out > v_session.check_in
    ) THEN
      RETURN jsonb_build_object('success', false, 'error', 'ROOM_NOT_AVAILABLE');
    END IF;
  END IF;

  -- 8. Validate Discount Voucher / Entitlement state
  IF v_session.discount_amount_vnd > 0 THEN
    SELECT vr.id, vr.expires_at, vr.discount_amount_vnd, v.is_active, v.voucher_type, v.discount_percentage, v.max_eligible_base_vnd
    INTO v_redemption_id, v_redemption_expires_at, v_redemption_discount, v_voucher_is_active, v_voucher_type, v_discount_percentage, v_max_eligible_base_vnd
    FROM public.voucher_redemptions vr
    JOIN public.vouchers v ON v.id = vr.voucher_id
    WHERE vr.checkout_session_id = v_session.id
      AND vr.status = 'RESERVED'
      AND vr.user_id = v_session.user_id
    FOR UPDATE OF vr;

    IF v_redemption_id IS NOT NULL THEN
      IF v_redemption_expires_at <= clock_timestamp()
         OR v_redemption_discount <> v_session.discount_amount_vnd
         OR v_voucher_is_active IS NOT TRUE
         OR v_voucher_type <> 'percentage_discount'
         OR v_discount_percentage <> 40.00
         OR v_max_eligible_base_vnd <> 1000000 THEN
        RETURN jsonb_build_object('success', false, 'error', 'VOUCHER_STATE_INVALID');
      END IF;
    ELSE
      SELECT ue.id, ue.expires_at, sd.reward_type, sd.discount_percentage, sd.max_discount_vnd, sd.is_active
      INTO v_ent_discount_rec
      FROM public.user_reward_entitlements ue
      JOIN public.streak_reward_definitions sd ON ue.reward_definition_id = sd.id
      WHERE ue.checkout_session_id = v_session.id
        AND ue.status = 'RESERVED'
        AND ue.user_id = v_session.user_id
        AND sd.reward_type IN ('DISCOUNT_30', 'DISCOUNT_40')
      FOR UPDATE OF ue;

      IF v_ent_discount_rec.id IS NULL
         OR v_ent_discount_rec.expires_at <= clock_timestamp()
         OR v_ent_discount_rec.is_active IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'REWARD_ENTITLEMENT_STATE_INVALID');
      END IF;
    END IF;
  END IF;

  -- 9. Create Confirmed Booking record
  INSERT INTO public.bookings (
    checkout_session_id,
    user_id,
    room_id,
    check_in_at,
    check_out_at,
    check_in,
    check_out,
    guest_count,
    gross_amount_vnd,
    discount_amount_vnd,
    menu_amount_vnd,
    final_paid_amount_vnd,
    payment_status,
    booking_status
  ) VALUES (
    v_session.id,
    v_session.user_id,
    v_session.room_id,
    v_session.check_in_at,
    v_session.check_out_at,
    v_session.check_in,
    v_session.check_out,
    v_session.guest_count,
    v_session.gross_amount_vnd,
    v_session.discount_amount_vnd,
    COALESCE(v_session.menu_amount_vnd, 0),
    p_verified_paid_amount_vnd,
    'paid',
    'confirmed'
  )
  RETURNING id INTO v_booking_id;

  -- 10. Persist order items to public.booking_menu_items
  INSERT INTO public.booking_menu_items (
    booking_id,
    menu_product_id,
    product_name_snapshot,
    product_category_snapshot,
    quantity,
    source_type,
    entitlement_id,
    unit_price_vnd,
    total_price_vnd,
    normal_price_vnd,
    reward_source
  )
  SELECT
    v_booking_id,
    cmi.menu_product_id,
    mp.name,
    mp.category,
    cmi.quantity,
    cmi.source_type,
    cmi.entitlement_id,
    cmi.unit_price_vnd,
    cmi.total_price_vnd,
    cmi.normal_price_vnd,
    CASE
      WHEN cmi.source_type = 'REWARD' AND sd.milestone_day IS NOT NULL THEN 'Quà Day ' || sd.milestone_day
      WHEN cmi.source_type = 'REWARD' THEN 'Phần thưởng'
      ELSE NULL
    END
  FROM public.checkout_menu_items cmi
  JOIN public.menu_products mp ON mp.id = cmi.menu_product_id
  LEFT JOIN public.user_reward_entitlements ue ON ue.id = cmi.entitlement_id
  LEFT JOIN public.streak_reward_definitions sd ON sd.id = ue.reward_definition_id
  WHERE cmi.checkout_session_id = v_session.id;

  -- 11. Idempotently generate booking_access_credentials from room_private_details
  SELECT door_access_code, private_instructions
  INTO v_door_code, v_private_instructions
  FROM public.room_private_details
  WHERE room_id = v_session.room_id;

  IF v_session.check_in_at IS NOT NULL AND v_session.check_out_at IS NOT NULL THEN
    v_stay_start := v_session.check_in_at;
    v_stay_end := v_session.check_out_at;
  ELSE
    v_stay_start := (v_session.check_in::text || ' 14:00:00+07')::timestamptz;
    v_stay_end := (v_session.check_out::text || ' 12:00:00+07')::timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.booking_access_credentials WHERE booking_id = v_booking_id
  ) THEN
    INSERT INTO public.booking_access_credentials (
      booking_id,
      room_id,
      credential_type,
      credential_value,
      instructions,
      valid_from,
      valid_until,
      status
    ) VALUES (
      v_booking_id,
      v_session.room_id,
      'pin',
      COALESCE(NULLIF(TRIM(v_door_code), ''), LPAD((floor(random() * 900000) + 100000)::text, 6, '0')),
      COALESCE(NULLIF(TRIM(v_private_instructions), ''), 'Nhập mã trên khóa thông minh sau đó nhấn # để mở cửa.'),
      v_stay_start,
      v_stay_end,
      'active'
    );
  END IF;

  -- 12. Transition reserved voucher / entitlements to USED
  IF v_redemption_id IS NOT NULL THEN
    UPDATE public.voucher_redemptions
    SET status = 'USED',
        booking_id = v_booking_id,
        used_at = clock_timestamp()
    WHERE id = v_redemption_id;
  END IF;

  UPDATE public.user_reward_entitlements
  SET status = 'USED',
      booking_id = v_booking_id,
      used_at = clock_timestamp(),
      updated_at = clock_timestamp()
  WHERE checkout_session_id = v_session.id
    AND status = 'RESERVED';

  -- 13. Append booking_earn to loyalty_transactions ledger (final_paid_amount_vnd * 0.00025)
  v_points_earned := (p_verified_paid_amount_vnd::NUMERIC * 0.00025::NUMERIC);

  IF v_points_earned > 0 THEN
    INSERT INTO public.loyalty_transactions (
      user_id,
      type,
      points_delta,
      booking_id,
      description
    ) VALUES (
      v_session.user_id,
      'booking_earn',
      v_points_earned,
      v_booking_id,
      'Booking earn for confirmed booking ' || v_booking_id::TEXT
    );
  END IF;

  -- 14. Complete checkout session
  UPDATE public.checkout_sessions
  SET status = 'COMPLETED'
  WHERE id = v_session.id;

  RETURN jsonb_build_object(
    'success', true,
    'booking', jsonb_build_object(
      'id', v_booking_id,
      'checkout_session_id', v_session.id,
      'user_id', v_session.user_id,
      'room_id', v_session.room_id,
      'check_in_at', v_session.check_in_at,
      'check_out_at', v_session.check_out_at,
      'check_in', v_session.check_in,
      'check_out', v_session.check_out,
      'guest_count', v_session.guest_count,
      'gross_amount_vnd', v_session.gross_amount_vnd,
      'discount_amount_vnd', v_session.discount_amount_vnd,
      'menu_amount_vnd', COALESCE(v_session.menu_amount_vnd, 0),
      'final_paid_amount_vnd', p_verified_paid_amount_vnd,
      'payment_status', 'paid',
      'booking_status', 'confirmed',
      'loyalty_points_earned', v_points_earned
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_verified_checkout_atomic(UUID, BIGINT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_verified_checkout_atomic(UUID, BIGINT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.finalize_verified_checkout_atomic(UUID, BIGINT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_verified_checkout_atomic(UUID, BIGINT, TEXT) TO service_role;

-- ----------------------------------------------------------------------------
-- 7. Admin RPC: get_admin_rooms
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_admin_rooms(
  p_property_id UUID DEFAULT NULL,
  p_search TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_rooms JSONB;
BEGIN
  -- Strict Admin check
  IF v_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.staff_roles WHERE user_id = v_user_id AND role = 'admin'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN_ADMIN_ONLY');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'name', r.name,
    'property_id', r.property_id,
    'property_name', p.name,
    'property_address', p.address,
    'room_number', r.room_number,
    'floor_number', r.floor_number,
    'hourly_price_vnd', r.hourly_price_vnd,
    'nightly_price_vnd', r.nightly_price_vnd,
    'capacity', r.capacity,
    'is_listed', r.is_listed,
    'operational_status', COALESCE(ro.operational_status, 'ready'),
    'cover_image', (
      SELECT rm.storage_path
      FROM public.room_media rm
      WHERE rm.room_id = r.id AND rm.is_cover = true
      LIMIT 1
    ),
    'media_count', (
      SELECT COUNT(*)
      FROM public.room_media rm
      WHERE rm.room_id = r.id
    )
  ) ORDER BY p.name ASC, COALESCE(r.room_number, r.name) ASC), '[]'::jsonb)
  INTO v_rooms
  FROM public.rooms r
  JOIN public.properties p ON r.property_id = p.id
  LEFT JOIN public.room_operations ro ON r.id = ro.room_id
  WHERE (p_property_id IS NULL OR r.property_id = p_property_id)
    AND (
      p_search IS NULL
      OR p_search = ''
      OR r.name ILIKE '%' || p_search || '%'
      OR r.room_number ILIKE '%' || p_search || '%'
    );

  RETURN jsonb_build_object('success', true, 'rooms', v_rooms);
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_rooms(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_admin_rooms(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_admin_rooms(UUID, TEXT) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 8. Admin RPC: get_admin_room_detail
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_admin_room_detail(p_room_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_room JSONB;
  v_media JSONB;
  v_private JSONB;
BEGIN
  IF v_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.staff_roles WHERE user_id = v_user_id AND role = 'admin'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN_ADMIN_ONLY');
  END IF;

  SELECT jsonb_build_object(
    'id', r.id,
    'name', r.name,
    'property_id', r.property_id,
    'property_name', p.name,
    'property_address', p.address,
    'room_number', r.room_number,
    'floor_number', r.floor_number,
    'hourly_price_vnd', r.hourly_price_vnd,
    'nightly_price_vnd', r.nightly_price_vnd,
    'capacity', r.capacity,
    'description', r.description,
    'amenities', r.amenities,
    'is_listed', r.is_listed,
    'operational_status', COALESCE(ro.operational_status, 'ready')
  )
  INTO v_room
  FROM public.rooms r
  JOIN public.properties p ON r.property_id = p.id
  LEFT JOIN public.room_operations ro ON r.id = ro.room_id
  WHERE r.id = p_room_id;

  IF v_room IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'ROOM_NOT_FOUND');
  END IF;

  -- Room media
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', rm.id,
    'room_id', rm.room_id,
    'media_type', rm.media_type,
    'storage_path', rm.storage_path,
    'sort_order', rm.sort_order,
    'is_cover', rm.is_cover,
    'alt_text', rm.alt_text,
    'created_at', rm.created_at
  ) ORDER BY rm.sort_order ASC, rm.created_at ASC), '[]'::jsonb)
  INTO v_media
  FROM public.room_media rm
  WHERE rm.room_id = p_room_id;

  -- Room private details (Strictly admin-only)
  SELECT jsonb_build_object(
    'door_access_code', rpd.door_access_code,
    'wifi_ssid', rpd.wifi_ssid,
    'wifi_password', rpd.wifi_password,
    'private_instructions', rpd.private_instructions,
    'updated_at', rpd.updated_at
  )
  INTO v_private
  FROM public.room_private_details rpd
  WHERE rpd.room_id = p_room_id;

  RETURN jsonb_build_object(
    'success', true,
    'room', v_room,
    'media', v_media,
    'private_details', COALESCE(v_private, jsonb_build_object(
      'door_access_code', NULL,
      'wifi_ssid', NULL,
      'wifi_password', NULL,
      'private_instructions', NULL
    ))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_room_detail(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_admin_room_detail(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_admin_room_detail(UUID) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 9. Admin RPC: admin_update_room
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_room(
  p_room_id UUID,
  p_name TEXT,
  p_property_id UUID,
  p_room_number TEXT,
  p_floor_number INT,
  p_hourly_price_vnd BIGINT,
  p_nightly_price_vnd BIGINT,
  p_capacity INT,
  p_description TEXT,
  p_amenities TEXT[],
  p_is_listed BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.staff_roles WHERE user_id = v_user_id AND role = 'admin'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN_ADMIN_ONLY');
  END IF;

  -- Validate inputs
  IF TRIM(p_name) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_ROOM_NAME');
  END IF;
  IF TRIM(p_room_number) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_ROOM_NUMBER');
  END IF;
  IF p_floor_number IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_FLOOR_NUMBER');
  END IF;
  IF p_hourly_price_vnd <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_PRICE');
  END IF;
  IF p_capacity <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_CAPACITY');
  END IF;

  -- Property must exist and be active
  IF NOT EXISTS (SELECT 1 FROM public.properties WHERE id = p_property_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'PROPERTY_NOT_FOUND');
  END IF;

  UPDATE public.rooms
  SET
    name = TRIM(p_name),
    property_id = p_property_id,
    room_number = TRIM(p_room_number),
    floor_number = p_floor_number,
    hourly_price_vnd = p_hourly_price_vnd,
    nightly_price_vnd = COALESCE(p_nightly_price_vnd, p_hourly_price_vnd * 5),
    capacity = p_capacity,
    description = p_description,
    amenities = COALESCE(p_amenities, ARRAY[]::TEXT[]),
    is_listed = p_is_listed,
    updated_at = clock_timestamp()
  WHERE id = p_room_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'ROOM_NOT_FOUND');
  END IF;

  -- Log action (safe metadata)
  INSERT INTO public.admin_audit_logs (admin_user_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_user_id,
    'ROOM_UPDATED',
    'room',
    p_room_id::text,
    jsonb_build_object(
      'name', TRIM(p_name),
      'room_number', TRIM(p_room_number),
      'floor_number', p_floor_number,
      'is_listed', p_is_listed
    )
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_room(UUID, TEXT, UUID, TEXT, INT, BIGINT, BIGINT, INT, TEXT, TEXT[], BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_room(UUID, TEXT, UUID, TEXT, INT, BIGINT, BIGINT, INT, TEXT, TEXT[], BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_update_room(UUID, TEXT, UUID, TEXT, INT, BIGINT, BIGINT, INT, TEXT, TEXT[], BOOLEAN) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 10. Admin RPC: admin_update_room_access
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_room_access(
  p_room_id UUID,
  p_door_access_code TEXT,
  p_wifi_ssid TEXT,
  p_wifi_password TEXT,
  p_private_instructions TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.staff_roles WHERE user_id = v_user_id AND role = 'admin'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN_ADMIN_ONLY');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.rooms WHERE id = p_room_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'ROOM_NOT_FOUND');
  END IF;

  INSERT INTO public.room_private_details (
    room_id,
    door_access_code,
    wifi_ssid,
    wifi_password,
    private_instructions,
    updated_at
  ) VALUES (
    p_room_id,
    NULLIF(TRIM(p_door_access_code), ''),
    NULLIF(TRIM(p_wifi_ssid), ''),
    NULLIF(TRIM(p_wifi_password), ''),
    NULLIF(TRIM(p_private_instructions), ''),
    clock_timestamp()
  )
  ON CONFLICT (room_id) DO UPDATE
  SET
    door_access_code = NULLIF(TRIM(p_door_access_code), ''),
    wifi_ssid = NULLIF(TRIM(p_wifi_ssid), ''),
    wifi_password = NULLIF(TRIM(p_wifi_password), ''),
    private_instructions = NULLIF(TRIM(p_private_instructions), ''),
    updated_at = clock_timestamp();

  -- Log action safely: NEVER log raw door code or wifi password
  INSERT INTO public.admin_audit_logs (admin_user_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_user_id,
    'ROOM_ACCESS_UPDATED',
    'room_access',
    p_room_id::text,
    jsonb_build_object(
      'door_access_configured', (NULLIF(TRIM(p_door_access_code), '') IS NOT NULL),
      'wifi_configured', (NULLIF(TRIM(p_wifi_ssid), '') IS NOT NULL)
    )
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_room_access(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_room_access(UUID, TEXT, TEXT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_update_room_access(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 11. Admin Media RPCs: add, delete, set cover, reorder
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_add_room_media(
  p_room_id UUID,
  p_media_type TEXT,
  p_storage_path TEXT,
  p_sort_order INT,
  p_is_cover BOOLEAN,
  p_alt_text TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_media_id UUID;
  v_count INT;
BEGIN
  IF v_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.staff_roles WHERE user_id = v_user_id AND role = 'admin'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN_ADMIN_ONLY');
  END IF;

  IF p_media_type NOT IN ('IMAGE', 'VIDEO') THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_MEDIA_TYPE');
  END IF;

  IF TRIM(p_storage_path) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_STORAGE_PATH');
  END IF;

  -- If this is set as cover, unset other covers for this room
  IF p_is_cover THEN
    UPDATE public.room_media SET is_cover = false WHERE room_id = p_room_id;
  END IF;

  -- If this is first image and no cover exists, automatically set as cover
  SELECT COUNT(*) INTO v_count FROM public.room_media WHERE room_id = p_room_id AND is_cover = true;
  IF v_count = 0 AND p_media_type = 'IMAGE' THEN
    p_is_cover := true;
  END IF;

  INSERT INTO public.room_media (
    room_id,
    media_type,
    storage_path,
    sort_order,
    is_cover,
    alt_text
  ) VALUES (
    p_room_id,
    p_media_type,
    TRIM(p_storage_path),
    COALESCE(p_sort_order, 0),
    COALESCE(p_is_cover, false),
    TRIM(p_alt_text)
  )
  RETURNING id INTO v_media_id;

  -- Maintain backward compatibility: synchronize image_paths on rooms
  UPDATE public.rooms
  SET image_paths = (
    SELECT COALESCE(array_agg(rm.storage_path ORDER BY rm.sort_order ASC), ARRAY[]::TEXT[])
    FROM public.room_media rm
    WHERE rm.room_id = p_room_id AND rm.media_type = 'IMAGE'
  )
  WHERE id = p_room_id;

  INSERT INTO public.admin_audit_logs (admin_user_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_user_id,
    'ROOM_MEDIA_ADDED',
    'room_media',
    v_media_id::text,
    jsonb_build_object('room_id', p_room_id, 'media_type', p_media_type)
  );

  RETURN jsonb_build_object('success', true, 'media_id', v_media_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_add_room_media(UUID, TEXT, TEXT, INT, BOOLEAN, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_add_room_media(UUID, TEXT, TEXT, INT, BOOLEAN, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_add_room_media(UUID, TEXT, TEXT, INT, BOOLEAN, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_delete_room_media(p_media_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_room_id UUID;
  v_was_cover BOOLEAN;
  v_storage_path TEXT;
BEGIN
  IF v_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.staff_roles WHERE user_id = v_user_id AND role = 'admin'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN_ADMIN_ONLY');
  END IF;

  SELECT room_id, is_cover, storage_path
  INTO v_room_id, v_was_cover, v_storage_path
  FROM public.room_media
  WHERE id = p_media_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'MEDIA_NOT_FOUND');
  END IF;

  DELETE FROM public.room_media WHERE id = p_media_id;

  -- If deleted media was cover, select next available image as cover
  IF v_was_cover THEN
    UPDATE public.room_media
    SET is_cover = true
    WHERE id = (
      SELECT id FROM public.room_media
      WHERE room_id = v_room_id AND media_type = 'IMAGE'
      ORDER BY sort_order ASC, created_at ASC
      LIMIT 1
    );
  END IF;

  -- Maintain backward compatibility on rooms.image_paths
  UPDATE public.rooms
  SET image_paths = (
    SELECT COALESCE(array_agg(rm.storage_path ORDER BY rm.sort_order ASC), ARRAY[]::TEXT[])
    FROM public.room_media rm
    WHERE rm.room_id = v_room_id AND rm.media_type = 'IMAGE'
  )
  WHERE id = v_room_id;

  INSERT INTO public.admin_audit_logs (admin_user_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_user_id,
    'ROOM_MEDIA_DELETED',
    'room_media',
    p_media_id::text,
    jsonb_build_object('room_id', v_room_id, 'storage_path', v_storage_path)
  );

  RETURN jsonb_build_object('success', true, 'storage_path', v_storage_path);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_room_media(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_room_media(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_room_media(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_set_cover_room_media(
  p_room_id UUID,
  p_media_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.staff_roles WHERE user_id = v_user_id AND role = 'admin'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN_ADMIN_ONLY');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.room_media
    WHERE id = p_media_id AND room_id = p_room_id AND media_type = 'IMAGE'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'MEDIA_NOT_FOUND_OR_NOT_IMAGE');
  END IF;

  UPDATE public.room_media
  SET is_cover = (id = p_media_id)
  WHERE room_id = p_room_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_cover_room_media(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_cover_room_media(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_set_cover_room_media(UUID, UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_reorder_room_media(
  p_room_id UUID,
  p_media_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_id UUID;
  v_idx INT := 0;
BEGIN
  IF v_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.staff_roles WHERE user_id = v_user_id AND role = 'admin'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN_ADMIN_ONLY');
  END IF;

  FOREACH v_id IN ARRAY p_media_ids
  LOOP
    UPDATE public.room_media
    SET sort_order = v_idx
    WHERE id = v_id AND room_id = p_room_id;
    v_idx := v_idx + 1;
  END LOOP;

  -- Synchronize rooms.image_paths
  UPDATE public.rooms
  SET image_paths = (
    SELECT COALESCE(array_agg(rm.storage_path ORDER BY rm.sort_order ASC), ARRAY[]::TEXT[])
    FROM public.room_media rm
    WHERE rm.room_id = p_room_id AND rm.media_type = 'IMAGE'
  )
  WHERE id = p_room_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reorder_room_media(UUID, UUID[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_reorder_room_media(UUID, UUID[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_reorder_room_media(UUID, UUID[]) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 12. Admin Menu RPCs
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_admin_menu_products(
  p_category TEXT DEFAULT NULL,
  p_search TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_products JSONB;
BEGIN
  IF v_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.staff_roles WHERE user_id = v_user_id AND role = 'admin'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN_ADMIN_ONLY');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', mp.id,
    'name', mp.name,
    'slug', mp.slug,
    'category', mp.category,
    'description', mp.description,
    'price_vnd', mp.price_vnd,
    'image_url', mp.image_url,
    'is_active', mp.is_active,
    'sort_order', mp.sort_order,
    'created_at', mp.created_at,
    'updated_at', mp.updated_at
  ) ORDER BY mp.category ASC, mp.sort_order ASC, mp.name ASC), '[]'::jsonb)
  INTO v_products
  FROM public.menu_products mp
  WHERE (p_category IS NULL OR p_category = '' OR mp.category = p_category)
    AND (
      p_search IS NULL
      OR p_search = ''
      OR mp.name ILIKE '%' || p_search || '%'
      OR mp.slug ILIKE '%' || p_search || '%'
    );

  RETURN jsonb_build_object('success', true, 'products', v_products);
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_menu_products(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_admin_menu_products(TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_admin_menu_products(TEXT, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_create_menu_product(
  p_name TEXT,
  p_slug TEXT,
  p_category TEXT,
  p_description TEXT,
  p_price_vnd INT,
  p_image_url TEXT,
  p_sort_order INT,
  p_is_active BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_id UUID;
  v_clean_slug TEXT;
BEGIN
  IF v_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.staff_roles WHERE user_id = v_user_id AND role = 'admin'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN_ADMIN_ONLY');
  END IF;

  IF TRIM(p_name) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_PRODUCT_NAME');
  END IF;
  IF p_category NOT IN ('DRINK', 'SNACK', 'MAIN_FOOD') THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_CATEGORY');
  END IF;
  IF p_price_vnd < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_PRICE');
  END IF;

  v_clean_slug := TRIM(LOWER(p_slug));
  IF v_clean_slug = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_SLUG');
  END IF;

  IF EXISTS (SELECT 1 FROM public.menu_products WHERE slug = v_clean_slug) THEN
    RETURN jsonb_build_object('success', false, 'error', 'SLUG_ALREADY_EXISTS');
  END IF;

  INSERT INTO public.menu_products (
    name,
    slug,
    category,
    description,
    price_vnd,
    image_url,
    sort_order,
    is_active
  ) VALUES (
    TRIM(p_name),
    v_clean_slug,
    p_category,
    NULLIF(TRIM(p_description), ''),
    p_price_vnd,
    NULLIF(TRIM(p_image_url), ''),
    COALESCE(p_sort_order, 0),
    COALESCE(p_is_active, true)
  )
  RETURNING id INTO v_id;

  INSERT INTO public.admin_audit_logs (admin_user_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_user_id,
    'MENU_PRODUCT_CREATED',
    'menu_product',
    v_id::text,
    jsonb_build_object('name', TRIM(p_name), 'slug', v_clean_slug, 'price_vnd', p_price_vnd)
  );

  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_menu_product(TEXT, TEXT, TEXT, TEXT, INT, TEXT, INT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_create_menu_product(TEXT, TEXT, TEXT, TEXT, INT, TEXT, INT, BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_create_menu_product(TEXT, TEXT, TEXT, TEXT, INT, TEXT, INT, BOOLEAN) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_update_menu_product(
  p_id UUID,
  p_name TEXT,
  p_slug TEXT,
  p_category TEXT,
  p_description TEXT,
  p_price_vnd INT,
  p_image_url TEXT,
  p_sort_order INT,
  p_is_active BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_clean_slug TEXT;
BEGIN
  IF v_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.staff_roles WHERE user_id = v_user_id AND role = 'admin'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN_ADMIN_ONLY');
  END IF;

  IF TRIM(p_name) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_PRODUCT_NAME');
  END IF;
  IF p_category NOT IN ('DRINK', 'SNACK', 'MAIN_FOOD') THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_CATEGORY');
  END IF;
  IF p_price_vnd < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_PRICE');
  END IF;

  v_clean_slug := TRIM(LOWER(p_slug));
  IF v_clean_slug = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_SLUG');
  END IF;

  IF EXISTS (SELECT 1 FROM public.menu_products WHERE slug = v_clean_slug AND id <> p_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'SLUG_ALREADY_EXISTS');
  END IF;

  UPDATE public.menu_products
  SET
    name = TRIM(p_name),
    slug = v_clean_slug,
    category = p_category,
    description = NULLIF(TRIM(p_description), ''),
    price_vnd = p_price_vnd,
    image_url = NULLIF(TRIM(p_image_url), ''),
    sort_order = COALESCE(p_sort_order, 0),
    is_active = COALESCE(p_is_active, true),
    updated_at = clock_timestamp()
  WHERE id = p_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'PRODUCT_NOT_FOUND');
  END IF;

  INSERT INTO public.admin_audit_logs (admin_user_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_user_id,
    'MENU_PRODUCT_UPDATED',
    'menu_product',
    p_id::text,
    jsonb_build_object('name', TRIM(p_name), 'price_vnd', p_price_vnd, 'is_active', p_is_active)
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_menu_product(UUID, TEXT, TEXT, TEXT, TEXT, INT, TEXT, INT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_menu_product(UUID, TEXT, TEXT, TEXT, TEXT, INT, TEXT, INT, BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_update_menu_product(UUID, TEXT, TEXT, TEXT, TEXT, INT, TEXT, INT, BOOLEAN) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_set_menu_product_active(
  p_id UUID,
  p_is_active BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.staff_roles WHERE user_id = v_user_id AND role = 'admin'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN_ADMIN_ONLY');
  END IF;

  UPDATE public.menu_products
  SET
    is_active = p_is_active,
    updated_at = clock_timestamp()
  WHERE id = p_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'PRODUCT_NOT_FOUND');
  END IF;

  INSERT INTO public.admin_audit_logs (admin_user_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_user_id,
    CASE WHEN p_is_active THEN 'MENU_PRODUCT_REACTIVATED' ELSE 'MENU_PRODUCT_DEACTIVATED' END,
    'menu_product',
    p_id::text,
    jsonb_build_object('is_active', p_is_active)
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_menu_product_active(UUID, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_menu_product_active(UUID, BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_set_menu_product_active(UUID, BOOLEAN) TO authenticated, service_role;
