import { tenants } from '../lib/tenants'
import { Chat } from './chat'

// The settings are read when the page is requested, not when the site is built.
export const dynamic = 'force-dynamic'

export default function ChatPage() {
  // Only the tenant ids and the shortened keys go to the browser.
  return <Chat tenants={tenants().map(({ id, maskedKey }) => ({ id, maskedKey }))} />
}
