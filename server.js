const express = require('express');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const QUESTION_ID = process.env.QUESTION_ID || 'level2_brute_force';
const MAIN_BACKEND_URL = 'https://buggit-backend-yy8i.onrender.com/api/store-result';

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));

const SECRET_PIN = process.env.SECRET_PIN || '7392';
const MAX_ATTEMPTS = 12;

const sessions = {};

// Helper function to send result to main backend (backend-to-backend)
async function sendToMainBackend(teamcode, questionId) {
    try {
        const response = await fetch(MAIN_BACKEND_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ teamcode, questionId })
        });

        const result = await response.json();
        console.log("[BACKEND-SYNC] Stored in Main Backend:", result);
        return { success: true, result };
    } catch (error) {
        console.error("[BACKEND-SYNC] Error contacting main backend:", error.message);
        return { success: false, error: error.message };
    }
}

setInterval(() => {
    const now = Date.now();
    const TIMEOUT = 30 * 60 * 1000;
    for (const sessionId in sessions) {
        if (now - sessions[sessionId].createdAt > TIMEOUT) {
            delete sessions[sessionId];
        }
    }
}, 10 * 60 * 1000);

function getSession(sessionId) {
    if (!sessions[sessionId]) {
        sessions[sessionId] = {
            attempts: 0,
            locked: false,
            createdAt: Date.now()
        };
    }
    return sessions[sessionId];
}

app.post('/api/login', async (req, res) => {
    const { pin, sessionId, teamcode } = req.body;

    if (!sessionId) {
        return res.status(400).json({ error: 'Session ID required' });
    }

    const session = getSession(sessionId);

    if (session.locked) {
        return res.json({
            success: false,
            locked: true,
            attemptsLeft: 0,
            message: "🔒 SYSTEM LOCKED! Too many failed attempts."
        });
    }

    session.attempts++;
    const attemptsLeft = MAX_ATTEMPTS - session.attempts;

    const pinNum = parseInt(pin);
    const secretNum = parseInt(SECRET_PIN);

    if (pin === SECRET_PIN) {
        // Backend-to-backend call to main server
        const y = teamcode || '382045158047';
        const syncResult = await sendToMainBackend(y, QUESTION_ID);
        console.log("Sync result:", syncResult);

        res.json({
            success: true,
            attemptsLeft: attemptsLeft,
            message: "✅ PASSCODE ACCEPTED! Antidote sequence initiated.",
            bugFound: "BUG_FOUND{authentication_bypass_via_feedback_leak}",
            redirect: "https://bug-hunt-manager-tau.vercel.app/dashboard",
            backendSync: syncResult
        });
    } else if (attemptsLeft <= 0) {
        session.locked = true;
        res.json({
            success: false,
            locked: true,
            attemptsLeft: 0,
            lockoutDuration: 180,
            message: "🔒 SECURITY LOCKOUT!"
        });
    } else {
        let hint = "";
        if (pinNum < secretNum) {
            hint = "📈 TOO LOW";
        } else {
            hint = "📉 TOO HIGH";
        }

        res.json({
            success: false,
            attemptsLeft: attemptsLeft,
            hint: hint,
            message: `${hint} — ${attemptsLeft} attempts left`
        });
    }
});

app.post('/api/reset', (req, res) => {
    const { sessionId } = req.body;
    if (sessionId && sessions[sessionId]) {
        delete sessions[sessionId];
    }
    res.json({ success: true });
});

// Ping endpoint for health check
app.get('/ping', (req, res) => {
    res.json({ status: 'alive', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
    console.log(`Paramecium Level 2 running on port ${PORT}`);
    console.log(`Question ID: ${QUESTION_ID}`);
    console.log(`Main Backend: ${MAIN_BACKEND_URL}`);
    console.log(`Ping endpoint: /ping`);

    // Self-ping every 10 minutes to keep Render alive
    const PING_INTERVAL = 10 * 60 * 1000;
    setInterval(() => {
        const url = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
        fetch(`${url}/ping`)
            .then(res => res.json())
            .then(data => console.log(`[KEEP-ALIVE] Pinged at ${data.timestamp}`))
            .catch(err => console.log(`[KEEP-ALIVE] Ping failed: ${err.message}`));
    }, PING_INTERVAL);
    console.log(`[KEEP-ALIVE] Self-ping enabled every 10 minutes`);
});
