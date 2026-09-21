export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      booking_access_credentials: {
        Row: {
          booking_id: string
          created_at: string
          credential_type: string
          credential_value: string
          id: string
          instructions: string | null
          room_id: string
          status: string
          updated_at: string
          valid_from: string
          valid_until: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          credential_type?: string
          credential_value: string
          id?: string
          instructions?: string | null
          room_id: string
          status?: string
          updated_at?: string
          valid_from: string
          valid_until: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          credential_type?: string
          credential_value?: string
          id?: string
          instructions?: string | null
          room_id?: string
          status?: string
          updated_at?: string
          valid_from?: string
          valid_until?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_access_credentials_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_access_credentials_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          booking_status: string
          check_in: string
          check_out: string
          created_at: string
          discount_amount_vnd: number
          final_paid_amount_vnd: number
          gross_amount_vnd: number
          guest_count: number
          id: string
          payment_status: string
          room_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          booking_status: string
          check_in: string
          check_out: string
          created_at?: string
          discount_amount_vnd?: number
          final_paid_amount_vnd: number
          gross_amount_vnd: number
          guest_count: number
          id?: string
          payment_status: string
          room_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          booking_status?: string
          check_in?: string
          check_out?: string
          created_at?: string
          discount_amount_vnd?: number
          final_paid_amount_vnd?: number
          gross_amount_vnd?: number
          guest_count?: number
          id?: string
          payment_status?: string
          room_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      checkout_sessions: {
        Row: {
          check_in: string
          check_out: string
          created_at: string
          discount_amount_vnd: number
          expires_at: string
          final_payable_amount_vnd: number
          gross_amount_vnd: number
          guest_count: number
          id: string
          payment_reference: string | null
          room_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          check_in: string
          check_out: string
          created_at?: string
          discount_amount_vnd?: number
          expires_at: string
          final_payable_amount_vnd: number
          gross_amount_vnd: number
          guest_count: number
          id?: string
          payment_reference?: string | null
          room_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          check_in?: string
          check_out?: string
          created_at?: string
          discount_amount_vnd?: number
          expires_at?: string
          final_payable_amount_vnd?: number
          gross_amount_vnd?: number
          guest_count?: number
          id?: string
          payment_reference?: string | null
          room_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkout_sessions_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_checkins: {
        Row: {
          checkin_date: string
          created_at: string
          id: string
          reward_points: number
          user_id: string
        }
        Insert: {
          checkin_date: string
          created_at?: string
          id?: string
          reward_points?: number
          user_id: string
        }
        Update: {
          checkin_date?: string
          created_at?: string
          id?: string
          reward_points?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_checkins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_transactions: {
        Row: {
          booking_id: string | null
          created_at: string
          daily_checkin_id: string | null
          description: string | null
          id: string
          metadata: Json | null
          points_delta: number
          type: string
          user_id: string
          voucher_redemption_id: string | null
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          daily_checkin_id?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
          points_delta: number
          type: string
          user_id: string
          voucher_redemption_id?: string | null
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          daily_checkin_id?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
          points_delta?: number
          type?: string
          user_id?: string
          voucher_redemption_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_transactions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_transactions_daily_checkin_id_fkey"
            columns: ["daily_checkin_id"]
            isOneToOne: false
            referencedRelation: "daily_checkins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_transactions_voucher_redemption_id_fkey"
            columns: ["voucher_redemption_id"]
            isOneToOne: false
            referencedRelation: "voucher_redemptions"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      properties: {
        Row: {
          address: string
          created_at: string
          id: string
          is_active: boolean
          maps_url: string | null
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          address: string
          created_at?: string
          id?: string
          is_active?: boolean
          maps_url?: string | null
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          address?: string
          created_at?: string
          id?: string
          is_active?: boolean
          maps_url?: string | null
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      room_operations: {
        Row: {
          operational_status: string
          room_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          operational_status?: string
          room_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          operational_status?: string
          room_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "room_operations_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: true
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      room_private_details: {
        Row: {
          private_instructions: string | null
          room_id: string
          updated_at: string
          wifi_password: string | null
          wifi_ssid: string | null
        }
        Insert: {
          private_instructions?: string | null
          room_id: string
          updated_at?: string
          wifi_password?: string | null
          wifi_ssid?: string | null
        }
        Update: {
          private_instructions?: string | null
          room_id?: string
          updated_at?: string
          wifi_password?: string | null
          wifi_ssid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "room_private_details_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: true
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          amenities: string[]
          capacity: number
          created_at: string
          description: string | null
          id: string
          image_paths: string[]
          is_listed: boolean
          name: string
          nightly_price_vnd: number
          property_id: string
          updated_at: string
        }
        Insert: {
          amenities?: string[]
          capacity: number
          created_at?: string
          description?: string | null
          id?: string
          image_paths?: string[]
          is_listed?: boolean
          name: string
          nightly_price_vnd: number
          property_id: string
          updated_at?: string
        }
        Update: {
          amenities?: string[]
          capacity?: number
          created_at?: string
          description?: string | null
          id?: string
          image_paths?: string[]
          is_listed?: boolean
          name?: string
          nightly_price_vnd?: number
          property_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rooms_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          booking_id: string
          category: string
          created_at: string
          description: string
          id: string
          media_paths: string[]
          room_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          booking_id: string
          category: string
          created_at?: string
          description: string
          id?: string
          media_paths?: string[]
          room_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          booking_id?: string
          category?: string
          created_at?: string
          description?: string
          id?: string
          media_paths?: string[]
          room_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      voucher_redemptions: {
        Row: {
          booking_id: string | null
          checkout_session_id: string | null
          discount_amount_vnd: number | null
          expires_at: string
          id: string
          issued_at: string
          status: string
          used_at: string | null
          user_id: string
          voucher_id: string
        }
        Insert: {
          booking_id?: string | null
          checkout_session_id?: string | null
          discount_amount_vnd?: number | null
          expires_at: string
          id?: string
          issued_at?: string
          status?: string
          used_at?: string | null
          user_id: string
          voucher_id: string
        }
        Update: {
          booking_id?: string | null
          checkout_session_id?: string | null
          discount_amount_vnd?: number | null
          expires_at?: string
          id?: string
          issued_at?: string
          status?: string
          used_at?: string | null
          user_id?: string
          voucher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voucher_redemptions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voucher_redemptions_checkout_session_id_fkey"
            columns: ["checkout_session_id"]
            isOneToOne: false
            referencedRelation: "checkout_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voucher_redemptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voucher_redemptions_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      vouchers: {
        Row: {
          created_at: string
          discount_percentage: number
          id: string
          is_active: boolean
          max_eligible_base_vnd: number
          name: string
          points_cost: number
          updated_at: string
          voucher_type: string
        }
        Insert: {
          created_at?: string
          discount_percentage?: number
          id?: string
          is_active?: boolean
          max_eligible_base_vnd?: number
          name: string
          points_cost?: number
          updated_at?: string
          voucher_type?: string
        }
        Update: {
          created_at?: string
          discount_percentage?: number
          id?: string
          is_active?: boolean
          max_eligible_base_vnd?: number
          name?: string
          points_cost?: number
          updated_at?: string
          voucher_type?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_my_stay_credentials: {
        Args: {
          p_booking_id: string
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

