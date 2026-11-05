export type Chain = { id: number; name: string; description: string | null; created_at: string };
export type Step = { id: number; prompt_chain_id: number; step_order: number; prompt_text: string; created_at: string };
export type Run = { id: number; prompt_chain_id: number; user_id: string; input_data: unknown; output_data: unknown; created_at: string };
