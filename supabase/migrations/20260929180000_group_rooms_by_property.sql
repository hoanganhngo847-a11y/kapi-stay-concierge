-- ============================================================================
-- Migration: 20260929180000_group_rooms_by_property.sql
-- Description: Group rooms by active property for Admin and Operations dashboards
-- RPCs upgraded:
--   1. public.get_admin_dashboard_data() -> returns property_room_summaries (Option B) & room_summaries
--   2. public.get_staff_dashboard_data() -> room_operations items include property_id, property_name, property_address
-- Security: SECURITY DEFINER, SET search_path = '', strict role enforcement
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Upgrade public.get_admin_dashboard_data()
-- ----------------------------------------------------------------------------
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
    v_property_room_summaries JSONB;
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

    -- 2. Aggregate Room Status KPIs (Listed rooms belonging to active properties)
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
    JOIN public.properties p ON r.property_id = p.id AND p.is_active = true
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

    -- 7. Query Room Status Summaries (flat list with property info)
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'room_id', r.id,
        'room_name', r.name,
        'property_id', p.id,
        'property_name', p.name,
        'property_address', p.address,
        'operational_status', COALESCE(ro.operational_status, 'ready'),
        'updated_at', ro.updated_at,
        'updated_by', ro.updated_by
    ) ORDER BY p.name ASC, r.name ASC), '[]'::jsonb)
    INTO v_room_summaries
    FROM public.rooms r
    JOIN public.properties p ON r.property_id = p.id AND p.is_active = true
    LEFT JOIN public.room_operations ro ON r.id = ro.room_id
    WHERE r.is_listed = true;

    -- 8. Query Property Room Summaries (Option B: Pre-grouped by property)
    -- Properties sorted by property_name ASC, rooms sorted by room_name ASC
    SELECT COALESCE(jsonb_agg(prop_summary ORDER BY prop_summary->>'property_name' ASC), '[]'::jsonb)
    INTO v_property_room_summaries
    FROM (
        SELECT jsonb_build_object(
            'property_id', p.id,
            'property_name', p.name,
            'property_address', p.address,
            'room_count', COUNT(r.id),
            'ready_count', COUNT(r.id) FILTER (WHERE COALESCE(ro.operational_status, 'ready') = 'ready'),
            'occupied_count', COUNT(r.id) FILTER (WHERE COALESCE(ro.operational_status, 'ready') = 'occupied'),
            'cleaning_count', COUNT(r.id) FILTER (WHERE COALESCE(ro.operational_status, 'ready') = 'cleaning'),
            'maintenance_count', COUNT(r.id) FILTER (WHERE COALESCE(ro.operational_status, 'ready') = 'maintenance'),
            'rooms', COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                    'room_id', r2.id,
                    'room_name', r2.name,
                    'operational_status', COALESCE(ro2.operational_status, 'ready'),
                    'updated_at', ro2.updated_at,
                    'updated_by', ro2.updated_by
                ) ORDER BY r2.name ASC)
                FROM public.rooms r2
                LEFT JOIN public.room_operations ro2 ON r2.id = ro2.room_id
                WHERE r2.property_id = p.id AND r2.is_listed = true
            ), '[]'::jsonb)
        ) AS prop_summary
        FROM public.properties p
        JOIN public.rooms r ON r.property_id = p.id AND r.is_listed = true
        LEFT JOIN public.room_operations ro ON r.id = ro.room_id
        WHERE p.is_active = true
        GROUP BY p.id, p.name, p.address
    ) grouped;

    RETURN jsonb_build_object(
        'success', true,
        'kpis', v_kpis,
        'recent_bookings', v_recent_bookings,
        'pending_tickets', v_pending_tickets,
        'room_summaries', v_room_summaries,
        'property_room_summaries', v_property_room_summaries
    );
END;
$$;

-- Permissions for get_admin_dashboard_data
REVOKE ALL ON FUNCTION public.get_admin_dashboard_data() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_admin_dashboard_data() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_data() TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. Upgrade public.get_staff_dashboard_data()
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_staff_dashboard_data()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_room_ops JSONB;
    v_tickets JSONB;
    v_today_bookings JSONB;
    v_today DATE := (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::DATE;
BEGIN
    -- 1. Authoritative check for staff or admin role
    IF v_user_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.staff_roles
        WHERE user_id = v_user_id AND role IN ('staff', 'admin')
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN_STAFF_ONLY');
    END IF;

    -- 2. Query Room Operations (Include property_id, property_name, property_address)
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'room_id', r.id,
        'room_name', r.name,
        'property_id', p.id,
        'property_name', p.name,
        'property_address', p.address,
        'operational_status', COALESCE(ro.operational_status, 'ready'),
        'updated_at', ro.updated_at,
        'updated_by', ro.updated_by
    ) ORDER BY p.name ASC, r.name ASC), '[]'::jsonb)
    INTO v_room_ops
    FROM public.rooms r
    JOIN public.properties p ON r.property_id = p.id AND p.is_active = true
    LEFT JOIN public.room_operations ro ON r.id = ro.room_id
    WHERE r.is_listed = true;

    -- 3. Query Active Tickets
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', t.id,
        'booking_id', t.booking_id,
        'room_id', t.room_id,
        'room_name', r.name,
        'user_id', t.user_id,
        'guest_name', p.display_name,
        'guest_phone', p.phone,
        'category', t.category,
        'description', t.description,
        'media_paths', to_jsonb(t.media_paths),
        'status', t.status,
        'created_at', t.created_at,
        'updated_at', t.updated_at
    ) ORDER BY t.created_at DESC), '[]'::jsonb)
    INTO v_tickets
    FROM public.tickets t
    LEFT JOIN public.rooms r ON t.room_id = r.id
    LEFT JOIN public.profiles p ON t.user_id = p.id;

    -- 4. Query Today Bookings with Fulfillment & Menu Items
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', b.id,
        'room_id', b.room_id,
        'room_name', r.name,
        'user_id', b.user_id,
        'guest_name', p.display_name,
        'guest_phone', p.phone,
        'check_in', b.check_in,
        'check_out', b.check_out,
        'check_in_at', b.check_in_at,
        'check_out_at', b.check_out_at,
        'guest_count', b.guest_count,
        'booking_status', b.booking_status,
        'payment_status', b.payment_status,
        'menu_amount_vnd', COALESCE(b.menu_amount_vnd, 0),
        'is_checkin_today', (
            CASE
                WHEN b.check_in_at IS NOT NULL THEN (b.check_in_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::DATE = v_today
                ELSE (check_in = v_today)
            END
        ),
        'is_checkout_today', (
            CASE
                WHEN b.check_out_at IS NOT NULL THEN (b.check_out_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::DATE = v_today
                ELSE (check_out = v_today)
            END
        ),
        'rewards', (
            SELECT COALESCE(jsonb_agg(reward_desc), '[]'::jsonb)
            FROM (
                SELECT 'Voucher 40% (500 pts)' AS reward_desc
                FROM public.voucher_redemptions vr
                WHERE vr.booking_id = b.id AND vr.status = 'USED'

                UNION ALL

                SELECT
                    CASE
                        WHEN sd.reward_type = 'MEAL_CHOICE' AND ue.selection_data ? 'menu_item_name' THEN
                            'Món ăn: ' || (ue.selection_data->>'menu_item_name')
                        WHEN sd.reward_type = 'DISCOUNT_30' THEN
                            'Voucher 30% applied'
                        WHEN sd.reward_type = 'DISCOUNT_40' THEN
                            'Voucher 40% applied'
                        ELSE
                            sd.title
                    END AS reward_desc
                FROM public.user_reward_entitlements ue
                JOIN public.streak_reward_definitions sd ON ue.reward_definition_id = sd.id
                WHERE ue.booking_id = b.id AND ue.status = 'USED'
            ) sub
        ),
        'menu_items', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'id', bmi.id,
                'product_name', bmi.product_name_snapshot,
                'quantity', bmi.quantity,
                'source_type', bmi.source_type,
                'unit_price_vnd', bmi.unit_price_vnd,
                'total_price_vnd', bmi.total_price_vnd,
                'normal_price_vnd', bmi.normal_price_vnd,
                'reward_source', bmi.reward_source,
                'reward_label', CASE
                    WHEN bmi.source_type = 'REWARD' AND sd.milestone_day IS NOT NULL THEN 'Quà Day ' || sd.milestone_day
                    WHEN bmi.source_type = 'REWARD' THEN 'Phần thưởng'
                    ELSE NULL
                END
            ) ORDER BY bmi.source_type DESC, bmi.created_at ASC), '[]'::jsonb)
            FROM public.booking_menu_items bmi
            LEFT JOIN public.user_reward_entitlements ue ON ue.id = bmi.entitlement_id
            LEFT JOIN public.streak_reward_definitions sd ON sd.id = ue.reward_definition_id
            WHERE bmi.booking_id = b.id
        )
    ) ORDER BY COALESCE(b.check_in_at, (b.check_in::text || ' 14:00:00+07')::timestamptz) ASC), '[]'::jsonb)
    INTO v_today_bookings
    FROM public.bookings b
    LEFT JOIN public.rooms r ON b.room_id = r.id
    LEFT JOIN public.profiles p ON b.user_id = p.id
    WHERE (
        (b.check_in_at IS NOT NULL AND (
            (b.check_in_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::DATE = v_today
            OR (b.check_out_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::DATE = v_today
        ))
        OR (b.check_in_at IS NULL AND (b.check_in = v_today OR b.check_out = v_today))
    )
    AND LOWER(b.booking_status) NOT IN ('cancelled', 'refunded');

    RETURN jsonb_build_object(
        'success', true,
        'today', v_today,
        'room_operations', v_room_ops,
        'tickets', v_tickets,
        'today_bookings', v_today_bookings
    );
END;
$$;

-- Permissions for get_staff_dashboard_data
REVOKE ALL ON FUNCTION public.get_staff_dashboard_data() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_staff_dashboard_data() FROM anon;
REVOKE ALL ON FUNCTION public.get_staff_dashboard_data() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_staff_dashboard_data() TO authenticated, service_role;
