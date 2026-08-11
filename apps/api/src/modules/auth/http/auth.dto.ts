import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsObject,
  IsString,
  Length,
  MaxLength,
  MinLength,
} from "class-validator";
import { z } from "zod";
import { ApiProperty } from "@nestjs/swagger";
import { roles } from "../domain/roles";
import {
  webAuthnAuthenticationResponseSchema,
  webAuthnRegistrationResponseSchema,
} from "@amanor/contracts";

export const loginInputSchema = z
  .object({
    email: z.email().max(254),
    password: z.string().min(14).max(128),
    mfaCode: z
      .string()
      .regex(/^\d{6}$/u)
      .optional(),
    recoveryCode: z
      .string()
      .regex(/^[A-Z2-9]{4}(?:-[A-Z2-9]{4}){3}$/u)
      .optional(),
  })
  .refine((input) => Boolean(input.mfaCode) !== Boolean(input.recoveryCode))
  .strict();

export class LoginDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(14)
  @MaxLength(128)
  password!: string;

  @IsOptional() @IsString() @Length(6, 6) mfaCode?: string;
  @IsOptional() @IsString() @Length(19, 19) recoveryCode?: string;
}

export const rolesUpdateSchema = z
  .object({ roles: z.array(z.enum(roles)).min(1).max(roles.length) })
  .strict();
export class RolesUpdateDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(roles.length)
  @IsIn(roles, { each: true })
  roles!: string[];
}

export const administratorStatusSchema = z
  .object({ disabled: z.boolean() })
  .strict();
export class AdministratorStatusDto {
  @IsBoolean() disabled!: boolean;
}

export const administratorInvitationSchema = z
  .object({
    email: z.email().max(254),
    roles: z.array(z.enum(roles)).min(1).max(roles.length),
  })
  .strict();
export class AdministratorInvitationDto {
  @IsEmail() @MaxLength(254) email!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(roles.length)
  @IsIn(roles, { each: true })
  roles!: string[];
}

export const invitationSetupSchema = z
  .object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/u) })
  .strict();
export class InvitationSetupDto {
  @IsString() @Length(43, 43) token!: string;
}

export const invitationAcceptanceSchema = invitationSetupSchema
  .extend({
    password: z.string().min(14).max(128),
    mfaCode: z.string().regex(/^\d{6}$/u),
  })
  .strict();
export class InvitationAcceptanceDto extends InvitationSetupDto {
  @IsString() @MinLength(14) @MaxLength(128) password!: string;
  @IsString() @Length(6, 6) mfaCode!: string;
}

export const stepUpSchema = z
  .object({ mfaCode: z.string().regex(/^\d{6}$/u) })
  .strict();
export class StepUpDto {
  @IsString() @Length(6, 6) mfaCode!: string;
}

export class InvitationAcceptanceResponseDto {
  @ApiProperty({
    type: [String],
    minItems: 8,
    maxItems: 8,
    pattern: "^[A-Z2-9]{4}(?:-[A-Z2-9]{4}){3}$",
    description: "Single-use recovery codes displayed only in this response.",
  })
  recoveryCodes!: string[];
}

export class StepUpResponseDto {
  @ApiProperty({
    type: String,
    description: "Five-minute in-memory elevated access token.",
  })
  accessToken!: string;

  @ApiProperty({ type: Number, enum: [300] })
  expiresIn!: 300;
}

export const hardwareKeyRegistrationSchema = webAuthnRegistrationResponseSchema;
export const hardwareKeyAuthenticationSchema =
  webAuthnAuthenticationResponseSchema;

export class HardwareKeyRegistrationDto {
  @IsString() ceremonyId!: string;
  @IsObject()
  response!: Record<string, unknown>;
  @IsString() @MinLength(1) @MaxLength(80) label!: string;
}

export class HardwareKeyAuthenticationDto {
  @IsString() ceremonyId!: string;
  @IsObject()
  response!: Record<string, unknown>;
}

export const authenticationAuditQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    cursor: z.string().min(1).max(512).optional(),
  })
  .strict();
