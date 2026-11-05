"use server";

import { revalidatePath } from "next/cache";
import { requireSuperadmin } from "@/lib/auth";
import { WORKSPACE } from "@/lib/workspace";

type Command = {
  kind: "save-chain" | "delete-chain" | "save-step" | "delete-step" | "move-step";
  chainId?: number; stepId?: number; name?: string; description?: string;
  prompt?: string; direction?: "up" | "down";
};
const validId = (id: unknown): id is number => typeof id === "number" && Number.isSafeInteger(id) && id > 0;

export async function mutate(command: Command): Promise<{ error?: string; chainId?: number }> {
  const { supabase } = await requireSuperadmin();
  try {
    if (!command || !["save-chain", "delete-chain", "save-step", "delete-step", "move-step"].includes(command.kind)) throw new Error("Invalid action.");
    if (command.chainId !== undefined && !validId(command.chainId)) throw new Error("Invalid chain.");
    // Validate workspace membership before ANY child reads or writes, including
    // deletes. Never trust a chain ID supplied by the browser.
    if (command.chainId !== undefined) {
      const { data: chain, error } = await supabase.from("prompt_chains")
        .select("id").eq("workspace", WORKSPACE).eq("id", command.chainId).single();
      if (error || !chain) throw new Error("This chain is not available in PlanMyStudy.");
    }
    if (command.kind === "save-chain") {
      const name = command.name?.trim();
      if (!name || name.length > 200) throw new Error("Enter a chain name of 1–200 characters.");
      const values = { workspace: WORKSPACE, name, description: command.description?.trim() || null };
      const query = command.chainId
        ? supabase.from("prompt_chains").update(values).eq("workspace", WORKSPACE).eq("id", command.chainId)
        : supabase.from("prompt_chains").insert(values);
      const { data, error } = await query.select("id").single();
      if (error) throw error;
      revalidatePath("/");
      return { chainId: data.id };
    }
    if (!validId(command.chainId)) throw new Error("Choose a chain first.");
    if (command.kind === "delete-chain") {
      // The existing step foreign key may not cascade, so remove children first.
      const { error: stepError } = await supabase.from("prompt_chain_steps").delete().eq("prompt_chain_id", command.chainId);
      if (stepError) throw stepError;
      const { error } = await supabase.from("prompt_chains").delete().eq("workspace", WORKSPACE).eq("id", command.chainId).select("id").single();
      if (error) throw new Error("Chain deletion failed. Its steps were removed; another database reference may prevent deleting the chain.");
    } else if (command.kind === "save-step") {
      const prompt_text = command.prompt?.trim();
      if (!prompt_text) throw new Error("Enter prompt text for this step.");
      if (command.stepId !== undefined && !validId(command.stepId)) throw new Error("Invalid step.");
      if (command.stepId) {
        const { error } = await supabase.from("prompt_chain_steps").update({ prompt_text }).eq("id", command.stepId).eq("prompt_chain_id", command.chainId).select("id").single();
        if (error) throw error;
      } else {
        const { data, error: readError } = await supabase.from("prompt_chain_steps").select("step_order").eq("prompt_chain_id", command.chainId).order("step_order", { ascending: false }).limit(1);
        if (readError) throw readError;
        const { error } = await supabase.from("prompt_chain_steps").insert({ prompt_chain_id: command.chainId, prompt_text, step_order: (data?.[0]?.step_order ?? 0) + 1 });
        if (error) throw error;
      }
    } else {
      if (!validId(command.stepId)) throw new Error("Invalid step.");
      if (command.kind === "delete-step") {
        const { error } = await supabase.from("prompt_chain_steps").delete().eq("id", command.stepId).eq("prompt_chain_id", command.chainId).select("id").single();
        if (error) throw error;
      } else {
        if (command.direction !== "up" && command.direction !== "down") throw new Error("Invalid direction.");
        const { data, error } = await supabase.from("prompt_chain_steps").select("id,prompt_chain_id,step_order,prompt_text,created_at").eq("prompt_chain_id", command.chainId).order("step_order").order("id");
        if (error) throw error;
        const index = data.findIndex(step => step.id === command.stepId);
        const target = index + (command.direction === "up" ? -1 : 1);
        if (index < 0 || target < 0 || target >= data.length) throw new Error("This step cannot move further.");
        [data[index], data[target]] = [data[target], data[index]];
        // One statement updates the complete order, avoiding partial two-write swaps.
        const { error: writeError } = await supabase.from("prompt_chain_steps").upsert(data.map((step, i) => ({ ...step, step_order: i + 1 })), { onConflict: "id" });
        if (writeError) throw writeError;
      }
    }
    revalidatePath("/");
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The change could not be saved. Please try again." };
  }
}

// Explicit opt-in: page reads never create records. Only an empty PlanMyStudy
// workspace can be initialized; existing chains (including legacy data) stay intact.
export async function createStarterChains(): Promise<{ error?: string; chainId?: number }> {
  const { supabase } = await requireSuperadmin();
  const { data: existing, error: readError } = await supabase.from("prompt_chains")
    .select("id").eq("workspace", WORKSPACE).limit(1);
  if (readError) return { error: "Could not check the workspace. Please refresh and try again." };
  if (existing?.length) return { error: "This workspace already contains chains. Refresh to view them." };

  const { data: chains, error } = await supabase.from("prompt_chains").insert([
    { workspace: WORKSPACE, name: "Midterm Study Plan", description: "Generate a personalized study plan for upcoming midterms." },
    { workspace: WORKSPACE, name: "Final Exam Crunch", description: "Create an intensive, time-efficient study plan for final exams." },
    { workspace: WORKSPACE, name: "Weekly Review", description: "Create a weekly study review and adjusted plan." },
  ]).select("id,name");
  if (error || !chains) return { error: "Could not create starter chains. Please try again." };
  const midterm = chains.find(chain => chain.name === "Midterm Study Plan");
  if (!midterm) return { error: "Starter chains were created, but the midterm chain could not be identified. Refresh to review them." };
  const prompts = [
    "Analyze priorities — Rank courses by exam date and difficulty.",
    "Find study windows — Match availability with productive study times.",
    "Allocate study time — Distribute time across courses based on priority.",
    "Generate three plans — Create Balanced, Intensive, and Flexible plans.",
    "Format final plans — Recommend the best plan and present all options clearly.",
  ];
  const { error: stepError } = await supabase.from("prompt_chain_steps").insert(
    prompts.map((prompt_text, index) => ({ prompt_chain_id: midterm.id, step_order: index + 1, prompt_text }))
  );
  if (stepError) {
    // A failed multi-row step insert is atomic. Remove only chains created above
    // so the user can retry, without touching pre-existing or legacy records.
    const { error: cleanupError } = await supabase.from("prompt_chains").delete()
      .eq("workspace", WORKSPACE).in("id", chains.map(chain => chain.id));
    revalidatePath("/");
    return { error: cleanupError
      ? "Starter chains were created, but their steps could not be saved. Refresh and add the steps manually."
      : "Starter steps could not be saved. No starter chains were kept; please try again." };
  }
  revalidatePath("/");
  return { chainId: midterm.id };
}
