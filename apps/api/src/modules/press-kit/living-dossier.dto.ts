import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsIn, IsString, Length } from "class-validator";

export const dossierVariants = ["speaker", "institutional", "full"] as const;
export type DossierVariant = (typeof dossierVariants)[number];

export class GenerateLivingDossierDto {
  @ApiProperty({ minLength: 2, maxLength: 100 })
  @IsString()
  @Length(2, 100)
  requesterName!: string;

  @ApiProperty({ minLength: 2, maxLength: 160 })
  @IsString()
  @Length(2, 160)
  organisation!: string;

  @ApiProperty({ format: "email", maxLength: 254 })
  @IsEmail()
  @Length(3, 254)
  email!: string;

  @ApiProperty({ minLength: 10, maxLength: 500 })
  @IsString()
  @Length(10, 500)
  purpose!: string;

  @ApiProperty({ enum: dossierVariants })
  @IsIn(dossierVariants)
  variant!: DossierVariant;

  @ApiProperty({ enum: ["en-GB", "fr-FR"] })
  @IsIn(["en-GB", "fr-FR"])
  locale!: "en-GB" | "fr-FR";
}
