import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ContactEnquiryController } from "./contact-enquiry.controller";
import { ContactEnquiryService } from "./contact-enquiry.service";
import { ContactEnquiryWorker } from "./contact-enquiry.worker";
import { ContactRateLimitGuard } from "./contact-rate-limit.guard";

@Module({
  imports: [AuthModule],
  controllers: [ContactEnquiryController],
  providers: [
    ContactEnquiryService,
    ContactEnquiryWorker,
    ContactRateLimitGuard,
  ],
})
export class ContactModule {}
