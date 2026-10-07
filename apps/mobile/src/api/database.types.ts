
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "agent_proposals": {
                  Row: {
                    "agent_run_id": string | null,"created_at": string,"decided_at": string | null,"decided_by": string | null,"dedupe_key": string,"expires_at": string,"household_id": string,"id": string,"kind": string,"payload": NonNullable<Json>,"rationale": NonNullable<Json>,"result": Json | null,"status": string
                  }
                  Insert: {
                    "agent_run_id"?: string | null,"created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"dedupe_key": string,"expires_at"?: string,"household_id": string,"id"?: string,"kind": string,"payload": NonNullable<Json>,"rationale": NonNullable<Json>,"result"?: Json | null,"status"?: string
                  }
                  Update: {
                    "agent_run_id"?: string | null,"created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"dedupe_key"?: string,"expires_at"?: string,"household_id"?: string,"id"?: string,"kind"?: string,"payload"?: NonNullable<Json>,"rationale"?: NonNullable<Json>,"result"?: Json | null,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "agent_proposals_agent_run_id_fkey"
      columns: ["agent_run_id"]
isOneToOne: false
      referencedRelation: "agent_runs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "agent_proposals_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    }
                  ]
                },"agent_runs": {
                  Row: {
                    "agent": string,"created_at": string,"error": string | null,"household_id": string | null,"id": string,"input_tokens": number | null,"latency_ms": number | null,"model": string,"output_tokens": number | null,"status": string
                  }
                  Insert: {
                    "agent": string,"created_at"?: string,"error"?: string | null,"household_id"?: string | null,"id"?: string,"input_tokens"?: number | null,"latency_ms"?: number | null,"model": string,"output_tokens"?: number | null,"status": string
                  }
                  Update: {
                    "agent"?: string,"created_at"?: string,"error"?: string | null,"household_id"?: string | null,"id"?: string,"input_tokens"?: number | null,"latency_ms"?: number | null,"model"?: string,"output_tokens"?: number | null,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "agent_runs_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_log": {
                  Row: {
                    "action": string,"actor_id": string | null,"actor_type": string,"after": Json | null,"at": string,"before": Json | null,"entity": string,"entity_id": string | null,"household_id": string,"id": number
                  }
                  Insert: {
                    "action": string,"actor_id"?: string | null,"actor_type": string,"after"?: Json | null,"at"?: string,"before"?: Json | null,"entity": string,"entity_id"?: string | null,"household_id": string,"id"?: never
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"actor_type"?: string,"after"?: Json | null,"at"?: string,"before"?: Json | null,"entity"?: string,"entity_id"?: string | null,"household_id"?: string,"id"?: never
                  }
                  Relationships: [
                    
                  ]
                },"budget_alerts": {
                  Row: {
                    "budget_month": string,"cap_minor": number,"category_id": string,"fired_at": string,"household_id": string,"push_claimed_at": string | null,"push_status": string,"spent_minor": number,"threshold": number
                  }
                  Insert: {
                    "budget_month": string,"cap_minor": number,"category_id": string,"fired_at"?: string,"household_id": string,"push_claimed_at"?: string | null,"push_status"?: string,"spent_minor": number,"threshold": number
                  }
                  Update: {
                    "budget_month"?: string,"cap_minor"?: number,"category_id"?: string,"fired_at"?: string,"household_id"?: string,"push_claimed_at"?: string | null,"push_status"?: string,"spent_minor"?: number,"threshold"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "budget_alerts_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "budget_alerts_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    }
                  ]
                },"categories": {
                  Row: {
                    "archived_at": string | null,"budget_acknowledged": boolean,"color": string,"created_via": string,"hidden": boolean,"household_id": string,"icon": string,"id": string,"kind": string,"name": string,"rollover": boolean,"rollover_overspend": boolean,"sf_symbol": string,"sort_order": number
                  }
                  Insert: {
                    "archived_at"?: string | null,"budget_acknowledged"?: boolean,"color"?: string,"created_via"?: string,"hidden"?: boolean,"household_id": string,"icon"?: string,"id"?: string,"kind"?: string,"name": string,"rollover"?: boolean,"rollover_overspend"?: boolean,"sf_symbol"?: string,"sort_order"?: number
                  }
                  Update: {
                    "archived_at"?: string | null,"budget_acknowledged"?: boolean,"color"?: string,"created_via"?: string,"hidden"?: boolean,"household_id"?: string,"icon"?: string,"id"?: string,"kind"?: string,"name"?: string,"rollover"?: boolean,"rollover_overspend"?: boolean,"sf_symbol"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "categories_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    }
                  ]
                },"category_budgets": {
                  Row: {
                    "cap_minor": number,"category_id": string,"created_at": string,"created_by": string | null,"effective_month": string,"household_id": string
                  }
                  Insert: {
                    "cap_minor": number,"category_id": string,"created_at"?: string,"created_by"?: string | null,"effective_month": string,"household_id": string
                  }
                  Update: {
                    "cap_minor"?: number,"category_id"?: string,"created_at"?: string,"created_by"?: string | null,"effective_month"?: string,"household_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "category_budgets_category_id_household_id_fkey"
      columns: ["category_id","household_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id","household_id"]
    },{
      foreignKeyName: "category_budgets_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    }
                  ]
                },"category_rollovers": {
                  Row: {
                    "amount_minor": number,"budget_month": string,"category_id": string,"created_at": string,"household_id": string
                  }
                  Insert: {
                    "amount_minor": number,"budget_month": string,"category_id": string,"created_at"?: string,"household_id": string
                  }
                  Update: {
                    "amount_minor"?: number,"budget_month"?: string,"category_id"?: string,"created_at"?: string,"household_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "category_rollovers_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "category_rollovers_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    }
                  ]
                },"device_tokens": {
                  Row: {
                    "created_at": string,"household_id": string,"id": string,"label": string,"last_used_at": string | null,"revoked_at": string | null,"token_hash": string,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"household_id": string,"id"?: string,"label": string,"last_used_at"?: string | null,"revoked_at"?: string | null,"token_hash": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"household_id"?: string,"id"?: string,"label"?: string,"last_used_at"?: string | null,"revoked_at"?: string | null,"token_hash"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "device_tokens_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    }
                  ]
                },"fx_rates": {
                  Row: {
                    "base": string,"quote": string,"rate": number,"rate_date": string,"source": string
                  }
                  Insert: {
                    "base": string,"quote": string,"rate": number,"rate_date": string,"source": string
                  }
                  Update: {
                    "base"?: string,"quote"?: string,"rate"?: number,"rate_date"?: string,"source"?: string
                  }
                  Relationships: [
                    
                  ]
                },"household_income": {
                  Row: {
                    "amount_minor": number,"created_at": string,"created_by": string | null,"effective_month": string,"household_id": string
                  }
                  Insert: {
                    "amount_minor": number,"created_at"?: string,"created_by"?: string | null,"effective_month": string,"household_id": string
                  }
                  Update: {
                    "amount_minor"?: number,"created_at"?: string,"created_by"?: string | null,"effective_month"?: string,"household_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "household_income_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    }
                  ]
                },"household_invites": {
                  Row: {
                    "code_hash": string,"created_by": string | null,"expires_at": string,"household_id": string,"id": string,"used_at": string | null,"used_by": string | null
                  }
                  Insert: {
                    "code_hash": string,"created_by"?: string | null,"expires_at": string,"household_id": string,"id"?: string,"used_at"?: string | null,"used_by"?: string | null
                  }
                  Update: {
                    "code_hash"?: string,"created_by"?: string | null,"expires_at"?: string,"household_id"?: string,"id"?: string,"used_at"?: string | null,"used_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "household_invites_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    }
                  ]
                },"household_members": {
                  Row: {
                    "display_name": string,"household_id": string,"joined_at": string,"language": string,"notify_reports": boolean,"removed_at": string | null,"user_id": string
                  }
                  Insert: {
                    "display_name": string,"household_id": string,"joined_at"?: string,"language"?: string,"notify_reports"?: boolean,"removed_at"?: string | null,"user_id": string
                  }
                  Update: {
                    "display_name"?: string,"household_id"?: string,"joined_at"?: string,"language"?: string,"notify_reports"?: boolean,"removed_at"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "household_members_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    }
                  ]
                },"households": {
                  Row: {
                    "ai_consent_at": string | null,"base_currency": string,"created_at": string,"deleted_at": string | null,"id": string,"name": string,"settings": NonNullable<Json>,"timezone": string
                  }
                  Insert: {
                    "ai_consent_at"?: string | null,"base_currency"?: string,"created_at"?: string,"deleted_at"?: string | null,"id"?: string,"name": string,"settings"?: NonNullable<Json>,"timezone"?: string
                  }
                  Update: {
                    "ai_consent_at"?: string | null,"base_currency"?: string,"created_at"?: string,"deleted_at"?: string | null,"id"?: string,"name"?: string,"settings"?: NonNullable<Json>,"timezone"?: string
                  }
                  Relationships: [
                    
                  ]
                },"merchant_aliases": {
                  Row: {
                    "created_at": string,"household_id": string,"merchant_id": string,"normalized": string,"source": string
                  }
                  Insert: {
                    "created_at"?: string,"household_id": string,"merchant_id": string,"normalized": string,"source": string
                  }
                  Update: {
                    "created_at"?: string,"household_id"?: string,"merchant_id"?: string,"normalized"?: string,"source"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "merchant_aliases_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "merchant_aliases_merchant_id_household_id_fkey"
      columns: ["merchant_id","household_id"]
isOneToOne: false
      referencedRelation: "merchants"
      referencedColumns: ["id","household_id"]
    }
                  ]
                },"merchants": {
                  Row: {
                    "created_at": string,"default_category_id": string | null,"display_name": string,"household_id": string,"id": string,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"default_category_id"?: string | null,"display_name": string,"household_id": string,"id"?: string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"default_category_id"?: string | null,"display_name"?: string,"household_id"?: string,"id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "merchants_default_category_id_household_id_fkey"
      columns: ["default_category_id","household_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id","household_id"]
    },{
      foreignKeyName: "merchants_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    }
                  ]
                },"month_closes": {
                  Row: {
                    "budget_month": string,"carried_minor": number,"closed_at": string,"household_id": string,"net_minor": number,"reserved_minor": number,"snapshot": NonNullable<Json>,"total_cap_minor": number,"total_spent_minor": number
                  }
                  Insert: {
                    "budget_month": string,"carried_minor"?: number,"closed_at"?: string,"household_id": string,"net_minor": number,"reserved_minor"?: number,"snapshot": NonNullable<Json>,"total_cap_minor": number,"total_spent_minor": number
                  }
                  Update: {
                    "budget_month"?: string,"carried_minor"?: number,"closed_at"?: string,"household_id"?: string,"net_minor"?: number,"reserved_minor"?: number,"snapshot"?: NonNullable<Json>,"total_cap_minor"?: number,"total_spent_minor"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "month_closes_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    }
                  ]
                },"monthly_reports": {
                  Row: {
                    "agent_run_id": string | null,"budget_month": string,"claimed_at": string | null,"created_at": string,"household_id": string,"id": string,"metrics": NonNullable<Json>,"narrative": Json | null,"narratives": Json | null,"push_claimed_at": string | null,"push_status": string | null,"status": string,"updated_at": string
                  }
                  Insert: {
                    "agent_run_id"?: string | null,"budget_month": string,"claimed_at"?: string | null,"created_at"?: string,"household_id": string,"id"?: string,"metrics": NonNullable<Json>,"narrative"?: Json | null,"narratives"?: Json | null,"push_claimed_at"?: string | null,"push_status"?: string | null,"status": string,"updated_at"?: string
                  }
                  Update: {
                    "agent_run_id"?: string | null,"budget_month"?: string,"claimed_at"?: string | null,"created_at"?: string,"household_id"?: string,"id"?: string,"metrics"?: NonNullable<Json>,"narrative"?: Json | null,"narratives"?: Json | null,"push_claimed_at"?: string | null,"push_status"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "monthly_reports_agent_run_id_fkey"
      columns: ["agent_run_id"]
isOneToOne: false
      referencedRelation: "agent_runs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "monthly_reports_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    }
                  ]
                },"push_tokens": {
                  Row: {
                    "expo_push_token": string,"updated_at": string,"user_id": string
                  }
                  Insert: {
                    "expo_push_token": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "expo_push_token"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"recurring_reserves": {
                  Row: {
                    "amount_minor": number,"budget_month": string,"category_id": string,"created_at": string,"household_id": string,"rule_id": string
                  }
                  Insert: {
                    "amount_minor": number,"budget_month": string,"category_id": string,"created_at"?: string,"household_id": string,"rule_id": string
                  }
                  Update: {
                    "amount_minor"?: number,"budget_month"?: string,"category_id"?: string,"created_at"?: string,"household_id"?: string,"rule_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recurring_reserves_category_id_fkey"
      columns: ["category_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recurring_reserves_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recurring_reserves_rule_id_fkey"
      columns: ["rule_id"]
isOneToOne: false
      referencedRelation: "recurring_rules"
      referencedColumns: ["id"]
    }
                  ]
                },"recurring_rules": {
                  Row: {
                    "amount_kind": string,"amount_minor": number,"category_id": string,"created_at": string,"created_by": string | null,"currency": string,"day_of_month": number,"deleted_at": string | null,"end_date": string | null,"household_id": string,"id": string,"installment_count": number | null,"installment_first": string | null,"interval_months": number,"merchant_id": string | null,"next_run_date": string | null,"paused": boolean,"spread": boolean,"start_date": string,"title": string,"updated_at": string
                  }
                  Insert: {
                    "amount_kind": string,"amount_minor": number,"category_id": string,"created_at"?: string,"created_by"?: string | null,"currency": string,"day_of_month": number,"deleted_at"?: string | null,"end_date"?: string | null,"household_id": string,"id"?: string,"installment_count"?: number | null,"installment_first"?: string | null,"interval_months"?: number,"merchant_id"?: string | null,"next_run_date"?: string | null,"paused"?: boolean,"spread"?: boolean,"start_date": string,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "amount_kind"?: string,"amount_minor"?: number,"category_id"?: string,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"day_of_month"?: number,"deleted_at"?: string | null,"end_date"?: string | null,"household_id"?: string,"id"?: string,"installment_count"?: number | null,"installment_first"?: string | null,"interval_months"?: number,"merchant_id"?: string | null,"next_run_date"?: string | null,"paused"?: boolean,"spread"?: boolean,"start_date"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recurring_rules_category_id_household_id_fkey"
      columns: ["category_id","household_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id","household_id"]
    },{
      foreignKeyName: "recurring_rules_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recurring_rules_merchant_id_household_id_fkey"
      columns: ["merchant_id","household_id"]
isOneToOne: false
      referencedRelation: "merchants"
      referencedColumns: ["id","household_id"]
    }
                  ]
                },"savings_goal_moves": {
                  Row: {
                    "amount_minor": number,"created_at": string,"created_by": string | null,"goal_id": string,"household_id": string,"id": string
                  }
                  Insert: {
                    "amount_minor": number,"created_at"?: string,"created_by"?: string | null,"goal_id": string,"household_id": string,"id"?: string
                  }
                  Update: {
                    "amount_minor"?: number,"created_at"?: string,"created_by"?: string | null,"goal_id"?: string,"household_id"?: string,"id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "savings_goal_moves_goal_id_household_id_fkey"
      columns: ["goal_id","household_id"]
isOneToOne: false
      referencedRelation: "savings_goals"
      referencedColumns: ["id","household_id"]
    },{
      foreignKeyName: "savings_goal_moves_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    }
                  ]
                },"savings_goals": {
                  Row: {
                    "closed_at": string | null,"created_at": string,"created_by": string | null,"household_id": string,"id": string,"name": string,"sf_symbol": string,"target_minor": number,"target_month": string | null
                  }
                  Insert: {
                    "closed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"household_id": string,"id"?: string,"name": string,"sf_symbol"?: string,"target_minor": number,"target_month"?: string | null
                  }
                  Update: {
                    "closed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"household_id"?: string,"id"?: string,"name"?: string,"sf_symbol"?: string,"target_minor"?: number,"target_month"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "savings_goals_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    }
                  ]
                },"savings_ledger": {
                  Row: {
                    "amount_minor": number,"budget_month": string,"created_at": string,"created_by": string | null,"entry_type": string,"household_id": string,"id": string,"reason": string,"transaction_id": string | null
                  }
                  Insert: {
                    "amount_minor": number,"budget_month": string,"created_at"?: string,"created_by"?: string | null,"entry_type": string,"household_id": string,"id"?: string,"reason": string,"transaction_id"?: string | null
                  }
                  Update: {
                    "amount_minor"?: number,"budget_month"?: string,"created_at"?: string,"created_by"?: string | null,"entry_type"?: string,"household_id"?: string,"id"?: string,"reason"?: string,"transaction_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "savings_ledger_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "savings_ledger_transaction_id_fkey"
      columns: ["transaction_id"]
isOneToOne: false
      referencedRelation: "transactions"
      referencedColumns: ["id"]
    }
                  ]
                },"transactions": {
                  Row: {
                    "amount_base_minor": number,"amount_minor": number,"budget_month": string,"card_label": string | null,"category_id": string,"classification": Json | null,"created_at": string,"created_by": string | null,"currency": string,"deleted_at": string | null,"fx_rate": number,"fx_source": string,"household_id": string,"id": string,"idempotency_key": string | null,"merchant_id": string | null,"note": string | null,"occurred_at": string,"raw_merchant": string | null,"recurring_period": string | null,"recurring_rule_id": string | null,"source": string,"status": string,"title": string,"updated_at": string
                  }
                  Insert: {
                    "amount_base_minor"?: number,"amount_minor": number,"budget_month"?: string,"card_label"?: string | null,"category_id": string,"classification"?: Json | null,"created_at"?: string,"created_by"?: string | null,"currency": string,"deleted_at"?: string | null,"fx_rate"?: number,"fx_source"?: string,"household_id": string,"id"?: string,"idempotency_key"?: string | null,"merchant_id"?: string | null,"note"?: string | null,"occurred_at"?: string,"raw_merchant"?: string | null,"recurring_period"?: string | null,"recurring_rule_id"?: string | null,"source": string,"status"?: string,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "amount_base_minor"?: number,"amount_minor"?: number,"budget_month"?: string,"card_label"?: string | null,"category_id"?: string,"classification"?: Json | null,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"deleted_at"?: string | null,"fx_rate"?: number,"fx_source"?: string,"household_id"?: string,"id"?: string,"idempotency_key"?: string | null,"merchant_id"?: string | null,"note"?: string | null,"occurred_at"?: string,"raw_merchant"?: string | null,"recurring_period"?: string | null,"recurring_rule_id"?: string | null,"source"?: string,"status"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "transactions_category_id_household_id_fkey"
      columns: ["category_id","household_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id","household_id"]
    },{
      foreignKeyName: "transactions_household_id_fkey"
      columns: ["household_id"]
isOneToOne: false
      referencedRelation: "households"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "transactions_merchant_id_household_id_fkey"
      columns: ["merchant_id","household_id"]
isOneToOne: false
      referencedRelation: "merchants"
      referencedColumns: ["id","household_id"]
    },{
      foreignKeyName: "transactions_recurring_rule_id_household_id_fkey"
      columns: ["recurring_rule_id","household_id"]
isOneToOne: false
      referencedRelation: "recurring_rules"
      referencedColumns: ["id","household_id"]
    }
                  ]
                },"web_push_subscriptions": {
                  Row: {
                    "auth": string,"created_at": string,"endpoint": string,"p256dh": string,"updated_at": string,"user_agent": string | null,"user_id": string
                  }
                  Insert: {
                    "auth": string,"created_at"?: string,"endpoint": string,"p256dh": string,"updated_at"?: string,"user_agent"?: string | null,"user_id": string
                  }
                  Update: {
                    "auth"?: string,"created_at"?: string,"endpoint"?: string,"p256dh"?: string,"updated_at"?: string,"user_agent"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "add_savings_entry":
{ Args: { "p_amount_minor": number,"p_reason": string }; Returns: string
                           },
"advisor_candidates":
{ Args: { "p_household": string }; Returns: Json
                           },
"advisor_dismiss":
{ Args: { "p_candidate_id": string,"p_household": string,"p_reason": string }; Returns: undefined
                           },
"ai_under_cap":
{ Args: { "p_household": string }; Returns: boolean
                           },
"capture_auth":
{ Args: { "p_token_hash": string }; Returns: {
              "ai_enabled": boolean,"base_currency": string,"device_id": string,"household_id": string,"language": string,"user_id": string
            }[]
                           },
"capture_confirm":
{ Args: { "p_category_name": string,"p_device_id": string,"p_household": string,"p_new_category_name": string,"p_title": string,"p_transaction_id": string }; Returns: Json
                           },
"capture_health":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"capture_match":
{ Args: { "p_household": string,"p_raw": string }; Returns: Json
                           },
"capture_record":
{ Args: { "p": Json }; Returns: Json
                           },
"category_trend":
{ Args: { "p_category": string,"p_months"?: number }; Returns: Json
                           },
"claim_monthly_reports":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"claim_push_alerts":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"close_goal":
{ Args: { "p_id": string }; Returns: undefined
                           },
"create_device_token":
{ Args: { "p_label": string }; Returns: {
              "id": string,"token": string
            }[]
                           },
"create_household":
{ Args: { "p_base_currency": string,"p_display_name": string,"p_language"?: string,"p_name": string }; Returns: string
                           },
"create_installments":
{ Args: { "p_count": number,"p_transaction_id": string }; Returns: Json
                           },
"create_invite":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"decide_proposal":
{ Args: { "p_approve": boolean,"p_id": string }; Returns: Json
                           },
"delete_category":
{ Args: { "p_category_id": string,"p_dry_run"?: boolean }; Returns: Json
                           },
"find_transactions":
{ Args: { "p_before_at"?: string,"p_before_id"?: string,"p_filter"?: Json,"p_limit"?: number }; Returns: Json
                           },
"finish_push_alerts":
{ Args: { "p_dead_endpoints"?: (string)[],"p_dead_tokens": (string)[],"p_results": Json }; Returns: undefined
                           },
"join_household":
{ Args: { "p_code": string,"p_display_name": string }; Returns: string
                           },
"leave_household":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"list_goals":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"list_merchants":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"merge_merchants":
{ Args: { "p_from": string,"p_into": string }; Returns: Json
                           },
"month_overview":
{ Args: { "p_month"?: string }; Returns: Json
                           },
"move_goal":
{ Args: { "p_amount_minor": number,"p_id": string }; Returns: Json
                           },
"my_ai_usage":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"normalize_merchant":
{ Args: { "p_raw": string }; Returns: string
                           },
"prepare_account_deletion":
{ Args: { "p_user": string }; Returns: string
                           },
"rate_hit":
{ Args: { "p_key": string,"p_max": number,"p_window_seconds": number }; Returns: boolean
                           },
"recent_expense_templates":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"remove_member":
{ Args: { "p_user_id": string }; Returns: undefined
                           },
"remove_merchant_alias":
{ Args: { "p_merchant": string,"p_normalized": string }; Returns: undefined
                           },
"request_monthly_report":
{ Args: { "p_month": string }; Returns: undefined
                           },
"review_transaction":
{ Args: { "p_category_name": string,"p_new_category_name": string,"p_title": string,"p_transaction_id": string }; Returns: Json
                           },
"revoke_device_token":
{ Args: { "p_id": string }; Returns: undefined
                           },
"save_goal":
{ Args: { "p_id": string,"p_name": string,"p_symbol": string,"p_target_minor": number,"p_target_month": string }; Returns: string
                           },
"search_transactions":
{ Args: { "p_before_at"?: string,"p_before_id"?: string,"p_category"?: string,"p_limit"?: number,"p_month"?: string,"p_query"?: string }; Returns: Json
                           },
"set_budgets_bulk":
{ Args: { "p_budgets": Json,"p_income"?: number }; Returns: number
                           },
"set_category_budget":
{ Args: { "p_cap_minor": number,"p_category_id": string }; Returns: undefined
                           },
"set_monthly_income":
{ Args: { "p_amount_minor": number }; Returns: undefined
                           },
"set_my_language":
{ Args: { "p_language": string }; Returns: undefined
                           },
"set_report_notices":
{ Args: { "p_on": boolean }; Returns: undefined
                           },
"suggest_category":
{ Args: { "p_title": string }; Returns: Json
                           },
"summarize_transactions":
{ Args: { "p_filter"?: Json }; Returns: Json
                           },
"update_merchant":
{ Args: { "p_apply_existing"?: boolean,"p_category": string,"p_dry_run"?: boolean,"p_merchant": string,"p_name": string }; Returns: Json
                           },
"web_push_public_key":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"web_push_vapid":
{ Args: Record<PropertyKey, never>; Returns: Json
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

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            
          }
        }
} as const
