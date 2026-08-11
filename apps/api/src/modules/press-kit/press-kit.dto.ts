import { IsEmail, IsIn, IsString, Length } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class GeneratePressKitDto {
  @ApiProperty({ minLength: 2, maxLength: 100 })
  @IsString()
  @Length(2, 100)
  requesterName!: string;

  @ApiProperty({ minLength: 2, maxLength: 160 })
  @IsString()
  @Length(2, 160)
  outlet!: string;

  @ApiProperty({ format: "email", maxLength: 254 })
  @IsEmail()
  @Length(3, 254)
  email!: string;

  @ApiProperty({ enum: ["en-GB", "fr-FR"] })
  @IsIn(["en-GB", "fr-FR"])
  locale!: "en-GB" | "fr-FR";

  @ApiProperty({ enum: ["pdf", "zip"] })
  @IsIn(["pdf", "zip"])
  format!: "pdf" | "zip";
}
