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

export type Principal = StaffPrincipal | ReaderPrincipal;

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
  chapterId: string;
  position: number;
  updatedAt: string;
};

export type Entitlement = {
  contentId: string;
  benefit: "public-access" | "early-access" | "ad-free";
};

export type ReaderAccount = {
  id: string;
  progress: Record<string, ReadingProgress>;
  entitlements: Record<string, Entitlement>;
};

export type AnonymousReaderSession = {
  id: string;
  progress: Record<string, ReadingProgress>;
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

export function assertStaffMayPublish(
  principal: Principal,
): asserts principal is StaffPrincipal {
  if (principal.kind !== "staff") {
    throw new Error(
      "Staff Account is required for privileged publishing operations",
    );
  }

  if (!principal.permissions.includes("chapter:publish")) {
    throw new Error("Staff Account lacks chapter:publish permission");
  }
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
  return { id: input.id, progress: {}, entitlements: {} };
}

export function recordAnonymousProgress(
  session: AnonymousReaderSession,
  progress: ReadingProgress,
): AnonymousReaderSession {
  return {
    ...session,
    progress: {
      ...session.progress,
      [progress.chapterId]: progress,
    },
  };
}

export function upgradeAnonymousProgress(input: {
  session: AnonymousReaderSession;
  reader: ReaderAccount;
}): ReaderAccount {
  return {
    ...input.reader,
    progress: {
      ...input.reader.progress,
      ...input.session.progress,
    },
  };
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
