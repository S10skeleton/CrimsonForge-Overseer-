import { api } from '../api'
import FeedbackView from './customers/FeedbackView'

export default function FeedbackTab({ role }: { role: string }) {
  return (
    <FeedbackView
      role={role}
      product="crimsonforge-pro"
      source={{ list: api.cfp.feedback, updateStatus: api.cfp.updateFeedback }}
    />
  )
}
