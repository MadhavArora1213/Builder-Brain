import asyncio
import asyncpg

async def fix():
    conn = await asyncpg.connect(user='postgres', password='password', database='grizon_ai', host='localhost', port=5432)
    await conn.execute("DROP TABLE IF EXISTS sandbox_sessions CASCADE")
    print("Dropped sandbox_sessions table. It will be recreated on server start.")
    await conn.close()

asyncio.run(fix())
