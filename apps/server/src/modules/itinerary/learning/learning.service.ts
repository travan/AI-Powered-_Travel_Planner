import { CitiesService } from "../../cities/application/cities.service.js";
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import type {
  Itinerary,
  ItineraryInput,
  LearningSettings,
  PlannerLearningContext,
} from "@travel/types";
import {
  SQL_CLIENT,
  type SqlClient,
} from "../../../database/database.tokens.js";
import type {
  LearningSettingsDto,
  PlannerFeedbackDto,
} from "./learning.dto.js";
import * as travelTypes from "@travel/types";
const { itineraryRoute, routeLabels } =
  (travelTypes as unknown as { default?: typeof travelTypes }).default ??
  travelTypes;

export function safeMemoryText(text: unknown, max = 700): string {
  return typeof text === "string"
    ? text
        .replace(/https?:\/\/\S+/gi, "[link]")
        .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[email]")
        .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27}\b/gi, "[id]")
        .replace(/(?:\+?\d[\d ()-]{8,}\d)/g, "[number]")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, max)
    : "";
}
@Injectable()
export class PlannerLearningService {
  constructor(
    @Inject(SQL_CLIENT) private readonly sql: SqlClient,
    @Inject(CitiesService) private readonly cities?: CitiesService,
  ) {}
  async settings(userId: string): Promise<LearningSettings> {
    const r = await this.sql.query<LearningSettings>(
      "select memory_enabled,training_consent from planner_learning_settings where user_id=$1",
      [userId],
    );
    return r.rows[0] ?? { memory_enabled: true, training_consent: false };
  }
  async updateSettings(userId: string, input: LearningSettingsDto) {
    const r = await this.sql.query<LearningSettings>(
      `insert into planner_learning_settings(user_id,memory_enabled,training_consent) values($1,coalesce($2,true),coalesce($3,false)) on conflict(user_id) do update set memory_enabled=coalesce($2,planner_learning_settings.memory_enabled),training_consent=coalesce($3,planner_learning_settings.training_consent),updated_at=now() returning memory_enabled,training_consent`,
      [userId, input.memory_enabled ?? null, input.training_consent ?? null],
    );
    return r.rows[0];
  }
  async record(
    userId: string,
    event: string,
    payload: unknown,
    itineraryId?: string,
    sourceId?: string,
  ) {
    const r = await this.sql.query<{ id: string }>(
      `insert into planner_learning_events(user_id,event_type,payload,itinerary_id,source_id) values($1,$2,$3,$4,$5) returning id::text`,
      [userId, event, payload, itineraryId ?? null, sourceId ?? null],
    );
    return r.rows[0]!.id;
  }
  async context(
    userId: string,
    input: ItineraryInput,
    requestId: string,
  ): Promise<PlannerLearningContext> {
    const empty: PlannerLearningContext = {
      version: 1,
      past_plans: 0,
      preferences: [],
      costs: [],
    };
    if (!(await this.settings(userId)).memory_enabled) return empty;
    const [plans, events, costs, profile, history] = await Promise.all([
      this.sql.query<{ n: number }>(
        "select count(*)::int as n from itineraries where user_id=$1 and status='complete'",
        [userId],
      ),
      this.sql.query<{ event_type: string; payload: any }>(
        `select event_type,payload from (select distinct on (event_type,coalesce(source_id,id::text)) event_type,payload,created_at from planner_learning_events where user_id=$1 and id<>$2 and created_at>now()-interval '1 year' and (event_type in ('generation_request','feedback','revision_proposed') or (event_type in ('activity_insert','activity_update') and payload->>'source_plan_item_id' is null and payload->>'status'='approved' and trip_id in(select t.id from trips t join trip_members tm on tm.trip_id=t.id and tm.user_id=$1 and tm.status='active' where t.primary_city_slug=any($3::text[])))) order by event_type,coalesce(source_id,id::text),created_at desc) latest order by created_at desc limit 12`,
        [userId, requestId, input.cities],
      ),
      this.approvedCosts(
        userId,
        input.cities,
        input.currency,
        input.num_travelers,
      ),
      this.sql.query<{ travel_preferences: unknown }>(
        "select travel_preferences from profiles where user_id=$1",
        [userId],
      ),
      this.sql.query<{
        prompt_text: string;
        normalized_query: Record<string, unknown>;
      }>(
        "select prompt_text,normalized_query from user_prompt_history where user_id=$1 and created_at>now()-interval '1 year' order by created_at desc limit 8",
        [userId],
      ),
    ]);
    const preferences: PlannerLearningContext["preferences"] = [];
    const profileText = safeMemoryText(
      JSON.stringify(profile.rows[0]?.travel_preferences ?? {}),
    );
    if (profileText !== "{}")
      preferences.push({ source: "profile", text: profileText });
    const historical = history.rows.map((h) => ({
      event_type: "generation_request",
      payload: {
        request: { ...h.normalized_query, prompt_text: h.prompt_text },
      },
    }));
    for (const event of [...events.rows, ...historical]) {
      const p = event.payload;
      if (event.event_type === "feedback") {
        const text = safeMemoryText(p.note);
        if (text)
          preferences.push({
            source: "feedback",
            text: `rating=${p.rating}: ${text}`,
          });
      } else if (event.event_type === "revision_proposed") {
        const text = safeMemoryText(p.instruction);
        if (text) preferences.push({ source: "revision", text });
      } else if (event.event_type.startsWith("activity_")) {
        const text = safeMemoryText(
          JSON.stringify({
            title: p.title,
            category: p.category,
            notes: p.notes,
          }),
        );
        preferences.push({ source: "activity", text });
      } else {
        const request = p.request ?? {};
        if (
          (request.prompt_text ?? "") === (input.prompt_text ?? "") &&
          JSON.stringify(request.planning ?? null) ===
            JSON.stringify(input.planning ?? null)
        )
          continue;
        const criteria = request.planning;
        const text = safeMemoryText(
          JSON.stringify({
            request: safeMemoryText(request.prompt_text, 400),
            dining: criteria?.dining_preferences,
            experiences: criteria?.experience_preferences,
            stay: criteria?.stay_preferences
              ? {
                  type: criteria.stay_preferences.type,
                  requirements: criteria.stay_preferences.requirements,
                }
              : undefined,
          }),
        );
        if (text !== "{}")
          preferences.push({ source: "previous_request", text });
      }
    }
    return {
      version: 1,
      past_plans: plans.rows[0]?.n ?? 0,
      preferences: preferences
        .filter(
          (p, i, all) =>
            all.findIndex((v) => v.source === p.source && v.text === p.text) ===
            i,
        )
        .slice(0, 8),
      costs: costs.rows,
    };
  }
  private approvedCosts(
    userId: string,
    cities: string[],
    currency: string | null,
    partySize: number | null,
  ) {
    return this.sql.query<PlannerLearningContext["costs"][number]>(COST_SQL, [
      userId,
      cities,
      currency,
      partySize,
    ]);
  }
  async feedback(
    userId: string,
    itineraryId: string,
    input: PlannerFeedbackDto,
    tripId?: string,
  ) {
    const owner = await this.sql.query<{ result: Itinerary }>(
      `select coalesce((select current_plan from trips where id=$3::uuid and owner_user_id=$2 and source_itinerary_id=i.id),i.result) as result from itineraries i where i.id=$1 and i.user_id=$2::text and i.status='complete'`,
      [itineraryId, userId, tripId ?? null],
    );
    if (!owner.rows.length)
      throw new ForbiddenException(
        "Only the owner can review their generated plan",
      );
    const snapshot = structuredClone(owner.rows[0]!.result);
    if (this.cities && Array.isArray(snapshot.days)) {
      const unique = [
        ...new Set(snapshot.days.map((d) => d.city_slug ?? d.city)),
      ];
      const known = await Promise.all(
        unique.map((value) => this.cities!.findForPlanning(value)),
      );
      for (const day of snapshot.days) {
        const city = known[unique.indexOf(day.city_slug ?? day.city)];
        if (city) {
          day.city_slug = city.slug;
          day.city = city.name.en ?? city.slug;
          day.city_names = city.name;
          snapshot.city_catalog = {
            ...snapshot.city_catalog,
            [city.slug]: {
              name: city.name,
              country: city.country,
              timezone: city.timezone,
            },
          };
        }
      }
    }
    const route = itineraryRoute(snapshot);
    const cityRoute = routeLabels(
      {
        origin:
          route.origin?.names && route.origin.slug ? route.origin : undefined,
        destinations: route.destinations,
        end: route.end?.names && route.end.slug ? route.end : undefined,
      },
      snapshot.locale ?? "vi",
    ).join(" → ");
    await this.sql.query(
      `with feedback as (
         insert into planner_feedback(user_id,itinerary_id,rating,note,plan_snapshot)
         values($1,$2,$3,$4,$5)
         on conflict(user_id,itinerary_id) do update set rating=excluded.rating,
           note=excluded.note,plan_snapshot=excluded.plan_snapshot,updated_at=now()
         where (planner_feedback.rating,planner_feedback.note,planner_feedback.plan_snapshot)
           is distinct from (excluded.rating,excluded.note,excluded.plan_snapshot)
         returning user_id,itinerary_id,rating,note
       )
       insert into planner_feedback_mail(user_id,itinerary_id,rating,note,route)
       select user_id,itinerary_id,rating,note,$6 from feedback`,
      [
        userId,
        itineraryId,
        input.rating,
        input.note ?? "",
        snapshot,
        cityRoute,
      ],
    );
    return { saved: true };
  }
  async feedbackForTrip(
    userId: string,
    tripId: string,
    input: PlannerFeedbackDto,
  ) {
    const source = await this.sql.query<{ source_itinerary_id: string }>(
      "select source_itinerary_id::text from trips where id=$1 and owner_user_id=$2 and source_itinerary_id is not null",
      [tripId, userId],
    );
    if (!source.rows[0])
      throw new ForbiddenException(
        "Only the trip owner can submit learning feedback",
      );
    return this.feedback(
      userId,
      source.rows[0].source_itinerary_id,
      input,
      tripId,
    );
  }
  async dataset(userId: string) {
    if (!(await this.settings(userId)).training_consent)
      throw new BadRequestException({
        code: "TRAINING_CONSENT_REQUIRED",
        message:
          "Enable training dataset preparation in learning settings first.",
      });
    const rows = await this.sql.query<{ result: Itinerary; rating: number }>(
      `select f.plan_snapshot as result,f.rating from planner_feedback f join itineraries i on i.id=f.itinerary_id and i.user_id=f.user_id::text where f.user_id=$1 and f.rating>=4 and i.status='complete' and not exists(select 1 from jsonb_array_elements(coalesce(f.plan_snapshot->'issues','[]'::jsonb)) issue where (issue->>'severity'='error' or issue->>'code' in ('MEAL_MISSING','ACTIVITIES_MISSING','SCHEDULE_CONFLICT','ACTIVITY_DETAILS_MISSING','SCHEDULE_DETAILS_MISSING','COST_MISMATCH','BUDGET_INCOMPLETE'))) order by f.updated_at desc limit 100`,
      [userId],
    );
    // Export an allowlist of structural training features: no raw prompts, user IDs,
    // exact dates, free-text notes/descriptions, addresses, coordinates or booking references.
    const examples = rows.rows
      .filter(
        (row) => Array.isArray(row.result?.days) && row.result.days.length > 0,
      )
      .map(({ result: p, rating }) => ({
        schema_version: 1,
        quality: { source: "user_reviewed", rating },
        messages: [
          {
            role: "user",
            content: JSON.stringify({
              cities: p.days
                .map((d) => p.city_catalog?.[d.city_slug ?? ""]?.name.en)
                .filter(Boolean),
              days: p.num_days,
              travelers: p.num_travelers,
              currency: p.currency,
              style: p.trip_style,
              pace: p.planning?.experience_preferences.pace,
              budget: p.planning?.budget.total,
            }),
          },
          {
            role: "assistant",
            content: JSON.stringify({
              days: p.days.map((d) => ({
                day: d.day_number,
                city: p.city_catalog?.[d.city_slug ?? ""]?.name.en,
                activities: d.activities.map((a) => ({
                  kind: a.kind,
                  category: a.category,
                  meal_slot: a.meal_slot,
                  time: a.time,
                  duration_minutes: a.duration_minutes,
                  travel_minutes: a.travel_minutes,
                  cost: a.cost,
                  currency: a.currency,
                  price: a.price
                    ? {
                        amount: a.price.amount,
                        scope: a.price.scope,
                        status: a.price.status,
                      }
                    : undefined,
                })),
              })),
              budget: p.budget_breakdown
                ? {
                    accommodation: p.budget_breakdown.accommodation,
                    food: p.budget_breakdown.food,
                    activities: p.budget_breakdown.activities,
                    transport: p.budget_breakdown.transport,
                    contingency: p.budget_breakdown.contingency,
                    total: p.budget_breakdown.total,
                    complete: p.budget_breakdown.complete,
                  }
                : undefined,
            }),
          },
        ],
      }));
    const costs = await this.approvedCosts(userId, [], null, null);
    const spending = costs.rows
      .filter((c) => c.samples >= 3)
      .map((c) => ({
        schema_version: 1,
        quality: { source: "approved_spending", samples: c.samples },
        messages: [
          {
            role: "user",
            content: JSON.stringify({
              task: "estimate spending per entry",
              city: c.city_slug,
              category: c.category,
              currency: c.currency,
              party_size: c.party_size,
            }),
          },
          {
            role: "assistant",
            content: JSON.stringify({
              median: c.median_amount,
              min: c.min_amount,
              max: c.max_amount,
              samples: c.samples,
              scope: "per_expense_entry",
              status: "historical_observation",
            }),
          },
        ],
      }));
    return [...examples, ...spending];
  }
}

const COST_SQL = `with samples as (
     select e.amount::double precision as amount,e.currency,
       case when e.expense_type<>'other' then e.expense_type when a.category in ('meal','cafe','food') then 'food' when a.category in ('visit','attraction','leisure') then 'activity' when a.category in ('transport','transfer') then 'transport' when a.category in ('accommodation','check_in') then 'accommodation' else 'other' end as category,
       coalesce(p.city_slug,(select day->>'city_slug' from jsonb_array_elements(coalesce(t.current_plan->'days','[]'::jsonb)) day where exists(select 1 from jsonb_array_elements(coalesce(day->'activities','[]'::jsonb)) item where item->>'id'=a.source_plan_item_id) limit 1),case when cardinality(i.cities)=1 then i.cities[1] when i.id is null then t.primary_city_slug end) as city_slug,
       coalesce(nullif((select count(*)::int from expense_splits where expense_id=e.id),0),case when jsonb_typeof(coalesce(t.current_plan,i.result)->'num_travelers')='number' then (coalesce(t.current_plan,i.result)->>'num_travelers')::int end) as party_size
     from expenses e join trips t on t.id=e.trip_id
       join trip_members tm on tm.trip_id=t.id and tm.user_id=$1 and tm.status='active' and tm.role in ('host','co_host','contributor')
       left join itineraries i on i.id=t.source_itinerary_id left join trip_activities a on a.id=e.activity_id left join places p on p.id=e.place_id
     where e.approval_status='approved' and e.amount>0 and ($3::text is null or e.currency=$3) and e.created_at>now()-interval '1 year'
       and (t.owner_user_id=$1 or e.created_by_user_id=$1 or e.paid_by_user_id=$1)
     order by e.created_at desc limit 500
   ), canonical as (
     select s.*,c.slug as canonical_city_slug from samples s join lateral(
       select slug from cities where country<>'' and lat is not null and lon is not null
         and (slug=s.city_slug or s.city_slug=any(aliases) or lower(name->>'en')=lower(s.city_slug) or lower(name->>'vi')=lower(s.city_slug))
       order by case when slug=s.city_slug then 0 else 1 end,slug limit 1
     ) c on true
   ) select canonical_city_slug as city_slug,category,currency,party_size,count(*)::int as samples,
      percentile_cont(0.5) within group(order by amount)::double precision as median_amount,min(amount) as min_amount,max(amount) as max_amount
     from canonical where (cardinality($2::text[])=0 or canonical_city_slug=any($2::text[])) and category<>'other' and party_size>0 and ($4::int is null or party_size=$4) group by canonical_city_slug,category,currency,party_size order by count(*) desc limit 20`;
