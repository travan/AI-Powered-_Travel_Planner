import type {
  PlaceRecommendationSummary,
  TransportPriceRecommendationSummary,
} from "@travel/types";
import type {
  PlaceRecommendationQueryDto,
  TransportRecommendationQueryDto,
} from "../modules/recommendations/dto/recommendation.dto.js";
import { query } from "./postgres.js";

export async function listPlaceRecommendations(
  input: PlaceRecommendationQueryDto
): Promise<PlaceRecommendationSummary[]> {
  const result = await query<PlaceRecommendationSummary>(
    `with latest_price as (
       select distinct on (place_id)
         place_id,
         price::float8 as latest_price,
         price_type as latest_price_type,
         observed_at::text as latest_price_observed_at
       from place_price_history
       order by place_id, observed_at desc
     ),
     pending_signals as (
       select place_id, count(*)::int as pending_signal_count
       from place_change_signals
       where status = 'pending'
       group by place_id
     )
     select
       p.id::text,
       p.city_slug,
       p.current_name,
       p.type,
       p.category,
       p.normalized_address,
       p.average_rating::float8 as average_rating,
       p.quality_score::float8 as quality_score,
       p.freshness_score::float8 as freshness_score,
       p.status,
       lp.latest_price,
       lp.latest_price_type,
       lp.latest_price_observed_at,
       coalesce(ps.pending_signal_count, 0) as pending_signal_count,
       (
         p.quality_score * 0.45
         + p.freshness_score * 0.35
         + coalesce(p.average_rating::float8 / 5, 0) * 0.2
         - least(coalesce(ps.pending_signal_count, 0), 3) * 0.08
       )::float8 as recommendation_score,
       case
         when p.status in ('moved', 'renamed', 'closed', 'duplicate') then 'outdated'
         when coalesce(ps.pending_signal_count, 0) > 0 then 'needs_review'
         when lp.latest_price_observed_at::timestamptz > now() - interval '45 days' then 'watch_price'
         else 'fresh'
       end as data_quality_label
     from places p
     left join latest_price lp on lp.place_id = p.id
     left join pending_signals ps on ps.place_id = p.id
     where ($1::text is null or p.city_slug = $1)
       and ($2::text is null or p.type = $2)
       and p.status <> 'closed'
     order by recommendation_score desc, p.updated_at desc
     limit $3`,
    [input.city_slug ?? null, input.type ?? null, input.limit]
  );

  return result.rows;
}

export async function listTransportPriceRecommendations(
  input: TransportRecommendationQueryDto
): Promise<TransportPriceRecommendationSummary[]> {
  const result = await query<TransportPriceRecommendationSummary>(
    `select
       tpi.id::text,
       tpi.mode,
       from_hub.hub_code as from_hub_code,
       to_hub.hub_code as to_hub_code,
       coalesce(from_hub.hub_code, from_hub.name) as from_label,
       coalesce(to_hub.hub_code, to_hub.name) as to_label,
       tp.name as provider_name,
       tpi.service_class,
       tpi.month,
       tpi.cheapest_observed_price::float8 as cheapest_observed_price,
       tpi.average_price::float8 as average_price,
       tpi.expensive_threshold::float8 as expensive_threshold,
       tpi.cheap_window_start,
       tpi.cheap_window_end,
       tpi.recommendation,
       tpi.confidence_score::float8 as confidence_score,
       tpi.updated_at::text
     from transport_price_insights tpi
     left join transport_hubs from_hub on from_hub.id = tpi.route_from_hub_id
     left join transport_hubs to_hub on to_hub.id = tpi.route_to_hub_id
     left join transport_providers tp on tp.id = tpi.provider_id
     where ($1::text is null or tpi.mode = $1)
       and ($2::text is null or upper(coalesce(from_hub.hub_code, from_hub.name)) = upper($2))
       and ($3::text is null or upper(coalesce(to_hub.hub_code, to_hub.name)) = upper($3))
       and ($4::int is null or tpi.month = $4)
     order by tpi.confidence_score desc, tpi.updated_at desc
     limit $5`,
    [input.mode ?? null, input.from ?? null, input.to ?? null, input.month ?? null, input.limit]
  );

  return result.rows;
}
