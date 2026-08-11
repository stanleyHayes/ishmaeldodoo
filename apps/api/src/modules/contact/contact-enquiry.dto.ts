import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  Equals,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Length,
} from "class-validator";
import { contactCategories } from "@amanor/contracts";

export class ContactEnquiryDto {
  @ApiProperty({ minLength: 2, maxLength: 100 })
  @IsString()
  @Length(2, 100)
  name!: string;

  @ApiProperty({ format: "email", maxLength: 254 })
  @IsEmail()
  @Length(3, 254)
  email!: string;

  @ApiPropertyOptional({ minLength: 2, maxLength: 160 })
  @IsOptional()
  @IsString()
  @Length(2, 160)
  organisation?: string;

  @ApiProperty({ enum: contactCategories })
  @IsIn(contactCategories)
  category!: (typeof contactCategories)[number];

  @ApiProperty({ minLength: 4, maxLength: 160 })
  @IsString()
  @Length(4, 160)
  subject!: string;

  @ApiProperty({ minLength: 20, maxLength: 4000 })
  @IsString()
  @Length(20, 4000)
  message!: string;

  @ApiProperty({ enum: ["en-GB", "fr-FR"] })
  @IsIn(["en-GB", "fr-FR"])
  locale!: "en-GB" | "fr-FR";

  @ApiProperty({ enum: [true], type: Boolean })
  @Equals(true)
  privacyConsent!: true;
}
