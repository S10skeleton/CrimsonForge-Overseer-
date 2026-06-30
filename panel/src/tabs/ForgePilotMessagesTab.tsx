import { api } from '../api'
import MessagesView from './customers/MessagesView'

export default function ForgePilotMessagesTab({ role }: { role: string }) {
  return (
    <MessagesView
      role={role}
      product="forgepilot"
      source={{ list: api.fp.messages, create: api.fp.createMessage, update: api.fp.updateMessage, remove: api.fp.deleteMessage }}
    />
  )
}
