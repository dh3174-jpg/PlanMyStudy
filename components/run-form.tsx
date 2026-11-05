"use client";

import { useState, useTransition } from "react";
import { runChain } from "@/app/run-actions";
import type { Chain, Run } from "@/lib/types";

export default function RunForm({ chain, stepCount, onClose, onSuccess }: {
  chain: Chain; stepCount: number; onClose: () => void; onSuccess: (run: Run) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return <dialog className="modal-backdrop" ref={node => { if (node && !node.open) node.showModal(); }} onCancel={event => { if (pending) event.preventDefault(); else onClose(); }} aria-labelledby="run-title">
    <section className="modal run-form">
      <span className="pill">STUDY INPUTS</span>
      <h2 id="run-title">Run {chain.name}</h2>
      <p className="muted">Provide your study details. All {stepCount} steps run in sequence to create three personalized plans.</p>
      <form onSubmit={event => {
        event.preventDefault();
        if (pending) return;
        const data = new FormData(event.currentTarget);
        const inputs = Object.fromEntries(["courses", "examDates", "hardestSubjects", "availability", "productiveTime", "notes"].map(key => [key, String(data.get(key) ?? "")]));
        setError(null);
        startTransition(async () => {
          try {
            const result = await runChain(chain.id, inputs);
            if (result.error) setError(result.error);
            else if (result.run) onSuccess(result.run);
            else setError("No saved run was returned. Refresh the run history before trying again.");
          } catch { setError("The request was interrupted. Check run history before retrying to avoid a duplicate run."); }
        });
      }}>
        <fieldset disabled={pending} className="run-fields">
          <label htmlFor="courses">Courses</label>
          <textarea autoFocus required maxLength={6000} rows={3} id="courses" name="courses" placeholder={"Intermediate Microeconomics\nEnvironmental Science\nCognitive Science"} />
          <label htmlFor="examDates">Exam dates</label>
          <textarea required maxLength={6000} rows={3} id="examDates" name="examDates" placeholder={"Microeconomics — Nov 12, 2026\nEnvironmental Science — Nov 15, 2026\nCognitive Science — Nov 18, 2026"} />
          <p className="field-help">Include the year for clear scheduling. Write “no exam scheduled” when applicable.</p>
          <label htmlFor="hardestSubjects">Hardest courses or subjects</label>
          <textarea required maxLength={6000} rows={2} id="hardestSubjects" name="hardestSubjects" placeholder="Environmental Science — ecosystems and nutrient cycles" />
          <label htmlFor="availability">Available study windows</label>
          <textarea required maxLength={6000} rows={3} id="availability" name="availability" placeholder={"Monday 6–9 PM\nWednesday 5–8 PM\nSaturday 11 AM–3 PM"} />
          <label htmlFor="productiveTime">Preferred productive time</label>
          <select required id="productiveTime" name="productiveTime" defaultValue="Evening"><option>Morning</option><option>Afternoon</option><option>Evening</option></select>
          <label htmlFor="notes">Notes or constraints <span className="muted">(optional)</span></label>
          <textarea maxLength={6000} rows={2} id="notes" name="notes" placeholder="e.g. Include breaks; keep Friday free." />
        </fieldset>
        {pending && <div className="generation-status" role="status"><strong>Generating your study plans…</strong><p>Running {stepCount} {stepCount === 1 ? "step" : "steps"} sequentially. This may take a few minutes. Keep this window open.</p></div>}
        {error && <div className="alert" role="alert">{error}</div>}
        <div className="modal-actions"><button type="button" disabled={pending} onClick={onClose}>Cancel</button><button className="primary" disabled={pending} type="submit">{pending ? "Generating…" : "Generate study plans"}</button></div>
      </form>
    </section>
  </dialog>;
}
