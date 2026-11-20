/**
 * Every setting the Groups Settings API accepts, grouped the way an admin
 * thinks about them. This is the allowlist for both reading (what gets
 * normalised) and writing (what may be sent); a name outside it is refused
 * before any request is made.
 */
export const SETTING_GROUPS = {
  membership: [
    "allowExternalMembers",
    "allowGoogleCommunication",
    "customRolesEnabledForSettingsToBeMerged",
    "includeInGlobalAddressList",
    "whoCanAdd",
    "whoCanApproveMembers",
    "whoCanBanUsers",
    "whoCanContactOwner",
    "whoCanDiscoverGroup",
    "whoCanInvite",
    "whoCanJoin",
    "whoCanLeaveGroup",
    "whoCanModifyMembers",
    "whoCanViewGroup",
    "whoCanViewMembership",
  ],
  posting: [
    "allowWebPosting",
    "customFooterText",
    "customReplyTo",
    "includeCustomFooter",
    "maxMessageBytes",
    "messageDisplayFont",
    "primaryLanguage",
    "replyTo",
    "showInGroupDirectory",
    "whoCanPostMessage",
  ],
  moderation: [
    "whoCanApproveMessages",
    "whoCanAssignTopics",
    "whoCanAssistContent",
    "whoCanDeleteAnyPost",
    "whoCanDeleteTopics",
    "whoCanEnterFreeFormTags",
    "whoCanLockTopics",
    "whoCanMakeTopicsSticky",
    "whoCanMarkDuplicate",
    "whoCanMarkFavoriteReplyOnAnyTopic",
    "whoCanMarkFavoriteReplyOnOwnTopic",
    "messageModerationLevel",
    "spamModerationLevel",
    "whoCanMarkNoResponseNeeded",
    "whoCanModerateContent",
    "whoCanModerateMembers",
    "whoCanModifyTagsAndCategories",
    "whoCanMoveTopicsIn",
    "whoCanMoveTopicsOut",
    "whoCanPostAnnouncements",
    "whoCanTakeTopics",
    "whoCanUnassignTopic",
    "whoCanUnmarkFavoriteReplyOnAnyTopic",
  ],
  delivery: [
    "archiveOnly",
    "defaultMessageDenyNotificationText",
    "enableCollaborativeInbox",
    "favoriteRepliesOnTop",
    "isArchived",
    "sendMessageDenyNotification",
    "whoCanAddReferences",
    "whoCanHideAbuse",
  ],
} as const;

export type SettingGroup = keyof typeof SETTING_GROUPS;
export type SettingName = (typeof SETTING_GROUPS)[SettingGroup][number];

export const SETTING_NAMES: SettingName[] = Object.values(SETTING_GROUPS).flat() as SettingName[];

const BY_NAME = new Map<string, SettingGroup>(
  Object.entries(SETTING_GROUPS).flatMap(([group, names]) =>
    names.map((name) => [name, group as SettingGroup] as const),
  ),
);

export function settingGroup(name: string): SettingGroup | undefined {
  return BY_NAME.get(name);
}

export function isKnownSetting(name: string): boolean {
  return BY_NAME.has(name);
}

/**
 * Splits a raw settings object into the four groups. Only names present in the
 * response appear; nothing is invented and nothing is dropped silently: an
 * unknown key lands in `other` so the caller can see it.
 */
export function normaliseSettings(raw: Record<string, unknown>): {
  groups: Record<string, Record<string, unknown>>;
  other: Record<string, unknown>;
} {
  const groups: Record<string, Record<string, unknown>> = {};
  const other: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(raw)) {
    const group = settingGroup(key);
    if (!group) {
      other[key] = value;
      continue;
    }
    groups[group] ??= {};
    groups[group][key] = value;
  }

  return { groups, other };
}
