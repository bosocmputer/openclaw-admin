import postgres from 'postgres'

const sql = postgres(process.env.DATABASE_URL!, {
  max: 5,
  idle_timeout: 30,
})

export default sql
