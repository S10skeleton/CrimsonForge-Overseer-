import { runMorningBriefing } from './scheduler.js'

console.log('Manually triggering morning briefing...')
runMorningBriefing().then(() => {
  console.log('Done.')
  process.exit(0)
})
