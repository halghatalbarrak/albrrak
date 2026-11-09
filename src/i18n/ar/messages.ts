// قاموس نصوص صفحة الرسائل — العربيّة. يُستدعى عبر tMessages.

export const messagesAr = {
  badgeNew: "جديدة",
  badgeAbsence: "غياب",
} as const;

export type MessagesKey = keyof typeof messagesAr;

export function tMessages(key: MessagesKey): string {
  return messagesAr[key];
}
