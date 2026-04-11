export type UserPlan = "free" | "premium";
export type SubscriptionStatus = "active" | "cancelled" | "expired";
export type SubscriptionPlan = "monthly" | "yearly";

export interface User {
  id: string;
  email: string;
  name?: string;
  avatar_url?: string;
  plan: UserPlan;
  locale: string;
  created_at: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  stripe_customer_id?: string;
  stripe_sub_id?: string;
  status: SubscriptionStatus;
  plan: SubscriptionPlan;
  current_period_end?: string;
  created_at: string;
}

export interface SavedTrip {
  id: string;
  user_id: string;
  itinerary_id: string;
  created_at: string;
}
