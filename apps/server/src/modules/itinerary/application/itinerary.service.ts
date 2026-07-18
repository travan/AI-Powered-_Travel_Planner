import { Inject, Injectable } from "@nestjs/common";
import { notFound, ok, type ServiceResult } from "../../../shared/application/service-result.js";
import type { ItineraryDetail } from "../domain/itinerary.entity.js";
import { ITINERARY_REPOSITORY, type ItineraryRepository } from "../domain/itinerary.repository.js";

@Injectable()
export class ItineraryService {
  constructor(@Inject(ITINERARY_REPOSITORY) private readonly itineraries: ItineraryRepository) {}

  async getVisible(input: { itineraryId: string; userId?: string | null }): Promise<ServiceResult<ItineraryDetail>> {
    const itinerary = await this.itineraries.findVisible(input);
    return itinerary ? ok(itinerary) : notFound("Itinerary not found");
  }
}
