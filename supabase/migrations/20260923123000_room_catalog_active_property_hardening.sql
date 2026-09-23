-- ============================================================================
-- Harden public room availability against inactive parent properties.
-- A room is publicly usable only when:
--   1) rooms.is_listed = true
--   2) its parent properties.is_active = true
-- ============================================================================

-- 1. Public room RLS must not expose rooms belonging to inactive properties.
DROP POLICY IF EXISTS "Public rooms are viewable by everyone" ON public.rooms;

CREATE POLICY "Public rooms are viewable by everyone"
  ON public.rooms FOR SELECT
  TO anon, authenticated
  USING (
    is_listed = true
    AND EXISTS (
      SELECT 1
      FROM public.properties p
      WHERE p.id = rooms.property_id
        AND p.is_active = true
    )
  );

-- 2. Availability RPC must enforce the same parent-property rule because
-- SECURITY DEFINER bypasses caller RLS.
CREATE OR REPLACE FUNCTION public.check_room_availability(
    p_room_id UUID,
    p_check_in DATE,
    p_check_out DATE
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF p_room_id IS NULL
       OR p_check_in IS NULL
       OR p_check_out IS NULL
       OR p_check_out <= p_check_in THEN
        RETURN FALSE;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.rooms r
        JOIN public.properties p ON p.id = r.property_id
        WHERE r.id = p_room_id
          AND r.is_listed = true
          AND p.is_active = true
    ) THEN
        RETURN FALSE;
    END IF;

    RETURN NOT EXISTS (
        SELECT 1
        FROM public.bookings
        WHERE room_id = p_room_id
          AND LOWER(booking_status) IN ('confirmed', 'completed')
          AND check_in < p_check_out
          AND check_out > p_check_in
    );
END;
$$;

REVOKE ALL ON FUNCTION public.check_room_availability(UUID, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_room_availability(UUID, DATE, DATE)
  TO anon, authenticated;

-- 3. Trusted checkout/booking writes must also fail closed if a property is
-- deactivated after a room was listed or after a checkout session was created.
CREATE OR REPLACE FUNCTION public.enforce_active_room_property()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM public.rooms r
        JOIN public.properties p ON p.id = r.property_id
        WHERE r.id = NEW.room_id
          AND r.is_listed = true
          AND p.is_active = true
    ) THEN
        RAISE EXCEPTION 'ROOM_PROPERTY_INACTIVE_OR_UNAVAILABLE'
          USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_active_room_property()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tr_checkout_sessions_active_room
  ON public.checkout_sessions;

CREATE TRIGGER tr_checkout_sessions_active_room
  BEFORE INSERT OR UPDATE OF room_id
  ON public.checkout_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_active_room_property();

DROP TRIGGER IF EXISTS tr_bookings_active_room
  ON public.bookings;

CREATE TRIGGER tr_bookings_active_room
  BEFORE INSERT OR UPDATE OF room_id
  ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_active_room_property();
