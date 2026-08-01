import {
  BadRequestException,
  ConflictException,
  HttpException,
} from "@nestjs/common";
import {
  CANON_CHANGE_REQUIRES_REASON,
  LockedCanonError,
  RIGHTS_EVIDENCE_REQUIRED,
  RIGHTS_GRANT_EXCEEDED,
  RIGHTS_RECORD_REQUIRED,
  RightsGrantExceededError,
  RightsRecordRequiredError,
  StaffAccessDeniedError,
  UnbackedRightsEvidenceError,
  WORKFLOW_MATERIAL_ALREADY_ATTACHED,
  WorkflowMaterialAlreadyAttachedError,
} from "@novelx/shared";

/**
 * Translates a broken domain rule into the answer an editor can act on.
 *
 * Something they can fix in the request is a bad request; state they must
 * change or explain first — locked Canon, missing rights — is a conflict, and
 * carries the domain's own code so a client can tell the refusals apart rather
 * than reading the sentence. A refusal the boundary already decided passes
 * through untouched, so an authorization failure never softens into a 400.
 */
export function domainRule<T>(apply: () => T): T {
  try {
    return apply();
  } catch (error) {
    if (
      error instanceof HttpException ||
      error instanceof StaffAccessDeniedError
    ) {
      throw error;
    }

    if (error instanceof LockedCanonError) {
      throw new ConflictException({
        error: CANON_CHANGE_REQUIRES_REASON,
        message: error.message,
      });
    }

    if (error instanceof UnbackedRightsEvidenceError) {
      throw new BadRequestException({
        error: RIGHTS_EVIDENCE_REQUIRED,
        message: error.message,
      });
    }

    if (error instanceof RightsRecordRequiredError) {
      throw new ConflictException({
        error: RIGHTS_RECORD_REQUIRED,
        message: error.message,
      });
    }

    if (error instanceof RightsGrantExceededError) {
      throw new ConflictException({
        error: RIGHTS_GRANT_EXCEEDED,
        message: error.message,
        rightsRecordId: error.rightsRecordId,
      });
    }

    if (error instanceof WorkflowMaterialAlreadyAttachedError) {
      throw new ConflictException({
        error: WORKFLOW_MATERIAL_ALREADY_ATTACHED,
        message: error.message,
      });
    }

    throw error instanceof Error
      ? new BadRequestException(error.message)
      : error;
  }
}
