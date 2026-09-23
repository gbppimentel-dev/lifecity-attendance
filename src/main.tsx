import './mobile-workspaces.css'
import './styles.css'
import './landing.css'
import './ui-polish.css'
import './motion.css'
import './appearance-kiosk.css'
import './feedback.css'
import './tech-stack.css'
import './mobile-dashboard.css'
import './mobile-scanner.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { MotionRuntime } from './lib/motion'

createRoot(document.getElementById('root')!).render(
  <StrictMode><MotionRuntime /><App /></StrictMode>,
)
