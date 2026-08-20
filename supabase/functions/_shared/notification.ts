export interface NeedNotification {
  title: string
  body: string
  tag: string
  url: string
}

/** What the family sees on the lock screen when someone asks for something. */
export function buildNeedNotification(
  requesterName: string,
  itemName: string,
  householdName: string,
  itemId: string,
): NeedNotification {
  const who = requesterName.trim() || 'Someone'
  return {
    title: `${who} needs ${itemName} 🙋`,
    body: householdName,
    // One notification per item: asking twice replaces rather than stacks.
    tag: `need-${itemId}`,
    url: '/low',
  }
}

/**
 * 404 and 410 mean the push service has permanently dropped this endpoint —
 * the device is gone. Anything else may succeed on a later request.
 */
export function shouldPruneSubscription(status: number): boolean {
  return status === 404 || status === 410
}
