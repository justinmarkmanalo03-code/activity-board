// Supabase Auth signs in by email, but the app uses usernames only.
// We deterministically map usernames to internal emails so users never
// need a real email address (same behavior as the original PHP app).

const FAKE_DOMAIN = "users.activityboard.internal";

export function emailForUsername(username: string): string {
  return `${username.trim().toLowerCase()}@${FAKE_DOMAIN}`;
}

// Accepts either a username or a real email address at the login form.
export function resolveLoginEmail(input: string): string {
  const value = input.trim();
  if (value.includes("@")) {
    return value;
  }
  return emailForUsername(value);
}
