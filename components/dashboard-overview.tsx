"use client";

import type { Chain, Run } from "@/lib/types";
import { runDate, runInput } from "@/components/run-viewer";

export default function DashboardOverview({ chains, selected, stepCount, runs, onManage, onViewRuns, onOpenRun }: {
  chains: Chain[];
  selected: Chain | null;
  stepCount: number;
  runs: Run[];
  onManage: () => void;
  onViewRuns: () => void;
  onOpenRun: (run: Run) => void;
}) {
  return <>
    <div className="stats">
      <div><small>Prompt Chains</small><strong>{chains.length}</strong></div>
      <div><small>Steps in selected chain</small><strong>{stepCount}</strong><span className="stat-context">{selected?.name || "No chain selected"}</span></div>
      <div><small>Saved Runs</small><strong>{runs.length}</strong></div>
    </div>
    <div className="overview-grid">
      <section className="panel overview-section">
        <h2>Quick Actions</h2>
        <p className="muted">Build a workflow or revisit a generated plan.</p>
        <div className="overview-actions">
          <button className="primary" onClick={onManage}>Manage Prompt Chains →</button>
          <button onClick={onViewRuns}>View Generated Runs →</button>
        </div>
      </section>
      <section className="panel overview-section">
        <div className="section-heading"><h2>Recent Runs</h2>{runs.length > 0 && <button onClick={onViewRuns}>View all runs</button>}</div>
        {runs.length ? <div className="run-list">{runs.slice(0, 5).map(run => <button key={run.id} onClick={() => onOpenRun(run)}>
          <span><strong>{runInput(run, "chainName") || chains.find(chain => chain.id === run.prompt_chain_id)?.name || "Study workflow"}</strong><small>{runDate(run.created_at)} ET</small></span><span>View plan →</span>
        </button>)}</div> : <div className="overview-empty"><h3>No saved plans yet</h3><p className="muted">Open Prompt Chains to select a workflow and run your first study plan.</p><button onClick={onManage}>Go to Prompt Chains</button></div>}
      </section>
    </div>
  </>;
}
