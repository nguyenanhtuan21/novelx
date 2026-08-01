export type CreativeDisclosure = "Human" | "Hybrid" | "AI-Assisted";

export type QualityGateCondition = "pass" | "warning" | "blocking-failure";

export type QualityGate = {
  canonContinuity: QualityGateCondition;
  policySafety: QualityGateCondition;
  originalityIp: QualityGateCondition;
  metadata: QualityGateCondition;
  rightsRecord: QualityGateCondition;
  provenanceLedger: QualityGateCondition;
  humanApproval: QualityGateCondition;
};

export type ManagedTaxonomy = {
  genre: string;
  subgenre: string;
  tropes: string[];
  moods: string[];
  themes: string[];
  audience: string;
  ageRating: string;
  contentWarnings: string[];
};

export type Series = {
  id: string;
  title: string;
  synopsis: string;
  creativeDisclosure: CreativeDisclosure;
  taxonomy: ManagedTaxonomy;
  status: "draft" | "active" | "completed" | "hiatus";
};

export type PublicCatalogSeries = Series & {
  firstPublicChapterId?: string;
};

export type StaffPrincipal = {
  kind: "staff";
  staffAccountId: string;
  permissions: string[];
};

export type ReaderPrincipal = {
  kind: "reader";
  readerAccountId: string;
};

export type AnonymousReaderPrincipal = {
  kind: "anonymous-reader";
  anonymousSessionId: string;
};

export type Principal = StaffPrincipal | ReaderPrincipal;

export type ReaderRequestPrincipal = ReaderPrincipal | AnonymousReaderPrincipal;

/** Whoever a request presented, which may be no one and is rarely staff. */
export type RequestPrincipal = Principal | ReaderRequestPrincipal | undefined;

export type AiPersona = {
  id: string;
  displayName: string;
  disclosure: "AI-operated creative persona";
  managedContentLineIds: string[];
  canAuthenticate: false;
};

export type ChapterDraft = {
  id: string;
  seriesId: string;
  chapterNumber: number;
  title: string;
  body: string;
  creativeDisclosure: CreativeDisclosure;
  rightsRecordId: string;
  provenanceLedgerEntryId: string;
  qualityGate: QualityGate;
  humanApproval?: {
    reviewerStaffAccountId: string;
    approvedAt: string;
  };
};

export type PublishedSnapshot = Readonly<{
  id: string;
  chapterId: string;
  seriesId: string;
  chapterNumber: number;
  title: string;
  body: string;
  version: number;
  creativeDisclosure: CreativeDisclosure;
  provenanceLedgerEntryId: string;
  rightsRecordId: string;
  publishedAt: string;
  publishedByStaffAccountId: string;
  publiclyReadable: true;
}>;

export type ReadingProgress = {
  seriesId: string;
  chapterId: string;
  position: number;
  updatedAt: string;
};

export type Entitlement = {
  contentId: string;
  benefit: "public-access" | "early-access" | "ad-free";
};

export type SeriesFollow = {
  seriesId: string;
  followedAt: string;
};

export type ReaderAccount = {
  id: string;
  progress: Record<string, ReadingProgress>;
  entitlements: Record<string, Entitlement>;
  follows: Record<string, SeriesFollow>;
};

export type AnonymousReaderSession = {
  id: string;
  progress: Record<string, ReadingProgress>;
  /** Set once the session has become a Reader Account, so it upgrades only once. */
  upgradedToReaderAccountId?: string;
};

export type ReaderLibraryEntry = {
  series: PublicCatalogSeries;
  followedAt: string;
  continueReading?: ReadingProgress;
};

export type ReaderLibrary = {
  entries: ReaderLibraryEntry[];
};

export function createSeries(
  input: Omit<Series, "status"> & { status?: Series["status"] },
): Series {
  validateManagedTaxonomy(input.taxonomy);

  return {
    ...input,
    status: input.status ?? "draft",
  };
}

export function createChapterDraft(input: ChapterDraft): ChapterDraft {
  if (!input.rightsRecordId.trim()) {
    throw new Error("Rights Record is required before draft workflow entry");
  }

  if (!input.provenanceLedgerEntryId.trim()) {
    throw new Error(
      "Provenance Ledger entry is required before draft workflow entry",
    );
  }

  return input;
}

export function publishChapter(input: {
  series: Series;
  draft: ChapterDraft;
  actor: StaffPrincipal;
  publishedAt?: string;
  version?: number;
}): PublishedSnapshot {
  const { draft } = input;
  assertStaffMayPublish(input.actor);

  if (input.series.id !== draft.seriesId) {
    throw new Error("chapter draft does not belong to the Series");
  }

  validatePublishableDraft(draft);

  return createPublishedSnapshot({
    draft,
    actor: input.actor,
    publishedAt: input.publishedAt,
    version: input.version ?? 1,
  });
}

export function revisePublishedChapter(input: {
  previousSnapshot: PublishedSnapshot;
  fixedDraft: ChapterDraft;
  actor: StaffPrincipal;
  reason: string;
  publishedAt?: string;
}): PublishedSnapshot {
  assertStaffMayPublish(input.actor);

  if (!input.reason.trim()) {
    throw new Error("post-publication fixes require an accountable reason");
  }

  if (input.previousSnapshot.chapterId !== input.fixedDraft.id) {
    throw new Error("post-publication fix must target the same Chapter");
  }

  validatePublishableDraft(input.fixedDraft);

  return createPublishedSnapshot({
    draft: input.fixedDraft,
    actor: input.actor,
    publishedAt: input.publishedAt,
    version: input.previousSnapshot.version + 1,
  });
}

function validatePublishableDraft(draft: ChapterDraft): void {
  if (!draft.rightsRecordId) {
    throw new Error("Rights Record is required before public publishing");
  }

  if (!draft.provenanceLedgerEntryId) {
    throw new Error(
      "Provenance Ledger entry is required before public publishing",
    );
  }

  const blockingFailures = Object.entries(draft.qualityGate)
    .filter(([, condition]) => condition === "blocking-failure")
    .map(([name]) => name);

  if (blockingFailures.length > 0) {
    throw new Error(
      `blocking Quality Gate failure: ${blockingFailures.join(", ")}`,
    );
  }

  if (!draft.humanApproval || draft.qualityGate.humanApproval !== "pass") {
    throw new Error("Human Approval is required before public publishing");
  }
}

function createPublishedSnapshot(input: {
  draft: ChapterDraft;
  actor: StaffPrincipal;
  publishedAt?: string;
  version: number;
}): PublishedSnapshot {
  const { draft } = input;

  return Object.freeze({
    id: `${draft.id}:snapshot:${input.version}`,
    chapterId: draft.id,
    seriesId: draft.seriesId,
    chapterNumber: draft.chapterNumber,
    title: draft.title,
    body: draft.body,
    version: input.version,
    creativeDisclosure: draft.creativeDisclosure,
    provenanceLedgerEntryId: draft.provenanceLedgerEntryId,
    rightsRecordId: draft.rightsRecordId,
    publishedAt: input.publishedAt ?? new Date().toISOString(),
    publishedByStaffAccountId: input.actor.staffAccountId,
    publiclyReadable: true,
  });
}

export function createReaderPrincipal(input: {
  readerAccountId: string;
}): ReaderPrincipal {
  return { kind: "reader", readerAccountId: input.readerAccountId };
}

export function createAnonymousReaderPrincipal(input: {
  anonymousSessionId: string;
}): AnonymousReaderPrincipal {
  return {
    kind: "anonymous-reader",
    anonymousSessionId: input.anonymousSessionId,
  };
}

export const READER_ACCOUNT_UPGRADE_REQUIRED =
  "reader-account-upgrade-required";

export class ReaderAccountUpgradeRequiredError extends Error {
  readonly code = READER_ACCOUNT_UPGRADE_REQUIRED;

  constructor() {
    super(
      "Reader Account is required for library behavior; upgrade the Anonymous Reader Session first",
    );
    this.name = "ReaderAccountUpgradeRequiredError";
  }
}

export function assertReaderAccountPrincipal(
  principal: ReaderRequestPrincipal,
): asserts principal is ReaderPrincipal {
  if (principal.kind !== "reader") {
    throw new ReaderAccountUpgradeRequiredError();
  }
}

export function createStaffPrincipal(input: {
  staffAccountId: string;
  permissions: string[];
}): StaffPrincipal {
  return {
    kind: "staff",
    staffAccountId: input.staffAccountId,
    permissions: input.permissions,
  };
}

export type StaffAuditActor =
  | { kind: "staff"; staffAccountId: string }
  | { kind: "reader"; readerAccountId: string }
  | { kind: "anonymous-reader"; anonymousSessionId: string }
  | { kind: "unauthenticated" };

/**
 * The baseline account of a privileged staff operation: who acted, what they
 * did, what they did it to, whether the boundary let them, and when. Refused
 * attempts are recorded too, so a reader probing the staff boundary leaves
 * evidence rather than silence.
 */
export type StaffAuditRecord = Readonly<{
  actor: StaffAuditActor;
  action: string;
  target: string;
  outcome: "allowed" | "denied";
  recordedAt: string;
}>;

export function staffAuditActor(principal: RequestPrincipal): StaffAuditActor {
  switch (principal?.kind) {
    case "staff":
      return { kind: "staff", staffAccountId: principal.staffAccountId };
    case "reader":
      return { kind: "reader", readerAccountId: principal.readerAccountId };
    case "anonymous-reader":
      return {
        kind: "anonymous-reader",
        anonymousSessionId: principal.anonymousSessionId,
      };
    default:
      return { kind: "unauthenticated" };
  }
}

export function createStaffAuditRecord(input: {
  actor: StaffAuditActor;
  action: string;
  target: string;
  outcome: StaffAuditRecord["outcome"];
  recordedAt: string;
}): StaffAuditRecord {
  if (!input.action.trim() || !input.target.trim()) {
    throw new Error("staff audit records must name an action and a target");
  }

  return Object.freeze({
    actor: input.actor,
    action: input.action,
    target: input.target,
    outcome: input.outcome,
    recordedAt: input.recordedAt,
  });
}

export const STAFF_ACCESS_REQUIRED = "staff-access-required";

/**
 * Refusal of a staff operation: either the request names no Staff Account, or
 * the Staff Account it names does not hold the permission the operation needs.
 */
export class StaffAccessDeniedError extends Error {
  readonly code = STAFF_ACCESS_REQUIRED;

  constructor(
    message: string,
    /** Whether a Staff Account was named at all, which decides 401 vs 403. */
    readonly authenticated: boolean,
  ) {
    super(message);
    this.name = "StaffAccessDeniedError";
  }
}

/**
 * The one gate every staff operation goes through.
 *
 * Reader Accounts and Anonymous Reader Sessions are not staff and never become
 * staff by holding a permission string: only a principal that arrived through
 * the staff boundary can pass, and only for a permission it actually holds.
 */
export function assertStaffAccount(
  principal: RequestPrincipal,
): asserts principal is StaffPrincipal {
  if (principal?.kind !== "staff") {
    throw new StaffAccessDeniedError(
      "Staff Account is required for privileged operations",
      false,
    );
  }
}

export function assertStaffPermission(
  principal: RequestPrincipal,
  permission: string,
): asserts principal is StaffPrincipal {
  assertStaffAccount(principal);

  if (!principal.permissions.includes(permission)) {
    throw new StaffAccessDeniedError(
      `Staff Account lacks ${permission} permission`,
      true,
    );
  }
}

export function assertStaffMayPublish(
  principal: Principal,
): asserts principal is StaffPrincipal {
  assertStaffPermission(principal, "chapter:publish");
}

export function createAiPersona(input: {
  id: string;
  displayName: string;
  disclosure: "AI-operated creative persona";
  managedContentLineIds: string[];
  fakeHumanBiography?: string;
  fakeHumanCredentials?: string;
}): AiPersona {
  if (input.fakeHumanBiography || input.fakeHumanCredentials) {
    throw new Error(
      "AI Persona must not present fake-human biography or credentials",
    );
  }

  return {
    id: input.id,
    displayName: input.displayName,
    disclosure: input.disclosure,
    managedContentLineIds: input.managedContentLineIds,
    canAuthenticate: false,
  };
}

export function createAnonymousReaderSession(input: {
  id: string;
}): AnonymousReaderSession {
  return { id: input.id, progress: {} };
}

export function createReaderAccount(input: { id: string }): ReaderAccount {
  return { id: input.id, progress: {}, entitlements: {}, follows: {} };
}

export function followSeries(
  reader: ReaderAccount,
  input: { seriesId: string; followedAt: string },
): ReaderAccount {
  return {
    ...reader,
    follows: {
      ...reader.follows,
      [input.seriesId]: {
        seriesId: input.seriesId,
        followedAt: input.followedAt,
      },
    },
  };
}

export function recordAnonymousProgress(
  session: AnonymousReaderSession,
  progress: ReadingProgress,
): AnonymousReaderSession {
  return {
    ...session,
    progress: {
      ...session.progress,
      [getReadingProgressKey(progress)]: progress,
    },
  };
}

export function getReadingProgressKey(
  progress: Pick<ReadingProgress, "seriesId" | "chapterId">,
): string {
  return `${encodeURIComponent(progress.seriesId)}/${encodeURIComponent(progress.chapterId)}`;
}

export function upgradeAnonymousProgress(input: {
  session: AnonymousReaderSession;
  reader: ReaderAccount;
}): ReaderAccount {
  return {
    ...input.reader,
    progress: mergeReadingProgress(
      input.reader.progress,
      input.session.progress,
    ),
  };
}

export function unfollowSeries(
  reader: ReaderAccount,
  input: { seriesId: string },
): ReaderAccount {
  const follows = { ...reader.follows };
  delete follows[input.seriesId];

  return { ...reader, follows };
}

export function recordReaderProgress(
  reader: ReaderAccount,
  progress: ReadingProgress,
): ReaderAccount {
  return {
    ...reader,
    progress: {
      ...reader.progress,
      [getReadingProgressKey(progress)]: progress,
    },
  };
}

export function buildReaderLibrary(input: {
  reader: ReaderAccount;
  catalog: PublicCatalogSeries[];
}): ReaderLibrary {
  const continueReadingBySeries = latestProgressBySeries(input.reader.progress);

  const entries = input.catalog
    .flatMap((series) => {
      const follow = input.reader.follows[series.id];

      return follow
        ? [
            {
              series,
              followedAt: follow.followedAt,
              continueReading: continueReadingBySeries.get(series.id),
            },
          ]
        : [];
    })
    .sort(compareLibraryEntries);

  return { entries };
}

function latestProgressBySeries(
  progress: Record<string, ReadingProgress>,
): Map<string, ReadingProgress> {
  const latest = new Map<string, ReadingProgress>();

  for (const entry of Object.values(progress)) {
    const current = latest.get(entry.seriesId);

    if (!current || current.updatedAt < entry.updatedAt) {
      latest.set(entry.seriesId, entry);
    }
  }

  return latest;
}

function compareLibraryEntries(
  left: ReaderLibraryEntry,
  right: ReaderLibraryEntry,
): number {
  if (left.continueReading && right.continueReading) {
    return right.continueReading.updatedAt.localeCompare(
      left.continueReading.updatedAt,
    );
  }

  if (left.continueReading || right.continueReading) {
    return left.continueReading ? -1 : 1;
  }

  return right.followedAt.localeCompare(left.followedAt);
}

function mergeReadingProgress(
  readerProgress: Record<string, ReadingProgress>,
  anonymousProgress: Record<string, ReadingProgress>,
): Record<string, ReadingProgress> {
  const progress = { ...readerProgress };

  for (const [key, candidate] of Object.entries(anonymousProgress)) {
    const existing = progress[key];
    if (!existing || candidate.updatedAt > existing.updatedAt) {
      progress[key] = candidate;
    }
  }

  return progress;
}

export function grantEntitlement(
  reader: ReaderAccount,
  entitlement: Entitlement,
): ReaderAccount {
  return {
    ...reader,
    entitlements: {
      ...reader.entitlements,
      [entitlement.contentId]: entitlement,
    },
  };
}

function validateManagedTaxonomy(taxonomy: ManagedTaxonomy): void {
  if (
    !taxonomy.genre.trim() ||
    !taxonomy.subgenre.trim() ||
    !taxonomy.audience.trim() ||
    !taxonomy.ageRating.trim()
  ) {
    throw new Error(
      "Managed Taxonomy requires genre, subgenre, audience, and age rating",
    );
  }
}
