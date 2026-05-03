import type {
  LinkedAccountDiscordOAuth,
  LinkedAccountGitHubOAuth,
  LinkedAccountGoogleOAuth,
  User,
} from '@privy-io/api-types';

export function getPrivyEmail(user: User | null): string | null {
  if (!user?.linked_accounts?.length) return null;

  for (const account of user.linked_accounts) {
    if (account.type === 'email') return account.address;
    if (account.type === 'google_oauth') return account.email;
    if (account.type === 'github_oauth') {
      const gh = account as LinkedAccountGitHubOAuth;
      if (gh.email) return gh.email;
    }
    if (account.type === 'discord_oauth') {
      const d = account as LinkedAccountDiscordOAuth;
      if (d.email) return d.email;
    }
  }

  return null;
}

export function getPrivyDisplayName(user: User | null): string | null {
  if (!user?.linked_accounts?.length) return null;

  const google = user.linked_accounts.find((a): a is LinkedAccountGoogleOAuth => a.type === 'google_oauth');
  if (google?.name?.trim()) return google.name.trim();

  const gh = user.linked_accounts.find((a): a is LinkedAccountGitHubOAuth => a.type === 'github_oauth');
  if (gh?.name?.trim()) return gh.name.trim();

  const email = getPrivyEmail(user);
  if (email) {
    const local = email.split('@')[0];
    return local || email;
  }

  return null;
}
