import {
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
} from "class-validator";
import type { WorkflowAction } from "../domain/workflow";

export class CreateDraftDto {
  @IsObject()
  payload!: Record<string, unknown>;
}

export class TransitionContentDto {
  @IsIn([
    "submit",
    "request_changes",
    "approve",
    "schedule",
    "supersede",
  ] satisfies WorkflowAction[])
  action!: WorkflowAction;

  @IsOptional()
  @IsBoolean()
  policySensitive?: boolean;

  @IsOptional()
  @IsString()
  scheduledFor?: string;
}

export class PublishContentDto {
  @IsIn(["en-GB", "fr-FR"])
  locale!: "en-GB" | "fr-FR";
}
