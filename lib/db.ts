import postgres from 'postgres'

const dbUrl = process.env.DATABASE_URL
if (!dbUrl) throw new Error('DATABASE_URL env var is required')

const sql = postgres(dbUrl, {
  max: 20,
  idle_timeout: 30,
  connect_timeout: 10,
})

export default sql
