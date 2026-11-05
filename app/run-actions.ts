"use server";

import { revalidatePath } from "next/cache";
import { requireSuperadmin } from "@/lib/auth";
import { WORKSPACE } from "@/lib/workspace";
import { validateInputs } from "@/lib/study-plan";
import { executeStudyChain } from "@/lib/gemini";
import type { Run } from "@/lib/types";

export async function runChain(chainId: number, rawInputs: unknown): Promise<{ run?: Run; error?: string }> {
  const { supabase, user } = await requireSuperadmin();
  try {
    if (!Number.isSafeInteger(chainId) || chainId <= 0) throw new Error("Choose a valid prompt chain.");
    const inputs = validateInputs(rawInputs);
    const { data: chain, error: chainError } = await supabase.from("prompt_chains")
      .select("id,name").eq("workspace", WORKSPACE).eq("id", chainId).single();
    if (chainError || !chain) throw new Error("This chain is not available in PlanMyStudy.");
    const { data: steps, error: stepError } = await supabase.from("prompt_chain_steps")
      .select("prompt_text,step_order,id").eq("prompt_chain_id", chain.id).order("step_order").order("id");
    if (stepError) throw new Error("Could not load the chain steps. No run was started.");
    const output = await executeStudyChain(steps ?? [], inputs);
    // Recheck membership after generation: a chain may have been removed while
    // the provider was working. RLS also rechecks authorization on the insert.
    const { data: currentChain, error: currentError } = await supabase.from("prompt_chains")
      .select("id").eq("workspace", WORKSPACE).eq("id", chain.id).single();
    if (currentError || !currentChain) throw new Error("The chain is no longer available. The generated result was not saved.");
    const { data: run, error: saveError } = await supabase.from("prompt_chain_runs").insert({
      prompt_chain_id: chain.id, user_id: user.id,
      input_data: { ...inputs, chainName: chain.name }, output_data: output,
    }).select("id,prompt_chain_id,user_id,input_data,output_data,created_at").single();
    if (saveError || !run) throw new Error("Generation completed, but the run could not be saved. Check database access before retrying; retrying will generate again.");
    revalidatePath("/");
    return { run };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The chain could not be completed. Please try again." };
  }
}
