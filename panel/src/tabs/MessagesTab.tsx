import { api } from '../api'
import MessagesView from './customers/MessagesView'

export default function MessagesTab({ role }: { role: string }) {
  return (
    <MessagesView
      role={role}
      product="crimsonforge-pro"
      source={{ list: api.cfp.messages, create: api.cfp.createMessage, update: api.cfp.updateMessage, remove: api.cfp.deleteMessage }}
    />
  )
}
