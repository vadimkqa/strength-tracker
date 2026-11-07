import type { SetPrescription } from './prescriptions';
export interface Prescription {
  reps: string;
  notes: string;
  category: string;
  source: string;
  setPrescriptions?: SetPrescription[];
  exerciseIntensity?: string;
  optional?: boolean;
  alternatives?: string[];
  kind?: string;
}
export type PlanExercise = [
  name: string,
  sets: number | null,
  rest: number | null,
  prescription?: Prescription,
];
export type Plan = Record<string, PlanExercise[]>;
export const templates: Plan = {
  'Tuesday · Bench focus': [
    ['Bench Press', 4, 180],
    ['Cable Seated Fly', 4, 90],
    ['Pull-ups', 4, 120],
    ['EZ Bar Curl', 4, 120],
    ['Supported Wrist Extension', 4, 75],
    ['Face Pull', 4, 90],
    ['Core', 3, 60],
  ],
  'Thursday · Back focus': [
    ['Pull-ups / Weighted Pull-ups', 4, 180],
    ['Seated Cable Row', 4, 150],
    ['Chest Press', 4, 120],
    ['Lateral Raise', 4, 75],
    ['Hammer Curl', 4, 90],
    ['Triceps Pushdown', 4, 90],
    ['Core', 3, 60],
  ],
  'Saturday · Chest focus': [
    ['Dumbbell Bench Press', 4, 180],
    ['Incline Chest Press', 4, 150],
    ['Lat Pulldown', 4, 120],
    ['Lateral Raise', 4, 75],
    ['Triceps Pushdown', 4, 90],
    ['Rear Delt Fly', 4, 75],
  ],
  'Sunday · Legs': [
    ['Squat', 4, 210],
    ['Leg Extension', 4, 120],
    ['Hyperextension', 3, 120],
    ['Hamstring Curl', 3, 120],
    ['Calf Raise', 4, 90],
  ],
};
export const easyLegs: [string, number, number][] = [
  ['Bulgarian Split Squat', 4, 150],
  ['Hip Thrust', 4, 180],
  ['Standing Calf Raise', 3, 90],
  ['Front Squat', 4, 180],
  ['Adductor', 2, 90],
];

export function defaultPlan(): Plan {
  const plan = structuredClone({ ...templates, 'Sunday · Legs · Easy': easyLegs });
  for (const exercises of Object.values(plan))
    for (const ex of exercises)
      if (/curl|extension|face pull|lateral|pushdown|rear delt|wrist|adductor/i.test(ex[0]))
        ex[1] = 3;
  return plan;
}
