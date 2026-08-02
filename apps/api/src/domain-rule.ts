import {
  BadRequestException,
  ConflictException,
  HttpException,
} from "@nestjs/common";
import {
  CANON_CHANGE_REQUIRES_REASON,
  PUBLICATION_REFUSALS,
  RIGHTS_EVIDENCE_REQUIRED,
  RIGHTS_GRANT_EXCEEDED,
  RIGHTS_RECORD_REQUIRED,
  RightsGrantExceededError,
  StaffAccessDeniedError,
  WORKFLOW_MATERIAL_ALREADY_ATTACHED,
} from "@novelx/shared";

/**
 * The refusals a client should be able to tell apart, and the answer each gets.
 *
 * A conflict is state the editor must change or explain first; a bad request is
 * something they can fix in the request itself. Everything else the domain
 * raises is a rule they broke without a name for it, and answers 400 with the
 * rule's own words.
 */
const REFUSALS: Readonly<Record<string, "conflict" | "bad-request">> = {
  [CANON_CHANGE_REQUIRES_REASON]: "conflict",
  [RIGHTS_RECORD_REQUIRED]: "conflict",
  [RIGHTS_GRANT_EXCEEDED]: "conflict",
  [WORKFLOW_MATERIAL_ALREADY_ATTACHED]: "conflict",
  [RIGHTS_EVIDENCE_REQUIRED]: "bad-request",
  // Every publishing refusal is state: a gate that has not been passed, a
  // Chapter that is not next, a time that has not come. None of them is
  // something the operator can fix by sending a different request.
  ...Object.fromEntries(
    PUBLICATION_REFUSALS.map((refusal) => [refusal, "conflict" as const]),
  ),
};

/**
 * Translates a broken domain rule into the answer an editor can act on, keeping
 * the domain's own code in the body so a client can tell the refusals apart
 * rather than reading the sentence. A refusal the boundary already decided
 * passes through untouched, so an authorization failure never softens into
 * a 400.
 */
export function domainRule<T>(apply: () => T): T {
  try {
    return apply();
  } catch (error) {
    if (
      error instanceof HttpException ||
      error instanceof StaffAccessDeniedError ||
      !(error instanceof Error)
    ) {
      throw error;
    }

    const code = refusalCode(error);
    const answer = code ? REFUSALS[code] : undefined;

    if (!code || !answer) {
      throw new BadRequestException(error.message);
    }

    const body = {
      error: code,
      message: error.message,
      ...(error instanceof RightsGrantExceededError
        ? { rightsRecordId: error.rightsRecordId }
        : {}),
    };

    throw answer === "conflict"
      ? new ConflictException(body)
      : new BadRequestException(body);
  }
}

function refusalCode(error: Error): string | undefined {
  const code = (error as { code?: unknown }).code;

  return typeof code === "string" ? code : undefined;
}
