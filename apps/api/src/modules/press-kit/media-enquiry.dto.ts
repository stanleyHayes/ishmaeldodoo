import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEmail,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
} from "class-validator";
export class MediaEnquiryDto {
  @ApiProperty({ minLength: 2, maxLength: 100 })
  @IsString()
  @Length(2, 100)
  name!: string;
  @ApiProperty({ minLength: 2, maxLength: 160 })
  @IsString()
  @Length(2, 160)
  outlet!: string;
  @ApiProperty({ format: "email", maxLength: 254 })
  @IsEmail()
  @Length(3, 254)
  email!: string;
  @ApiPropertyOptional({ format: "date-time" })
  @IsOptional()
  @IsISO8601()
  deadline?: string;
  @ApiProperty({ minLength: 4, maxLength: 160 })
  @IsString()
  @Length(4, 160)
  subject!: string;
  @ApiProperty({ minLength: 20, maxLength: 4000 })
  @IsString()
  @Length(20, 4000)
  message!: string;
  @ApiProperty({ enum: ["en-GB", "fr-FR"] }) @IsIn(["en-GB", "fr-FR"]) locale!:
    "en-GB" | "fr-FR";
}
