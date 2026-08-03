export type CreativeDisclosure = "Human" | "Hybrid" | "AI-Assisted";

/**
 * How one Quality Gate condition came out. Only a blocking failure blocks: a
 * warning is something an editor should read, not something that stops a
 * chapter, and neither is a score.
 */
export const QUALITY_GATE_VERDICTS = [
  "pass",
  "warning",
  "blocking-failure",
] as const;

export type QualityGateVerdict = (typeof QUALITY_GATE_VERDICTS)[number];

/** The checks a chapter must pass before public publishing (ADR-0001). */
export const QUALITY_GATE_CONDITIONS = [
  "canonContinuity",
  "policySafety",
  "originalityIp",
  "metadata",
  "rightsRecord",
  "provenanceLedger",
  "humanApproval",
] as const;

export type QualityGateConditionName = (typeof QUALITY_GATE_CONDITIONS)[number];

/**
 * The conditions somebody has to report a check for. They are judgements about
 * the prose — does it contradict Canon, is it safe, is it original, does its
 * metadata describe it — and NovelX cannot reach them by reading its own
 * records, so a run that reports none of them has checked none of them.
 */
export const REPORTED_QUALITY_GATE_CONDITIONS = [
  "canonContinuity",
  "policySafety",
  "originalityIp",
  "metadata",
] as const;

/**
 * The conditions the record answers: the Rights Record covering the draft, the
 * lineage the Provenance Ledger holds for it, and the reviewer who approved it.
 * No reported check speaks for these, because believing a caller about them is
 * exactly what the gate exists to stop.
 */
export const RECORDED_QUALITY_GATE_CONDITIONS = [
  "rightsRecord",
  "provenanceLedger",
  "humanApproval",
] as const;

export type RecordedQualityGateCondition =
  (typeof RECORDED_QUALITY_GATE_CONDITIONS)[number];

export type ReportedQualityGateCondition =
  (typeof REPORTED_QUALITY_GATE_CONDITIONS)[number];

/** What a checker found for one condition, in the checker's own words. */
export type ReportedQualityCheck = Readonly<{
  condition: ReportedQualityGateCondition;
  verdict: QualityGateVerdict;
  /** How well it scored out of a hundred. Non-blocking: it decides nothing. */
  score?: number;
  note?: string;
}>;

/** The gate's answer for one condition, and why it answered that way. */
export type QualityGateFinding = Readonly<{
  condition: QualityGateConditionName;
  verdict: QualityGateVerdict;
  score?: number;
  note?: string;
}>;

/**
 * What one run of the Quality Gate concluded about a draft Chapter.
 *
 * Only `evaluateQualityGate` produces one, so a gate result cannot be written
 * by whoever wants a chapter published. `publicPublishingReady` is read off
 * `blockingFailures` and nothing else: `meanReportedScore` describes how the
 * checks that were scored went, and can never make a blocked chapter ready.
 */
export type QualityGateResult = Readonly<{
  chapterId: string;
  /** One finding per condition, in the order the gate checks them. */
  findings: readonly QualityGateFinding[];
  blockingFailures: readonly QualityGateConditionName[];
  /**
   * The mean of the scores checkers reported, absent when none were. It says how
   * the checks that were scored went, and is deliberately not a quality score
   * for the chapter: nothing reads it to decide anything.
   */
  meanReportedScore?: number;
  publicPublishingReady: boolean;
  evaluatedAt: string;
}>;

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
  aiPersona?: AiPersona;
  taxonomy: ManagedTaxonomy;
  status: "draft" | "active" | "completed" | "hiatus";
};

export type PublicCatalogSeries = Omit<Series, "aiPersona"> & {
  aiPersona?: PublicAiPersona;
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

export type PublicAiPersona = Pick<
  AiPersona,
  "id" | "displayName" | "disclosure"
>;

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
  /** What the Quality Gate concluded when it last ran, absent until it has. */
  qualityGate?: QualityGateResult;
  humanApproval?: {
    reviewerStaffAccountId: string;
    approvedAt: string;
  };
};

/**
 * When an approved Chapter is due to become public, and who put it there.
 *
 * A schedule is an intention rather than a publication: it holds the time the
 * Chapter may go out, and publishing before then is refused. Nothing here
 * publishes on its own — an operator or, later, a worker does the publishing,
 * and this is what they are held to.
 */
export type ChapterPublicationSchedule = Readonly<{
  seriesId: string;
  chapterId: string;
  chapterNumber: number;
  scheduledFor: string;
  scheduledByStaffAccountId: string;
  scheduledAt: string;
}>;

/**
 * Why a Published Snapshot replaced the one before it.
 *
 * A post-publication fix is a further version rather than a correction of the
 * earlier one, so what readers saw stays exactly as they saw it (ADR-0003) and
 * the reason it stopped being the public version is on the record that replaced
 * it, rather than only in a log beside it.
 */
export type PublishedSnapshotRevision = Readonly<{
  supersedesSnapshotId: string;
  reason: string;
}>;

export type PublishedSnapshot = Readonly<{
  id: string;
  chapterId: string;
  seriesId: string;
  chapterNumber: number;
  title: string;
  body: string;
  version: number;
  creativeDisclosure: CreativeDisclosure;
  aiPersona?: AiPersona;
  /** The lineage entry this snapshot's content traced when it went public. */
  provenanceLedgerEntryId: string;
  /** Every grant that cleared this Chapter for publishing, not just one. */
  rightsRecordIds: readonly string[];
  publishedAt: string;
  publishedByStaffAccountId: string;
  /** Why this version replaced the one before it; absent on a first publication. */
  revision?: PublishedSnapshotRevision;
}>;

/**
 * A published Chapter NovelX has stopped distributing, and why.
 *
 * A takedown is a decision about distribution, not a change to the record: it
 * names the Published Snapshot that was public when distribution stopped and
 * leaves it exactly as it was, so what readers saw is still answerable after
 * they can no longer open it (ADR-0003). Reason, actor, and time are all on it,
 * because a takedown nobody has to explain is not evidence of anything.
 *
 * It is keyed by Chapter rather than by snapshot: a Chapter that has been taken
 * down stays dark, so a later version cannot quietly walk back out.
 */
export type ChapterTakedown = Readonly<{
  seriesId: string;
  chapterId: string;
  /** The Published Snapshot that was public when distribution stopped. */
  snapshotId: string;
  reason: string;
  takenDownByStaffAccountId: string;
  takenDownAt: string;
}>;

/**
 * What a reader may see of a Published Snapshot: the Chapter, not the making
 * of it.
 *
 * The grants that cleared a Chapter, the lineage it traces, and the Staff
 * Account that published it are how NovelX answers for the Chapter internally.
 * They are named here by being left out, so a public read cannot serve them by
 * a snapshot growing a field nobody thought about.
 */
export type PublicChapter = Pick<
  PublishedSnapshot,
  | "id"
  | "chapterId"
  | "seriesId"
  | "chapterNumber"
  | "title"
  | "body"
  | "version"
  | "creativeDisclosure"
  | "publishedAt"
> & { aiPersona?: PublicAiPersona };

export function publicChapter(snapshot: PublishedSnapshot): PublicChapter {
  return Object.freeze({
    id: snapshot.id,
    chapterId: snapshot.chapterId,
    seriesId: snapshot.seriesId,
    chapterNumber: snapshot.chapterNumber,
    title: snapshot.title,
    body: snapshot.body,
    version: snapshot.version,
    creativeDisclosure: snapshot.creativeDisclosure,
    ...(snapshot.aiPersona
      ? { aiPersona: publicAiPersona(snapshot.aiPersona) }
      : {}),
    publishedAt: snapshot.publishedAt,
  });
}

export function publicAiPersona(
  persona: Pick<AiPersona, "id" | "displayName" | "disclosure">,
): PublicAiPersona {
  return Object.freeze({
    id: persona.id,
    displayName: persona.displayName,
    disclosure: persona.disclosure,
  });
}

export function publicCatalogSeries(input: {
  id: string;
  title: string;
  synopsis: string;
  creativeDisclosure: CreativeDisclosure;
  taxonomy: ManagedTaxonomy;
  status: Series["status"];
  aiPersona?: Pick<AiPersona, "id" | "displayName" | "disclosure">;
  firstPublicChapterId?: string;
}): PublicCatalogSeries {
  return Object.freeze({
    id: input.id,
    title: input.title,
    synopsis: input.synopsis,
    creativeDisclosure: input.creativeDisclosure,
    taxonomy: input.taxonomy,
    status: input.status,
    ...(input.aiPersona ? { aiPersona: publicAiPersona(input.aiPersona) } : {}),
    ...(input.firstPublicChapterId
      ? { firstPublicChapterId: input.firstPublicChapterId }
      : {}),
  });
}

/**
 * Where a traced change came from: an accountable person, or an AI workflow
 * run. A run is named as itself rather than as whoever started it, because how
 * AI-assisted content was made is the fact this ledger exists to keep.
 */
export type ProvenanceSource =
  | { kind: "staff"; staffAccountId: string }
  | { kind: "ai-workflow"; workspaceId: string; workflowRunId: string };

/** The artifacts whose lineage the ledger traces. */
export const PROVENANCE_TARGET_KINDS = [
  "series",
  "story-bible",
  "chapter-draft",
  "published-snapshot",
] as const;

export type ProvenanceTargetKind = (typeof PROVENANCE_TARGET_KINDS)[number];

/**
 * The artifact an entry traces. Every one of them belongs to a Series, and the
 * Series is carried on the entry so a Series' lineage can be read whole rather
 * than reassembled from the ids of everything under it.
 */
export type ProvenanceTarget = Readonly<{
  kind: ProvenanceTargetKind;
  id: string;
  seriesId: string;
}>;

/**
 * What the traced artifact was when the action happened, in the terms the
 * artifact already carries. The ledger says which version an action produced;
 * the CMS holds the version itself, so an entry names canon entries and
 * chapter numbers rather than copying prose that would then drift.
 */
export type ProvenanceVersion =
  | {
      kind: "series";
      status: Series["status"];
      creativeDisclosure: CreativeDisclosure;
    }
  | { kind: "story-bible"; canonEntryIds: readonly string[]; locked: boolean }
  | {
      kind: "chapter-draft";
      chapterNumber: number;
      /** The grants that cleared the material this draft's workflow carries. */
      rightsRecordIds: readonly string[];
      /**
       * What the Quality Gate concluded, once it has run. An evaluation that
       * left no trace of its outcome would be indistinguishable from the next
       * one, and the ledger exists to keep how content was evaluated.
       */
      qualityGate?: Readonly<{
        blockingFailures: readonly QualityGateConditionName[];
        publicPublishingReady: boolean;
      }>;
    }
  | { kind: "published-snapshot"; chapterId: string; version: number };

/**
 * What an entry is about: which artifact, and what it was at that moment. The
 * two travel together because an entry whose version context describes some
 * other artifact points at the wrong content, which is worse than none.
 */
export type ProvenanceSubject = Readonly<{
  target: ProvenanceTarget;
  version: ProvenanceVersion;
}>;

/**
 * One line of the Provenance Ledger: how content or an AI workflow artifact was
 * created, evaluated, edited, approved, revised, or published (ADR-0008).
 *
 * It is written once and never changed. This is lineage rather than operational
 * accountability, which is what keeps it distinct from a Staff Audit Record: an
 * entry exists because content changed, so refused attempts leave none, and an
 * AI workflow run appears here as a source in its own right.
 */
export type ProvenanceEntry = Readonly<{
  id: string;
  source: ProvenanceSource;
  action: string;
  target: ProvenanceTarget;
  version: ProvenanceVersion;
  recordedAt: string;
}>;

export type ReadingProgress = {
  seriesId: string;
  chapterId: string;
  position: number;
  updatedAt: string;
};

/**
 * The benefits an Entitlement may carry: ad-free reading, early access, or the
 * baseline public access every reader holds. NovelX models entitlement from the
 * start, even though real payment-provider integration is deferred until the
 * core reader, CMS, and publishing flows stabilize.
 */
export const ENTITLEMENT_BENEFITS = [
  "public-access",
  "early-access",
  "ad-free",
] as const;

export type EntitlementBenefit = (typeof ENTITLEMENT_BENEFITS)[number];

export type Entitlement = {
  contentId: string;
  benefit: EntitlementBenefit;
};

/**
 * The benefit a Chapter demands before a reader may open it. Absent when a
 * Chapter is open to every reader, present when access is gated on an
 * Entitlement a reader holds.
 */
export type EntitlementRequirement = Readonly<{
  chapterId: string;
  benefit: EntitlementBenefit;
}>;

export const ENTITLEMENT_REQUIRED = "entitlement-required";

/**
 * The access decision a reader-facing read reaches: either the Chapter is
 * open to this reader, or the benefit it demands and the reader lacks. The
 * refused case carries the requirement so a client can render an upgrade-ready
 * state without a second read.
 */
export type ChapterAccessDecision =
  { granted: true } | { granted: false; requirement: EntitlementRequirement };

/**
 * A requirement a Chapter demands, validated against the benefits NovelX
 * models. Only `createEntitlementRequirement` produces one, so a benefit
 * invented by a caller cannot gate a Chapter.
 */
export function createEntitlementRequirement(input: {
  chapterId: string;
  benefit: EntitlementBenefit;
}): EntitlementRequirement {
  if (!input.chapterId?.trim()) {
    throw new Error("Entitlement Requirement needs the Chapter it gates");
  }

  if (!ENTITLEMENT_BENEFITS.includes(input.benefit)) {
    throw new Error(
      `Entitlement Requirement needs a benefit: ${ENTITLEMENT_BENEFITS.join(", ")}`,
    );
  }

  return Object.freeze({
    chapterId: input.chapterId,
    benefit: input.benefit,
  });
}
/**
 * Whether a reader may open a Chapter, read off the Entitlement they hold
 * rather than any payment-provider state (ADR-0020).
 *
 * A Chapter with no requirement is open to every reader, anonymous included.
 * `public-access` is the baseline every reader holds, so a Chapter demanding it
 * stays open too — it is not a gate. Every other benefit is granted only by an
 * entitlement whose content is the Chapter and whose benefit is the one it
 * demands: one benefit does not stand in for another, because ad-free reading
 * and early access answer different questions, and an entitlement for another
 * Chapter answers none.
 */
export function decideChapterAccess(input: {
  requirement: EntitlementRequirement | undefined;
  entitlements: Readonly<Record<string, Entitlement>>;
}): ChapterAccessDecision {
  if (!input.requirement || input.requirement.benefit === "public-access") {
    return { granted: true };
  }

  const { chapterId, benefit } = input.requirement;
  const held = Object.values(input.entitlements).find(
    (entitlement) =>
      entitlement.contentId === chapterId && entitlement.benefit === benefit,
  );

  return held
    ? { granted: true }
    : { granted: false, requirement: input.requirement };
}

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
  const aiPersona = normalizeAiPersona(input.aiPersona);
  validateSeriesAiPersona(input.id, input.creativeDisclosure, aiPersona);

  return {
    id: input.id,
    title: input.title,
    synopsis: input.synopsis,
    creativeDisclosure: input.creativeDisclosure,
    taxonomy: input.taxonomy,
    ...(aiPersona ? { aiPersona } : {}),
    status: input.status ?? "draft",
  };
}

/** Changes an editor may make to a Series; its identity is not one of them. */
export function updateSeries(input: {
  series: Series;
  changes: Partial<Omit<Series, "id">>;
}): Series {
  const { aiPersona: changedAiPersona, ...changesWithoutAiPersona } =
    input.changes;
  const aiPersona =
    changedAiPersona === undefined
      ? input.series.aiPersona
      : normalizeAiPersona(changedAiPersona);
  const updated = {
    ...input.series,
    ...changesWithoutAiPersona,
    ...(aiPersona ? { aiPersona } : {}),
  };
  validateManagedTaxonomy(updated.taxonomy);
  validateSeriesAiPersona(updated.id, updated.creativeDisclosure, aiPersona);

  return updated;
}

function normalizeAiPersona(
  input: AiPersona | undefined,
): AiPersona | undefined {
  if (input === undefined) {
    return undefined;
  }

  if (input === null) {
    throw new Error("AI Persona must be a transparent persona profile");
  }

  return createAiPersona(input);
}

function validateSeriesAiPersona(
  seriesId: string,
  creativeDisclosure: CreativeDisclosure,
  aiPersona?: AiPersona,
): void {
  if (!aiPersona) {
    return;
  }

  if (creativeDisclosure !== "AI-Assisted") {
    throw new Error(
      "AI Persona content lines must use AI-Assisted Creative Disclosure",
    );
  }

  if (!aiPersona.managedContentLineIds.includes(seriesId)) {
    throw new Error("AI Persona must name the Series content line it manages");
  }
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
  const creativeDisclosure =
    input.creativeDisclosure ?? input.series.creativeDisclosure;
  validateSeriesAiPersona(
    input.series.id,
    creativeDisclosure,
    input.series.aiPersona,
  );

  return {
    id: input.id,
    seriesId: input.series.id,
    chapterNumber: input.chapterNumber,
    title: input.title,
    body: input.body,
    creativeDisclosure,
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
 *
 * Attaching changes what the draft is made of — the grants a Published Snapshot
 * names are read from these attachments — so the draft loses its Quality Gate
 * result and its Human Approval, per `withoutStaleGateAndApproval`.
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

  return withoutStaleGateAndApproval({
    ...input.draft,
    workflowMaterials: [...attached, attachment],
  });
}

/**
 * Takes the Quality Gate result and the Human Approval off a draft that has
 * changed.
 *
 * Both describe the draft as it was: the gate judged that prose and that
 * material, and a reviewer signed off the same. An approval therefore means the
 * content rather than the Chapter's name, and leaving either on would let a
 * Chapter reach readers citing a grant no run evaluated or prose no reviewer
 * saw. Re-running the gate and approving again is how a changed draft becomes
 * publishable, which is the one rule every route that changes a draft follows.
 */
function withoutStaleGateAndApproval(draft: ChapterDraft): ChapterDraft {
  const changed = { ...draft };
  delete changed.qualityGate;
  delete changed.humanApproval;

  return changed;
}

/**
 * Rewrites the prose of a draft Chapter, which is how a post-publication fix
 * reaches the publishing door as new prose that has been through everything.
 *
 * The prose is the most direct thing a gate run judged and a reviewer signed
 * off, so rewriting it costs the draft both, per `withoutStaleGateAndApproval`.
 *
 * A rewrite that changes nothing returns the draft it was given, so an
 * accidental resend does not cost a Chapter its approval.
 */
export function reviseChapterDraft(input: {
  draft: ChapterDraft;
  title?: string;
  body?: string;
}): ChapterDraft {
  const title = input.title ?? input.draft.title;
  const body = input.body ?? input.draft.body;

  if (!title.trim() || !body.trim()) {
    throw new Error("a draft Chapter needs a title and prose");
  }

  if (title === input.draft.title && body === input.draft.body) {
    return input.draft;
  }

  return withoutStaleGateAndApproval({ ...input.draft, title, body });
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

/**
 * Runs the Quality Gate over a draft Chapter: the multi-condition check a
 * chapter passes before it can be published publicly.
 *
 * Each condition is answered on its own and no condition outvotes another. Four
 * of them are judgements about the prose, so they arrive as reported checks, and
 * a condition nobody reported a check for is a blocking failure rather than a
 * pass — a gate that accepted silence could be passed by sending nothing. The
 * other three are read from the record: the grant covering the draft, the
 * lineage the Provenance Ledger holds for it, and the reviewer who approved it.
 *
 * It asserts no permission of its own. Whether a draft passes is a fact about
 * records and reported checks; who may run the gate is a separate question,
 * asked at the staff boundary.
 */
export function evaluateQualityGate(input: {
  draft: ChapterDraft;
  /** The Rights Record the draft names, as the grants on record hold it. */
  chapterRightsRecord?: RightsRecord;
  /** The draft's lineage as the Provenance Ledger holds it, newest first. */
  lineage: readonly ProvenanceEntry[];
  reportedChecks: readonly ReportedQualityCheck[];
  evaluatedAt: string;
}): QualityGateResult {
  const reported = readReportedChecks(input.reportedChecks);
  const findings = QUALITY_GATE_CONDITIONS.map((condition) =>
    Object.freeze(
      isRecordedCondition(condition)
        ? RECORDED_CONDITION_ANSWERS[condition](input)
        : (reported.get(condition) ?? unreportedFinding(condition)),
    ),
  );
  const scores = findings.flatMap((finding) =>
    finding.score === undefined ? [] : [finding.score],
  );

  const blockingFailures = findings
    .filter((finding) => finding.verdict === "blocking-failure")
    .map((finding) => finding.condition);

  return Object.freeze({
    chapterId: input.draft.id,
    findings: Object.freeze(findings),
    blockingFailures: Object.freeze(blockingFailures),
    ...(scores.length > 0
      ? {
          meanReportedScore: Math.round(
            scores.reduce((total, score) => total + score, 0) / scores.length,
          ),
        }
      : {}),
    // Read off the blocking failures and nothing else, so no summing of scores
    // can make a blocked chapter ready.
    publicPublishingReady: blockingFailures.length === 0,
    evaluatedAt: input.evaluatedAt,
  });
}

/**
 * Reads the checks a run reports, refusing what the gate cannot act on: a
 * condition it does not have, a condition the record answers, a second verdict
 * for a condition already answered, or a score that is not a share of a hundred.
 */
function readReportedChecks(
  checks: readonly ReportedQualityCheck[],
): Map<ReportedQualityGateCondition, QualityGateFinding> {
  const reported = new Map<ReportedQualityGateCondition, QualityGateFinding>();

  for (const check of checks) {
    const condition = check?.condition;

    if (isRecordedCondition(condition as QualityGateConditionName)) {
      throw new Error(
        `${condition} is answered by the record, not by a reported check`,
      );
    }

    if (!REPORTED_QUALITY_GATE_CONDITIONS.includes(condition)) {
      throw new Error(`the Quality Gate has no ${condition} condition`);
    }

    if (!QUALITY_GATE_VERDICTS.includes(check.verdict)) {
      throw new Error(
        `a reported check needs a verdict: ${QUALITY_GATE_VERDICTS.join(", ")}`,
      );
    }

    if (
      check.score !== undefined &&
      (!Number.isFinite(check.score) || check.score < 0 || check.score > 100)
    ) {
      throw new Error(
        "a reported score is a share of a hundred, or is left out",
      );
    }

    if (reported.has(condition)) {
      throw new Error(
        `${condition} was checked twice: one condition, one verdict`,
      );
    }

    reported.set(condition, {
      condition,
      verdict: check.verdict,
      ...(check.score === undefined ? {} : { score: check.score }),
      ...(check.note?.trim() ? { note: check.note } : {}),
    });
  }

  return reported;
}

/** What the gate reads the recorded conditions off, gathered for one run. */
type QualityGateRecords = Readonly<{
  draft: ChapterDraft;
  chapterRightsRecord?: RightsRecord;
  lineage: readonly ProvenanceEntry[];
}>;

/**
 * Where the gate reads each recorded condition.
 *
 * Keeping the answers in one map beside the vocabulary is what stops the two
 * from drifting: a condition named as recorded has its answer here, and there
 * is no fall-through that could quietly treat one as merely unreported.
 */
const RECORDED_CONDITION_ANSWERS = {
  rightsRecord: rightsFinding,
  provenanceLedger: provenanceFinding,
  humanApproval: humanApprovalFinding,
} satisfies Record<
  RecordedQualityGateCondition,
  (records: QualityGateRecords) => QualityGateFinding
>;

function isRecordedCondition(
  condition: QualityGateConditionName,
): condition is RecordedQualityGateCondition {
  return RECORDED_QUALITY_GATE_CONDITIONS.includes(
    condition as RecordedQualityGateCondition,
  );
}

/** A condition nobody checked, which blocks rather than passing on silence. */
function unreportedFinding(
  condition: ReportedQualityGateCondition,
): QualityGateFinding {
  return {
    condition,
    verdict: "blocking-failure",
    note: `no check was reported for ${condition}`,
  };
}

/**
 * Whether a grant covers publishing this draft Chapter.
 *
 * Material attached to the draft's workflow was cleared by the rights gate on
 * the way in (ADR-0015), so its grants are checked facts — but only for the use
 * they were cleared for, and material licensed for AI use says nothing about
 * publishing it. A Rights Record the draft names for itself is not a checked
 * fact at all: the gate resolves it against the grants on record and refuses an
 * id nobody holds, or a grant that does not cover publishing.
 */
function rightsFinding(records: QualityGateRecords): QualityGateFinding {
  const { draft, chapterRightsRecord } = records;
  const condition = "rightsRecord" as const;
  const named = draft.rightsRecordId?.trim();

  if (named) {
    if (chapterRightsRecord?.id !== named) {
      return {
        condition,
        verdict: "blocking-failure",
        note: `the draft Chapter names Rights Record ${named}, which is not held`,
      };
    }

    if (!chapterRightsRecord.scope.includes("publishing")) {
      return {
        condition,
        verdict: "blocking-failure",
        note: `Rights Record ${named} does not cover publishing use`,
      };
    }
  }

  const grants = publishingRightsGrants(draft);

  return grants.length > 0
    ? {
        condition,
        verdict: "pass",
        note: `cleared for publishing by Rights Record ${grants.join(", ")}`,
      }
    : {
        condition,
        verdict: "blocking-failure",
        note: "no Rights Record clears this draft Chapter for publishing",
      };
}

/**
 * The grants that clear a draft Chapter for publishing: the Rights Record it
 * names for itself, and those that cleared the material its workflow carries
 * for publishing use. The Quality Gate reads them to answer its rights
 * condition and the Published Snapshot carries them, so both say the same thing
 * about the same Chapter.
 */
function publishingRightsGrants(draft: ChapterDraft): readonly string[] {
  const named = draft.rightsRecordId?.trim();
  const cleared = (draft.workflowMaterials ?? [])
    .filter((attachment) => attachment.use === "publishing")
    .map((attachment) => attachment.rightsRecordId);

  return [...new Set([...(named ? [named] : []), ...cleared])];
}

/**
 * Whether the Provenance Ledger can say how this draft Chapter was made. The
 * lineage has to trace this draft under this Series: entries about some other
 * artifact would answer the condition with another Chapter's history.
 */
function provenanceFinding(records: QualityGateRecords): QualityGateFinding {
  const { draft } = records;
  const condition = "provenanceLedger" as const;
  const traced = tracedLineageEntry(draft, records.lineage);

  return traced
    ? {
        condition,
        verdict: "pass",
        note: `traced by Provenance Ledger entry ${traced.id}`,
      }
    : {
        condition,
        verdict: "blocking-failure",
        note: "the Provenance Ledger holds no lineage for this draft Chapter",
      };
}

/**
 * The line of lineage that traces this draft Chapter, out of however much of
 * the ledger was read. Lineage arrives newest first, so the first match is the
 * most recent one. Entries about some other artifact are no answer at all:
 * they would hand another Chapter's history to whoever asked.
 */
function tracedLineageEntry(
  draft: ChapterDraft,
  lineage: readonly ProvenanceEntry[],
): ProvenanceEntry | undefined {
  return lineage.find(
    (entry) =>
      entry.target.kind === "chapter-draft" &&
      entry.target.id === draft.id &&
      entry.target.seriesId === draft.seriesId,
  );
}

/** Whether an accountable human has approved the draft Chapter (ADR-0001). */
function humanApprovalFinding(records: QualityGateRecords): QualityGateFinding {
  const condition = "humanApproval" as const;
  const approval = records.draft.humanApproval;

  return isHumanApproved(records.draft)
    ? {
        condition,
        verdict: "pass",
        note: `approved by ${approval?.reviewerStaffAccountId}`,
      }
    : {
        condition,
        verdict: "blocking-failure",
        note: "no accountable reviewer has approved this draft Chapter",
      };
}

/**
 * Whether an approval names both the reviewer accountable for it and when they
 * gave it. One rule in one place, because the Quality Gate and the publishing
 * door both ask it and an approval that counted at one and not the other would
 * be a gate the other could be talked past.
 */
function isHumanApproved(draft: ChapterDraft): boolean {
  const approval = draft.humanApproval;

  return Boolean(
    approval?.reviewerStaffAccountId?.trim() && approval.approvedAt?.trim(),
  );
}

/** Admits a draft to the workflow that carries it towards publishing. */
export function createChapterDraft(
  input: ChapterDraft & {
    rightsRecordId: string;
    qualityGate: QualityGateResult;
  },
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

/**
 * The refusals of a publishing action that name state an editor has to change
 * or wait out, rather than a request they can correct. They are named so that
 * "nobody approved it" and "the Chapter before it is not out yet" are different
 * answers to whoever is trying to publish.
 */
/** What a Chapter is on its first publication; a fix is the version after. */
const FIRST_PUBLISHED_VERSION = 1;

export const PUBLICATION_REFUSALS = [
  "quality-gate-blocked",
  "human-approval-required",
  "chapter-already-published",
  "chapter-out-of-sequence",
  "publication-not-due",
  "chapter-not-published",
  "chapter-under-takedown",
] as const;

export type PublicationRefusal = (typeof PUBLICATION_REFUSALS)[number];

export class PublicationRefusedError extends Error {
  constructor(
    readonly code: PublicationRefusal,
    message: string,
  ) {
    super(message);
    this.name = "PublicationRefusedError";
  }
}

/** Approving a Chapter is the accountability act, held apart from writing it. */
export function assertStaffMayApproveChapter(
  principal: RequestPrincipal,
): asserts principal is StaffPrincipal {
  assertStaffPermission(principal, "chapter:approve");
}

/**
 * Records the Human Approval that ADR-0001 makes the public-publishing gate:
 * an accountable reviewer taking responsibility for this draft Chapter.
 *
 * A reviewer may only answer the condition that is theirs. A draft the Quality
 * Gate blocked for any other reason is refused here, so approval is the last
 * condition of the gate rather than a way around the rest of it.
 *
 * Approving an approved draft changes nothing: the approval names who took the
 * decision, and a second one must not move that to whoever pressed the button
 * most recently.
 */
export function approveChapterDraft(input: {
  draft: ChapterDraft;
  actor: RequestPrincipal;
  approvedAt: string;
}): ChapterDraft {
  assertStaffMayApproveChapter(input.actor);

  if (isHumanApproved(input.draft)) {
    return input.draft;
  }

  assertQualityGateCleared(input.draft);

  if (Number.isNaN(Date.parse(input.approvedAt))) {
    throw new Error(
      "Human Approval needs the time the reviewer took the decision",
    );
  }

  return {
    ...input.draft,
    humanApproval: {
      reviewerStaffAccountId: input.actor.staffAccountId,
      approvedAt: input.approvedAt,
    },
  };
}

/**
 * Records when an approved Chapter may become public.
 *
 * Only a Chapter that could be published right now can be scheduled, so a
 * schedule is a decision about *when* rather than a promise to finish the
 * gates later. The order it goes out in is not settled here: sequence is read
 * from what readers can already see, at the moment of publishing.
 */
export function scheduleChapterPublication(input: {
  series: Series;
  draft: ChapterDraft;
  actor: RequestPrincipal;
  scheduledFor: string;
  scheduledAt: string;
}): ChapterPublicationSchedule {
  const { draft } = input;
  assertStaffMayPublish(input.actor);
  assertDraftBelongsToSeries(input.series, draft);
  validateSeriesAiPersona(
    input.series.id,
    draft.creativeDisclosure,
    input.series.aiPersona,
  );
  assertPublishableDraft(draft);

  if (Number.isNaN(Date.parse(input.scheduledFor))) {
    throw new Error(
      "a Publication Schedule needs the time the Chapter becomes public",
    );
  }

  return Object.freeze({
    seriesId: draft.seriesId,
    chapterId: draft.id,
    chapterNumber: draft.chapterNumber,
    scheduledFor: input.scheduledFor,
    scheduledByStaffAccountId: input.actor.staffAccountId,
    scheduledAt: input.scheduledAt,
  });
}

/**
 * Makes a draft Chapter public as an immutable Published Snapshot (ADR-0003).
 *
 * It takes the Chapter numbers readers can already see rather than a flag
 * saying the order is fine, because publishing in sequence is a fact about the
 * Series and not a claim the caller can make about it.
 */
export function publishChapter(input: {
  series: Series;
  draft: ChapterDraft;
  actor: RequestPrincipal;
  /** The Chapter numbers of this Series that readers can already see. */
  publishedChapterNumbers: readonly number[];
  /** The draft's lineage as the Provenance Ledger holds it, newest first. */
  lineage: readonly ProvenanceEntry[];
  /** Present when this Chapter was scheduled, and it may not go out early. */
  schedule?: ChapterPublicationSchedule;
  publishedAt?: string;
}): PublishedSnapshot {
  const { draft } = input;
  assertStaffMayPublish(input.actor);
  assertDraftBelongsToSeries(input.series, draft);
  validateSeriesAiPersona(
    input.series.id,
    draft.creativeDisclosure,
    input.series.aiPersona,
  );
  assertPublishableDraft(draft);

  const publishedAt = input.publishedAt ?? new Date().toISOString();
  assertPublishesInSequence(draft, input.publishedChapterNumbers);
  assertPublicationIsDue(draft, input.schedule, publishedAt);

  return createPublishedSnapshot({
    series: input.series,
    draft,
    actor: input.actor,
    lineage: input.lineage,
    publishedAt,
    version: FIRST_PUBLISHED_VERSION,
  });
}

function assertDraftBelongsToSeries(series: Series, draft: ChapterDraft): void {
  if (series.id !== draft.seriesId) {
    throw new Error("chapter draft does not belong to the Series");
  }
}

/**
 * Whether this Chapter is the one the Series is due next.
 *
 * Readers follow a Series in order, so a Chapter cannot appear before the one
 * ahead of it, and a Chapter already published is refused rather than given a
 * second version: a change to public text is a revision, which carries the
 * reason this does not.
 */
function assertPublishesInSequence(
  draft: ChapterDraft,
  publishedChapterNumbers: readonly number[],
): void {
  const published = new Set(publishedChapterNumbers);

  if (published.has(draft.chapterNumber)) {
    throw new PublicationRefusedError(
      "chapter-already-published",
      `Chapter ${draft.chapterNumber} of Series ${draft.seriesId} is already published; a post-publication fix is a revision`,
    );
  }

  for (let earlier = 1; earlier < draft.chapterNumber; earlier += 1) {
    if (!published.has(earlier)) {
      throw new PublicationRefusedError(
        "chapter-out-of-sequence",
        `Chapter ${draft.chapterNumber} cannot be published before Chapter ${earlier}`,
      );
    }
  }
}

/** Whether a scheduled Chapter has reached the time it was scheduled for. */
function assertPublicationIsDue(
  draft: ChapterDraft,
  schedule: ChapterPublicationSchedule | undefined,
  publishedAt: string,
): void {
  if (!schedule) {
    return;
  }

  if (schedule.chapterId !== draft.id) {
    throw new Error(
      `the Publication Schedule names Chapter ${schedule.chapterId}, not ${draft.id}`,
    );
  }

  if (Date.parse(publishedAt) < Date.parse(schedule.scheduledFor)) {
    throw new PublicationRefusedError(
      "publication-not-due",
      `Chapter ${draft.chapterNumber} is scheduled for ${schedule.scheduledFor}`,
    );
  }
}

/**
 * Fixes a Chapter after publication by publishing a further version of it.
 *
 * The previous snapshot is read rather than written: it says what readers saw,
 * and a fix that edited it would destroy the only record of that (ADR-0003).
 * The new version carries the reason and the snapshot it replaced, so the
 * public text and why it changed are answerable from the same record.
 *
 * A fix is new prose, so it goes back through everything: the Quality Gate must
 * have run on the fixed draft and a reviewer must have approved it. A Chapter
 * under takedown is refused outright — republishing it would be a way around a
 * decision to stop distributing it, taken by whoever holds a different
 * permission.
 */
export function revisePublishedChapter(input: {
  series: Series;
  previousSnapshot: PublishedSnapshot;
  fixedDraft: ChapterDraft;
  actor: RequestPrincipal;
  /** The fixed draft's lineage as the Provenance Ledger holds it. */
  lineage: readonly ProvenanceEntry[];
  reason: string;
  /** Present when distribution of this Chapter has already been stopped. */
  takedown?: ChapterTakedown;
  publishedAt?: string;
}): PublishedSnapshot {
  const { fixedDraft, previousSnapshot } = input;
  assertStaffMayPublish(input.actor);

  if (!input.reason?.trim()) {
    throw new Error("post-publication fixes require an accountable reason");
  }

  if (previousSnapshot.chapterId !== fixedDraft.id) {
    throw new Error("post-publication fix must target the same Chapter");
  }

  assertDraftBelongsToSeries(input.series, fixedDraft);
  validateSeriesAiPersona(
    input.series.id,
    fixedDraft.creativeDisclosure,
    input.series.aiPersona,
  );
  assertChapterIsDistributed(fixedDraft.id, input.takedown);
  assertPublishableDraft(fixedDraft);

  return createPublishedSnapshot({
    series: input.series,
    draft: fixedDraft,
    actor: input.actor,
    lineage: input.lineage,
    ...(input.publishedAt ? { publishedAt: input.publishedAt } : {}),
    version: previousSnapshot.version + 1,
    revision: {
      supersedesSnapshotId: previousSnapshot.id,
      reason: input.reason,
    },
  });
}

/** Stopping distribution is its own authority, held apart from publishing. */
export function assertStaffMayTakeDownChapter(
  principal: RequestPrincipal,
): asserts principal is StaffPrincipal {
  assertStaffPermission(principal, "chapter:takedown");
}

/**
 * Stops distributing a published Chapter, without touching what it published.
 *
 * The Published Snapshot is taken as evidence rather than as something to
 * change: the takedown names it, and everything the Chapter ever published
 * stays on the record. Reason and actor are required because a takedown is a
 * decision somebody has to answer for — a legal complaint, a policy breach —
 * and one with neither would be indistinguishable from content going missing.
 */
export function takeDownPublishedChapter(input: {
  snapshot: PublishedSnapshot;
  actor: RequestPrincipal;
  reason: string;
  takenDownAt: string;
}): ChapterTakedown {
  assertStaffMayTakeDownChapter(input.actor);

  if (!input.reason?.trim()) {
    throw new Error("a takedown requires the reason distribution stopped");
  }

  if (Number.isNaN(Date.parse(input.takenDownAt))) {
    throw new Error("a takedown needs the time distribution stopped");
  }

  return Object.freeze({
    seriesId: input.snapshot.seriesId,
    chapterId: input.snapshot.chapterId,
    snapshotId: input.snapshot.id,
    reason: input.reason,
    takenDownByStaffAccountId: input.actor.staffAccountId,
    takenDownAt: input.takenDownAt,
  });
}

/** Whether this Chapter is one NovelX is still willing to put in front of readers. */
function assertChapterIsDistributed(
  chapterId: string,
  takedown: ChapterTakedown | undefined,
): void {
  if (takedown) {
    throw new PublicationRefusedError(
      "chapter-under-takedown",
      `distribution of Chapter ${chapterId} has been stopped: ${takedown.reason}`,
    );
  }
}

/**
 * A draft that has everything public publishing requires. Only
 * `assertPublishableDraft` produces one, so a Published Snapshot cannot be
 * built from a draft that skipped a gate.
 */
type PublishableChapterDraft = ChapterDraft & {
  qualityGate: QualityGateResult;
};

/**
 * Whether a draft may become public.
 *
 * Rights and lineage are not asked for here as strings the draft carries: they
 * are conditions of the Quality Gate, which resolves the grants on record and
 * the lineage the ledger holds rather than believing an id (ADR-0017). Asking
 * for the string as well would put the weaker check last.
 */
function assertPublishableDraft(
  draft: ChapterDraft,
): asserts draft is PublishableChapterDraft {
  assertQualityGateCleared(draft);

  // The approval itself, not the gate's account of it: a gate result says what
  // was on record when it ran, and an approval is what publishing needs now.
  if (!isHumanApproved(draft)) {
    throw new PublicationRefusedError(
      "human-approval-required",
      "Human Approval is required before public publishing",
    );
  }
}

/**
 * Whether the Quality Gate has run and left nothing blocking that approving
 * would not answer.
 *
 * `humanApproval` is dropped from what the last run found because it is the one
 * condition read from the draft rather than from the prose: the gate answers it
 * by looking at `draft.humanApproval` (ADR-0017), so approving between a run and
 * a publish genuinely resolves it, and re-reading the approval here is the same
 * check with a fresher answer. Every other condition is a judgement about the
 * draft as the gate found it, and only a new run can change one.
 */
function assertQualityGateCleared(
  draft: ChapterDraft,
): asserts draft is ChapterDraft & { qualityGate: QualityGateResult } {
  if (!draft.qualityGate) {
    throw new PublicationRefusedError(
      "quality-gate-blocked",
      "Quality Gate evaluation is required before public publishing",
    );
  }

  const blocking = draft.qualityGate.blockingFailures.filter(
    (condition) => condition !== "humanApproval",
  );

  if (blocking.length > 0) {
    throw new PublicationRefusedError(
      "quality-gate-blocked",
      `blocking Quality Gate failure: ${blocking.join(", ")}`,
    );
  }
}

function createPublishedSnapshot(input: {
  series: Series;
  draft: PublishableChapterDraft;
  actor: StaffPrincipal;
  lineage: readonly ProvenanceEntry[];
  publishedAt?: string;
  version: number;
  revision?: PublishedSnapshotRevision;
}): PublishedSnapshot {
  const { draft } = input;
  const traced = tracedLineageEntry(draft, input.lineage);

  // The gate's provenance condition passed on the ledger, so reaching here
  // without lineage means the ledger lost what it had. A snapshot that named no
  // lineage would be a public Chapter nobody could say the making of.
  if (!traced) {
    throw new Error(
      "the Provenance Ledger holds no lineage for this draft Chapter",
    );
  }

  return Object.freeze({
    id: `${draft.id}:snapshot:${input.version}`,
    chapterId: draft.id,
    seriesId: draft.seriesId,
    chapterNumber: draft.chapterNumber,
    title: draft.title,
    body: draft.body,
    version: input.version,
    creativeDisclosure: draft.creativeDisclosure,
    ...(input.series.aiPersona ? { aiPersona: input.series.aiPersona } : {}),
    provenanceLedgerEntryId: traced.id,
    rightsRecordIds: Object.freeze(publishingRightsGrants(draft)),
    publishedAt: input.publishedAt ?? new Date().toISOString(),
    publishedByStaffAccountId: input.actor.staffAccountId,
    ...(input.revision ? { revision: Object.freeze(input.revision) } : {}),
  });
}

/** Names a content change after the principal that made it, and nothing else. */
export function provenanceSource(
  principal: StaffPrincipal | AiWorkflowPrincipal,
): ProvenanceSource {
  return principal.kind === "staff"
    ? { kind: "staff", staffAccountId: principal.staffAccountId }
    : {
        kind: "ai-workflow",
        workspaceId: principal.workspaceId,
        workflowRunId: principal.workflowRunId,
      };
}

export function seriesProvenance(series: Series): ProvenanceSubject {
  return subject(
    { kind: "series", id: series.id, seriesId: series.id },
    {
      kind: "series",
      status: series.status,
      creativeDisclosure: series.creativeDisclosure,
    },
  );
}

export function storyBibleProvenance(
  storyBible: StoryBible,
): ProvenanceSubject {
  return subject(
    {
      kind: "story-bible",
      id: storyBible.seriesId,
      seriesId: storyBible.seriesId,
    },
    {
      kind: "story-bible",
      canonEntryIds: storyBible.canon.map((entry) => entry.id),
      locked: storyBible.lock !== undefined,
    },
  );
}

export function chapterDraftProvenance(draft: ChapterDraft): ProvenanceSubject {
  return subject(
    { kind: "chapter-draft", id: draft.id, seriesId: draft.seriesId },
    {
      kind: "chapter-draft",
      chapterNumber: draft.chapterNumber,
      rightsRecordIds: (draft.workflowMaterials ?? []).map(
        (attachment) => attachment.rightsRecordId,
      ),
      ...(draft.qualityGate
        ? {
            qualityGate: {
              blockingFailures: draft.qualityGate.blockingFailures,
              publicPublishingReady: draft.qualityGate.publicPublishingReady,
            },
          }
        : {}),
    },
  );
}

export function publishedSnapshotProvenance(
  snapshot: PublishedSnapshot,
): ProvenanceSubject {
  return subject(
    {
      kind: "published-snapshot",
      id: snapshot.id,
      seriesId: snapshot.seriesId,
    },
    {
      kind: "published-snapshot",
      chapterId: snapshot.chapterId,
      version: snapshot.version,
    },
  );
}

/**
 * Writes one line of lineage. The entry is frozen because the ledger is
 * append-only: a correction is a later entry saying what changed, never a
 * quieter edit of what the ledger said before.
 */
export function createProvenanceEntry(input: {
  id: string;
  source: ProvenanceSource;
  action: string;
  subject: ProvenanceSubject;
  recordedAt: string;
}): ProvenanceEntry {
  const { target, version } = input.subject ?? {};

  if (
    !input.id?.trim() ||
    !input.action?.trim() ||
    !target?.id?.trim() ||
    !target.seriesId?.trim() ||
    !PROVENANCE_TARGET_KINDS.includes(target.kind)
  ) {
    throw new Error(
      "Provenance Ledger entry needs an id, an action, and the artifact it traces",
    );
  }

  if (version?.kind !== target.kind) {
    throw new Error(
      `version context describes a ${version?.kind ?? "nothing"}, not a ${target.kind}`,
    );
  }

  return Object.freeze({
    id: input.id,
    source: Object.freeze({ ...input.source }),
    action: input.action,
    target: Object.freeze({ ...target }),
    version: Object.freeze({ ...version }),
    recordedAt: input.recordedAt,
  });
}

function subject(
  target: ProvenanceTarget,
  version: ProvenanceVersion,
): ProvenanceSubject {
  return Object.freeze({
    target: Object.freeze(target),
    version: Object.freeze(version),
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
  principal: RequestPrincipal,
): asserts principal is StaffPrincipal {
  assertStaffPermission(principal, "chapter:publish");
}

export function createAiPersona(input: {
  id: string;
  displayName: string;
  disclosure: "AI-operated creative persona";
  managedContentLineIds: string[];
  canAuthenticate?: boolean;
  fakeHumanBiography?: string;
  fakeHumanCredentials?: string;
  fakeHumanLivedExperience?: string;
  fakeHumanTestimonials?: string[];
}): AiPersona {
  if (input.canAuthenticate) {
    throw new Error(
      "AI Persona cannot authenticate or hold account privileges",
    );
  }

  if (
    input.fakeHumanBiography ||
    input.fakeHumanCredentials ||
    input.fakeHumanLivedExperience ||
    (input.fakeHumanTestimonials?.length ?? 0) > 0
  ) {
    throw new Error(
      "AI Persona must not present fake-human biography, credentials, lived experience, or testimonials",
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

// === Weekly Engaged Reading Hours and guardrails ===

/**
 * A chunk of engaged reading time a reader spent on a Chapter: the seconds they
 * read for, and the position they reached. Engagements arrive as debounced
 * events rather than per-scroll, so Weekly Engaged Reading Hours measures
 * reading rather than how often the page fired (CONTEXT: Weekly Engaged Reading
 * Hours).
 *
 * Only `acceptReadingEngagement` produces one, so a number a client made up
 * cannot reach the metric without passing the boundary's noise checks.
 */
export type ReadingEngagement = Readonly<{
  /** Present when a Reader Account reported the engagement. */
  readerAccountId?: string;
  /** Present when an Anonymous Reader Session reported the engagement. */
  anonymousSessionId?: string;
  seriesId: string;
  chapterId: string;
  /** Engaged reading seconds this event reports, bounded at the boundary. */
  engagedSeconds: number;
  /** Where in the Chapter the reader had reached when the event fired. */
  position: number;
  occurredAt: string;
}>;

/**
 * The longest single engagement the boundary accepts. A chunk longer than this
 * is noise rather than reading: a reader who left a visible tab open is not the
 * same signal as one who read, and an event claiming hours is exactly the
 * obvious case the boundary exists to keep out of the north-star metric.
 */
export const READING_ENGAGEMENT_MAX_SECONDS = 30 * 60;

export const READING_ENGAGEMENT_REFUSALS = [
  "reading-engagement-needs-a-chapter",
  "reading-engagement-needs-a-reader",
  "reading-engagement-needs-valid-seconds",
  "reading-engagement-needs-valid-position",
  "reading-engagement-needs-valid-time",
] as const;

export type ReadingEngagementRefusal =
  (typeof READING_ENGAGEMENT_REFUSALS)[number];

/**
 * Refusal of a reading engagement event the boundary kept out of the metric.
 * Each code names a kind of obvious noise so a caller can tell a missing
 * Chapter from an absurd duration.
 */
export class ReadingEngagementRefusedError extends Error {
  readonly code: ReadingEngagementRefusal;

  constructor(code: ReadingEngagementRefusal, message: string) {
    super(message);
    this.name = "ReadingEngagementRefusedError";
    this.code = code;
  }
}

/**
 * Admits a reading engagement event at the application boundary, refusing the
 * obvious noise cases so Weekly Engaged Reading Hours is built from legitimate
 * reader activity rather than whatever a client sent.
 *
 * The reader identity is attached by the caller, which has already resolved the
 * principal; this function guards the numbers. A chunk with no reading time, a
 * negative position, an unparseable time, or a duration longer than a reader
 * could read in one sitting is refused, because each is what an event fired on
 * every pixel scroll — or not fired by a reader at all — would look like.
 */
export function acceptReadingEngagement(input: {
  readerAccountId?: string;
  anonymousSessionId?: string;
  seriesId: string;
  chapterId: string;
  engagedSeconds: number;
  position: number;
  occurredAt: string;
}): ReadingEngagement {
  const hasReaderAccount = Boolean(input.readerAccountId?.trim());
  const hasAnonymousSession = Boolean(input.anonymousSessionId?.trim());

  if (hasReaderAccount === hasAnonymousSession) {
    throw new ReadingEngagementRefusedError(
      "reading-engagement-needs-a-reader",
      "reading engagement needs exactly one Reader Account or Anonymous Reader Session",
    );
  }

  if (!input.seriesId?.trim() || !input.chapterId?.trim()) {
    throw new ReadingEngagementRefusedError(
      "reading-engagement-needs-a-chapter",
      "reading engagement needs the Series and Chapter it was read on",
    );
  }

  if (!Number.isFinite(input.engagedSeconds) || input.engagedSeconds <= 0) {
    throw new ReadingEngagementRefusedError(
      "reading-engagement-needs-valid-seconds",
      "reading engagement needs a positive number of engaged seconds",
    );
  }

  if (input.engagedSeconds > READING_ENGAGEMENT_MAX_SECONDS) {
    throw new ReadingEngagementRefusedError(
      "reading-engagement-needs-valid-seconds",
      `reading engagement cannot exceed ${READING_ENGAGEMENT_MAX_SECONDS} seconds in one event`,
    );
  }

  if (!Number.isFinite(input.position) || input.position < 0) {
    throw new ReadingEngagementRefusedError(
      "reading-engagement-needs-valid-position",
      "reading engagement needs a non-negative position",
    );
  }

  if (Number.isNaN(Date.parse(input.occurredAt))) {
    throw new ReadingEngagementRefusedError(
      "reading-engagement-needs-valid-time",
      "reading engagement needs the time it occurred at",
    );
  }

  return Object.freeze({
    ...(input.readerAccountId?.trim()
      ? { readerAccountId: input.readerAccountId }
      : {}),
    ...(input.anonymousSessionId?.trim()
      ? { anonymousSessionId: input.anonymousSessionId }
      : {}),
    seriesId: input.seriesId,
    chapterId: input.chapterId,
    engagedSeconds: input.engagedSeconds,
    position: input.position,
    occurredAt: input.occurredAt,
  });
}

/**
 * The number of days the north-star metric reads across. It is the window the
 * metric is named for: a reader who stops reading is not reading this week.
 */
export const WEEKLY_ENGAGED_READING_HOURS_WINDOW_DAYS = 7;

export type WeeklyEngagedReadingHours = Readonly<{
  weekStart: string;
  weekEnd: string;
  /** Total engaged seconds accepted in the window. */
  totalEngagedSeconds: number;
  /** The north-star metric: total valid reading time, as hours. */
  engagedReadingHours: number;
  /** How many engagement events the metric was read from. */
  engagementCount: number;
}>;

/**
 * Reads the north-star metric off the engagements accepted in a week window:
 * total valid reading time from legitimate readers (CONTEXT: Weekly Engaged
 * Reading Hours).
 *
 * It reads engaged seconds rather than counting events, because the metric is
 * hours of reading rather than events: two five-minute chunks and one
 * ten-minute one are the same engaged hour. Engagements outside the window are
 * ignored, since a week is the window the metric is named for.
 */
export function weeklyEngagedReadingHours(input: {
  engagements: readonly ReadingEngagement[];
  weekStart: string;
  weekEnd: string;
}): WeeklyEngagedReadingHours {
  const start = Date.parse(input.weekStart);
  const end = Date.parse(input.weekEnd);
  const inWindow = input.engagements.filter((engagement) => {
    const at = Date.parse(engagement.occurredAt);
    return at >= start && at < end;
  });

  const totalEngagedSeconds = inWindow.reduce(
    (total, engagement) => total + engagement.engagedSeconds,
    0,
  );

  return Object.freeze({
    weekStart: input.weekStart,
    weekEnd: input.weekEnd,
    totalEngagedSeconds,
    engagedReadingHours: round3(totalEngagedSeconds / 3600),
    engagementCount: inWindow.length,
  });
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * The dimensions Weekly Engaged Reading Hours is interpreted alongside, so
 * growth is read against retention, report rate, AI cost, and ad complaints
 * rather than optimized in isolation (CONTEXT: Weekly Engaged Reading Hours).
 */
export const GUARDRAIL_DIMENSIONS = [
  "d30Retention",
  "reportRate",
  "aiCostPerApprovedChapter",
  "adComplaints",
] as const;

export type GuardrailDimension = (typeof GUARDRAIL_DIMENSIONS)[number];

/**
 * The guardrails the north-star metric is read against. Each is a baseline
 * hook: a slot the metric output carries so a real source can fill it later. A
 * guardrail with no source yet is absent rather than zero, because the absence
 * of a measurement is not the measurement zero.
 */
export type GuardrailSignals = Readonly<{
  d30Retention?: number;
  reportRate?: number;
  aiCostPerApprovedChapter?: number;
  adComplaints?: number;
}>;

/**
 * The metric output a staff or product user inspects: the north-star metric and
 * the guardrails it is interpreted alongside, in one read.
 */
export type WeeklyEngagedReadingHoursMetric = Readonly<{
  weeklyEngagedReadingHours: WeeklyEngagedReadingHours;
  guardrails: GuardrailSignals;
}>;
