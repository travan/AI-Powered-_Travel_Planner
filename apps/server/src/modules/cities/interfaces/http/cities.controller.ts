import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from "@nestjs/common";
import { throwServiceError } from "../../../../shared/nest/http-errors.js";
import { JwtAuthGuard } from "../../../../shared/nest/jwt-auth.guard.js";
import { CitiesService } from "../../application/cities.service.js";
import { CitySearchQueryDto, CitySlugParamsDto, RememberCityDto } from "../../dto/city.dto.js";

@Controller("api/cities")
export class CitiesController {
  constructor(@Inject(CitiesService) private readonly cities: CitiesService) {}

  @Get("search")
  search(@Query() query: CitySearchQueryDto) {
    return this.cities.search(query.q);
  }

  @Get("popular")
  popular() {
    return this.cities.popular();
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  remember(@Body() dto: RememberCityDto) {
    return this.cities.remember(dto.name);
  }

  @Get(":slug")
  async detail(@Param() params: CitySlugParamsDto) {
    const result = await this.cities.getDetail(params.slug);
    if (!result.ok) throwServiceError(result.error);
    return result.value;
  }
}
