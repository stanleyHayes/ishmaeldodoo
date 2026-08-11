import {
  Body,
  Controller,
  Header,
  HttpCode,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiAcceptedResponse, ApiTags } from "@nestjs/swagger";
import { MediaEnquiryDto } from "./media-enquiry.dto";
import { MediaEnquiryService } from "./media-enquiry.service";
import { PressKitRateLimitGuard } from "./press-kit-rate-limit.guard";
@ApiTags("media-enquiries")
@Controller("public/media-enquiries")
export class MediaEnquiryController {
  constructor(private readonly enquiries: MediaEnquiryService) {}
  @Post()
  @HttpCode(202)
  @UseGuards(PressKitRateLimitGuard)
  @Header("Cache-Control", "no-store")
  @ApiAcceptedResponse({
    description:
      "Media enquiry accepted for durable delivery to the designated press contact.",
  })
  async create(
    @Body() input: MediaEnquiryDto,
  ): Promise<Readonly<{ reference: string; status: "accepted" }>> {
    return {
      reference: await this.enquiries.accept(input),
      status: "accepted",
    };
  }
}
