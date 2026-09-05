export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
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
      labels: {
        Row: {
          id: string
          name: string
          user_id: string
        }
        Insert: {
          id?: string
          name: string
          user_id: string
        }
        Update: {
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      line_labels: {
        Row: {
          label_id: string
          line_id: string
        }
        Insert: {
          label_id: string
          line_id: string
        }
        Update: {
          label_id?: string
          line_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "line_labels_label_id_fkey"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "labels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "line_labels_line_id_fkey"
            columns: ["line_id"]
            isOneToOne: false
            referencedRelation: "lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "line_labels_line_id_fkey"
            columns: ["line_id"]
            isOneToOne: false
            referencedRelation: "v_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      lines: {
        Row: {
          amount: number
          from_node: string
          id: string
          memo: string | null
          occurred_on: string
          recorded_at: string
          superseded_at: string | null
          to_node: string
          user_id: string
          version_of: string | null
        }
        Insert: {
          amount: number
          from_node: string
          id?: string
          memo?: string | null
          occurred_on: string
          recorded_at?: string
          superseded_at?: string | null
          to_node: string
          user_id: string
          version_of?: string | null
        }
        Update: {
          amount?: number
          from_node?: string
          id?: string
          memo?: string | null
          occurred_on?: string
          recorded_at?: string
          superseded_at?: string | null
          to_node?: string
          user_id?: string
          version_of?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lines_from_node_fkey"
            columns: ["from_node"]
            isOneToOne: false
            referencedRelation: "nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lines_to_node_fkey"
            columns: ["to_node"]
            isOneToOne: false
            referencedRelation: "nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lines_version_of_fkey"
            columns: ["version_of"]
            isOneToOne: false
            referencedRelation: "lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lines_version_of_fkey"
            columns: ["version_of"]
            isOneToOne: false
            referencedRelation: "v_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      nodes: {
        Row: {
          created_at: string
          currency: string
          exclude_from_flow_totals: boolean
          id: string
          is_archived: boolean
          name: string
          node_type: string
          parent_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          currency?: string
          exclude_from_flow_totals?: boolean
          id?: string
          is_archived?: boolean
          name: string
          node_type: string
          parent_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          exclude_from_flow_totals?: boolean
          id?: string
          is_archived?: boolean
          name?: string
          node_type?: string
          parent_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nodes_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      valuations: {
        Row: {
          id: string
          market_value: number
          node_id: string
          recorded_at: string
          user_id: string
          valued_on: string
        }
        Insert: {
          id?: string
          market_value: number
          node_id: string
          recorded_at?: string
          user_id: string
          valued_on: string
        }
        Update: {
          id?: string
          market_value?: number
          node_id?: string
          recorded_at?: string
          user_id?: string
          valued_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "valuations_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "nodes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_cumulative: {
        Row: {
          cumulative_balance: number | null
          daily_delta: number | null
          node_id: string | null
          occurred_on: string | null
          user_id: string | null
        }
        Relationships: []
      }
      v_daily_deltas: {
        Row: {
          delta: number | null
          node_id: string | null
          occurred_on: string | null
          user_id: string | null
        }
        Relationships: []
      }
      v_lines: {
        Row: {
          amount: number | null
          from_name: string | null
          from_node: string | null
          id: string | null
          memo: string | null
          occurred_on: string | null
          recorded_at: string | null
          superseded_at: string | null
          to_name: string | null
          to_node: string | null
          user_id: string | null
          version_of: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lines_from_node_fkey"
            columns: ["from_node"]
            isOneToOne: false
            referencedRelation: "nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lines_to_node_fkey"
            columns: ["to_node"]
            isOneToOne: false
            referencedRelation: "nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lines_version_of_fkey"
            columns: ["version_of"]
            isOneToOne: false
            referencedRelation: "lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lines_version_of_fkey"
            columns: ["version_of"]
            isOneToOne: false
            referencedRelation: "v_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      v_monthly_flow: {
        Row: {
          income: number | null
          month: string | null
          spend: number | null
          user_id: string | null
        }
        Relationships: []
      }
      v_net_worth: {
        Row: {
          net_worth: number | null
          user_id: string | null
        }
        Relationships: []
      }
      v_net_worth_daily: {
        Row: {
          net_worth: number | null
          occurred_on: string | null
          user_id: string | null
        }
        Relationships: []
      }
      v_node_balances: {
        Row: {
          balance: number | null
          node_id: string | null
          user_id: string | null
        }
        Relationships: []
      }
      v_node_paths: {
        Row: {
          node_id: string | null
          path: string | null
        }
        Relationships: []
      }
      v_node_suggestions: {
        Row: {
          node_id: string | null
          usage_count: number | null
          user_id: string | null
        }
        Relationships: []
      }
      v_node_tree: {
        Row: {
          ancestor_id: string | null
          depth: number | null
          descendant_id: string | null
          user_id: string | null
        }
        Relationships: []
      }
      v_rollup_balances: {
        Row: {
          balance: number | null
          node_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      promote_to_parent: { Args: { target_node_id: string }; Returns: string }
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
