"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createStarterChains, mutate } from "@/app/actions";
import type { Chain, Step, Run } from "@/lib/types";

type Editor = { type: "chain"; chain?: Chain } | { type: "step"; step?: Step };
const date = (value: string) => new Date(value).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" });
function DataView({ value }: { value: unknown }) {
  return <pre className="data-view">{typeof value === "string" ? value : JSON.stringify(value, null, 2)}</pre>;
}

export default function Studio({ chains, selected, steps, runs, email, loadError }: {
  chains: Chain[]; selected: Chain | null; steps: Step[]; runs: Run[]; email: string; loadError: string | null;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("Steps");
  const [section, setSection] = useState("Prompt Chains");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [openedRun, setOpenedRun] = useState<Run | null>(null);
  const [runTab, setRunTab] = useState("Output");
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
  const openEditor = (value: Editor) => { setError(null); setEditor(value); };
  const visible = chains.filter(chain => `${chain.name} ${chain.description ?? ""}`.toLowerCase().includes(search.toLowerCase()));
  const showRuns = section === "Generated Runs" || tab === "Runs";
  return <div className="app-shell">
    <aside className="sidebar">
      <Link href="/" className="brand"><span className="brand-mark" aria-hidden="true">▤</span><span>PlanMyStudy<small>Prompt Chain Studio</small></span></Link>
      <span className="nav-label">WORKSPACE</span>
      <nav aria-label="Main navigation">{["Dashboard", "Prompt Chains", "Generated Runs", "Models"].map((item, i) => <button key={item} className={`nav-item ${section === item ? "active" : ""}`} onClick={() => { setSection(item); setOpenedRun(null); }}><span aria-hidden="true">{["◫", "▤", "◷", "◇"][i]}</span>{item}</button>)}</nav>
      <div className="sidebar-bottom"><label htmlFor="theme">Theme</label><select id="theme" defaultValue="light" onChange={event => changeTheme(event.target.value)}><option value="light">Light</option><option value="dark">Dark</option><option value="system">System</option></select><div className="account"><span className="avatar">S</span><div><strong>Superadmin</strong><small title={email}>{email}</small></div></div></div>
    </aside>
    <main className="workspace">
      <header className="topbar"><span>PlanMyStudy <span className="slash">/</span> {section}</span><span className="access-badge">● Superadmin access</span></header>
      <div className="page-content">
        <div className="page-heading"><div><p className="eyebrow">PLAN WITH PURPOSE</p><h1>{section}</h1><p className="muted">Design personalized study plans, one thoughtful prompt at a time.</p></div>{section !== "Models" && <button className="primary" onClick={() => openEditor({ type: "chain" })}>+ New Prompt Chain</button>}</div>
        {loadError && <div className="alert" role="alert">{loadError}</div>}
        {error && !editor && <div className="alert" role="alert">{error}</div>}
        {notice && <p className="notice" role="status">{notice}</p>}
        {section === "Dashboard" && <div className="stats"><div><small>Prompt chains</small><strong>{chains.length}</strong></div><div><small>Steps in selected chain</small><strong>{steps.length}</strong></div><div><small>Saved runs in selected chain</small><strong>{runs.length}</strong></div></div>}
        {section === "Models" ? <div className="panel empty"><span className="empty-symbol">◇</span><h2>Models, when you’re ready</h2><p>AI-provider configuration belongs to a later phase. You can build and organize your prompt chains now.</p><button onClick={() => setSection("Prompt Chains")}>Back to Prompt Chains</button></div> : <div className="studio-grid">
          <section className="panel chain-list" aria-label="Prompt chains"><div className="list-heading"><h2>Your chains</h2><span className="count">{chains.length}</span></div><label className="sr-only" htmlFor="search">Search chains</label><input id="search" type="search" placeholder="Search prompt chains…" value={search} onChange={event => setSearch(event.target.value)} /><div className="chain-items">{visible.map(chain => <button key={chain.id} className={`chain-item ${selected?.id === chain.id ? "selected" : ""}`} onClick={() => { setOpenedRun(null); setError(null); router.push(`/?chain=${chain.id}`); }}><span className="chain-icon">▤</span><strong>{chain.name}</strong><p>{chain.description || "No description yet."}</p><small>View workflow <span>→</span></small></button>)}{visible.length === 0 && <p className="list-empty">{search ? "No matching chains. Try another search." : "Your first workflow starts here. Create a prompt chain to get started."}</p>}</div><div className="list-footer">A little structure. A clearer plan.</div></section>
          <section className="panel chain-detail" aria-label="Selected chain">{!selected ? <div className="empty"><span className="empty-symbol">▤</span><h2>Create your first prompt chain</h2><p>Turn study-planning prompts into an ordered workflow.</p><div className="empty-actions"><button className="primary" disabled={pending || !!loadError} onClick={seedWorkspace}>{pending ? "Creating starter chains…" : "Create study-planner starters"}</button><button disabled={pending} onClick={() => openEditor({ type: "chain" })}>+ New Prompt Chain</button></div><small>Midterm Study Plan · Final Exam Crunch · Weekly Review</small></div> : <>
            <div className="chain-heading"><div><span className="pill">STUDY WORKFLOW</span><h2>{selected.name}</h2><p className="muted">{selected.description || "Add a description to explain what this workflow does."}</p><small>{steps.length} {steps.length === 1 ? "step" : "steps"} <span className="slash">·</span> Created {date(selected.created_at)} ET</small></div><div className="chain-toolbar"><button className="primary run-reserved" disabled title="Chain generation will be added in a later phase.">▷ Run Chain <span>Soon</span></button><button disabled={pending} onClick={() => openEditor({ type: "chain", chain: selected })}>Edit Chain</button></div></div>
            <div className="tabs" role="tablist" aria-label="Chain sections">{["Steps", "Runs", "Details"].map(item => <button role="tab" aria-selected={(section === "Generated Runs" ? "Runs" : tab) === item} key={item} onClick={() => { setTab(item); if (section === "Generated Runs") setSection("Prompt Chains"); setOpenedRun(null); }}>{item}{item === "Steps" && <span className="count">{steps.length}</span>}{item === "Runs" && <span className="count">{runs.length}</span>}</button>)}</div>
            <div className="tab-content" role="tabpanel">
              {showRuns ? <><div className="section-heading"><div><h3>Saved runs</h3><p className="muted">Generated results associated with this chain.</p></div><span className="pill pink">READ ONLY</span></div>{runs.length === 0 ? <div className="empty inset"><span className="empty-symbol">◷</span><h3>A fresh start for this workflow</h3><p>No saved runs yet. Results will appear here when this chain has generated a study plan.</p><small>Generation will be added in a later phase.</small></div> : <div className="run-list">{runs.map(run => <button key={run.id} onClick={() => { setOpenedRun(run); setRunTab("Output"); }}><span><strong>Run #{run.id}</strong><small>{date(run.created_at)} ET</small></span><span>Open run →</span></button>)}</div>}
              {openedRun && <article className="run-output"><div className="section-heading"><h3>Run #{openedRun.id}</h3><button onClick={() => setOpenedRun(null)}>Close</button></div><div className="tabs">{["Output", "Run Details"].map(item => <button key={item} aria-pressed={runTab === item} onClick={() => setRunTab(item)}>{item}</button>)}</div>{runTab === "Output" ? <DataView value={openedRun.output_data} /> : <><p><strong>Chain:</strong> {selected.name}</p><p><strong>Generated:</strong> {date(openedRun.created_at)} ET</p><p><strong>User:</strong> {openedRun.user_id}</p><h4>Input data</h4><DataView value={openedRun.input_data} /></>}</article>}</> : tab === "Steps" ? <><div className="section-heading"><div><h3>Workflow steps</h3><p className="muted">Each prompt builds on the step before it.</p></div><button className="primary" disabled={pending} onClick={() => openEditor({ type: "step" })}>+ Add Step</button></div>{steps.length === 0 ? <div className="empty inset"><span className="empty-symbol">▤</span><h3>Give your workflow a starting point</h3><p>Add your first prompt, then build the sequence one step at a time.</p></div> : <ol className="steps">{steps.map((step, index) => <li key={step.id}><span className="step-number">{String(index + 1).padStart(2, "0")}</span><div className="step-body"><div className="step-label">STEP {index + 1}</div>{step.prompt_text.includes(" — ") ? <><h4 className="step-title">{step.prompt_text.split(" — ")[0]}</h4><p>{step.prompt_text.split(" — ").slice(1).join(" — ")}</p></> : <p>{step.prompt_text}</p>}<div className="step-actions"><button disabled={pending || index === 0} onClick={() => execute({ kind: "move-step", chainId: selected.id, stepId: step.id, direction: "up" })}>↑ Move Up</button><button disabled={pending || index === steps.length - 1} onClick={() => execute({ kind: "move-step", chainId: selected.id, stepId: step.id, direction: "down" })}>↓ Move Down</button><button disabled={pending} onClick={() => openEditor({ type: "step", step })}>Edit Step</button><button className="danger-text" disabled={pending} onClick={() => { if (confirm("Delete this step?")) execute({ kind: "delete-step", chainId: selected.id, stepId: step.id }); }}>Delete Step</button></div></div></li>)}</ol>}<div className="editor-note"><span>◇</span> Designed for personalized study plans. Ready for your prompts.</div></> : <><h3>Chain details</h3><dl className="details"><dt>Name</dt><dd>{selected.name}</dd><dt>Description</dt><dd>{selected.description || "No description provided."}</dd><dt>Created</dt><dd>{date(selected.created_at)} ET</dd><dt>Chain ID</dt><dd>{selected.id}</dd></dl><div className="detail-actions"><button disabled={pending} onClick={() => openEditor({ type: "chain", chain: selected })}>Edit Chain</button><button className="danger-text" disabled={pending} onClick={deleteChain}>Delete Chain</button></div></>}
            </div></>}
          </section>
        </div>}
        <footer className="page-footer"><span>PlanMyStudy <span className="slash">/</span> Prompt Chain Studio</span><span>Make every study hour count.</span></footer>
      </div>
    </main>
    {editor && <dialog className="modal-backdrop" ref={node => { if (node && !node.open) node.showModal(); }} onCancel={event => { if (pending) event.preventDefault(); else setEditor(null); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="editor-title"><h2 id="editor-title">{editor.type === "chain" ? `${editor.chain ? "Edit" : "New"} Prompt Chain` : `${editor.step ? "Edit" : "Add"} Step`}</h2><p className="muted">{editor.type === "chain" ? "Give your workflow a clear name and purpose." : "Write the instructions for this part of the workflow."}</p><form onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); if (editor.type === "chain") execute({ kind: "save-chain", chainId: editor.chain?.id, name: String(data.get("name")), description: String(data.get("description")) }); else if (selected) execute({ kind: "save-step", chainId: selected.id, stepId: editor.step?.id, prompt: String(data.get("prompt")) }); }}>
      {editor.type === "chain" ? <><label htmlFor="chain-name">Chain name</label><input autoFocus required maxLength={200} id="chain-name" name="name" defaultValue={editor.chain?.name ?? ""} placeholder="e.g. Personalized Study Planner" /><label htmlFor="description">Description</label><textarea id="description" name="description" rows={4} defaultValue={editor.chain?.description ?? ""} placeholder="What will this workflow help you create?" /></> : <><label htmlFor="prompt">Prompt text</label><textarea autoFocus required id="prompt" name="prompt" rows={9} defaultValue={editor.step?.prompt_text ?? ""} placeholder="e.g. Rank the courses based on exam dates and difficulty. Explain your priorities." /></>}
      {error && <p className="alert" role="alert">{error}</p>}<div className="modal-actions"><button type="button" disabled={pending} onClick={() => setEditor(null)}>Cancel</button><button className="primary" disabled={pending} type="submit">{pending ? "Saving…" : "Save changes"}</button></div>
    </form></section></dialog>}
  </div>;
}
