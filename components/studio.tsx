"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createStarterChains, mutate } from "@/app/actions";
import LogoutButton from "@/components/logout-button";
import DashboardOverview from "@/components/dashboard-overview";
import RunForm from "@/components/run-form";
import RunViewer, { runDate, runInput } from "@/components/run-viewer";
import type { Chain, Step, Run } from "@/lib/types";

type Editor = { type: "chain"; chain?: Chain } | { type: "step"; step?: Step };
const date = (value: string) => new Date(value).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" });

export default function Studio({ chains, selected, steps, runs: savedRuns, allRuns, email, loadError, initialSection = "Dashboard" }: {
  chains: Chain[]; selected: Chain | null; steps: Step[]; runs: Run[]; allRuns: Run[]; email: string; loadError: string | null; initialSection?: "Dashboard" | "Prompt Chains";
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("Steps");
  const [section, setSection] = useState<string>(initialSection);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [openedRun, setOpenedRun] = useState<Run | null>(null);
  const [runningChain, setRunningChain] = useState<Chain | null>(null);
  const [generatedRun, setGeneratedRun] = useState<Run | null>(null);
  const runs = generatedRun && generatedRun.prompt_chain_id === selected?.id && !savedRuns.some(run => run.id === generatedRun?.id)
    ? [generatedRun, ...savedRuns] : savedRuns;
  const workspaceRuns = generatedRun && chains.some(chain => chain.id === generatedRun.prompt_chain_id) && !allRuns.some(run => run.id === generatedRun.id) ? [generatedRun, ...allRuns] : allRuns;
  const latest = runs[0];
  const chainName = (run: Run) => runInput(run, "chainName") || chains.find(chain => chain.id === run.prompt_chain_id)?.name || "Study workflow";
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    let preference = "light";
    try {
      const stored = localStorage.getItem("planmystudy-theme");
      if (stored && ["light", "dark", "system"].includes(stored)) preference = stored;
    } catch { /* Light still works if browser storage is unavailable. */ }
    document.documentElement.dataset.theme = preference;
    const select = document.getElementById("theme") as HTMLSelectElement | null;
    if (select) select.value = preference;
  }, []);
  // Section changes and focused run views start at the top, rather than keeping
  // the scroll position from a long chain editor or previous study plan.
  useEffect(() => { window.scrollTo({ top: 0 }); }, [section, openedRun?.id]);
  const navigate = (next: string) => {
    setSection(next); setOpenedRun(null); setError(null); setNotice("");
  };
  const viewRun = (run: Run) => {
    setSection("Generated Runs"); setOpenedRun(run); setError(null); setNotice("");
  };
  const changeTheme = (value: string) => {
    document.documentElement.dataset.theme = value;
    try { localStorage.setItem("planmystudy-theme", value); } catch { /* Keep the selection for this visit. */ }
  };
  const seedWorkspace = () => {
    setError(null); setNotice("");
    startTransition(async () => {
      try {
        const result = await createStarterChains();
        if (result.error) { setError(result.error); router.refresh(); return; }
        setNotice("Your three study-planning chains are ready.");
        router.push(`/?chain=${result.chainId}`);
        router.refresh();
      } catch { setError("Starter chains could not be created. Refresh before trying again."); }
    });
  };
  const execute = (command: Parameters<typeof mutate>[0]) => {
    setError(null); setNotice("");
    startTransition(async () => {
      try {
        const result = await mutate(command);
        if (result.error) { setError(result.error); return; }
        setEditor(null); setNotice("Changes saved.");
        if (result.chainId) router.push(`/?chain=${result.chainId}`);
        else if (command.kind === "delete-chain") router.push("/");
        router.refresh();
      } catch { setError("The request failed. Refresh and try again."); }
    });
  };
  const deleteChain = () => {
    if (selected && confirm(`Delete “${selected.name}”? Its steps and associated run history will be removed. If another database reference blocks deletion, its steps may already have been removed.`)) execute({ kind: "delete-chain", chainId: selected.id });
  };
  const openEditor = (value: Editor) => { setError(null); if (value.type === "chain" && !value.chain) { setSection("Prompt Chains"); setOpenedRun(null); } setEditor(value); };
  const visible = chains.filter(chain => `${chain.name} ${chain.description ?? ""}`.toLowerCase().includes(search.toLowerCase()));
  const showRuns = tab === "Runs";
  return <div className="app-shell">
    <aside className="sidebar">
      <Link href="/" className="brand"><span className="brand-mark" aria-hidden="true">▤</span><span>PlanMyStudy<small>Prompt Chain Studio</small></span></Link>
      <span className="nav-label">WORKSPACE</span>
      <nav aria-label="Main navigation">{["Dashboard", "Prompt Chains", "Generated Runs", "Models"].map((item, i) => <button key={item} className={`nav-item ${section === item ? "active" : ""}`} aria-current={section === item ? "page" : undefined} onClick={() => navigate(item)}><span aria-hidden="true">{["◫", "▤", "◷", "◇"][i]}</span>{item}</button>)}</nav>
      <div className="sidebar-bottom"><label htmlFor="theme">Theme</label><select id="theme" defaultValue="light" onChange={event => changeTheme(event.target.value)}><option value="light">Light</option><option value="dark">Dark</option><option value="system">System</option></select><div className="account"><span className="avatar">S</span><div><strong>Superadmin</strong><small title={email}>{email}</small></div></div><LogoutButton /></div>
    </aside>
    <main className="workspace">
      <header className="topbar"><span>PlanMyStudy <span className="slash">/</span> {section}</span><span className="access-badge">● Superadmin access</span></header>
      <div className="page-content">
        <div className="page-heading"><div><p className="eyebrow">{{ Dashboard: "Dashboard Overview", "Prompt Chains": "Prompt Chain Management", "Generated Runs": "Saved Run History", Models: "Model Configuration" }[section]}</p><h1>{section}</h1><p className="muted">{section === "Dashboard" ? "Create and manage AI workflows for personalized study plans." : section === "Prompt Chains" ? "Build, edit, and organize the workflows that generate study plans." : section === "Generated Runs" ? "Review saved study-plan outputs and the inputs used to create them." : "Design personalized study plans, one thoughtful prompt at a time."}</p></div>{section !== "Models" && <button className="primary" onClick={() => openEditor({ type: "chain" })}>+ New Prompt Chain</button>}</div>
        {loadError && <div className="alert" role="alert">{loadError}</div>}
        {error && !editor && <div className="alert" role="alert">{error}</div>}
        {notice && <p className="notice" role="status">{notice}</p>}

        {section === "Dashboard" ? <DashboardOverview chains={chains} selected={selected} stepCount={steps.length} runs={workspaceRuns} onManage={() => navigate("Prompt Chains")} onViewRuns={() => navigate("Generated Runs")} onOpenRun={viewRun} /> : section === "Models" ? <div className="panel empty"><span className="empty-symbol">◇</span><h2>Gemini study-plan generation</h2><p>Gemini runs your workflow steps sequentially on the server. Open a prompt chain and choose Run Chain to generate a study plan.</p><button onClick={() => setSection("Prompt Chains")}>Back to Prompt Chains</button></div> : section === "Generated Runs" ? <section className="panel all-runs">
          {openedRun ? <RunViewer key={openedRun.id} run={openedRun} chainName={chainName(openedRun)} onClose={() => { setOpenedRun(null); setNotice(""); }} closeLabel="← Back to all runs" /> : <>
            <div className="section-heading"><div><h2>Saved study plans</h2><p className="muted">Completed runs across your PlanMyStudy chains, newest first.</p></div><span className="pill">{workspaceRuns.length} SAVED</span></div>
            {workspaceRuns.length ? <div className="run-list">{workspaceRuns.map(run => <button key={run.id} onClick={() => viewRun(run)}><span><strong>{chainName(run)}</strong><small>{runDate(run.created_at)} ET · Run #{run.id}</small><span className="run-context">{runInput(run, "courses").slice(0, 180) || "Open to view saved inputs"}</span></span><span>Open run →</span></button>)}</div> : <div className="empty inset"><span className="empty-symbol">◷</span><h3>No study plans saved yet</h3><p>Select a chain and use Run Chain to generate your first study plan.</p><button onClick={() => navigate("Prompt Chains")}>Go to Prompt Chains</button></div>}
          </>}
        </section> : <div className="studio-grid">
          <section className="panel chain-list" aria-label="Prompt chains"><div className="list-heading"><h2>Your chains</h2><span className="count">{chains.length}</span></div><label className="sr-only" htmlFor="search">Search chains</label><input id="search" type="search" placeholder="Search prompt chains…" value={search} onChange={event => setSearch(event.target.value)} /><div className="chain-items">{visible.map(chain => <button key={chain.id} className={`chain-item ${selected?.id === chain.id ? "selected" : ""}`} onClick={() => { setOpenedRun(null); setError(null); router.push(`/?chain=${chain.id}`); }}><span className="chain-icon">▤</span><strong>{chain.name}</strong><p>{chain.description || "No description yet."}</p><small>View workflow <span>→</span></small></button>)}{visible.length === 0 && <p className="list-empty">{search ? "No matching chains. Try another search." : "Your first workflow starts here. Create a prompt chain to get started."}</p>}</div></section>
          <section className="panel chain-detail" aria-label="Selected chain">{!selected ? <div className="empty"><span className="empty-symbol">▤</span><h2>Create your first prompt chain</h2><p>Create three starter chains, including a Midterm Study Plan with five ready-to-edit steps. Or start with your own blank chain.</p><div className="empty-actions"><button className="primary" disabled={pending || !!loadError} onClick={seedWorkspace}>{pending ? "Creating starter chains…" : "Create study-planner starters"}</button><button disabled={pending} onClick={() => openEditor({ type: "chain" })}>+ New Prompt Chain</button></div><div className="starter-preview"><p className="starter-label">Included with the starters</p><ul className="starter-chips" aria-label="Starter chains"><li>Midterm Study Plan</li><li>Final Exam Crunch</li><li>Weekly Review</li></ul></div></div> : <>
            <div className="chain-heading"><div><span className="pill">STUDY WORKFLOW</span><h2>{selected.name}</h2><p className="muted">{selected.description || "Add a description to explain what this workflow does."}</p><small>{steps.length} {steps.length === 1 ? "step" : "steps"} <span className="slash">·</span> Created {date(selected.created_at)} ET</small></div><div className="chain-toolbar"><button className="primary" disabled={pending || !!runningChain || steps.length === 0 || !!loadError} title={steps.length === 0 ? "Add a step before running this chain." : "Generate study plans using this workflow"} onClick={() => setRunningChain(selected)}>▷ Run Chain</button><button disabled={pending} onClick={() => openEditor({ type: "chain", chain: selected })}>Edit Chain</button>{latest && <button onClick={() => viewRun(latest)}>View latest generated plan →</button>}</div></div>
            <div className="tabs" role="tablist" aria-label="Chain sections">{["Steps", "Runs", "Details"].map(item => <button role="tab" aria-selected={(section === "Generated Runs" ? "Runs" : tab) === item} key={item} onClick={() => { setTab(item); if (section === "Generated Runs") setSection("Prompt Chains"); setOpenedRun(null); }}>{item}{item === "Steps" && <span className="count">{steps.length}</span>}{item === "Runs" && <span className="count">{runs.length}</span>}</button>)}</div>
            <div className="tab-content" role="tabpanel">
              {showRuns ? <><div className="section-heading"><div><h3>Saved runs</h3><p className="muted">Generated results associated with this chain.</p></div><span className="pill pink">READ ONLY</span></div>{runs.length === 0 ? <div className="empty inset"><span className="empty-symbol">◷</span><h3>A fresh start for this workflow</h3><p>No saved runs yet. Run this chain to generate and save three personalized study plans.</p><small>Use Run Chain above to create your first study plan.</small></div> : <div className="run-list">{runs.map(run => <button key={run.id} onClick={() => viewRun(run)}><span><strong>Run #{run.id}</strong><small>{date(run.created_at)} ET</small></span><span>Open run →</span></button>)}</div>}
              </> : tab === "Steps" ? <><div className="section-heading"><div><h3>Workflow steps</h3><p className="muted">Each prompt builds on the step before it.</p></div><button className="primary" disabled={pending} onClick={() => openEditor({ type: "step" })}>+ Add Step</button></div>{steps.length === 0 ? <div className="empty inset"><span className="empty-symbol">▤</span><h3>Give your workflow a starting point</h3><p>Add your first prompt, then build the sequence one step at a time.</p></div> : <ol className="steps">{steps.map((step, index) => <li key={step.id}><span className="step-number">{String(index + 1).padStart(2, "0")}</span><div className="step-body"><div className="step-label">STEP {index + 1}</div>{step.prompt_text.includes(" — ") ? <><h4 className="step-title">{step.prompt_text.split(" — ")[0]}</h4><p>{step.prompt_text.split(" — ").slice(1).join(" — ")}</p></> : <p>{step.prompt_text}</p>}<div className="step-actions"><button disabled={pending || index === 0} onClick={() => execute({ kind: "move-step", chainId: selected.id, stepId: step.id, direction: "up" })}>↑ Move Up</button><button disabled={pending || index === steps.length - 1} onClick={() => execute({ kind: "move-step", chainId: selected.id, stepId: step.id, direction: "down" })}>↓ Move Down</button><button disabled={pending} onClick={() => openEditor({ type: "step", step })}>Edit Step</button><button className="danger-text" disabled={pending} onClick={() => { if (confirm("Delete this step?")) execute({ kind: "delete-step", chainId: selected.id, stepId: step.id }); }}>Delete Step</button></div></div></li>)}</ol>}<div className="editor-note"><span>◇</span> Step order defines the workflow sequence. Use Move Up and Move Down to adjust it.</div></> : <><h3>Chain details</h3><dl className="details"><dt>Name</dt><dd>{selected.name}</dd><dt>Description</dt><dd>{selected.description || "No description provided."}</dd><dt>Created</dt><dd>{date(selected.created_at)} ET</dd><dt>Chain ID</dt><dd>{selected.id}</dd></dl><div className="detail-actions"><button disabled={pending} onClick={() => openEditor({ type: "chain", chain: selected })}>Edit Chain</button><button className="danger-text" disabled={pending} onClick={deleteChain}>Delete Chain</button></div></>}
            </div></>}
          </section>
        </div>}

      </div>
    </main>
    {runningChain && <RunForm chain={runningChain} stepCount={steps.length} onClose={() => setRunningChain(null)} onSuccess={run => {
      setGeneratedRun(run); setOpenedRun(run); setRunningChain(null); setTab("Runs"); setSection("Generated Runs");
      setNotice("Study plan generated successfully. Your result is shown below and saved in Generated Runs."); router.refresh();
    }} />}
    {editor && <dialog className="modal-backdrop" ref={node => { if (node && !node.open) node.showModal(); }} onCancel={event => { if (pending) event.preventDefault(); else setEditor(null); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="editor-title"><h2 id="editor-title">{editor.type === "chain" ? `${editor.chain ? "Edit" : "New"} Prompt Chain` : `${editor.step ? "Edit" : "Add"} Step`}</h2><p className="muted">{editor.type === "chain" ? "Give your workflow a clear name and purpose." : "Write the instructions for this part of the workflow."}</p><form onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); if (editor.type === "chain") execute({ kind: "save-chain", chainId: editor.chain?.id, name: String(data.get("name")), description: String(data.get("description")) }); else if (selected) execute({ kind: "save-step", chainId: selected.id, stepId: editor.step?.id, prompt: String(data.get("prompt")) }); }}>
      {editor.type === "chain" ? <><label htmlFor="chain-name">Chain name</label><input autoFocus required maxLength={200} id="chain-name" name="name" defaultValue={editor.chain?.name ?? ""} placeholder="e.g. Personalized Study Planner" /><label htmlFor="description">Description</label><textarea id="description" name="description" rows={4} defaultValue={editor.chain?.description ?? ""} placeholder="What will this workflow help you create?" /></> : <><label htmlFor="prompt">Prompt text</label><textarea autoFocus required id="prompt" name="prompt" rows={9} defaultValue={editor.step?.prompt_text ?? ""} placeholder="e.g. Rank the courses based on exam dates and difficulty. Explain your priorities." /></>}
      {error && <p className="alert" role="alert">{error}</p>}<div className="modal-actions"><button type="button" disabled={pending} onClick={() => setEditor(null)}>Cancel</button><button className="primary" disabled={pending} type="submit">{pending ? "Saving…" : "Save changes"}</button></div>
    </form></section></dialog>}
  </div>;
}
