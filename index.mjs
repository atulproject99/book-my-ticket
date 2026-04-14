/* ================= IMPORTS ================= */
import bcrypt from "bcrypt";
import cors from "cors";
import "dotenv/config.js";
import express from "express";
import jwt from "jsonwebtoken";
import path, { dirname } from "path";
import pg from "pg";
import { fileURLToPath } from "url";
/* ================= PATH ================= */
const __dirname = dirname(fileURLToPath(import.meta.url));

/* ================= CONFIG ================= */
const port = process.env.PORT || 8080;

const isProduction = process.env.NODE_ENV === "production";

const pool = new pg.Pool(
  isProduction
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
      }
    : {
        host: "localhost",
        port: 5433,
        user: "postgres",
        password: "postgres",
        database: "sql_class_2_db",
      },
);
/* ================= APP INIT ================= */
const app = new express();
// Serve static files
app.use(express.static(path.join(__dirname, "public")));
app.use(cors());
app.use(express.json());

/* ================= HELPER RESPONSE FUNCTIONS ================= */
function sendOkResponse(res, message = "ok", data = null) {
  return res.status(200).json({
    status: true,
    message,
    data,
  });
}

function sendBadResponse(res, message = "Bad response") {
  return res.status(404).json({
    status: false,
    message,
  });
}

function unauthorized(res, message = "unauthorized") {
  return res.status(401).json({
    status: false,
    message,
  });
}

function isString(value) {
  return typeof value === "string";
}

/* ================= PASSWORD + JWT HELPERS ================= */
async function hashPassword(plainText) {
  const saltRound = 10;
  const hashPassword = await bcrypt.hash(plainText, saltRound);
  return hashPassword;
}

async function comparePassword(plainText, hashedPassword) {
  const isMatch = await bcrypt.compare(plainText, hashedPassword);
  return isMatch;
}

const generateAccessToken = (data) => {
  return jwt.sign(data, process.env.ACCESS_TOKEN_SECRET, {
    expiresIn: process.env.ACCESS_TOKEN_EXPIRY || "15m",
  });
};

const verifyToken = (token) => {
  return jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
};

/* ================= AUTH MIDDLEWARE ================= */
const authentication = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer "))
      unauthorized(res, "Access token required");

    const token = authHeader.split(" ")[1];

    console.log(token);

    const data = verifyToken(token);

    req.id = data.id;

    next();
  } catch (error) {
    return unauthorized(res, error.message);
  }
};

/* ================= DATABASE INIT ================= */
async function initDB() {
  try {
    const createTablesText = `
      CREATE TABLE IF NOT EXISTS seats (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255),
        user_id INT UNIQUE,
        isbooked INT DEFAULT 0
      );

      INSERT INTO seats (isbooked)
      SELECT 0
      FROM generate_series(1, 20)
      WHERE NOT EXISTS (SELECT 1 FROM seats);

      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        mobile_no VARCHAR(12) UNIQUE,
        email VARCHAR(322) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    const db = await pool.connect();

    const result = await db.query(createTablesText);

    console.log(`Result ${result}`);

    db.release();
  } catch (error) {
    console.log(`Error while creating tables ${error.message}`);
    process.exit(0);
  }
}

/* ================= AUTH CONTROLLERS ================= */
async function register(req, res) {
  try {
    const body = req.body;

    if (!body) return sendBadResponse(res, "Data required");

    const { name, mobileNo, email, password } = req.body;

    if (
      !name ||
      !mobileNo ||
      !email ||
      !password ||
      !isString(name) ||
      !isString(mobileNo) ||
      !isString(email) ||
      !isString(password)
    )
      return sendBadResponse(
        res,
        "Data can't be empty or invalid type[name,mobileNo,email,password]",
      );

    const hashedPassword = await hashPassword(password);

    const db = await pool.connect();

    const insertQuery =
      "INSERT INTO users(name, email, mobile_no,password) VALUES ($1, $2, $3,$4) RETURNING id, name, email, mobile_no, created_at";

    const result = await db.query(insertQuery, [
      name,
      email,
      mobileNo,
      hashedPassword,
    ]);

    db.release();

    if (result.rowCount > 0)
      return sendOkResponse(
        res,
        "Registeration successfully please login",
        result.rows[0],
      );
    else return sendBadResponse(res, "User registeration not failed!");
  } catch (error) {
    throw new Error(error.message);
  }
}

async function login(req, res) {
  try {
    const body = req.body;

    if (!body) return sendBadResponse(res, "Data required");

    const { email, password } = req.body;

    if (!email || !password || !isString(email) || !isString(password))
      return sendBadResponse(
        res,
        "Data can't be empty or invalid type[email,password]",
      );

    const hasedPassword = hashPassword(password);

    const db = await pool.connect();

    const query =
      "SELECT id,name,email,mobile_no as mobileNo,password FROM users where email=$1";

    const result = await db.query(query, [email]);

    db.release();

    if (result.rowCount === 0) return sendBadResponse(res, "User not found!");

    const user = result.rows[0];

    const isMatch = await comparePassword(password, user.password);

    if (!isMatch)
      return sendBadResponse(res, "Login failed! Please check  password again");

    delete user.password;

    const accessToken = generateAccessToken({
      id: user.id,
      email: user.email,
    });

    user.accessToken = accessToken;

    return sendOkResponse(res, "Logged in successfully", user);
  } catch (error) {
    throw new Error(error.message);
  }
}

/* ================= ROUTES ================= */
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

app.get("/seats", authentication, async (req, res) => {
  const result = await pool.query("select * from seats");
  res.send(result.rows);
});

app.put("/:id/:name", authentication, async (req, res) => {
  try {
    console.log(`User id ${req.id}`);

    const id = req.params.id;
    const name = req.params.name;

    const conn = await pool.connect();

    await conn.query("BEGIN");

    const sql =
      "SELECT * FROM seats where id = $1 and isbooked = 0 and user_id=$2 FOR UPDATE";

    const result = await conn.query(sql, [id, req.id]);

    if (result.rowCount > 0) {
      res.send({ error: "Seat already booked" });
      return;
    }

    const sqlU =
      "update seats set isbooked = 1,user_id=$3, name = $2 where id = $1";

    const updateResult = await conn.query(sqlU, [id, name, req.id]);

    await conn.query("COMMIT");

    conn.release();

    res.send(updateResult);
  } catch (ex) {
    console.log(ex);
    res.send({ error: ex.message });
  }
});

/* ================= MOCK MOVIE ================= */
const movie = {
  id: 1,
  title: "Dhurandhar The Revenge",
  duration: "3h 2m",
  language: "HINDI",
  showTime: "10:00 AM",
};

app.get("/movie", (req, res) => {
  sendOkResponse(res, "Movie data fetched successfully", movie);
});

/* ================= AUTH ROUTES ================= */
app.post("/auth/register", register);
app.post("/auth/login", login);

/* ================= INIT DB + START SERVER ================= */
initDB();

app.listen(port, () => console.log("Server starting on port: " + port));
