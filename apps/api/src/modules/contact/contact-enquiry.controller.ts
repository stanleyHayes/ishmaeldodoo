import {
  Body,
  Controller,
  Header,
  HttpCode,
  Inject,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiAcceptedResponse, ApiTags } from "@nestjs/swagger";
import { ContactEnquiryDto } from "./contact-enquiry.dto";
import { ContactEnquiryService } from "./contact-enquiry.service";
import { ContactRateLimitGuard } from "./contact-rate-limit.guard";

@ApiTags("contact")
@Controller("public/contact-enquiries")
export class ContactEnquiryController {
  constructor(
    @Inject(ContactEnquiryService)
    private readonly enquiries: ContactEnquiryService,
  ) {}

  @Post()
  @HttpCode(202)
  @UseGuards(ContactRateLimitGuard)
  @Header("Cache-Control", "no-store")
  @ApiAcceptedResponse({
    description: "General contact enquiry accepted for durable delivery.",
  })
  async create(
    @Body() input: ContactEnquiryDto,
  ): Promise<Readonly<{ reference: string; status: "accepted" }>> {
    return {
      reference: await this.enquiries.accept(input),
      status: "accepted",
    };
  }
}
