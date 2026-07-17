import { Controller, Get, Param, Query } from "@nestjs/common";
import { cityService } from "../../application/city.service.js";
import { citySearchQueryDto, citySlugParamsDto } from "../../dto/city.dto.js";
import { throwServiceError } from "../../../../shared/nest/http-errors.js";
import { ZodValidationPipe } from "../../../../shared/nest/zod-validation.pipe.js";

@Controller("api/cities")
export class CitiesController {
  @Get("search")
  async search(@Query(new ZodValidationPipe(citySearchQueryDto)) query: { q: string }) {
    return cityService.search(query.q);
  }

  @Get("popular")
  async popular() {
    return cityService.popular();
  }

  @Get(":slug")
  async detail(@Param(new ZodValidationPipe(citySlugParamsDto)) params: { slug: string }) {
    const result = await cityService.getDetail(params.slug);
    if (!result.ok) throwServiceError(result.error);
    return result.value;
  }
}
