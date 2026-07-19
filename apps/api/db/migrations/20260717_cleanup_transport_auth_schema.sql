alter table if exists expenses drop column if exists flight_booking_id;
alter table if exists trip_checklist_items drop column if exists related_flight_segment_id;

update expenses set expense_type = 'transport' where expense_type = 'flight';
alter table if exists expenses drop constraint if exists expenses_expense_type_check;
alter table if exists expenses
  add constraint expenses_expense_type_check
  check (expense_type in ('accommodation', 'food', 'activity', 'transport', 'shopping', 'other'));

update trip_checklist_items set category = 'transport' where category = 'flight';
alter table if exists trip_checklist_items drop constraint if exists trip_checklist_items_category_check;
alter table if exists trip_checklist_items
  add constraint trip_checklist_items_category_check
  check (category in ('transport', 'hotel', 'activity', 'document', 'payment', 'general'));

drop table if exists
  flight_price_insights,
  flight_price_snapshots,
  flight_bookings,
  flight_segments,
  airports,
  airlines,
  food_orders_or_meals,
  trip_comments,
  trip_versions,
  trip_shares,
  notifications,
  place_media,
  place_reviews,
  trip_places,
  prompt_search_clusters,
  user_prompt_history
cascade;
