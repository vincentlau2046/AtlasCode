// OAuth client — residual account-info population only.
// The claude.ai subscription refresh chain (refreshOAuthToken /
// fetchAndStoreUserRoles / createAndStoreApiKey / fetchProfileInfo /
// shouldUseClaudeAIAuth / parseScopes / isOAuthTokenExpired / getOrganizationUUID)
// was removed with the subscription OAuth chain. Domestic vendors authenticate
// via the OpenAI-protocol static key; account info is seeded from env vars
// (ATLAS_ACCOUNT_UUID / ATLAS_USER_EMAIL / ATLAS_ORGANIZATION_UUID) by
// populateOAuthAccountInfoIfNeeded below.

import type { AccountInfo } from '../../utils/config.js'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'
import type { BillingType } from './types.js'

/**
 * Populate the OAuth account info from env vars if not already cached in config.
 * SDK callers like Cowork can provide account info directly via env vars.
 * The profile-fetch tail was removed with the subscription chain — in the
 * static-key lane isAtlasAISubscriber() is always false, so the network fetch
 * was unreachable.
 * @returns Whether the oauth account info was populated.
 */
export async function populateOAuthAccountInfoIfNeeded(): Promise<boolean> {
  const envAccountUuid = process.env.ATLAS_ACCOUNT_UUID
  const envUserEmail = process.env.ATLAS_USER_EMAIL
  const envOrganizationUuid = process.env.ATLAS_ORGANIZATION_UUID
  if (envAccountUuid && envUserEmail && envOrganizationUuid) {
    if (!getGlobalConfig().oauthAccount) {
      storeOAuthAccountInfo({
        accountUuid: envAccountUuid,
        emailAddress: envUserEmail,
        organizationUuid: envOrganizationUuid,
      })
    }
    return true
  }
  return false
}

export function storeOAuthAccountInfo({
  accountUuid,
  emailAddress,
  organizationUuid,
  displayName,
  hasExtraUsageEnabled,
  billingType,
  accountCreatedAt,
  subscriptionCreatedAt,
}: {
  accountUuid: string
  emailAddress: string
  organizationUuid: string | undefined
  displayName?: string
  hasExtraUsageEnabled?: boolean
  billingType?: BillingType
  accountCreatedAt?: string
  subscriptionCreatedAt?: string
}): void {
  const accountInfo: AccountInfo = {
    accountUuid,
    emailAddress,
    organizationUuid,
    hasExtraUsageEnabled,
    billingType,
    accountCreatedAt,
    subscriptionCreatedAt,
  }
  if (displayName) {
    accountInfo.displayName = displayName
  }
  saveGlobalConfig(current => {
    // For oauthAccount we need to compare content since it's an object
    if (
      current.oauthAccount?.accountUuid === accountInfo.accountUuid &&
      current.oauthAccount?.emailAddress === accountInfo.emailAddress &&
      current.oauthAccount?.organizationUuid === accountInfo.organizationUuid &&
      current.oauthAccount?.displayName === accountInfo.displayName &&
      current.oauthAccount?.hasExtraUsageEnabled ===
        accountInfo.hasExtraUsageEnabled &&
      current.oauthAccount?.billingType === accountInfo.billingType &&
      current.oauthAccount?.accountCreatedAt === accountInfo.accountCreatedAt &&
      current.oauthAccount?.subscriptionCreatedAt ===
        accountInfo.subscriptionCreatedAt
    ) {
      return current
    }
    return { ...current, oauthAccount: accountInfo }
  })
}
