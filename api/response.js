import { neon } from '@neondatabase/serverless';

const getSql = () => {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing');
  return neon(process.env.DATABASE_URL);
};

async function ensureTable(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS hanan_responses (
      id BIGSERIAL PRIMARY KEY,
      session_id TEXT NOT NULL,
      stage TEXT NOT NULL,
      choice TEXT NOT NULL,
      lang VARCHAR(5) NOT NULL DEFAULT 'en',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_hanan_responses_session ON hanan_responses(session_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_hanan_responses_created ON hanan_responses(created_at DESC)`;
}

export default async function handler(req, res) {
  try {
    const sql = getSql();
    await ensureTable(sql);

    if (req.method === 'POST') {
      const { sessionId, stage, choice, lang = 'en' } = req.body || {};
      if (!sessionId || !stage || !choice) {
        return res.status(400).json({ ok: false, error: 'Missing fields' });
      }
      if ([sessionId, stage, choice, lang].some(v => typeof v !== 'string')) {
        return res.status(400).json({ ok: false, error: 'Invalid fields' });
      }
      if (sessionId.length > 100 || stage.length > 50 || choice.length > 500 || lang.length > 5) {
        return res.status(400).json({ ok: false, error: 'Payload too large' });
      }
      await sql`
        INSERT INTO hanan_responses (session_id, stage, choice, lang)
        VALUES (${sessionId}, ${stage}, ${choice}, ${lang})
      `;
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'GET') {
      const token = req.query?.token || req.headers['x-admin-token'];
      if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
        return res.status(401).json({ ok: false, error: 'Unauthorized' });
      }
      const rows = await sql`
        SELECT id, session_id, stage, choice, lang, created_at
        FROM hanan_responses
        ORDER BY created_at DESC
        LIMIT 500
      `;
      return res.status(200).json({ ok: true, responses: rows });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}
