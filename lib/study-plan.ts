// Shared, serializable contracts. Provider credentials never belong in this file.
export type StudyInputs = {
  courses: string;
  examDates: string;
  hardestSubjects: string;
  availability: string;
  productiveTime: "Morning" | "Afternoon" | "Evening";
  notes: string;
};
export const planKeys = ["balanced", "intensive", "flexible"] as const;
export type PlanKey = typeof planKeys[number];
export type StudyPlan = {
  title: string;
  summary: string;
  schedule: { day: string; time: string; course: string; activity: string }[];
};
export type StudyOutput = {
  recommendedPlan: PlanKey;
  recommendationReason: string;
  balanced: StudyPlan;
  intensive: StudyPlan;
  flexible: StudyPlan;
};
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

export function validateInputs(value: unknown): StudyInputs {
  if (!record(value)) throw new Error("Please complete the study input form.");
  const labels = { courses: "Courses", examDates: "Exam dates", hardestSubjects: "Hardest subjects", availability: "Study windows" };
  for (const [key, label] of Object.entries(labels)) {
    if (!text(value[key])) throw new Error(`${label} is required.`);
    if ((value[key] as string).length > 6000) throw new Error(`${label} must be at most 6,000 characters.`);
  }
  if (!["Morning", "Afternoon", "Evening"].includes(String(value.productiveTime))) throw new Error("Choose your preferred productive time.");
  if (typeof value.notes !== "string" || value.notes.length > 6000) throw new Error("Notes must be at most 6,000 characters.");
  return {
    courses: (value.courses as string).trim(), examDates: (value.examDates as string).trim(),
    hardestSubjects: (value.hardestSubjects as string).trim(), availability: (value.availability as string).trim(),
    productiveTime: value.productiveTime as StudyInputs["productiveTime"], notes: value.notes.trim(),
  };
}

export function isStudyOutput(value: unknown): value is StudyOutput {
  if (!record(value) || !planKeys.includes(value.recommendedPlan as PlanKey) || !text(value.recommendationReason)) return false;
  return planKeys.every(key => {
    const plan = value[key];
    return record(plan) && text(plan.title) && text(plan.summary) && Array.isArray(plan.schedule)
      && plan.schedule.length > 0 && plan.schedule.length <= 100
      && plan.schedule.every(slot => record(slot) && [slot.day, slot.time, slot.course, slot.activity].every(text));
  });
}

const planSchema = {
  type: "object",
  properties: {
    title: { type: "string" }, summary: { type: "string" },
    schedule: { type: "array", minItems: 1, maxItems: 100, items: {
      type: "object", properties: {
        day: { type: "string", description: "Day/date, including year when known" },
        time: { type: "string", description: "Start and end time inside an available study window" },
        course: { type: "string" }, activity: { type: "string" },
      }, required: ["day", "time", "course", "activity"],
    } },
  }, required: ["title", "summary", "schedule"],
};
export const outputSchema = {
  type: "object",
  properties: {
    recommendedPlan: { type: "string", enum: [...planKeys] },
    recommendationReason: { type: "string" },
    balanced: planSchema, intensive: planSchema, flexible: planSchema,
  }, required: ["recommendedPlan", "recommendationReason", ...planKeys],
};
