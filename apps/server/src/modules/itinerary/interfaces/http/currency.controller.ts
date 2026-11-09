import { Controller, Get, Inject, Query } from "@nestjs/common";
import { IsIn } from "class-validator";
import { CurrencyService } from "../../enrichment/currency.service.js";
const CURRENCIES = [
  "USD",
  "VND",
  "EUR",
  "GBP",
  "JPY",
  "AUD",
  "CAD",
  "SGD",
  "THB",
];
export class CurrencyQuoteDto {
  @IsIn(CURRENCIES) from!: string;
  @IsIn(CURRENCIES) to!: string;
}
@Controller("api/currency")
export class CurrencyController {
  constructor(
    @Inject(CurrencyService) private readonly currency: CurrencyService,
  ) {}
  @Get("quote") quote(@Query() query: CurrencyQuoteDto) {
    return this.currency.quote(query.from, query.to);
  }
}
