import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module.js";
import { SearchDraftsService } from "./application/search-drafts.service.js";
import { SEARCH_DRAFT_REPOSITORY } from "./domain/search-draft.repository.js";
import { PostgresSearchDraftRepository } from "./infrastructure/postgres-search-draft.repository.js";
import { SearchDraftsController } from "./interfaces/http/search-drafts.controller.js";

@Module({
  imports: [DatabaseModule],
  controllers: [SearchDraftsController],
  providers: [
    SearchDraftsService,
    {
      provide: SEARCH_DRAFT_REPOSITORY,
      useClass: PostgresSearchDraftRepository,
    },
  ],
  exports: [SearchDraftsService],
})
export class SearchDraftsModule {}
