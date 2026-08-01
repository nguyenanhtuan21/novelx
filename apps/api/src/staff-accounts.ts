import { createHash, timingSafeEqual } from "node:crypto";

import { createStaffPrincipal, type StaffPrincipal } from "@novelx/shared";

export const STAFF_ACCOUNT_DIRECTORY = Symbol("STAFF_ACCOUNT_DIRECTORY");

/**
 * The Staff Accounts a deployment recognises, and the only way to turn a staff
 * access credential into a Staff Account principal.
 *
 * `find` is what a staff session is worth on its own: the token names the
 * account, the directory says what that account may do right now, so removing
 * an account or a permission takes effect on the next request rather than when
 * the last session it was issued to runs out.
 */
export type StaffAccountDirectory = {
  authenticate(input: {
    staffAccountId: string;
    credential: string;
  }): StaffPrincipal | undefined;
  find(staffAccountId: string): StaffPrincipal | undefined;
};

type ProvisionedStaffAccount = {
  id: string;
  permissions: string[];
  credentialSha256: string;
};

/**
 * Staff Accounts provisioned through `STAFF_ACCOUNTS`, a JSON array of
 * `{ id, permissions, credentialSha256 }`, where the credential is a
 * high-entropy secret handed to an operator out of band.
 *
 * A deployment that configures nothing has no staff at all, which is the safe
 * default: local runs and the reader-facing surface never gain staff access by
 * accident. Real staff authentication — identity provider, MFA, step-up for
 * sensitive actions — replaces this directory without moving the boundary.
 */
export class ConfiguredStaffAccounts implements StaffAccountDirectory {
  private readonly accounts: Map<string, ProvisionedStaffAccount>;

  constructor(configuration: string | undefined) {
    this.accounts = new Map(
      parseStaffAccounts(configuration).map((account) => [account.id, account]),
    );
  }

  authenticate(input: {
    staffAccountId: string;
    credential: string;
  }): StaffPrincipal | undefined {
    const account = this.accounts.get(input.staffAccountId);
    const matches = credentialMatches(account, input.credential);

    return account && matches ? staffPrincipal(account) : undefined;
  }

  find(staffAccountId: string): StaffPrincipal | undefined {
    const account = this.accounts.get(staffAccountId);

    return account ? staffPrincipal(account) : undefined;
  }
}

/** Hashed against for an unknown id, so timing says nothing about who exists. */
const UNPROVISIONED_CREDENTIAL_SHA256 = "0".repeat(64);

function staffPrincipal(account: ProvisionedStaffAccount): StaffPrincipal {
  return createStaffPrincipal({
    staffAccountId: account.id,
    permissions: account.permissions,
  });
}

function credentialMatches(
  account: ProvisionedStaffAccount | undefined,
  credential: string,
): boolean {
  const expected = Buffer.from(
    account?.credentialSha256 ?? UNPROVISIONED_CREDENTIAL_SHA256,
    "hex",
  );
  const actual = createHash("sha256").update(credential).digest();

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/**
 * Misconfigured staff provisioning fails the deployment rather than quietly
 * leaving privileged operations open to whatever the config happened to mean.
 */
function parseStaffAccounts(
  configuration: string | undefined,
): ProvisionedStaffAccount[] {
  if (!configuration?.trim()) {
    return [];
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(configuration);
  } catch {
    throw new Error("STAFF_ACCOUNTS must be a JSON array of Staff Accounts");
  }

  if (!Array.isArray(parsed) || !parsed.every(isProvisionedStaffAccount)) {
    throw new Error(
      "each STAFF_ACCOUNTS entry needs id, permissions, and credentialSha256",
    );
  }

  return parsed;
}

function isProvisionedStaffAccount(
  candidate: unknown,
): candidate is ProvisionedStaffAccount {
  const account = candidate as Partial<ProvisionedStaffAccount>;

  return (
    typeof account?.id === "string" &&
    account.id.trim().length > 0 &&
    Array.isArray(account.permissions) &&
    account.permissions.every((permission) => typeof permission === "string") &&
    typeof account.credentialSha256 === "string" &&
    /^[0-9a-f]{64}$/i.test(account.credentialSha256)
  );
}
