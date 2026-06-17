import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express'
import cors from 'cors'
import path from 'path'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import batchRoutes from './routes/batches.js'
import ruleRoutes from './routes/rules.js'
import anomalyRoutes from './routes/anomalies.js'
import reportRoutes from './routes/report.js'
import checkRoutes from './routes/check.js'
import drillRoutes from './routes/drill.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config()

const app: express.Application = express()

app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

app.use('/api/batches', batchRoutes)
app.use('/api/rules', ruleRoutes)
app.use('/api/anomalies', anomalyRoutes)
app.use('/api/report', reportRoutes)
app.use('/api/check', checkRoutes)
app.use('/api/drill', drillRoutes)

app.use(
  '/api/health',
  (req: Request, res: Response, next: NextFunction): void => {
    res.status(200).json({
      success: true,
      message: 'ok',
    })
  },
)

app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('API Error:', error.message, error.stack)
  res.status(500).json({
    success: false,
    error: 'Server internal error',
  })
})

app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'API not found',
  })
})

export default app
