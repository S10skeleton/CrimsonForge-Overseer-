import { api } from '../api'
import FeedbackView from './customers/FeedbackView'

export default function ForgePilotFeedbackTab({ role }: { role: string }) {
  return (
    <FeedbackView
      role={role}
      product="forgepilot"
      source={{ list: api.fp.feedback, updateStatus: api.fp.updateFeedback }}
    />
  )
}
