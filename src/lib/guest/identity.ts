import { z } from "zod";

const GUEST_STORAGE_KEY = "codelens-studio-guest";
const adjectives = ["Brisk", "Calm", "Clever", "Kind", "Bright", "Steady"];
const roles = ["Reviewer", "Builder", "Navigator", "Debugger", "Maker", "Coder"];

const guestIdentitySchema = z.object({
  id: z.string().uuid(),
  displayName: z.string().min(1).max(48),
});

export type GuestIdentity = z.infer<typeof guestIdentitySchema>;

function generateDisplayName() {
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const role = roles[Math.floor(Math.random() * roles.length)];
  const suffix = Math.floor(10 + Math.random() * 90);
  return `${adjective} ${role} ${suffix}`;
}

export function getOrCreateGuestIdentity(): GuestIdentity {
  const storedValue = window.localStorage.getItem(GUEST_STORAGE_KEY);

  if (storedValue) {
    try {
      const result = guestIdentitySchema.safeParse(JSON.parse(storedValue));
      if (result.success) {
        return result.data;
      }
    } catch {
      // Invalid local data is replaced with a fresh identity below.
    }
  }

  const identity = {
    id: crypto.randomUUID(),
    displayName: generateDisplayName(),
  } satisfies GuestIdentity;

  window.localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(identity));
  return identity;
}

export function updateGuestDisplayName(identity: GuestIdentity, displayName: string) {
  const nextIdentity = guestIdentitySchema.parse({ ...identity, displayName: displayName.trim() });
  window.localStorage.setItem(GUEST_STORAGE_KEY, JSON.stringify(nextIdentity));
  return nextIdentity;
}
