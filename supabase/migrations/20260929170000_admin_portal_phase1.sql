-- ============================================================================
-- Migration: 20260929170000_admin_portal_phase1.sql
-- Description: Trusted RPC for Kapi Admin Portal (Phase 1)
-- Authoritative check against public.staff_roles (role = 'admin')
-- Security: SECURITY DEFINER, SET search_path = '', strict role enforcement
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_admin_dashboard_data()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_today DATE := (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::DATE;
    v_kpis JSONB;
    v_recent_bookings JSONB;
    v_pending_tickets JSONB;
    v_room_summaries JSONB;
    v_today_bookings_count INT := 0;
    v_today_checkins_count INT := 0;
    v_today_checkouts_count INT := 0;
    v_occupied_count INT := 0;
    v_ready_count INT := 0;
    v_cleaning_count INT := 0;
    v_maintenance_count INT := 0;
    v_total_rooms_count INT := 0;
    v_pending_tickets_count INT := 0;
BEGIN
    -- 1. Authoritative Admin verification: reject null or non-admin users
    IF v_user_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.staff_roles
        WHERE user_id = v_user_id AND role = 'admin'
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN_ADMIN_ONLY');
    END IF;

    -- 2. Aggregate Room Status KPIs
    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE COALESCE(ro.operational_status, 'ready') = 'occupied'),
        COUNT(*) FILTER (WHERE COALESCE(ro.operational_status, 'ready') = 'ready'),
        COUNT(*) FILTER (WHERE COALESCE(ro.operational_status, 'ready') = 'cleaning'),
        COUNT(*) FILTER (WHERE COALESCE(ro.operational_status, 'ready') = 'maintenance')
    INTO
        v_total_rooms_count,
        v_occupied_count,
        v_ready_count,
        v_cleaning_count,
        v_maintenance_count
    FROM public.rooms r
    LEFT JOIN public.room_operations ro ON r.id = ro.room_id
    WHERE r.is_listed = true;

    -- 3. Aggregate Booking KPIs for Today (Asia/Ho_Chi_Minh timezone)
    SELECT
        COUNT(*) FILTER (WHERE (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::DATE = v_today),
        COUNT(*) FILTER (WHERE (
            CASE
                WHEN check_in_at IS NOT NULL THEN (check_in_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::DATE = v_today
                ELSE (check_in = v_today)
            END
        ) AND booking_status != 'CANCELLED'),
        COUNT(*) FILTER (WHERE (
            CASE
                WHEN check_out_at IS NOT NULL THEN (check_out_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::DATE = v_today
                ELSE (check_out = v_today)
            END
        ) AND booking_status != 'CANCELLED')
    INTO
        v_today_bookings_count,
        v_today_checkins_count,
        v_today_checkouts_count
    FROM public.bookings;

    -- 4. Aggregate Pending Tickets KPI
    SELECT COUNT(*)
    INTO v_pending_tickets_count
    FROM public.tickets
    WHERE status = 'pending';

    -- Build KPIs JSON object
    v_kpis := jsonb_build_object(
        'today_bookings_count', v_today_bookings_count,
        'today_checkins_count', v_today_checkins_count,
        'today_checkouts_count', v_today_checkouts_count,
        'occupied_rooms_count', v_occupied_count,
        'ready_rooms_count', v_ready_count,
        'cleaning_rooms_count', v_cleaning_count,
        'maintenance_rooms_count', v_maintenance_count,
        'total_rooms_count', v_total_rooms_count,
        'pending_tickets_count', v_pending_tickets_count
    );

    -- 5. Query Recent Bookings (Limit 15, ordered by created_at DESC)
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', b.id,
        'short_id', SUBSTRING(b.id::text, 1, 8),
        'room_id', b.room_id,
        'room_name', COALESCE(r.name, 'N/A'),
        'user_id', b.user_id,
        'guest_name', COALESCE(p.display_name, 'Khách vãng lai'),
        'guest_phone', p.phone,
        'check_in', b.check_in,
        'check_out', b.check_out,
        'check_in_at', b.check_in_at,
        'check_out_at', b.check_out_at,
        'booking_status', b.booking_status,
        'payment_status', b.payment_status,
        'final_paid_amount_vnd', b.final_paid_amount_vnd,
        'created_at', b.created_at
    ) ORDER BY b.created_at DESC), '[]'::jsonb)
    INTO v_recent_bookings
    FROM (
        SELECT * FROM public.bookings
        ORDER BY created_at DESC
        LIMIT 15
    ) b
    LEFT JOIN public.rooms r ON b.room_id = r.id
    LEFT JOIN public.profiles p ON b.user_id = p.id;

    -- 6. Query Pending / Active Tickets (Limit 15, ordered by created_at DESC)
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', t.id,
        'short_id', SUBSTRING(t.id::text, 1, 8),
        'booking_id', t.booking_id,
        'room_id', t.room_id,
        'room_name', COALESCE(r.name, 'N/A'),
        'user_id', t.user_id,
        'guest_name', COALESCE(p.display_name, 'Khách'),
        'guest_phone', p.phone,
        'category', t.category,
        'description', t.description,
        'status', t.status,
        'created_at', t.created_at,
        'updated_at', t.updated_at
    ) ORDER BY t.created_at DESC), '[]'::jsonb)
    INTO v_pending_tickets
    FROM (
        SELECT * FROM public.tickets
        WHERE status IN ('pending', 'in_progress')
        ORDER BY created_at DESC
        LIMIT 15
    ) t
    LEFT JOIN public.rooms r ON t.room_id = r.id
    LEFT JOIN public.profiles p ON t.user_id = p.id;

    -- 7. Query Room Status Summaries (All listed rooms)
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'room_id', r.id,
        'room_name', r.name,
        'operational_status', COALESCE(ro.operational_status, 'ready'),
        'updated_at', ro.updated_at,
        'updated_by', ro.updated_by
    ) ORDER BY r.name ASC), '[]'::jsonb)
    INTO v_room_summaries
    FROM public.rooms r
    LEFT JOIN public.room_operations ro ON r.id = ro.room_id
    WHERE r.is_listed = true;

    RETURN jsonb_build_object(
        'success', true,
        'kpis', v_kpis,
        'recent_bookings', v_recent_bookings,
        'pending_tickets', v_pending_tickets,
        'room_summaries', v_room_summaries
    );
END;
$$;

-- Explicit least privilege
REVOKE ALL ON FUNCTION public.get_admin_dashboard_data() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_admin_dashboard_data() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_data() TO authenticated, service_role;
