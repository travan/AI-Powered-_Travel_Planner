import { Module } from "@nestjs/common";
import { AppConfigModule } from "./config/config.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { HealthController } from "./health.controller.js";
import { ActivitiesModule } from "./modules/activities/activities.module.js";
import { AuthModule } from "./modules/auth/auth.module.js";
import { BillsModule } from "./modules/bills/bills.module.js";
import { CitiesModule } from "./modules/cities/cities.module.js";
import { ExpensesModule } from "./modules/expenses/expenses.module.js";
import { ItineraryModule } from "./modules/itinerary/itinerary.module.js";
import { RecommendationsModule } from "./modules/recommendations/recommendations.module.js";
import { ReviewModule } from "./modules/review/review.module.js";
import { SearchDraftsModule } from "./modules/search-drafts/search-drafts.module.js";
import { TransportModule } from "./modules/transport/transport.module.js";
import { TripsModule } from "./modules/trips/trips.module.js";
import { UsersModule } from "./modules/users/users.module.js";
import { SharedAuthModule } from "./shared/nest/shared-auth.module.js";

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    SharedAuthModule,
    ActivitiesModule,
    AuthModule,
    BillsModule,
    CitiesModule,
    ExpensesModule,
    ItineraryModule,
    RecommendationsModule,
    ReviewModule,
    SearchDraftsModule,
    TransportModule,
    TripsModule,
    UsersModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
