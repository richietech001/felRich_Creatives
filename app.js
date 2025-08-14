import { MongoClient } from "mongodb";

/**
 * Serverless-friendly MongoDB client caching.
 * Avoid re-creating new MongoClient on every invocation.
 */
const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || "poetry";
let cachedClient = global._mongoClientPromise;
let cachedDb = global._mongoDb;

if (!cachedClient) {
  if (!uri) {
    console.error("MONGODB_URI environment variable is not set.");
  }
  const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
  cachedClient = client.connect();
  global._mongoClientPromise = cachedClient;
}

async function getDb() {
  if (cachedDb) return cachedDb;
  const client = await cachedClient;
  const db = client.db(dbName);
  cachedDb = db;
  global._mongoDb = db;
  return db;
}

/**
 * Helper: send JSON with CORS headers (allow GitHub Pages or any origin).
 * Adjust origins for stricter security if needed.
 */
function sendJson(res, status, data) {
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", process.env.CORS_ORIGIN || "*"); // set specific origin in production
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.status(status).json(data);
}

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", process.env.CORS_ORIGIN || "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }

  try {
    const db = await getDb();
    const poemsCollection = db.collection("poems");

    if (req.method === "GET") {
      // Return all poems, newest first
      const poems = await poemsCollection
        .find({})
        .sort({ createdAt: -1 })
        .toArray();

      return sendJson(res, 200, poems);
    }

    if (req.method === "POST") {
      // Basic validation
      const { title, author, content } = req.body || {};

      if (!title || !content) {
        return sendJson(res, 400, { error: "Missing required fields: title and content." });
      }

      const doc = {
        title: String(title).trim(),
        author: author ? String(author).trim() : "Anonymous",
        content: String(content).trim(),
        createdAt: new Date()
      };

      const result = await poemsCollection.insertOne(doc);

      return sendJson(res, 201, { message: "Poem created", id: result.insertedId });
    }

    // Method not allowed
    return sendJson(res, 405, { error: "Method not allowed" });
  } catch (err) {
    console.error("API error:", err);
    return sendJson(res, 500, { error: "Internal Server Error" });
  }
}
E