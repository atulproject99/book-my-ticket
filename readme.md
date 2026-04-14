# Book My Ticket

A movie/flight ticket booking system built with **Node.js, Express, PostgreSQL, and HTML/JS**. This application demonstrates user authentication, database integration, and concurrency control for seat booking.

## Tech Stack

- **Backend:** Node.js, Express
- **Database:** PostgreSQL
- **Authentication:** JSON Web Tokens (JWT), bcrypt
- **Frontend:** HTML, CSS, JavaScript (served via Express from the `public` directory)
- **Infrastructure:** Docker Compose (for local database provisioning)

## Prerequisites

- Node.js (v16+)
- Docker & Docker Compose (for local database)

_Alternatively, you can provide your own remote PostgreSQL Database by configuring the `.env` file._

## Setup & Run Locally

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Create or modify the `.env` file in the root directory:

```env
ACCESS_TOKEN_SECRET=your_jwt_secret
ACCESS_TOKEN_EXPIRY=15m
NODE_ENV=development # Set to production if using a remote database
# DATABASE_URL=postgresql://user:pass@host:port/dbname (Used when NODE_ENV=production)
```

### 3. Start the Database

The project includes a `docker-compose.yml` to quickly spin up a PostgreSQL instance.

```bash
npm run db:up
```

_This starts a postgres instance on port 5433 with user `postgres`, password `postgres`, and db `sql_class_2_db`._

### 4. Run the Server

```bash
npm run dev
```

_This uses nodemon to start `index.mjs` on port `8080`. During startup, the application's `initDB()` function will automatically connect to the database, create the `users` and `seats` tables, and seed the database with 20 empty seats._

**The application will be accessible at:** `http://localhost:8080`

### 5. Stop the Database

When you're done, you can stop the database container:

```bash
npm run db:down
```

## Application Flow & Architecture

1. **Initialization:**
   - Server runs via `index.mjs`.
   - `initDB()` is immediately called on startup to ensure database schemas exist (`users` and `seats`). It seeds initial seats if they don't already exist.
2. **Static Asset Serving:**
   - The application serves files (`index.html`, `login.html`, `register.html`) directly from the `/public` root.
3. **Authentication Flow:**
   - **Registration:** Hit `/auth/register` with `name`, `mobileNo`, `email`, and `password`. The password is encrypted via `bcrypt` and stored in the database.
   - **Login:** Hit `/auth/login` with `email` and `password`. On success, a JWT is generated and returned as an `accessToken`.
   - **Protected Routes:** Use the `authentication` middleware. A valid JWT must be passed in the `Authorization: Bearer <token>` header to access protected endpoints.
4. **Booking Flow:**
   - Users browse seats via the protected `GET /seats` endpoint.
   - To book a seat, an authenticated `PUT /:id/:name` request is sent.
   - **Concurrency Control:** The booking system uses explicitly locked database transactions `SELECT ... FOR UPDATE` to secure the seat and ensure that no two users can book the same seat at precisely the exact same time. It then marks the seat as booked (`isbooked = 1`) and assigns the `user_id`.

## API Endpoints

### Authentication

#### 1. Register User

- **URL:** `/auth/register`
- **Method:** `POST`
- **Body:**
  ```json
  {
    "name": "Jane Doe",
    "mobileNo": "1234567890",
    "email": "jane@example.com",
    "password": "securepassword"
  }
  ```
- **Success Response:** `200 OK` (Returns registered user details).
- **Error Response:** `404 Not Found` (Missing or invalid data).

#### 2. Login User

- **URL:** `/auth/login`
- **Method:** `POST`
- **Body:**
  ```json
  {
    "email": "jane@example.com",
    "password": "securepassword"
  }
  ```
- **Success Response:** `200 OK` (Returns user details and `accessToken`).
- **Error Response:** `404 Not Found` (Invalid credentials).

### Public Routes

#### 3. Application Entrypoint

- **URL:** `/`
- **Method:** `GET`
- **Response:** Serves the `index.html` static file.

#### 4. Get Movie Details

- **URL:** `/movie`
- **Method:** `GET`
- **Response:** `200 OK` with JSON object containing mock movie data (Title, duration, show time, language).

### Protected Routes (Requires JWT)

_These routes require an `Authorization` header with a valid Bearer token (`Authorization: Bearer <accessToken>`)._

#### 5. Get All Seats

- **URL:** `/seats`
- **Method:** `GET`
- **Response:** `200 OK` with an array of seat objects, including their `isbooked` status and associated `user_id`.

#### 6. Book a Seat

- **URL:** `/:id/:name`
- **Method:** `PUT`
- **Path Parameters:**
  - `id`: The integer ID of the seat.
  - `name`: The name associated with the booking.
- **Success Response:** `200 OK` with database update result.
- **Error Response:** `200 OK` with `{ "error": "Seat already booked" }` or `{ "error": "<error message>" }`.
