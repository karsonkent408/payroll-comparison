import { createHono } from '@/server/api/util/hono'
import aiFormatRoutes from './aiFormat'
import adminRoutes from './admin'
import devRoutes from './dev'
import comparisonRouter from './comparisons/index'

const app = createHono()

.route('/admin', adminRoutes)
.route('/ai-format', aiFormatRoutes)
.route('/comparisons', comparisonRouter)
.route('/dev', devRoutes)

export default app
