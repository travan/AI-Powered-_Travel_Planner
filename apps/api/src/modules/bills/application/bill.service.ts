import type { BillUploadSummary } from "@travel/types";
import { createBillUpload, getBillUploadSummary } from "../../../db/bill-store.js";
import { forbidden, notFound, ok, type ServiceResult } from "../../../shared/application/service-result.js";
import type { CreateBillUploadDto } from "../dto/bill.dto.js";

export class BillService {
  async create(input: {
    tripId: string;
    userId: string;
    dto: CreateBillUploadDto;
  }): Promise<ServiceResult<BillUploadSummary>> {
    const bill = await createBillUpload({
      tripId: input.tripId,
      userId: input.userId,
      body: input.dto,
    });

    return bill ? ok(bill) : forbidden("You cannot upload bills to this trip");
  }

  async getById(billId: string): Promise<ServiceResult<BillUploadSummary>> {
    const bill = await getBillUploadSummary(billId);
    return bill ? ok(bill) : notFound("Bill upload not found");
  }
}

export const billService = new BillService();
