export function formatUserDisplay(
  username: string | null | undefined,
  phone: string,
): string {
  const u = username?.trim()
  if (u) return `@${u}`
  return phone
}

export type PeerDisplay = {
  phone: string
  username?: string | null
  firstName?: string | null
  lastName?: string | null
}

export function formatPeerTitle(peer: PeerDisplay): string {
  const full =
    `${peer.firstName?.trim() ?? ''} ${peer.lastName?.trim() ?? ''}`.trim()
  if (full) return full
  return formatUserDisplay(peer.username, peer.phone)
}

export function formatProfileTitle(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  username: string | null | undefined,
  phone: string,
): string {
  return formatPeerTitle({ phone, username, firstName, lastName })
}

export function userAvatarLetter(
  username: string | null | undefined,
  phone: string,
): string {
  const u = username?.trim()
  if (u) return u.charAt(0).toUpperCase()
  const d = phone.replace(/\D/g, '')
  return d ? d.slice(-1).toUpperCase() : ''
}

export function userAvatarLetterForPeer(peer: PeerDisplay): string {
  const f = peer.firstName?.trim()
  if (f) return f.charAt(0).toUpperCase()
  const l = peer.lastName?.trim()
  if (l) return l.charAt(0).toUpperCase()
  return userAvatarLetter(peer.username, peer.phone)
}
