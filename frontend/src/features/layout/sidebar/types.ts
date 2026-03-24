export interface MessengerChatItem {
  id: string
  title: string
  subtitle?: string
  initials?: string
  avatarUrl?: string
  unreadCount?: number
  /** Онлайн-собеседник в DM; если нет пира — не показывать индикатор. */
  peerOnline?: boolean
}
