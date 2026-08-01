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

/** One accepted truth of a Series: a world rule, character, or story fact. */
export type CanonEntry = Readonly<{
  id: string;
  statement: string;
}>;

/** Who put a Story Bible into production use, and when. */
export type CanonLock = Readonly<{
  staffAccountId: string;
  lockedAt: string;
}>;

export type StoryBible = Readonly<{
  seriesId: string;
  canon: readonly CanonEntry[];
  /** Present once the Story Bible is locked; changes then need a reason. */
  lock?: CanonLock;
}>;

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

/**
 * An AI Factory workflow run reaching Core Platform. It is a system path, not a
 * person: it never becomes staff, so it cannot pass a staff permission gate.
 */
export type AiWorkflowPrincipal = {
  kind: "ai-workflow";
  workspaceId: string;
  workflowRunId: string;
};

export type Principal = StaffPrincipal | ReaderPrincipal;

export type ReaderRequestPrincipal = ReaderPrincipal | AnonymousReaderPrincipal;

/** Whoever a request presented, which may be no one and is rarely staff. */
export type RequestPrincipal =
  Principal | ReaderRequestPrincipal | AiWorkflowPrincipal | undefined;

export type AiPersona = {
  id: string;
  displayName: string;
  disclosure: "AI-operated creative persona";
  managedContentLineIds: string[];
  canAuthenticate: false;
};

/**
 * Something a workflow wants to work from rather than something NovelX wrote:
 * an asset, a dataset, a reference, or source material. It is named apart from
 * Chapters and Series because the question it raises is where it came from.
 */
export const WORKFLOW_MATERIAL_KINDS = [
  "asset",
  "dataset",
  "reference",
  "source-material",
] as const;

export type WorkflowMaterial = Readonly<{
  id: string;
  kind: (typeof WORKFLOW_MATERIAL_KINDS)[number];
}>;

/** A use of material that a Rights Record has to cover before it happens. */
export const RIGHTS_USES = ["ai-workflow", "publishing"] as const;

export type RightsUse = (typeof RIGHTS_USES)[number];

/** A grant somebody actually gave, and the shape the grant took. */
export const RIGHTS_EVIDENCE_KINDS = [
  "signed-licence",
  "written-permission",
  "work-for-hire",
  "public-domain-proof",
] as const;

export type RightsEvidenceKind = (typeof RIGHTS_EVIDENCE_KINDS)[number];

/**
 * A claim that only says the material could be reached. These are modelled
 * instead of left out so that presenting one is refused for what it is: being
 * findable on the Internet is not a grant, and neither is the URL it was found
 * at (ADR-0007).
 */
export const UNBACKED_RIGHTS_CLAIMS = [
  "public-availability",
  "source-url",
] as const;

export type UnbackedRightsClaim = (typeof UNBACKED_RIGHTS_CLAIMS)[number];

export type RightsEvidence = Readonly<{
  kind: RightsEvidenceKind | UnbackedRightsClaim;
  /** Where the grant itself is held: a contract, a licence, a signed letter. */
  reference: string;
}>;

/** How long the grant runs, open-ended until an expiry has been agreed. */
export type RightsDuration = Readonly<{ from: string; until?: string }>;

/** A territory value that covers every territory. */
export const WORLDWIDE_TERRITORY = "worldwide";

/**
 * The evidence-backed record of who owns or licenses workflow material, where
 * it may be used, for how long, whether it may be modified, and whether it may
 * be used in AI workflows.
 *
 * `scope` says which NovelX workflows the material is cleared for; `aiUseAllowed`
 * says whether the grant permits AI use at all. They are kept apart because a
 * licence routinely allows publishing while forbidding model use, and reading
 * that off a single field would make the safe answer the easy one to lose.
 */
export type RightsRecord = Readonly<{
  id: string;
  material: WorkflowMaterial;
  owner: string;
  scope: readonly RightsUse[];
  territories: readonly string[];
  duration: RightsDuration;
  modificationAllowed: boolean;
  aiUseAllowed: boolean;
  evidence: RightsEvidence;
  recordedByStaffAccountId: string;
  recordedAt: string;
}>;

/**
 * Material that passed the rights gate, and the Rights Record that let it
 * through. Only `clearMaterialForWorkflowUse` produces one, so material cannot
 * be attached to a workflow without a record that covers the use.
 */
export type WorkflowMaterialAttachment = Readonly<{
  material: WorkflowMaterial;
  use: RightsUse;
  rightsRecordId: string;
  territory: string;
  modifies: boolean;
  clearedAt: string;
}>;

/**
 * A Chapter being worked on: prose attached to a governed Series, never public.
 *
 * A draft starts as the prose an editor authored and nothing else. Rights
 * Record, Provenance Ledger entry, Quality Gate result, and Human Approval are
 * attached by the workflow that later carries it towards publishing, which is
 * why each is absent until then rather than blank.
 */
export type ChapterDraft = {
  id: string;
  seriesId: string;
  chapterNumber: number;
  title: string;
  body: string;
  creativeDisclosure: CreativeDisclosure;
  /** Material cleared into this draft's workflow, absent until any is. */
  workflowMaterials?: readonly WorkflowMaterialAttachment[];
  rightsRecordId?: string;
  provenanceLedgerEntryId?: string;
  qualityGate?: QualityGate;
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

/** Changes an editor may make to a Series; its identity is not one of them. */
export function updateSeries(input: {
  series: Series;
  changes: Partial<Omit<Series, "id">>;
}): Series {
  const updated = { ...input.series, ...input.changes };
  validateManagedTaxonomy(updated.taxonomy);

  return updated;
}

export const CANON_CHANGE_REQUIRES_REASON = "canon-change-requires-reason";

/**
 * Refusal of a change to locked Canon that nobody explained. Locked Canon is
 * not frozen — it is accountable: an editor may still change it, but only by
 * saying why, so the change cannot happen silently.
 */
export class LockedCanonError extends Error {
  readonly code = CANON_CHANGE_REQUIRES_REASON;

  constructor() {
    super("changing locked Canon requires an accountable reason");
    this.name = "LockedCanonError";
  }
}

/**
 * Canon is human-owned (ADR-0002), so every canon write asserts here rather
 * than trusting its caller: an AI Factory workflow, a reader session, or an
 * unidentified request is refused even when it reaches the domain directly.
 */
export function assertStaffMayWriteCanon(
  principal: RequestPrincipal,
): asserts principal is StaffPrincipal {
  assertStaffPermission(principal, "canon:write");
}

export function createStoryBible(input: {
  seriesId: string;
  canon?: readonly CanonEntry[];
  actor: RequestPrincipal;
}): StoryBible {
  assertStaffMayWriteCanon(input.actor);
  const canon = input.canon ?? [];
  validateCanon(canon);

  return Object.freeze({
    seriesId: input.seriesId,
    canon: Object.freeze([...canon]),
  });
}

export function amendCanon(input: {
  storyBible: StoryBible;
  canon: readonly CanonEntry[];
  actor: RequestPrincipal;
  /** Required once the Story Bible is locked, so no locked change is silent. */
  reason?: string;
}): StoryBible {
  assertStaffMayWriteCanon(input.actor);

  if (input.storyBible.lock && !input.reason?.trim()) {
    throw new LockedCanonError();
  }

  validateCanon(input.canon);

  return Object.freeze({
    ...input.storyBible,
    canon: Object.freeze([...input.canon]),
  });
}

/**
 * Puts a Story Bible into production use, naming the human accountable for it.
 *
 * Locking an already-locked Story Bible changes nothing. The lock records who
 * first took production use on, so a second lock must not quietly move that
 * accountability to whoever pressed the button most recently.
 */
export function lockStoryBible(input: {
  storyBible: StoryBible;
  actor: RequestPrincipal;
  lockedAt: string;
}): StoryBible {
  assertStaffMayWriteCanon(input.actor);

  if (input.storyBible.lock) {
    return input.storyBible;
  }

  return Object.freeze({
    ...input.storyBible,
    lock: Object.freeze({
      staffAccountId: input.actor.staffAccountId,
      lockedAt: input.lockedAt,
    }),
  });
}

function validateCanon(canon: readonly CanonEntry[]): void {
  const ids = new Set<string>();

  for (const entry of canon) {
    if (!entry.id.trim() || !entry.statement.trim() || ids.has(entry.id)) {
      throw new Error("Canon entries need a unique id and a statement");
    }

    ids.add(entry.id);
  }
}

/**
 * Writes a draft Chapter against a governed Series. Taking the Series rather
 * than its id is the attachment rule: there is no way to author a draft for a
 * Series the CMS does not hold.
 */
export function authorChapterDraft(input: {
  id: string;
  series: Series;
  chapterNumber: number;
  title: string;
  body: string;
  creativeDisclosure?: CreativeDisclosure;
}): ChapterDraft {
  if (
    !Number.isInteger(input.chapterNumber) ||
    input.chapterNumber < 1 ||
    !input.title.trim() ||
    !input.body.trim()
  ) {
    throw new Error(
      "draft Chapter needs a positive chapter number, a title, and prose",
    );
  }

  return {
    id: input.id,
    seriesId: input.series.id,
    chapterNumber: input.chapterNumber,
    title: input.title,
    body: input.body,
    creativeDisclosure:
      input.creativeDisclosure ?? input.series.creativeDisclosure,
  };
}

export const RIGHTS_EVIDENCE_REQUIRED = "rights-evidence-required";

/**
 * Refusal of a rights claim backed by nothing but reachability. A Rights Record
 * records a grant somebody gave; a URL records where a file was downloaded.
 */
export class UnbackedRightsEvidenceError extends Error {
  readonly code = RIGHTS_EVIDENCE_REQUIRED;

  constructor(readonly claim: string) {
    super(
      `${claim} is not rights evidence: a Rights Record needs the grant somebody gave`,
    );
    this.name = "UnbackedRightsEvidenceError";
  }
}

export const RIGHTS_RECORD_REQUIRED = "rights-record-required";

/** Refusal of workflow material nobody has recorded the rights to. */
export class RightsRecordRequiredError extends Error {
  readonly code = RIGHTS_RECORD_REQUIRED;

  constructor(message: string) {
    super(message);
    this.name = "RightsRecordRequiredError";
  }
}

export const RIGHTS_GRANT_EXCEEDED = "rights-grant-exceeded";

/**
 * Refusal of a use the Rights Record does not cover. Distinct from a missing
 * record: here the rights were checked and the grant says no, which is a
 * different thing for an editor to answer than nobody having checked.
 */
export class RightsGrantExceededError extends Error {
  readonly code = RIGHTS_GRANT_EXCEEDED;

  constructor(
    readonly rightsRecordId: string,
    message: string,
  ) {
    super(message);
    this.name = "RightsGrantExceededError";
  }
}

export const WORKFLOW_MATERIAL_ALREADY_ATTACHED =
  "workflow-material-already-attached";

/**
 * Refusal of material a draft's workflow already carries for that use. The
 * attachment records when the material entered the workflow, so attaching it
 * twice is refused rather than quietly re-dated.
 */
export class WorkflowMaterialAlreadyAttachedError extends Error {
  readonly code = WORKFLOW_MATERIAL_ALREADY_ATTACHED;

  constructor(message: string) {
    super(message);
    this.name = "WorkflowMaterialAlreadyAttachedError";
  }
}

/** Recording rights is privileged work: it is what later uses are trusted to. */
export function assertStaffMayRecordRights(
  principal: RequestPrincipal,
): asserts principal is StaffPrincipal {
  assertStaffPermission(principal, "rights:write");
}

export function createRightsRecord(input: {
  id: string;
  material: WorkflowMaterial;
  owner: string;
  scope: readonly RightsUse[];
  territories: readonly string[];
  duration: RightsDuration;
  modificationAllowed: boolean;
  aiUseAllowed: boolean;
  evidence: RightsEvidence;
  actor: RequestPrincipal;
  recordedAt: string;
}): RightsRecord {
  assertStaffMayRecordRights(input.actor);
  validateWorkflowMaterial(input.material);
  validateRightsEvidence(input.evidence);

  if (
    !input.owner?.trim() ||
    input.scope.length === 0 ||
    input.scope.some((use) => !RIGHTS_USES.includes(use)) ||
    input.territories.length === 0 ||
    input.territories.some((territory) => !territory?.trim())
  ) {
    throw new Error(
      "Rights Record needs an owner, a scope of use, and a territory",
    );
  }

  validateRightsDuration(input.duration);

  // A record that claims AI-workflow scope while the grant refuses AI use is
  // not a strict record or a lax one, it is a contradiction, and storing it
  // would leave the two fields to be reconciled by whoever reads them next.
  if (input.scope.includes("ai-workflow") && !input.aiUseAllowed) {
    throw new Error(
      "a Rights Record cannot clear AI-workflow use while the grant refuses AI use",
    );
  }

  return Object.freeze({
    id: input.id,
    material: Object.freeze({ ...input.material }),
    owner: input.owner,
    scope: Object.freeze([...input.scope]),
    territories: Object.freeze([...input.territories]),
    duration: Object.freeze({ ...input.duration }),
    modificationAllowed: input.modificationAllowed,
    aiUseAllowed: input.aiUseAllowed,
    evidence: Object.freeze({ ...input.evidence }),
    recordedByStaffAccountId: input.actor.staffAccountId,
    recordedAt: input.recordedAt,
  });
}

/**
 * The gate every workflow use of material passes: no Rights Record, no AI or
 * publishing use (ADR-0007). It answers the rights question and only that, so
 * an AI Factory workflow asking whether material is cleared gets the honest
 * answer rather than a permission refusal — who may record rights and who may
 * attach material are separate questions, asked at the staff boundary.
 */
export function clearMaterialForWorkflowUse(input: {
  material: WorkflowMaterial;
  use: RightsUse;
  rightsRecord: RightsRecord | undefined;
  territory: string;
  modifies?: boolean;
  usedAt: string;
}): WorkflowMaterialAttachment {
  const { material, use, rightsRecord: record } = input;
  validateWorkflowMaterial(material);

  if (!RIGHTS_USES.includes(use) || !input.territory?.trim()) {
    throw new Error(
      `workflow material needs a use (${RIGHTS_USES.join(", ")}) and the territory the use happens in`,
    );
  }

  const named = `${material.kind} ${material.id}`;

  if (!record) {
    throw new RightsRecordRequiredError(
      `${named} has no Rights Record, so it cannot enter ${use} use`,
    );
  }

  if (
    record.material.id !== material.id ||
    record.material.kind !== material.kind
  ) {
    throw new RightsRecordRequiredError(
      `Rights Record ${record.id} covers ${record.material.kind} ${record.material.id}, not ${named}`,
    );
  }

  const exceeded = (why: string) => {
    throw new RightsGrantExceededError(
      record.id,
      `${named} cannot enter ${use} use: ${why}`,
    );
  };

  if (!record.scope.includes(use)) {
    exceeded(`the grant does not cover ${use} use`);
  }

  // AI use is checked against the grant itself rather than only against the
  // scope list, because it is the dimension where a wrong answer is a licensing
  // breach instead of a metadata mistake.
  if (use === "ai-workflow" && !record.aiUseAllowed) {
    exceeded("the grant refuses AI use");
  }

  assertWithinRightsDuration(record, input.usedAt, exceeded);

  if (
    !record.territories.includes(WORLDWIDE_TERRITORY) &&
    !record.territories.includes(input.territory)
  ) {
    exceeded(`the grant does not cover the ${input.territory} territory`);
  }

  if (input.modifies && !record.modificationAllowed) {
    exceeded("the grant does not allow modification");
  }

  return Object.freeze({
    material: Object.freeze({ ...material }),
    use,
    rightsRecordId: record.id,
    territory: input.territory,
    modifies: input.modifies ?? false,
    clearedAt: input.usedAt,
  });
}

/**
 * Carries cleared material into a draft's workflow. It takes an attachment
 * rather than a material and a record, so there is no way to attach material
 * that did not go through the rights gate first.
 */
export function attachWorkflowMaterial(input: {
  draft: ChapterDraft;
  attachment: WorkflowMaterialAttachment;
}): ChapterDraft {
  const { attachment } = input;
  const attached = input.draft.workflowMaterials ?? [];

  if (
    attached.some(
      (entry) =>
        entry.material.id === attachment.material.id &&
        entry.material.kind === attachment.material.kind &&
        entry.use === attachment.use,
    )
  ) {
    throw new WorkflowMaterialAlreadyAttachedError(
      `draft Chapter ${input.draft.id} already carries ${attachment.material.kind} ${attachment.material.id} for ${attachment.use} use`,
    );
  }

  return {
    ...input.draft,
    workflowMaterials: [...attached, attachment],
  };
}

function validateWorkflowMaterial(material: WorkflowMaterial): void {
  if (
    !material?.id?.trim() ||
    !WORKFLOW_MATERIAL_KINDS.includes(material.kind)
  ) {
    throw new Error(
      `workflow material needs an id and a kind: ${WORKFLOW_MATERIAL_KINDS.join(", ")}`,
    );
  }
}

function validateRightsEvidence(evidence: RightsEvidence): void {
  if (UNBACKED_RIGHTS_CLAIMS.includes(evidence?.kind as UnbackedRightsClaim)) {
    throw new UnbackedRightsEvidenceError(evidence.kind);
  }

  if (!RIGHTS_EVIDENCE_KINDS.includes(evidence?.kind as RightsEvidenceKind)) {
    throw new Error(
      `Rights evidence must name how the grant is backed: ${RIGHTS_EVIDENCE_KINDS.join(", ")}`,
    );
  }

  if (!evidence.reference?.trim()) {
    throw new Error("Rights evidence must reference the grant it is backed by");
  }
}

function validateRightsDuration(duration: RightsDuration): void {
  const from = Date.parse(duration?.from ?? "");
  const until = duration?.until ? Date.parse(duration.until) : undefined;

  if (
    Number.isNaN(from) ||
    (until !== undefined && (Number.isNaN(until) || until <= from))
  ) {
    throw new Error(
      "Rights Record needs a duration that starts before it runs out",
    );
  }
}

function assertWithinRightsDuration(
  record: RightsRecord,
  usedAt: string,
  exceeded: (why: string) => void,
): void {
  const at = Date.parse(usedAt);

  if (Number.isNaN(at)) {
    exceeded(
      "the time of use is not a moment the grant can be checked against",
    );
    return;
  }

  if (at < Date.parse(record.duration.from)) {
    exceeded(`the grant does not start until ${record.duration.from}`);
  }

  if (record.duration.until && at > Date.parse(record.duration.until)) {
    exceeded(`the grant ran out on ${record.duration.until}`);
  }
}

/** Admits a draft to the workflow that carries it towards publishing. */
export function createChapterDraft(
  input: ChapterDraft & { rightsRecordId: string; qualityGate: QualityGate },
): ChapterDraft {
  if (!input.rightsRecordId.trim()) {
    throw new Error("Rights Record is required before draft workflow entry");
  }

  if (!input.provenanceLedgerEntryId?.trim()) {
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

  assertPublishableDraft(draft);

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

  assertPublishableDraft(input.fixedDraft);

  return createPublishedSnapshot({
    draft: input.fixedDraft,
    actor: input.actor,
    publishedAt: input.publishedAt,
    version: input.previousSnapshot.version + 1,
  });
}

/**
 * A draft that has everything public publishing requires. Only
 * `assertPublishableDraft` produces one, so a Published Snapshot cannot be
 * built from a draft that skipped a gate.
 */
type PublishableChapterDraft = ChapterDraft & {
  rightsRecordId: string;
  provenanceLedgerEntryId: string;
  qualityGate: QualityGate;
};

function assertPublishableDraft(
  draft: ChapterDraft,
): asserts draft is PublishableChapterDraft {
  if (!draft.rightsRecordId) {
    throw new Error("Rights Record is required before public publishing");
  }

  if (!draft.provenanceLedgerEntryId) {
    throw new Error(
      "Provenance Ledger entry is required before public publishing",
    );
  }

  if (!draft.qualityGate) {
    throw new Error(
      "Quality Gate evaluation is required before public publishing",
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
  draft: PublishableChapterDraft;
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

export function createAiWorkflowPrincipal(input: {
  workspaceId: string;
  workflowRunId: string;
}): AiWorkflowPrincipal {
  return {
    kind: "ai-workflow",
    workspaceId: input.workspaceId,
    workflowRunId: input.workflowRunId,
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
  | { kind: "ai-workflow"; workspaceId: string; workflowRunId: string }
  | { kind: "unauthenticated" };

/**
 * The baseline account of a privileged staff operation: who acted, what they
 * did, what they did it to, whether the boundary let them, and when. Refused
 * attempts are recorded too, so a reader probing the staff boundary leaves
 * evidence rather than silence.
 *
 * `outcome` is the boundary's decision on the attempt, not the result of the
 * work: `allowed` says this actor was permitted to try, which is what makes a
 * `denied` record meaningful.
 */
export type StaffAuditRecord = Readonly<{
  actor: StaffAuditActor;
  action: string;
  target: string;
  outcome: "allowed" | "denied";
  /**
   * Why the operation was performed, for the operations that are only
   * accountable when explained — changing locked Canon above all. Recording it
   * here is what stops such a change from being silent after the fact.
   */
  reason?: string;
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
    case "ai-workflow":
      return {
        kind: "ai-workflow",
        workspaceId: principal.workspaceId,
        workflowRunId: principal.workflowRunId,
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
  reason?: string;
  recordedAt: string;
}): StaffAuditRecord {
  if (!input.action.trim() || !input.target.trim()) {
    throw new Error("staff audit records must name an action and a target");
  }

  return Object.freeze({
    actor: input.actor,
    action: input.action,
    target: input.target,
    ...(input.reason?.trim() ? { reason: input.reason } : {}),
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
    !taxonomy?.genre?.trim() ||
    !taxonomy.subgenre?.trim() ||
    !taxonomy.audience?.trim() ||
    !taxonomy.ageRating?.trim()
  ) {
    throw new Error(
      "Managed Taxonomy requires genre, subgenre, audience, and age rating",
    );
  }

  // Every governed dimension has to arrive, even when it arrives empty. A
  // taxonomy that simply omits contentWarnings would take the warnings off a
  // Series a reader is about to open, which is the one dimension where a
  // silently missing value is a safety problem rather than a metadata gap.
  for (const dimension of [
    "tropes",
    "moods",
    "themes",
    "contentWarnings",
  ] as const) {
    if (
      !Array.isArray(taxonomy[dimension]) ||
      taxonomy[dimension].some((value) => typeof value !== "string")
    ) {
      throw new Error(
        `Managed Taxonomy needs ${dimension} as a list of governed values, even when empty`,
      );
    }
  }
}
