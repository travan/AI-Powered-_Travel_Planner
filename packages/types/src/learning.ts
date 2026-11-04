export interface PlannerLearningContext {
  version: 1;
  past_plans: number;
  preferences: {
    source:
      | "previous_request"
      | "feedback"
      | "revision"
      | "profile"
      | "activity";
    text: string;
  }[];
  costs: {
    city_slug: string;
    category: string;
    currency: string;
    party_size: number;
    samples: number;
    median_amount: number;
    min_amount: number;
    max_amount: number;
  }[];
}
export interface LearningSettings {
  memory_enabled: boolean;
  training_consent: boolean;
}
