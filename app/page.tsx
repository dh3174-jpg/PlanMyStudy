import { connection } from "next/server";
import { requireSuperadmin } from "@/lib/auth";
import Studio from "@/components/studio";
import { WORKSPACE } from "@/lib/workspace";

export const instant = false;

export default async function HomePage({ searchParams }: PageProps<"/">) {
  await connection();
  const { supabase, user } = await requireSuperadmin();
  const params = await searchParams;
  const chainsResult = await supabase.from("prompt_chains").select("id,name,description,created_at").eq("workspace", WORKSPACE).order("created_at", { ascending: false });
  const chains = chainsResult.data ?? [];
  const requested = Number(params.chain);
  const selected = chains.find(chain => chain.id === requested) ?? chains[0];
  const [stepsResult, runsResult] = selected ? await Promise.all([
    supabase.from("prompt_chain_steps").select("id,prompt_chain_id,step_order,prompt_text,created_at").eq("prompt_chain_id", selected.id).order("step_order").order("id"),
    supabase.from("prompt_chain_runs").select("id,prompt_chain_id,user_id,input_data,output_data,created_at").eq("prompt_chain_id", selected.id).order("created_at", { ascending: false }),
  ]) : [{ data: [], error: null }, { data: [], error: null }];
  const error = chainsResult.error || stepsResult.error || runsResult.error;
  return <Studio chains={chains} selected={selected ?? null} steps={stepsResult.data ?? []} runs={runsResult.data ?? []} email={user.email ?? "Superadmin"} loadError={error ? "Some records could not be loaded. Check database permissions and refresh before editing." : null} />;
}
