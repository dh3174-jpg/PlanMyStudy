"use client";

import { useEffect, useRef, useState } from "react";
import { isStudyOutput, planKeys } from "@/lib/study-plan";
import type { Run } from "@/lib/types";

export const runDate = (value: string) => new Date(value).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" });
export function runInput(run: Run, key: string): string {
  const data = run.input_data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return "";
  const value = (data as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}
export default function RunViewer({ run, chainName, latest = false, onClose, closeLabel = "Close run" }: {
  run: Run; chainName: string; latest?: boolean; onClose?: () => void; closeLabel?: string;
}) {
  const article = useRef<HTMLElement>(null);
  const opened = !!onClose;
  useEffect(() => { if (opened) article.current?.focus({ preventScroll: true }); }, [run.id, opened]);
  const [tab, setTab] = useState("Output");
  const output = run.output_data;
  const structured = isStudyOutput(output);
  return <article tabIndex={-1} ref={article} className="run-output" aria-label={`Generated output for run ${run.id}`}>
    <div className="section-heading"><div><span className="pill">{latest ? "LATEST SAVED RUN" : `SAVED RUN #${run.id}`}</span><h3>Generated Output</h3><p className="muted">{chainName} · {runDate(run.created_at)} ET</p></div>{onClose && <button onClick={onClose}>{closeLabel}</button>}</div>
    <div className="tabs" role="tablist" aria-label={`Run ${run.id} sections`}>{["Output", "Run Details"].map(item => <button key={item} role="tab" aria-selected={tab === item} onClick={() => setTab(item)}>{item}</button>)}</div>
    <div role="tabpanel">
      {tab === "Run Details" ? <dl className="details run-details">
        {[["Courses", "courses"], ["Exam dates", "examDates"], ["Hardest subjects", "hardestSubjects"], ["Availability", "availability"], ["Productive time", "productiveTime"], ["Notes", "notes"]].map(([label, key]) => <div key={key}><dt>{label}</dt><dd>{runInput(run, key) || "Not provided"}</dd></div>)}
        <div><dt>Chain used</dt><dd>{runInput(run, "chainName") || chainName} (#{run.prompt_chain_id})</dd></div><div><dt>Generated</dt><dd>{runDate(run.created_at)} ET</dd></div>
      </dl> : structured ? <>
        <section className="recommendation"><span className="recommended-badge">RECOMMENDED</span><h3>Recommended Study Plan</h3><h4>{output[output.recommendedPlan].title}</h4><p>{output[output.recommendedPlan].summary}</p></section>
        <div className="study-plans">{planKeys.map(key => <section className={`study-plan ${key === output.recommendedPlan ? "recommended-plan" : ""}`} key={key}>
          <div className="section-heading"><h3>{{ balanced: "Balanced Plan", intensive: "Intensive Plan", flexible: "Flexible Plan" }[key]}</h3>{key === output.recommendedPlan && <span className="recommended-badge">Recommended</span>}</div>
          <p className="muted">{output[key].summary}</p>
          <ol className="schedule">{output[key].schedule.map((slot, index) => <li key={index}><div className="schedule-time"><strong>{slot.day}</strong><span>{slot.time}</span></div><div><strong>{slot.course}</strong><p>{slot.activity}</p></div></li>)}</ol>
        </section>)}</div>
        <section className="recommendation-reason"><h3>Why This Plan?</h3><p>{output.recommendationReason}</p></section>
      </> : <><p className="muted">This saved run uses an earlier output format. Its original output is shown below.</p><pre className="data-view">{typeof output === "string" ? output : JSON.stringify(output, null, 2)}</pre></>}
    </div>
  </article>;
}
