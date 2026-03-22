/**
 * IntelliCredit BFF - Real-Time Backend for Frontend
 * ====================================================
 * Vivriti Capital - Hybrid Credit Decision Intelligence Engine
 *
 * Responsibilities:
 *  1. Receive progress events from Java Core Backend (internal REST)
 *  2. Push real-time WebSocket events to the Next.js Frontend via Socket.io
 *  3. Proxy application state queries to Java Backend
 *  4. JWT validation (Zero-Trust) for Java → BFF internal calls
 *
 * Security: Helmet, Rate Limiting, JWT Validation
 * Observability: Winston Logging + Prometheus Metrics
 */

require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server: SocketIOServer } = require("socket.io");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const winston = require("winston");
const client = require("prom-client");
const multer = require("multer");
const FormData = require("form-data");
const Redis = require("ioredis");
const cron = require("node-cron");

// ─────────────────────────────────────────────
// Circuit Breaker State
// ─────────────────────────────────────────────
const circuitBreaker = {
  python: { state: "CLOSED", failures: 0, lastFailure: null, threshold: 3, cooldown: 30000 },
  java: { state: "CLOSED", failures: 0, lastFailure: null, threshold: 5, cooldown: 15000 },
};

function isCircuitOpen(service) {
  const cb = circuitBreaker[service];
  if (cb.state === "OPEN") {
    const elapsed = Date.now() - cb.lastFailure;
    if (elapsed > cb.cooldown) {
      cb.state = "HALF_OPEN";
      logger.info(`[CB] ${service} circuit HALF_OPEN — probing`);
      return false;
    }
    return true;
  }
  return false;
}

function recordSuccess(service) {
  const cb = circuitBreaker[service];
  cb.failures = 0;
  cb.state = "CLOSED";
}

function recordFailure(service) {
  const cb = circuitBreaker[service];
  cb.failures++;
  cb.lastFailure = Date.now();
  if (cb.failures >= cb.threshold) {
    cb.state = "OPEN";
    logger.error(`[CB] ${service} circuit OPEN after ${cb.failures} failures`);
  }
}

// ─────────────────────────────────────────────
// OCR-LLM In-Process Queue
// ─────────────────────────────────────────────
const { EventEmitter } = require("events");
const ocrQueue = [];
let ocrWorkerRunning = false;

async function runOcrLlm({ fileBuffer, filename, applicationId }) {
  const form = new FormData();
  form.append("file", fileBuffer, {
    filename: filename,
    contentType: "application/pdf",
  });

  const token = generateInternalServiceToken("bff-node");

  logger.info(`[BFF] Starting runOcrLlm for application ${applicationId}`);
  
  // Circuit Breaker check
  if (isCircuitOpen("python")) {
    throw new Error("ML service temporarily unavailable (Circuit OPEN)");
  }

  try {
    const response = await axios.post(`${PYTHON_WORKER_URL}/analyze-ocr-llm`, form, {
      headers: {
        ...form.getHeaders(),
        Authorization: `Bearer ${token}`,
      },
      timeout: 600000, // 600s
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
    recordSuccess("python");
    return response.data;
  } catch (err) {
    recordFailure("python");
    throw err;
  }
}

async function enqueueOcrJob(job) {
  return new Promise((resolve, reject) => {
    ocrQueue.push({ ...job, resolve, reject });
    processOcrQueue();
  });
}

async function processOcrQueue() {
  if (ocrWorkerRunning || ocrQueue.length === 0) return;
  ocrWorkerRunning = true;
  const job = ocrQueue.shift();
  try {
    const result = await runOcrLlm(job);
    job.resolve(result);
  } catch (err) {
    job.reject(err);
  } finally {
    ocrWorkerRunning = false;
    processOcrQueue();
  }
}


// Scraper modules (added for web intelligence)
const {
  probeConnectivity,
  REACHABLE_SOURCES,
} = require("./src/utils/connectivityProbe");
const { scrapeRSS, scrapeGoogleNews, RSS_SOURCES } = require("./src/scrapers/rss.scraper");
const { scrapeReddit } = require("./src/scrapers/reddit.scraper");
const { getRiskLevel } = require("./src/config/riskKeywords");

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
const JAVA_BACKEND_URL = process.env.JAVA_BACKEND_URL || "http://localhost:8090";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
const JWT_SECRET = process.env.JWT_SECRET || "VivritiIntelliCreditSecretKey2025AES256BitKeyForProduction";
// Align with Java: derive an HS512-sized key from the configured secret.
const INTERNAL_JWT_KEY = crypto.createHash("sha512").update(JWT_SECRET, "utf8").digest();
const PYTHON_WORKER_URL = process.env.PYTHON_WORKER_URL || "http://localhost:8001";
const REDIS_URL = process.env.REDIS_URL || "";

// Kick connectivity probe once on startup (non-blocking) and log reachability.
async function initConnectivityProbe() {
  try {
    const out = await probeConnectivity({ force: true });
    const reachable = out?.reachableSources || [];
    logger.info(`[PROBE] reachable sources: ${reachable.join(", ") || "none"}`);
    if (out?.results) {
      for (const r of out.results) {
        logger.info(`[PROBE] ${r.name} => ${r.reachable ? "UP" : "DOWN"}`, r.reachable ? { ms: r.ms } : { error: r.error });
      }
    }
  } catch (e) {
    logger.warn(`[PROBE] failed: ${e.message}`);
  }
}

// ─────────────────────────────────────────────
// Redis Pub/Sub (optional)
// ─────────────────────────────────────────────
let redisPub = null;
let redisSub = null;
const REDIS_CHANNEL_PROGRESS = "intellicredit:progress";

function setupRedisPubSub(io) {
  if (!REDIS_URL) return;
  try {
    redisPub = new Redis(REDIS_URL, { maxRetriesPerRequest: 2, enableReadyCheck: true });
    redisSub = new Redis(REDIS_URL, { maxRetriesPerRequest: 2, enableReadyCheck: true });

    redisSub.subscribe(REDIS_CHANNEL_PROGRESS, (err) => {
      if (err) logger.warn(`[REDIS] subscribe failed: ${err.message}`);
      else logger.info(`[REDIS] subscribed to ${REDIS_CHANNEL_PROGRESS}`);
    });

    redisSub.on("message", (channel, message) => {
      if (channel !== REDIS_CHANNEL_PROGRESS) return;
      try {
        const evt = JSON.parse(message);
        if (evt?.applicationId) io.to(`app:${evt.applicationId}`).emit("progress:update", evt);
      } catch (e) {
        logger.warn(`[REDIS] bad message: ${e.message}`);
      }
    });
  } catch (e) {
    logger.warn(`[REDIS] setup failed: ${e.message}`);
  }
}

function generateInternalServiceToken(serviceId) {
  return jwt.sign(
    {
      serviceId,
      role: "INTERNAL_SERVICE",
      scope: "intellicredit:internal",
    },
    INTERNAL_JWT_KEY,
    { algorithm: "HS512", expiresIn: "1h", subject: serviceId }
  );
}

// ─────────────────────────────────────────────
// Winston Logger (ISO27001 A.12.4 - Logging)
// ─────────────────────────────────────────────
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          return `${timestamp} [${level}] ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ""}`;
        })
      ),
    }),
    new winston.transports.File({ filename: "./logs/bff-error.log", level: "error" }),
    new winston.transports.File({ filename: "./logs/bff-combined.log" }),
  ],
});

require("fs").mkdirSync("./logs", { recursive: true });

// ─────────────────────────────────────────────
// Prometheus Metrics
// ─────────────────────────────────────────────
const register = new client.Registry();
client.collectDefaultMetrics({ register });

const wsConnectionsGauge = new client.Gauge({
  name: "bff_websocket_connections_total",
  help: "Active WebSocket connections",
  registers: [register],
});

const progressEventsCounter = new client.Counter({
  name: "bff_progress_events_total",
  help: "Total progress events pushed to frontend",
  labelNames: ["stage"],
  registers: [register],
});

const proxyRequestDuration = new client.Histogram({
  name: "bff_proxy_request_duration_ms",
  help: "Duration of proxy requests to Java backend",
  buckets: [50, 100, 200, 500, 1000, 2000],
  registers: [register],
});

// ─────────────────────────────────────────────
// Express App Setup
// ─────────────────────────────────────────────
const app = express();
const server = http.createServer(app);

// Security middleware
app.use(helmet({ contentSecurityPolicy: false }));

// CORS for frontend
app.use(cors({
  origin: [FRONTEND_URL, "http://localhost:3000", "http://localhost:3002"],
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true,
}));

app.use(express.json({ limit: "10mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 60 * 1024 * 1024 }, // 60MB (annual reports can be large)
});

// Multer error handler (so UI doesn't just see a generic 500)
app.use((err, req, res, next) => {
  if (err && err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        error: "File too large",
        message: "PDF exceeds upload limit (60MB). Try a smaller filing or compress the PDF.",
      });
    }
    return res.status(400).json({ error: "Upload failed", message: err.message });
  }
  return next(err);
});

// Rate limiting (RBI DL - Bot prevention)
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 200,
  message: { error: "Too many requests. Please slow down." },
});
app.use("/api/", limiter);

// ─────────────────────────────────────────────
// Socket.io Configuration
// ─────────────────────────────────────────────
const io = new SocketIOServer(server, {
  cors: {
    origin: [FRONTEND_URL, "http://localhost:3000", "http://localhost:3002"],
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ["websocket", "polling"],
  pingTimeout: 60000,
  pingInterval: 10000,
});

// Track active subscriptions: applicationId → Set<socketId>
const applicationSubscriptions = new Map();

// In-memory event buffer (last 50 events per application for reconnection)
const eventBuffer = new Map();

function bufferEvent(applicationId, event) {
  if (!eventBuffer.has(applicationId)) {
    eventBuffer.set(applicationId, []);
  }
  const buffer = eventBuffer.get(applicationId);
  buffer.push(event);
  if (buffer.length > 50) buffer.shift(); // Keep last 50
}

// Socket.io connection handler
io.on("connection", (socket) => {
  wsConnectionsGauge.inc();
  logger.info(`[SOCKET] Client connected: ${socket.id}`);

  // Subscribe to application-specific updates
  socket.on("subscribe:application", ({ applicationId }) => {
    if (!applicationId) return;

    socket.join(`app:${applicationId}`);

    if (!applicationSubscriptions.has(applicationId)) {
      applicationSubscriptions.set(applicationId, new Set());
    }
    applicationSubscriptions.get(applicationId).add(socket.id);

    logger.info(`[SOCKET] ${socket.id} subscribed to application ${applicationId}`);

    // Replay buffered events for reconnecting clients
    const buffered = eventBuffer.get(applicationId) || [];
    if (buffered.length > 0) {
      socket.emit("event:buffer", { applicationId, events: buffered });
    }

    // Acknowledge subscription
    socket.emit("subscribed", { applicationId, socketId: socket.id });
  });

  socket.on("unsubscribe:application", ({ applicationId }) => {
    socket.leave(`app:${applicationId}`);
    if (applicationSubscriptions.has(applicationId)) {
      applicationSubscriptions.get(applicationId).delete(socket.id);
    }
  });

  socket.on("disconnect", () => {
    wsConnectionsGauge.dec();
    logger.info(`[SOCKET] Client disconnected: ${socket.id}`);
    // Clean up subscriptions
    applicationSubscriptions.forEach((socketSet) => socketSet.delete(socket.id));
  });

  socket.on("ping:heartbeat", () => {
    socket.emit("pong:heartbeat", { timestamp: Date.now() });
  });
});

// ─────────────────────────────────────────────
// Internal Middleware (JWT for Java → BFF calls)
// ─────────────────────────────────────────────
function validateInternalJWT(req, res, next) {
  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    // Permissive for MVP - in production enforce strictly
    logger.warn(`[JWT] Missing auth header from ${req.ip} on ${req.path}`);
    return next();
  }

  try {
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, INTERNAL_JWT_KEY, { algorithms: ["HS512"] });
    if (decoded.role !== "INTERNAL_SERVICE") {
      return res.status(403).json({ error: "Insufficient service permissions" });
    }
    req.serviceId = decoded.serviceId;
    next();
  } catch (err) {
    logger.warn(`[JWT] Invalid token: ${err.message}`);
    next(); // Permissive for MVP
  }
}

// ─────────────────────────────────────────────
// Internal Endpoints (Java → BFF)
// ─────────────────────────────────────────────

/**
 * POST /internal/progress
 * Called by Java Core Backend to push pipeline progress to frontend
 */
app.post("/internal/progress", validateInternalJWT, (req, res) => {
  const { applicationId, stage, message, progress } = req.body;

  if (!applicationId || !stage) {
    return res.status(400).json({ error: "applicationId and stage are required" });
  }

  const STAGE_CONFIG = {
    INGESTING: {
      label: "Ingesting Databricks Data",
      icon: "database",
      color: "blue",
      step: 1,
    },
    RUNNING_MODELS: {
      label: "Running Hybrid ML Models",
      icon: "brain",
      color: "purple",
      step: 2,
    },
    CRAWLING_INTELLIGENCE: {
      label: "Crawling Web Intelligence",
      icon: "search",
      color: "orange",
      step: 3,
    },
    SYNTHESIZING_CAM: {
      label: "Synthesizing Credit Appraisal Memo",
      icon: "document",
      color: "green",
      step: 4,
    },
    COMPLETED: {
      label: "Credit Intelligence Complete",
      icon: "check",
      color: "green",
      step: 5,
    },
    ERROR: {
      label: "Processing Error",
      icon: "error",
      color: "red",
      step: -1,
    },
  };

  const stageConfig = STAGE_CONFIG[stage] || {
    label: stage,
    icon: "info",
    color: "gray",
    step: 0,
  };

  const event = {
    eventId: uuidv4(),
    applicationId,
    stage,
    stageConfig,
    message,
    progress: progress || 0,
    timestamp: new Date().toISOString(),
  };

  // Buffer for reconnection
  bufferEvent(applicationId, event);

  // Emit to all subscribers of this application
  io.to(`app:${applicationId}`).emit("progress:update", event);

  // Publish via Redis for cross-instance streaming (optional)
  if (redisPub) {
    try {
      redisPub.publish(REDIS_CHANNEL_PROGRESS, JSON.stringify(event));
    } catch { }
  }

  // If completed, emit a separate completion event
  if (stage === "COMPLETED" || stage === "ERROR") {
    // Small delay to let frontend process the progress first
    setTimeout(async () => {
      try {
        if (isCircuitOpen("java")) {
          throw new Error("Java service circuit OPEN");
        }
        let appResponse;
        try {
          appResponse = await axios.get(
            `${JAVA_BACKEND_URL}/api/v1/applications/${applicationId}`,
            { timeout: 5000 }
          );
          recordSuccess("java");
        } catch (err) {
          recordFailure("java");
          throw err;
        }
        io.to(`app:${applicationId}`).emit("analysis:complete", {
          applicationId,
          application: appResponse.data,
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        logger.warn(`[BFF] Failed to fetch final application state: ${err.message}`);
        io.to(`app:${applicationId}`).emit("analysis:complete", {
          applicationId,
          application: null,
          error: "Could not fetch application state",
          timestamp: new Date().toISOString(),
        });
      }
    }, 500);
  }

  progressEventsCounter.inc({ stage });
  logger.info(`[PROGRESS] ${applicationId} | Stage: ${stage} | ${progress}% | ${message}`);

  res.json({ success: true, eventId: event.eventId });
});

// ─────────────────────────────────────────────
// Proxy Endpoints (Frontend → BFF → Java)
// ─────────────────────────────────────────────

/**
 * Proxy helper: forwards requests to Java backend
 */
async function proxyToJava(req, res, path, method = "GET", body = null) {
  const timer = proxyRequestDuration.startTimer();
  if (isCircuitOpen("java")) {
    timer();
    return res.status(503).json({ error: "Java backend temporarily unavailable. Try again in 15 seconds.", circuit: "OPEN" });
  }
  try {
    const url = `${JAVA_BACKEND_URL}${path}`;
    const config = {
      method,
      url,
      headers: { "Content-Type": "application/json" },
      timeout: 30000,
      ...(body && { data: body }),
    };

    const response = await axios(config);
    recordSuccess("java");
    timer();
    res.status(response.status).json(response.data);
  } catch (err) {
    recordFailure("java");
    timer();
    logger.error(`[PROXY] ${method} ${path} failed: ${err.message}`);
    const status = err.response?.status || 502;
    const data = err.response?.data || { error: "Java backend unreachable", message: err.message };
    res.status(status).json(data);
  }
}

// Applications
app.get("/api/applications", (req, res) =>
  proxyToJava(req, res, "/api/v1/applications")
);

app.post("/api/applications", (req, res) =>
  proxyToJava(req, res, "/api/v1/applications", "POST", req.body)
);

app.get("/api/applications/:applicationId", (req, res) =>
  proxyToJava(req, res, `/api/v1/applications/${req.params.applicationId}`)
);

app.post("/api/applications/ingest-all", (req, res) =>
  proxyToJava(req, res, "/api/v1/applications/ingest-all", "POST")
);

app.post("/api/applications/:applicationId/ingest", (req, res) =>
  proxyToJava(req, res, `/api/v1/applications/ingest/${req.params.applicationId}`, "POST")
);

app.post("/api/applications/:applicationId/analyze", (req, res) =>
  proxyToJava(req, res, `/api/v1/applications/${req.params.applicationId}/analyze`, "POST", req.body)
);

app.get("/api/applications/:applicationId/audit", (req, res) =>
  proxyToJava(req, res, `/api/v1/applications/${req.params.applicationId}/audit`)
);

/**
 * GET /api/applications/:applicationId/export-cam?format=pdf|docx
 * Streams a generated CAM file from the Python worker back to the browser.
 */
app.get("/api/applications/:applicationId/export-cam", async (req, res) => {
  const { applicationId } = req.params;
  const format = (req.query.format || "pdf").toString().toLowerCase();
  if (!["pdf", "docx"].includes(format)) {
    return res.status(400).json({ error: "format must be pdf or docx" });
  }
  try {
    // Fetch current CAM markdown from Java
    if (isCircuitOpen("java")) {
      return res.status(503).json({ error: "Java backend temporarily unavailable", circuit: "OPEN" });
    }
    let appResp;
    try {
      appResp = await axios.get(`${JAVA_BACKEND_URL}/api/v1/applications/${applicationId}`, { timeout: 10000 });
      recordSuccess("java");
    } catch (err) {
      recordFailure("java");
      throw err;
    }
    const app = appResp.data || {};
    const camMarkdown = app.camDocument;
    const companyName = app.companyName || "Company";
    if (!camMarkdown) {
      return res.status(400).json({ error: "CAM not generated yet for this application" });
    }

    const token = generateInternalServiceToken("bff-node");
    if (isCircuitOpen("python")) {
      return res.status(503).json({ error: "ML service temporarily unavailable", circuit: "OPEN" });
    }
    let pythonResp;
    try {
      pythonResp = await axios.post(
        `${PYTHON_WORKER_URL}/api/v1/applications/${applicationId}/export-cam?format=${format}`,
        { cam_markdown: camMarkdown, company_name: companyName },
        {
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          timeout: 120000,
          responseType: "stream",
        }
      );
      recordSuccess("python");
    } catch (err) {
      recordFailure("python");
      throw err;
    }

    const contentType = pythonResp.headers["content-type"] || (format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    const dispo = pythonResp.headers["content-disposition"] || `attachment; filename="CAM_${applicationId}.${format}"`;
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", dispo);
    pythonResp.data.pipe(res);
  } catch (err) {
    logger.error(`[CAM EXPORT] Failed for ${applicationId}: ${err.message}`);
    const status = err.response?.status || 502;
    // Avoid serializing stream / circular objects
    let message = err.message;
    const respData = err.response?.data;
    if (respData && typeof respData === "object") {
      // best effort: common FastAPI error shapes
      message = respData.detail || respData.error || message;
    } else if (typeof respData === "string") {
      message = respData;
    }
    res.status(status).json({ error: "CAM export failed", message });
  }
});

/**
 * POST /api/applications/:applicationId/deep-crawl
 * Trigger an on-demand deep crawl (secondary research + evidence capture) on Python worker.
 * Streams status via Redis (if configured) and socket.io to the subscribed room.
 */
app.post("/api/applications/:applicationId/deep-crawl", async (req, res) => {
  const { applicationId } = req.params;
  try {
    const token = generateInternalServiceToken("bff-node");
    const startEvt = {
      eventId: uuidv4(),
      applicationId,
      stage: "DEEP_CRAWL_STARTED",
      stageConfig: { label: "Deep crawl", icon: "search", color: "orange", step: 3 },
      message: "Starting on-demand deep crawl (anti-bot delays + evidence capture enabled)",
      progress: 0,
      timestamp: new Date().toISOString(),
    };
    io.to(`app:${applicationId}`).emit("progress:update", startEvt);
    if (redisPub) redisPub.publish(REDIS_CHANNEL_PROGRESS, JSON.stringify(startEvt));

    if (isCircuitOpen("java")) {
      throw new Error("Java service temporarily unavailable");
    }
    let appResp;
    try {
      appResp = await axios.get(`${JAVA_BACKEND_URL}/api/v1/applications/${applicationId}`, { timeout: 10000 });
      recordSuccess("java");
    } catch (err) {
      recordFailure("java");
      throw err;
    }
    const app = appResp.data || {};
    const companyName = app.companyName || "Company";

    if (isCircuitOpen("python")) {
      throw new Error("ML service temporarily unavailable");
    }
    let py;
    try {
      py = await axios.post(
        `${PYTHON_WORKER_URL}/api/v1/applications/${applicationId}/deep-crawl`,
        { company_name: companyName },
        { headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, timeout: 180000 }
      );
      recordSuccess("python");
    } catch (err) {
      recordFailure("python");
      throw err;
    }

    const doneEvt = {
      eventId: uuidv4(),
      applicationId,
      stage: "DEEP_CRAWL_COMPLETED",
      stageConfig: { label: "Deep crawl complete", icon: "check", color: "green", step: 5 },
      message: "Deep crawl complete (sources + raw evidence captured)",
      progress: 100,
      timestamp: new Date().toISOString(),
    };
    io.to(`app:${applicationId}`).emit("progress:update", doneEvt);
    if (redisPub) redisPub.publish(REDIS_CHANNEL_PROGRESS, JSON.stringify(doneEvt));

    return res.json({ success: true, research: py.data });
  } catch (err) {
    const status = err.response?.status || 502;
    const msg = err.response?.data?.detail || err.message;
    const failEvt = {
      eventId: uuidv4(),
      applicationId,
      stage: "DEEP_CRAWL_FAILED",
      stageConfig: { label: "Deep crawl failed", icon: "error", color: "red", step: -1 },
      message: `Deep crawl failed: ${msg}`,
      progress: -1,
      timestamp: new Date().toISOString(),
    };
    io.to(`app:${applicationId}`).emit("progress:update", failEvt);
    if (redisPub) redisPub.publish(REDIS_CHANNEL_PROGRESS, JSON.stringify(failEvt));
    return res.status(status).json({ error: "Deep crawl failed", message: msg });
  }
});

/**
 * POST /api/applications/:applicationId/upload-document
 * Frontend uploads a PDF; BFF forwards to Python for parsing, then persists results in Java.
 */
app.post("/api/applications/:applicationId/upload-document", upload.single("file"), async (req, res) => {
  const { applicationId } = req.params;
  if (!req.file) {
    return res.status(400).json({ error: 'Missing file field "file" (multipart/form-data)' });
  }
  if (!req.file.originalname.toLowerCase().endsWith(".pdf")) {
    return res.status(400).json({ error: "Only PDF files are supported" });
  }

  const useOcrLlm = req.body.use_ocr_llm === true || req.body.use_ocr_llm === "true";

  if (useOcrLlm) {
    const jobId = `ocr_${applicationId}_${Date.now()}`;
    res.status(202).json({
      jobId,
      message: "OCR processing queued. Results will arrive via WebSocket.",
    });

    enqueueOcrJob({
      fileBuffer: req.file.buffer,
      filename: req.file.originalname,
      applicationId,
    })
      .then(async (data) => {
        // Persist extraction result into Java application
        try {
          if (isCircuitOpen("java")) {
            throw new Error("Java service circuit OPEN");
          }
          const savedApp = await axios.post(
            `${JAVA_BACKEND_URL}/api/v1/applications/${applicationId}/documents`,
            data,
            { headers: { "Content-Type": "application/json" }, timeout: 30000 }
          );
          recordSuccess("java");
          io.to(`app:${applicationId}`).emit("ocr_complete", {
            jobId,
            data,
            application: savedApp.data,
          });
        } catch (err) {
          recordFailure("java");
          logger.error(`[OCR QUEUE] Failed to persist results for ${applicationId}: ${err.message}`);
          io.to(`app:${applicationId}`).emit("ocr_failed", { jobId, error: "Persistence failed: " + err.message });
        }
      })
      .catch((err) => {
        logger.error(`[OCR QUEUE] Job ${jobId} failed: ${err.message}`);
        io.to(`app:${applicationId}`).emit("ocr_failed", {
          jobId,
          error: err.message,
        });
      });
    return;
  }

  try {
    const form = new FormData();
    form.append("file", req.file.buffer, {
      filename: req.file.originalname,
      contentType: req.file.mimetype || "application/pdf",
    });

    const token = generateInternalServiceToken("bff-node");

    let pythonResp;
    // Standard pipeline
    if (isCircuitOpen("python")) {
      return res.status(503).json({ error: "ML service temporarily unavailable. Try again in 30 seconds.", circuit: "OPEN" });
    }
    try {
      pythonResp = await axios.post(
        `${PYTHON_WORKER_URL}/api/v1/applications/${applicationId}/upload-document`,
        form,
        {
          headers: {
            ...form.getHeaders(),
            Authorization: `Bearer ${token}`,
          },
          timeout: 600000,
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
        }
      );
      recordSuccess("python");
    } catch (err) {
      recordFailure("python");
      throw err;
    }

    const parsed = pythonResp.data;

    // Persist extraction result into Java application
    if (isCircuitOpen("java")) {
      return res.status(503).json({ error: "Java backend temporarily unavailable. Try again in 15 seconds.", circuit: "OPEN" });
    }
    try {
      const savedApp = await axios.post(
        `${JAVA_BACKEND_URL}/api/v1/applications/${applicationId}/documents`,
        parsed,
        { headers: { "Content-Type": "application/json" }, timeout: 30000 }
      );
      recordSuccess("java");
      return res.json({
        success: true,
        python_result: parsed,
        application: savedApp.data,
        method: "standard",
      });
    } catch (err) {
      recordFailure("java");
      throw err;
    }
  } catch (err) {
    logger.error(`[DOC UPLOAD] Failed for ${applicationId}: ${err.message}`);
    const status = err.response?.status || 502;
    const data = err.response?.data || { error: "Document pipeline failed", message: err.message };
    return res.status(status).json(data);
  }
});

app.get("/api/databricks/catalog", (req, res) =>
  proxyToJava(req, res, "/api/v1/databricks/catalog")
);

// ML Worker status
app.get("/api/ml/health", async (req, res) => {
  if (isCircuitOpen("python")) {
    return res.status(503).json({ status: "DOWN", message: "ML Worker unreachable (Circuit OPEN)" });
  }
  try {
    const r = await axios.get(`${PYTHON_WORKER_URL}/health`, { timeout: 5000 });
    recordSuccess("python");
    res.json(r.data);
  } catch {
    recordFailure("python");
    res.status(503).json({ status: "DOWN", message: "ML Worker unreachable" });
  }
});

app.get("/api/ml/metrics", async (req, res) => {
  if (isCircuitOpen("python")) {
    return res.status(503).json({ error: "ML Worker unreachable (Circuit OPEN)" });
  }
  try {
    const r = await axios.get(`${PYTHON_WORKER_URL}/model/metrics`, { timeout: 5000 });
    recordSuccess("python");
    res.json(r.data);
  } catch {
    recordFailure("python");
    res.status(503).json({ error: "ML Worker unreachable" });
  }
});

// ─────────────────────────────────────────────
// Connectivity Probe API
// ─────────────────────────────────────────────
app.get("/api/probe", async (req, res) => {
  try {
    const force = String(req.query.force || "0") === "1";
    const out = await probeConnectivity({ force });
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: "probe_failed", message: e.message });
  }
});

// ─────────────────────────────────────────────
// Web Research API (RSS + Google News RSS + Reddit JSON)
// ─────────────────────────────────────────────
app.post("/api/research", async (req, res) => {
  const body = req.body || {};
  logger.info(`[BFF] Research request received for company: ${body.companyName || 'unknown'}`);
  const company = {
    id: body.applicationId || body.companyId || body.company_id || body.id || "unknown",
    name: body.companyName || body.company_name || body.name || "",
    cin: body.cin || null,
    promoters: Array.isArray(body.promoters) ? body.promoters : [],
    sector: body.sector || null,
  };

  // 1. Emit start event for UI feedback
  if (company.id !== "unknown") {
    const startEvt = {
      eventId: uuidv4(),
      applicationId: company.id,
      stage: "CRAWLING_INTELLIGENCE",
      stageConfig: { label: "News Intelligence", icon: "search", color: "orange", step: 3 },
      message: `Scanning news & regulatory data for ${company.name}`,
      progress: 10,
      timestamp: new Date().toISOString(),
    };
    io.to(`app:${company.id}`).emit("progress:update", startEvt);
    bufferEvent(company.id, startEvt);
  }

  // Ensure we probe at least once every 5 minutes (cached inside module)
  let probeOut;
  try {
    probeOut = await probeConnectivity();
  } catch {
    probeOut = { reachableSources: Array.from(REACHABLE_SOURCES), results: [] };
  }

  const reachableSet = REACHABLE_SOURCES;
  const connectivity = {
    rss: reachableSet.has("Economic Times RSS") || reachableSet.has("Mint RSS") || reachableSet.has("Economic Times") || reachableSet.has("Mint"),
    googleNews: reachableSet.has("Google News RSS"),
    reddit: reachableSet.has("Reddit API"),
    mca: false,
  };

  const pipelinesAttempted = [];
  const pipelinesSucceeded = [];

  const tasks = [];

  if (connectivity.rss) {
    pipelinesAttempted.push("rss");
    tasks.push(
      scrapeRSS(company, RSS_SOURCES, { logger, reachableSources: reachableSet })
        .then((r) => {
          pipelinesSucceeded.push("rss");
          return r;
        })
        .catch(() => [])
    );
  }

  if (connectivity.googleNews) {
    pipelinesAttempted.push("googlenews");
    tasks.push(
      scrapeGoogleNews(company, { logger, reachableSources: reachableSet })
        .then((r) => {
          pipelinesSucceeded.push("googlenews");
          return r;
        })
        .catch(() => [])
    );
  }

  if (connectivity.reddit) {
    pipelinesAttempted.push("reddit");
    tasks.push(
      scrapeReddit(company, { logger, reachableSources: reachableSet })
        .then((r) => {
          pipelinesSucceeded.push("reddit");
          return r;
        })
        .catch(() => [])
    );
  }

  const parts = await Promise.all(tasks);
  const merged = parts.flat();

  // Deduplicate by URL
  const byUrl = new Map();
  for (const r of merged) {
    const key = r?.sourceUrl || r?.source_url || "";
    if (!key) continue;
    if (!byUrl.has(key)) byUrl.set(key, r);
  }
  const results = Array.from(byUrl.values());

  // Summary
  const counts = { HIGH: 0, MEDIUM: 0, LOW: 0, NONE: 0 };
  for (const r of results) {
    const level = getRiskLevel(r.riskKeywordsFound || []);
    counts[level] = (counts[level] || 0) + 1;
  }

  const reachablePipelines = Object.entries(connectivity)
    .filter(([k, v]) => v === true)
    .map(([k]) => k);
  const unreachable = Object.entries(connectivity)
    .filter(([k, v]) => v === false)
    .map(([k]) => k);

  const status =
    reachablePipelines.length === 0
      ? "offline"
      : pipelinesSucceeded.length === reachablePipelines.length
        ? "complete"
        : "partial";

  const message =
    reachablePipelines.length === 0
      ? "All sources unreachable (network restricted)."
      : `Scraped ${pipelinesSucceeded.length} of ${reachablePipelines.length} reachable sources. ` +
      (unreachable.length ? `${unreachable.join(", ")} unreachable (network restricted).` : "All probed sources reachable.");

  const responseBody = {
    companyId: company.id,
    status,
    connectivity,
    probe: probeOut?.results || [],
    results,
    summary: {
      totalFound: results.length,
      highRisk: counts.HIGH,
      mediumRisk: counts.MEDIUM,
      lowRisk: counts.LOW,
      sourcesSearched: Array.from(new Set(results.map((r) => r.sourceName).filter(Boolean))),
    },
    sources_attempted: pipelinesAttempted,
    sources_succeeded: pipelinesSucceeded,
    total_found: results.length,
    message,
  };

  // Ship to Python + Java (best-effort, never block response)
  const app = body; // Map body as app for field compatibility
  const applicationId = company.id;
  const companyName = company.name;

  const analyzePayload = {
    application_id: applicationId,
    company_name: companyName,
    sector: app.sector || "General",
    debt_to_equity: app.debtToEquityRatio ?? 0,
    revenue_growth: app.revenueGrowthPercent ?? 0,
    interest_coverage: app.interestCoverageRatio ?? 0,
    current_ratio: app.currentRatio ?? 0,
    ebitda_margin: app.ebitdaMargin ?? 0,
    gst_compliance_score: app.gstComplianceScore ?? 50,
    credit_score: Math.min(900, Math.max(300, app.creditScore ?? 650)),
    annual_revenue: app.annualRevenue ?? 0,
    total_debt: app.totalDebt ?? 0,
    credit_officer_notes: app.creditOfficerNotes || "",
    document_extractions: null,
  };

  const javaIngestPayload = { applicationId, results };

  Promise.allSettled([
    axios.post(`${JAVA_BACKEND_URL}/api/v1/intelligence/ingest`, javaIngestPayload, { timeout: 20000 }).catch(() => null),
  ]).then(() => { });

  return res.json(responseBody);
});

app.post(
  "/api/applications/:applicationId/run-research",
  async (req, res) => {
    const { applicationId } = req.params;
    try {
      // 1. Fetch application from Java
      const appResp = await axios.get(
        `${JAVA_BACKEND_URL}/api/v1/applications/${applicationId}`
      );
      const app = appResp.data;

      // 2. Build research payload
      const company_name = app.companyName || req.body.company_name || "";
      const payload = {
        company_name,        // ← must be snake_case
        promoters: app.promoters || req.body.promoters || [],
        cin: app.cinNumber || req.body.cin || "",
        revenue: app.annualRevenue || app.revenue || req.body.revenue || 0,
        gst_score: app.gstComplianceScore || app.gstScore || req.body.gst_score || 0,
        base_credit_score: app.creditScore || req.body.base_credit_score || 650,
        application_id: applicationId,
      };

      // 3. Stream from Python worker
      if (isCircuitOpen("python")) {
        throw new Error("ML service temporarily unavailable (Circuit OPEN)");
      }
      let pythonResp;
      try {
        pythonResp = await axios.post(
          `${PYTHON_WORKER_URL}/api/research/run`,
          payload,
          { responseType: "stream", timeout: 120000 }
        );
        recordSuccess("python");
      } catch (err) {
        recordFailure("python");
        throw err;
      }

      res.setHeader("Content-Type", "application/x-ndjson");
      res.setHeader("Transfer-Encoding", "chunked");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("X-Accel-Buffering", "no");

      let buffer = "";
      pythonResp.data.on("data", (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            res.write(JSON.stringify(event) + "\n");

            // On complete: ingest to Java
            if (event.event === "complete" && event.data) {
              const researchData = event.data;
              const now = new Date().toISOString();

              const ingestPayload = {
                applicationId,
                results: (researchData.articles || []).map(a => ({
                  title: a.title || "",
                  sourceUrl: a.url || "",
                  sourceName: a.source || "",
                  sourceType: a.source_type || "api",
                  risk_score: a.risk_score ?? 0,
                  risk_level: a.risk_level || "NONE",
                  riskKeywordsFound: a.risk_flags || [],
                  publishedAt: a.published_at || null,
                  scrapedAt: now,
                })),
              };

              axios.post(
                `${JAVA_BACKEND_URL}/api/v1/intelligence/ingest`,
                ingestPayload
              ).then(() => {
                console.log(
                  `[BFF] Java ingest success for app=${applicationId} ` +
                  `signals=${ingestPayload.results.length}`
                );
              }).catch(err => {
                console.error(
                  `[BFF] Java ingest failed: ${err.message}`,
                  err.response?.data
                );
              });
            }
          } catch (e) {
            console.warn("[BFF] Skipped partial line:", line);
          }
        }
      });

      pythonResp.data.on("end", () => res.end());
      pythonResp.data.on("error", (err) => {
        console.error("[BFF] Stream error:", err.message);
        res.end();
      });

    } catch (err) {
      console.error("[BFF] run-research failed:", err.message);
      res.status(500).json({ error: err.message });
    }
  }
);

// ─────────────────────────────────────────────
// Observability
// ─────────────────────────────────────────────
app.get("/metrics", async (req, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

app.get("/api/circuit-status", (req, res) => {
  res.json({
    python: circuitBreaker.python.state,
    java: circuitBreaker.java.state,
    timestamp: new Date().toISOString(),
  });
});

app.use("/mca", require("./routes/mca"));

app.get("/health", (req, res) => {
  res.json({
    status: "UP",
    service: "IntelliCredit BFF",
    version: "1.0.0",
    activeConnections: io.engine.clientsCount,
    activeSubscriptions: applicationSubscriptions.size,
    timestamp: new Date().toISOString(),
  });
});

// ─────────────────────────────────────────────
// Start Server
// ─────────────────────────────────────────────
server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error("Port 3001 is already in use. Free the port and restart.");
    process.exit(1);
  } else {
    throw err;
  }
});

server.listen(PORT, () => {
  logger.info(`[BFF] IntelliCredit BFF started on port ${PORT}`);
  logger.info(`[BFF] WebSocket server ready`);
  logger.info(`[BFF] Proxying to Java Backend: ${JAVA_BACKEND_URL}`);
  logger.info(`[BFF] Frontend origin: ${FRONTEND_URL}`);
  initConnectivityProbe();
});

setupRedisPubSub(io);

// Nightly crawl scheduler (optional). Enable by setting NIGHTLY_CRAWL=1.
if ((process.env.NIGHTLY_CRAWL || "0") === "1") {
  const cronSpec = process.env.NIGHTLY_CRAWL_CRON || "15 2 * * *";
  cron.schedule(cronSpec, async () => {
    try {
      logger.info("[CRON] Nightly crawl starting");
      const apps = await axios.get(`${JAVA_BACKEND_URL}/api/v1/applications`, { timeout: 20000 });
      const list = apps.data || [];
      for (const a of list.slice(0, 30)) {
        const id = a.applicationId;
        if (!id) continue;
        const evt = {
          eventId: uuidv4(),
          applicationId: id,
          stage: "NIGHTLY_CRAWL",
          stageConfig: { label: "Nightly Crawl", icon: "search", color: "gray", step: 0 },
          message: "Nightly crawl trigger (deep crawl endpoint can be enabled)",
          progress: 0,
          timestamp: new Date().toISOString(),
        };
        io.to(`app:${id}`).emit("progress:update", evt);
        if (redisPub) redisPub.publish(REDIS_CHANNEL_PROGRESS, JSON.stringify(evt));
      }
      logger.info("[CRON] Nightly crawl dispatched");
    } catch (e) {
      logger.warn(`[CRON] Nightly crawl failed: ${e.message}`);
    }
  });
}

module.exports = { app, server, io };
