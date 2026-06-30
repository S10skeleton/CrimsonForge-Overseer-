import { useCallback, useEffect, useRef, useState } from 'react'

const DEFAULT_IDLE_MIN = Number(import.meta.env.VITE_IDLE_LOGOUT_MIN) || 45
const WARN_SECONDS = 60 // show the "still there?" modal this long before logout

/**
 * Auto sign-out after inactivity. Returns whether the warning modal should show
 * and a `stay()` to cancel it. Activity (mouse/key/click/scroll) resets the
 * timer while no warning is up; once the warning shows, only `stay()` cancels it
 * (so the countdown is deliberate). Disable by setting VITE_IDLE_LOGOUT_MIN=0.
 */
export function useIdleLogout(onIdle: () => void, idleMin: number = DEFAULT_IDLE_MIN) {
  const [warning, setWarning] = useState(false)
  const warnTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const warningRef = useRef(false)
  warningRef.current = warning

  const reset = useCallback(() => {
    setWarning(false)
    if (warnTimer.current) clearTimeout(warnTimer.current)
    if (idleTimer.current) clearTimeout(idleTimer.current)
    if (idleMin <= 0) return // disabled
    warnTimer.current = setTimeout(() => setWarning(true), Math.max(0, idleMin * 60 - WARN_SECONDS) * 1000)
    idleTimer.current = setTimeout(() => onIdle(), idleMin * 60 * 1000)
  }, [idleMin, onIdle])

  useEffect(() => {
    if (idleMin <= 0) return
    const events: Array<keyof WindowEventMap> = ['mousemove', 'keydown', 'click', 'scroll']
    const onActivity = () => { if (!warningRef.current) reset() }
    events.forEach(e => window.addEventListener(e, onActivity, { passive: true }))
    reset()
    return () => {
      events.forEach(e => window.removeEventListener(e, onActivity))
      if (warnTimer.current) clearTimeout(warnTimer.current)
      if (idleTimer.current) clearTimeout(idleTimer.current)
    }
  }, [reset, idleMin])

  return { warning: idleMin > 0 && warning, stay: reset, warnSeconds: WARN_SECONDS }
}
