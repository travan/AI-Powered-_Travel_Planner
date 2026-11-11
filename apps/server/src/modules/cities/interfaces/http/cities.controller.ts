import { PlaceLookupService } from "../../application/place-lookup.service.js";
import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { throwServiceError } from "../../../../shared/nest/http-errors.js";
import { JwtAuthGuard } from "../../../../shared/nest/jwt-auth.guard.js";
import { CitiesService } from "../../application/cities.service.js";
import {
  CitySearchQueryDto,
  CitySlugParamsDto,
  RememberCityDto,
  ResolveCityDto,
} from "../../dto/city.dto.js";

@Controller("api/cities")
export class CitiesController {
  constructor(
    @Inject(CitiesService) private readonly cities: CitiesService,
    @Inject(PlaceLookupService) private readonly lookup: PlaceLookupService,
  ) {}

  @Get("search")
  search(@Query() query: CitySearchQueryDto) {
    return this.cities.search(query.q);
  }

  @Get("country-suggestions")
  async countrySuggestions(@Query() query: CitySearchQueryDto) {
    return { suggestion: await this.cities.countrySuggestions(query.q) };
  }

  @Get("popular")
  popular() {
    return this.cities.popular();
  }

  @Get("resolve/search")
  @UseGuards(JwtAuthGuard)
  resolveSearch(@Query() query: CitySearchQueryDto) {
    return this.lookup.cityCandidates(query.q);
  }

  @Post("resolve")
  @UseGuards(JwtAuthGuard)
  resolve(@Body() dto: ResolveCityDto) {
    return this.lookup.rememberResolved(dto.query, dto.source_id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  remember(@Body() dto: RememberCityDto) {
    return this.cities.remember(dto.name);
  }

  @Get(":slug/places/lookup")
  @UseGuards(JwtAuthGuard)
  locate(
    @Param() params: CitySlugParamsDto,
    @Query() query: CitySearchQueryDto,
  ) {
    return this.lookup.search(params.slug, query.q);
  }

  @Get(":slug")
  async detail(@Param() params: CitySlugParamsDto) {
    const result = await this.cities.getDetail(params.slug);
    if (!result.ok) throwServiceError(result.error);
    return result.value;
  }
}
