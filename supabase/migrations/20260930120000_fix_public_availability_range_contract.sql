-- Migration: Fix public availability timeline range contract
-- Timestamp: 20260930120000
-- Purpose:
--   Expand get_public_room_availability_timeline max range validation from INTERVAL '14 days'
--   to INTERVAL '15 days'.
--
-- Rationale:
--   Frontend public booking horizon includes today + next 14 calendar dates (total 15 calendar days).
--   To cover all 15 calendar dates completely [today 00:00 -> today+15d 00:00), the requested
--   interval is exactly 15 days.
--   Capping at 14 days causes RANGE_TOO_LARGE in production when loading the room availability widget.
--   Security, sanitization, and half-open overlap semantics are strictly preserved.

CREATE OR REPLACE FUNCTION public.get_public_room_availability_timeline(
  p_room_id UUID,
  p_range_start TIMESTAMPTZ,
  p_range_end TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_intervals JSONB;
BEGIN
  -- Validate inputs
  IF p_room_id IS NULL OR p_range_start IS NULL OR p_range_end IS NULL OR p_range_start >= p_range_end THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_PARAMETERS');
  END IF;

  -- Limit max query window to 15 days (covers today + 14 future calendar dates)
  IF (p_range_end - p_range_start) > INTERVAL '15 days' THEN
    RETURN jsonb_build_object('success', false, 'error', 'RANGE_TOO_LARGE');
  END IF;

  -- Ensure room exists, is listed, and belongs to an active property
  IF NOT EXISTS (
    SELECT 1
    FROM public.rooms r
    JOIN public.properties p ON p.id = r.property_id
    WHERE r.id = p_room_id AND r.is_listed = true AND p.is_active = true
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'ROOM_NOT_FOUND');
  END IF;

  WITH raw_intervals AS (
    -- 1. Confirmed / completed bookings -> BOOKED
    SELECT
      COALESCE(b.check_in_at, (b.check_in::text || ' 14:00:00+07')::timestamptz) AS start_at,
      COALESCE(b.check_out_at, (b.check_out::text || ' 12:00:00+07')::timestamptz) AS end_at,
      'BOOKED' AS state
    FROM public.bookings b
    WHERE b.room_id = p_room_id
      AND LOWER(b.booking_status) IN ('confirmed', 'completed')
      AND COALESCE(b.check_in_at, (b.check_in::text || ' 14:00:00+07')::timestamptz) < p_range_end
      AND COALESCE(b.check_out_at, (b.check_out::text || ' 12:00:00+07')::timestamptz) > p_range_start

    UNION ALL

    -- 2. Active temporary holds in checkout_sessions -> HELD
    SELECT
      cs.check_in_at AS start_at,
      cs.check_out_at AS end_at,
      'HELD' AS state
    FROM public.checkout_sessions cs
    WHERE cs.room_id = p_room_id
      AND cs.status IN ('ACTIVE', 'PAYMENT_PROCESSING')
      AND cs.expires_at > clock_timestamp()
      AND cs.check_in_at < p_range_end
      AND cs.check_out_at > p_range_start

    UNION ALL

    -- 3. Room availability blocks (maintenance, housekeeping, owner_block) -> BLOCKED
    -- If reason = 'BOOKED', classify as BOOKED
    SELECT
      rab.starts_at AS start_at,
      rab.ends_at AS end_at,
      CASE
        WHEN rab.reason = 'BOOKED' THEN 'BOOKED'
        ELSE 'BLOCKED'
      END AS state
    FROM public.room_availability_blocks rab
    WHERE rab.room_id = p_room_id
      AND rab.starts_at < p_range_end
      AND rab.ends_at > p_range_start
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'start_at', i.start_at,
        'end_at', i.end_at,
        'state', i.state
      ) ORDER BY i.start_at ASC
    ),
    '[]'::jsonb
  ) INTO v_intervals
  FROM raw_intervals i;

  RETURN jsonb_build_object(
    'success', true,
    'room_id', p_room_id,
    'range_start', p_range_start,
    'range_end', p_range_end,
    'intervals', v_intervals
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_room_availability_timeline(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_room_availability_timeline(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO anon, authenticated, service_role;
