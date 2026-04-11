export interface FormState {
  cities: { slug: string; name: string }[];
  use_date_range: boolean;
  num_days: number;
  start_date: string;
  end_date: string;
  budget: string;
  currency: string;
  trip_style: string;
  traveler_count: number;
}
