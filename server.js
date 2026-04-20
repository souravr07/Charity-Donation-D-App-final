import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;

// --------------------
// Simple JSON storage (MVP)
// --------------------
// Structure:
// {
//   "expenses": [
//      { id, address, amount, category, note, dateISO, createdAt }
//   ]
// }

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "data");
const DB_PATH = path.join(DATA_DIR, "expenses.json");

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ expenses: [] }, null, 2));
  }
}

function readDb() {
  ensureDataFile();
  const raw = fs.readFileSync(DB_PATH, "utf8");
  const parsed = JSON.parse(raw);
  if (!parsed.expenses || !Array.isArray(parsed.expenses)) {
    return { expenses: [] };
  }
  return parsed;
}

function writeDb(db) {
  ensureDataFile();
  const tmp = DB_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_PATH);
}

function isValidEthAddress(addr) {
  return typeof addr === "string" && /^0x[a-fA-F0-9]{40}$/.test(addr);
}

function parseAmount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n <= 0) return null;
  return Math.round(n * 100) / 100; // 2 decimals
}

function normalizeMonth(month) {
  if (!month) return null;
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  return month;
}

// --------------------
// API
// --------------------

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

// GET expenses
// /api/expenses?address=0x...&month=YYYY-MM
app.get("/api/expenses", (req, res) => {
  try {
    const address = String(req.query.address || "").trim();
    const month = normalizeMonth(req.query.month);

    if (!isValidEthAddress(address)) {
      return res.status(400).json({ ok: false, error: "Valid address is required" });
    }

    const db = readDb();
    let expenses = db.expenses.filter(
      (e) => e.address.toLowerCase() === address.toLowerCase()
    );

    if (month) {
      expenses = expenses.filter((e) => String(e.dateISO || "").slice(0, 7) === month);
    }

    expenses.sort((a, b) => String(b.dateISO).localeCompare(String(a.dateISO)));
    return res.json({ ok: true, expenses });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// POST add expense
app.post("/api/expenses", (req, res) => {
  try {
    const { address, amount, category, note, dateISO } = req.body || {};

    const addr = String(address || "").trim();
    if (!isValidEthAddress(addr)) {
      return res.status(400).json({ ok: false, error: "Valid address is required" });
    }

    const parsedAmount = parseAmount(amount);
    if (parsedAmount === null) {
      return res.status(400).json({ ok: false, error: "Amount must be a positive number" });
    }

    const cat = String(category || "").trim();
    if (!cat) {
      return res.status(400).json({ ok: false, error: "Category is required" });
    }

    const dateStr = String(dateISO || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return res.status(400).json({ ok: false, error: "dateISO must be YYYY-MM-DD" });
    }

    const expense = {
      id: uuidv4(),
      address: addr,
      amount: parsedAmount,
      category: cat,
      note: String(note || "").trim(),
      dateISO: dateStr,
      createdAt: new Date().toISOString(),
    };

    const db = readDb();
    db.expenses.push(expense);
    writeDb(db);

    return res.json({ ok: true, expense });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// DELETE expense
app.delete("/api/expenses/:id", (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    const address = String(req.query.address || "").trim();
    if (!id) return res.status(400).json({ ok: false, error: "id is required" });
    if (!isValidEthAddress(address)) {
      return res.status(400).json({ ok: false, error: "Valid address is required" });
    }

    const db = readDb();
    const before = db.expenses.length;
    db.expenses = db.expenses.filter(
      (e) => !(e.id === id && e.address.toLowerCase() === address.toLowerCase())
    );
    const after = db.expenses.length;
    writeDb(db);

    return res.json({ ok: true, deleted: before !== after });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// GET summary
// /api/summary?address=0x...&month=YYYY-MM
app.get("/api/summary", (req, res) => {
  try {
    const address = String(req.query.address || "").trim();
    const month = normalizeMonth(req.query.month);

    if (!isValidEthAddress(address)) {
      return res.status(400).json({ ok: false, error: "Valid address is required" });
    }

    const db = readDb();
    let expenses = db.expenses.filter(
      (e) => e.address.toLowerCase() === address.toLowerCase()
    );

    if (month) {
      expenses = expenses.filter((e) => String(e.dateISO || "").slice(0, 7) === month);
    }

    const total = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);

    const byCategory = {};
    for (const e of expenses) {
      const c = e.category || "Other";
      byCategory[c] = (byCategory[c] || 0) + Number(e.amount || 0);
    }

    const categories = Object.entries(byCategory)
      .map(([category, amt]) => ({ category, amount: Math.round(amt * 100) / 100 }))
      .sort((a, b) => b.amount - a.amount);

    return res.json({ ok: true, total: Math.round(total * 100) / 100, categories });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

app.listen(PORT, () => {
  ensureDataFile();
  console.log(`Expense backend running on http://localhost:${PORT}`);
  console.log(`Data file: ${DB_PATH}`);
});
