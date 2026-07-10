import express from 'express';
import path from 'path';
import dns from 'dns';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import pg from 'pg';
import crypto from 'crypto';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '15mb' }));

// Initialize PostgreSQL client pool with Neon connection string safely
const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('⚠️ DATABASE_URL environment variable is not defined! Please configure your secure database credentials.');
}

const pool = new Pool({
  connectionString: connectionString || undefined,
  ssl: connectionString && (connectionString.includes('sslmode=require') || connectionString.includes('ssl=true')) ? { rejectUnauthorized: false } : false
});

// Database schema initialization
async function initDb() {
  if (!process.env.DATABASE_URL) {
    console.error('⚠️ Skipping database initialization: DATABASE_URL is not configured.');
    return;
  }
  const client = await pool.connect();
  try {
    // 1. Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        email VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        password_hash VARCHAR(255) NOT NULL
      );
    `);

    // 2. Create user sessions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        token VARCHAR(255) PRIMARY KEY,
        email VARCHAR(255) NOT NULL REFERENCES users(email) ON DELETE CASCADE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL
      );
    `);

    // 3. Create campaigns and emails tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS campaigns (
        id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        total_count INTEGER NOT NULL DEFAULT 0,
        valid_count INTEGER NOT NULL DEFAULT 0,
        invalid_count INTEGER NOT NULL DEFAULT 0,
        risky_count INTEGER NOT NULL DEFAULT 0,
        deliverability_score INTEGER NOT NULL DEFAULT 0,
        ai_summary TEXT,
        csv_headers TEXT
      );
    `);
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS emails (
        id SERIAL PRIMARY KEY,
        campaign_id VARCHAR(100) REFERENCES campaigns(id) ON DELETE CASCADE,
        email VARCHAR(255) NOT NULL,
        status VARCHAR(50) NOT NULL,
        score INTEGER NOT NULL DEFAULT 0,
        syntax_valid BOOLEAN NOT NULL,
        syntax_error TEXT,
        domain_valid BOOLEAN NOT NULL,
        domain_has_mx BOOLEAN NOT NULL,
        domain_error TEXT,
        disposable BOOLEAN NOT NULL DEFAULT FALSE,
        role_based BOOLEAN NOT NULL DEFAULT FALSE,
        typo_suggestion TEXT,
        original_row TEXT,
        occurrences INTEGER NOT NULL DEFAULT 1
      );
    `);

    // Ensure columns exist if the table was already created earlier
    await client.query(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS csv_headers TEXT;`);
    await client.query(`ALTER TABLE emails ADD COLUMN IF NOT EXISTS original_row TEXT;`);
    await client.query(`ALTER TABLE emails ADD COLUMN IF NOT EXISTS occurrences INTEGER DEFAULT 1;`);

    // 4. Seed default authorized users if not exists
    const pushkarEmail = 'pushkarmishra244@gmail.com';
    const raviEmail = 'ravi2009u@gmail.com';

    const pushkarCheck = await client.query('SELECT 1 FROM users WHERE email = $1', [pushkarEmail]);
    if (pushkarCheck.rowCount === 0) {
      const hash = crypto.createHash('sha256').update('Pushkar@2026').digest('hex');
      await client.query('INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3)', [pushkarEmail, 'Pushkar Mishra', hash]);
      console.log('Seeded default user: Pushkar Mishra');
    }

    const raviCheck = await client.query('SELECT 1 FROM users WHERE email = $1', [raviEmail]);
    if (raviCheck.rowCount === 0) {
      const hash = crypto.createHash('sha256').update('Ravi@2026').digest('hex');
      await client.query('INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3)', [raviEmail, 'Ravi Ranjan', hash]);
      console.log('Seeded default user: Ravi Ranjan');
    }

    console.log('Neon database tables successfully initialized or verified.');
  } catch (err) {
    console.error('Error initializing database tables:', err);
  } finally {
    client.release();
  }
}


// Initialize GoogleGenAI client lazy/safely
let ai: GoogleGenAI | null = null;
if (process.env.GEMINI_API_KEY) {
  ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Disposable domains
const DISPOSABLE_DOMAINS = new Set([
  'yopmail.com', 'mailinator.com', '10minutemail.com', 'tempmail.com', 
  'temp-mail.org', 'getairmail.com', 'guerrillamail.com', 'sharklasers.com', 
  'dispostable.com', 'trashmail.com', 'boun.cr', 'mintemail.com', 
  'getnada.com', 'throwawaymail.com', 'tempmailaddress.com', 'maildrop.cc',
  'disposable.com', 'tempmail.net', 'temp-mail.ru', 'temp-mail.info',
  'yopmail.fr', 'yopmail.net', 'cool.fr.nf', 'jetable.org'
]);

// Role-based account prefixes
const ROLE_PREFIXES = new Set([
  'admin', 'administrator', 'info', 'support', 'sales', 'contact', 'billing', 
  'jobs', 'careers', 'hr', 'office', 'marketing', 'media', 'press', 'hello', 
  'webmaster', 'hostmaster', 'postmaster', 'help', 'feedback', 'team', 'staff', 
  'service', 'no-reply', 'noreply', 'inquires', 'enquiries'
]);

// Typo domain corrections
const TYPO_MAP: { [key: string]: string } = {
  'gamil.com': 'gmail.com',
  'gmal.com': 'gmail.com',
  'gmeil.com': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gmaill.com': 'gmail.com',
  'yaho.com': 'yahoo.com',
  'yahooo.com': 'yahoo.com',
  'hotail.com': 'hotmail.com',
  'hotamil.com': 'hotmail.com',
  'msm.com': 'msn.com',
  'outlok.com': 'outlook.com',
  'iclod.com': 'icloud.com',
  'ymail.com': 'yahoo.com',
};

// DNS lookup with 1800ms timeout to keep bulk list analysis snappy
function checkMxRecords(domain: string, timeoutMs = 1800): Promise<{ valid: boolean; hasMx: boolean; error?: string }> {
  return new Promise((resolve) => {
    let resolved = false;
    
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve({ valid: true, hasMx: false, error: 'DNS Timeout' });
      }
    }, timeoutMs);

    dns.resolveMx(domain, (err, addresses) => {
      if (resolved) return;
      
      if (err) {
        // Fallback to A record check (some mail transfer agents deliver to A if MX is missing)
        dns.resolve(domain, 'A', (errA, addressesA) => {
          if (resolved) return;
          resolved = true;
          clearTimeout(timer);
          
          if (errA) {
            resolve({ valid: false, hasMx: false, error: 'No MX or A records' });
          } else if (addressesA && addressesA.length > 0) {
            resolve({ valid: true, hasMx: false }); // domain exists but no MX records
          } else {
            resolve({ valid: false, hasMx: false, error: 'No MX or A records' });
          }
        });
      } else {
        resolved = true;
        clearTimeout(timer);
        const hasMx = addresses && addresses.length > 0;
        resolve({ valid: hasMx, hasMx, error: hasMx ? undefined : 'No MX records' });
      }
    });
  });
}

// Single email validation
async function verifySingleEmail(rawEmail: string): Promise<any> {
  const email = (rawEmail || '').trim().toLowerCase();
  
  const result: any = {
    email: rawEmail.trim(),
    status: 'valid',
    score: 100,
    syntax: { valid: true },
    domain: { valid: true, hasMx: true },
    disposable: false,
    roleBased: false
  };

  // 1. Syntax check
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  
  if (!email || !emailRegex.test(email) || email.length > 254) {
    result.status = 'invalid';
    result.score = 0;
    result.syntax = { valid: false, error: 'Malformed or invalid syntax' };
    result.domain = { valid: false, hasMx: false, error: 'Cannot check invalid domain' };
    return result;
  }

  const parts = email.split('@');
  if (parts.length !== 2) {
    result.status = 'invalid';
    result.score = 0;
    result.syntax = { valid: false, error: 'Malformed syntax' };
    return result;
  }

  const [localPart, domain] = parts;

  // 2. Typo suggestions
  if (TYPO_MAP[domain]) {
    result.typoSuggestion = `${localPart}@${TYPO_MAP[domain]}`;
  }

  // 3. Disposable Check
  if (DISPOSABLE_DOMAINS.has(domain)) {
    result.disposable = true;
    result.status = 'risky';
    result.score -= 50;
  }

  // 4. Role-based Check
  if (ROLE_PREFIXES.has(localPart)) {
    result.roleBased = true;
    if (result.status !== 'risky') {
      result.status = 'risky';
    }
    result.score -= 30;
  }

  // 5. DNS & MX Check (skip if we already know syntax is busted or disposable domain)
  // If it's disposable, we can still perform MX check for completeness or skip
  try {
    const dnsResult = await checkMxRecords(domain);
    result.domain = {
      valid: dnsResult.valid,
      hasMx: dnsResult.hasMx,
      error: dnsResult.error
    };

    if (!dnsResult.valid) {
      result.status = 'invalid';
      result.score = 0;
    } else if (!dnsResult.hasMx) {
      // Has A record but no MX records
      if (result.status === 'valid') {
        result.status = 'risky';
      }
      result.score -= 20;
    }
  } catch (e: any) {
    result.domain = { valid: true, hasMx: false, error: 'DNS Lookup Error' };
    if (result.status === 'valid') {
      result.status = 'risky';
    }
    result.score -= 20;
  }

  // Clamp score
  result.score = Math.max(0, Math.min(100, result.score));

  return result;
}

// Bulk validation with concurrency
async function verifyEmailList(emails: string[]): Promise<any[]> {
  const results: any[] = [];
  const batchSize = 15; // Batch size to optimize DNS query speed and thread limits
  for (let i = 0; i < emails.length; i += batchSize) {
    const batch = emails.slice(i, i + batchSize);
    const promises = batch.map(email => verifySingleEmail(email));
    const batchResults = await Promise.all(promises);
    results.push(...batchResults);
  }
  return results;
}

// API Routes

// Helper to authenticate session token
async function authenticateToken(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Authentication token required' });
  }

  try {
    const sessionRes = await pool.query(
      'SELECT s.email, u.name FROM user_sessions s JOIN users u ON s.email = u.email WHERE s.token = $1 AND s.expires_at > NOW()',
      [token]
    );

    if (sessionRes.rowCount === 0) {
      return res.status(403).json({ error: 'Session expired or invalid' });
    }

    (req as any).user = {
      email: sessionRes.rows[0].email,
      name: sessionRes.rows[0].name
    };
    next();
  } catch (err) {
    console.error('Error authenticating session:', err);
    res.status(500).json({ error: 'Internal server authentication error' });
  }
}

// Authentication endpoints
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    
    // Strict restriction to only Pushkar Mishra & Ravi Ranjan
    const allowedEmails = ['pushkarmishra244@gmail.com', 'ravi2009u@gmail.com'];
    if (!allowedEmails.includes(normalizedEmail)) {
      return res.status(403).json({ error: 'Access Denied: Only Pushkar Mishra and Ravi Ranjan are authorized to access this platform.' });
    }

    // Get user details
    let userRes = await pool.query('SELECT * FROM users WHERE email = $1', [normalizedEmail]);
    let name = normalizedEmail === 'pushkarmishra244@gmail.com' ? 'Pushkar Mishra' : 'Ravi Ranjan';
    
    if (userRes.rowCount === 0) {
      // Create user if not exists for any reason
      const defaultHash = crypto.createHash('sha256').update('Default@2026').digest('hex');
      await pool.query('INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3)', [normalizedEmail, name, defaultHash]);
      userRes = await pool.query('SELECT * FROM users WHERE email = $1', [normalizedEmail]);
    }

    const user = userRes.rows[0];

    // Generate secure session token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiration

    await pool.query(
      'INSERT INTO user_sessions (token, email, expires_at) VALUES ($1, $2, $3)',
      [token, normalizedEmail, expiresAt]
    );

    res.json({
      success: true,
      token,
      user: {
        email: user.email,
        name: user.name
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error during login' });
  }
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json({ authenticated: true, user: (req as any).user });
});

app.post('/api/auth/logout', async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    try {
      await pool.query('DELETE FROM user_sessions WHERE token = $1', [token]);
    } catch (err) {
      console.error('Logout delete session error:', err);
    }
  }

  res.json({ success: true });
});

// 0. Fetch all campaigns and their validated emails from the database
app.get('/api/campaigns', authenticateToken, async (req, res) => {
  try {
    const campaignsRes = await pool.query('SELECT * FROM campaigns ORDER BY created_at DESC');
    const campaignsList = campaignsRes.rows;
    
    const campaigns: any[] = [];
    for (const c of campaignsList) {
      const emailsRes = await pool.query('SELECT * FROM emails WHERE campaign_id = $1 ORDER BY id ASC', [c.id]);
      
      campaigns.push({
        id: c.id,
        name: c.name,
        createdAt: c.created_at,
        totalCount: c.total_count,
        validCount: c.valid_count,
        invalidCount: c.invalid_count,
        riskyCount: c.risky_count,
        deliverabilityScore: c.deliverability_score,
        aiSummary: c.ai_summary,
        csvHeaders: c.csv_headers ? JSON.parse(c.csv_headers) : undefined,
        emails: emailsRes.rows.map(e => ({
          email: e.email,
          status: e.status,
          score: e.score,
          syntax: { valid: e.syntax_valid, error: e.syntax_error || undefined },
          domain: { valid: e.domain_valid, hasMx: e.domain_has_mx, error: e.domain_error || undefined },
          disposable: e.disposable,
          roleBased: e.role_based,
          typoSuggestion: e.typo_suggestion || undefined,
          originalRow: e.original_row ? JSON.parse(e.original_row) : undefined,
          occurrences: e.occurrences || 1
        }))
      });
    }
    
    res.json(campaigns);
  } catch (err: any) {
    console.error('Error fetching campaigns from database:', err);
    res.status(500).json({ error: 'Failed to fetch campaigns from database' });
  }
});

// 1. Bulk verify emails and save to Neon database
app.post('/api/verify', authenticateToken, async (req, res) => {
  try {
    const { emails, name, csvHeaders } = req.body;
    if (!emails || !Array.isArray(emails)) {
      return res.status(400).json({ error: 'Missing emails array in request body' });
    }

    const campaignName = name || `Campaign_${new Date().toLocaleDateString().replace(/\//g, '-')}`;
    
    // Check if the input is structured (objects with { email, originalRow }) or simple strings
    const isStructured = emails.length > 0 && typeof emails[0] === 'object' && emails[0] !== null && 'email' in emails[0];
    
    const rawEmails = isStructured
      ? emails.map((item: any) => item.email)
      : emails;

    const cleanEmails = rawEmails.filter((e: any) => typeof e === 'string' && e.trim().length > 0);

    if (cleanEmails.length === 0) {
      return res.status(400).json({ error: 'No valid non-empty email addresses provided' });
    }

    console.log(`Verifying list of ${cleanEmails.length} emails for: ${campaignName}`);
    const verifiedEmails = await verifyEmailList(cleanEmails);

    // Map back the originalRow and occurrences to verified email objects
    if (isStructured) {
      for (let i = 0; i < verifiedEmails.length; i++) {
        verifiedEmails[i].originalRow = emails[i]?.originalRow || null;
        verifiedEmails[i].occurrences = emails[i]?.occurrences || 1;
      }
    }

    // Calculate aggregations
    let validCount = 0;
    let riskyCount = 0;
    let invalidCount = 0;
    let totalScoreSum = 0;

    for (const item of verifiedEmails) {
      if (item.status === 'valid') validCount++;
      else if (item.status === 'risky') riskyCount++;
      else invalidCount++;
      
      totalScoreSum += item.score;
    }

    const totalCount = verifiedEmails.length;
    const deliverabilityScore = totalCount > 0 ? Math.round(totalScoreSum / totalCount) : 0;
    const campaignId = `camp_${Math.random().toString(36).substr(2, 9)}`;
    const createdAt = new Date().toISOString();

    const headersStr = csvHeaders ? JSON.stringify(csvHeaders) : null;

    // Start a transaction to insert campaign and its emails
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      await client.query(`
        INSERT INTO campaigns (id, name, created_at, total_count, valid_count, invalid_count, risky_count, deliverability_score, csv_headers)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [campaignId, campaignName, createdAt, totalCount, validCount, invalidCount, riskyCount, deliverabilityScore, headersStr]);

      for (const item of verifiedEmails) {
        await client.query(`
          INSERT INTO emails (campaign_id, email, status, score, syntax_valid, syntax_error, domain_valid, domain_has_mx, domain_error, disposable, role_based, typo_suggestion, original_row, occurrences)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        `, [
          campaignId,
          item.email,
          item.status,
          item.score,
          item.syntax.valid,
          item.syntax.error || null,
          item.domain.valid,
          item.domain.hasMx,
          item.domain.error || null,
          item.disposable,
          item.roleBased,
          item.typoSuggestion || null,
          item.originalRow ? JSON.stringify(item.originalRow) : null,
          item.occurrences || 1
        ]);
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    const campaignResult = {
      id: campaignId,
      name: campaignName,
      createdAt,
      totalCount,
      validCount,
      invalidCount,
      riskyCount,
      emails: verifiedEmails,
      deliverabilityScore,
      aiSummary: null,
      csvHeaders: csvHeaders || undefined
    };

    res.json(campaignResult);
  } catch (error: any) {
    console.error('Error verifying emails:', error);
    res.status(500).json({ error: 'Internal server error during verification' });
  }
});

// 2. Delete a single campaign (cascades emails automatically via FOREIGN KEY REFERENCES campaigns(id) ON DELETE CASCADE)
app.delete('/api/campaigns/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM campaigns WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err: any) {
    console.error('Error deleting campaign from database:', err);
    res.status(500).json({ error: 'Failed to delete campaign from database' });
  }
});

// 3. Delete multiple campaigns in bulk (cascades emails automatically)
app.post('/api/campaigns/delete-bulk', authenticateToken, async (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids)) {
    return res.status(400).json({ error: 'Missing ids array in request body' });
  }
  try {
    await pool.query('DELETE FROM campaigns WHERE id = ANY($1)', [ids]);
    res.json({ success: true });
  } catch (err: any) {
    console.error('Error bulk deleting campaigns from database:', err);
    res.status(500).json({ error: 'Failed to delete campaigns from database' });
  }
});

// 4. Generate campaign AI insights with Gemini and persist them
app.post('/api/campaign-insight', authenticateToken, async (req, res) => {
  try {
    const { summary } = req.body;
    if (!summary) {
      return res.status(400).json({ error: 'Missing campaign summary details' });
    }

    if (!ai) {
      return res.json({ 
        insight: `### ⚠️ AI Insights Unavailable\n\nTo unlock customized deliverability reports, cold-outreach recommendations, and campaign metrics analysis, configure your Gemini API Key in the **Settings > Secrets** panel in AI Studio. Your key will automatically enable this advanced assistant at runtime!` 
      });
    }

    const prompt = `Analyze this email verification list report and provide a highly professional, detailed deliverability and list-cleaning optimization advice report.
    
    Here is the campaign summary data:
    - Campaign Name: ${summary.name || 'Marketing List'}
    - Total Emails Scanned: ${summary.total}
    - Deliverable (Valid): ${summary.valid} (${((summary.valid / summary.total) * 100).toFixed(1)}%)
    - Risky (Disposable/Role-based): ${summary.risky} (${((summary.risky / summary.total) * 100).toFixed(1)}%)
    - Undeliverable (Invalid): ${summary.invalid} (${((summary.invalid / summary.total) * 100).toFixed(1)}%)
    - Disposable temporary emails found: ${summary.disposable}
    - Role-based accounts (info@, support@, admin@): ${summary.roleBased}
    - Syntax errors detected: ${summary.syntaxErrors}
    - Invalid domains (No MX/A records): ${summary.domainErrors}
    - Typo suggestions made: ${summary.typoCount}
    
    Generate a professional email marketing deliverability audit. Format it cleanly in beautiful, direct markdown (using headers, tables, or lists where suitable).
    Include the following sections:
    1. **Executive Deliverability Verdict**: Provide an overall health score/rating (Excellent, Good, Risky, or Critical) and explain why based on the proportions.
    2. **Bounce Rate Risk Assessment**: Compare the predicted hard bounce rate if they mail the uncleaned list vs the cleaned list. Detail the impact on IP reputation.
    3. **Audience Demographics & Role Accounts Warning**: Explain the danger of emailing role-based accounts (like sales@ or support@) vs individual accounts (spam complaints, lower conversion).
    4. **3 Actionable Campaign Deliverability Tips**: Give 3 highly tailored, smart recommendations for warming up their sender domain, writing copy that passes filters, or utilizing the typo suggestions.
    5. **Spam Trap Prevention**: Explain why removing disposable and invalid domains is crucial for avoiding honeypots or spam traps.

    Maintain a sophisticated, elite SaaS analyst tone. Avoid fluff, unnecessary commentary, and introductory remarks. Output raw markdown directly.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
    });

    const insightText = response.text;

    // Save AI summary to the campaigns database table if ID is provided
    if (summary.id) {
      try {
        await pool.query('UPDATE campaigns SET ai_summary = $1 WHERE id = $2', [insightText, summary.id]);
        console.log(`Saved AI summary for campaign ${summary.id} to Neon database.`);
      } catch (dbErr) {
        console.error('Failed to save AI summary to database:', dbErr);
      }
    }

    res.json({ insight: insightText });
  } catch (error: any) {
    console.error('Error generating insight:', error);
    res.status(500).json({ error: 'Failed to generate campaign insights' });
  }
});

// Vite Setup
async function startServer() {
  await initDb();

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Email verification server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();

