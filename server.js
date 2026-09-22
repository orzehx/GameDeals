const express = require("express");
const Database = require("better-sqlite3");
const dotenv = require("dotenv");
const path = require("path");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const nodemailer = require("nodemailer");
const crypto = require("crypto");

const SQLiteStore =
  require("better-sqlite3-session-store")(session);

dotenv.config();

const app = express();
const PORT =
  process.env.PORT || 3000; 

const STEAM_API_KEY = process.env.STEAM_API_KEY;
const SESSION_SECRET = process.env.SESSION_SECRET;

const BASE_URL =
  (process.env.BASE_URL || "http://localhost:3000")
    .replace(/\/$/, "");


// ======================================================
// SPRAWDZENIE KONFIGURACJI
// ======================================================

if (!SESSION_SECRET) {
  console.error("❌ Brak SESSION_SECRET w pliku .env");
  process.exit(1);
}

const SMTP_CONFIGURED =
  Boolean(
    process.env.SMTP_HOST &&
    process.env.SMTP_PORT &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS
  );


// ======================================================
// DATABASE
// ======================================================

const db = new Database("games.db");

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");


// ======================================================
// TABELE
// ======================================================

db.exec(`
  CREATE TABLE IF NOT EXISTS catalog (
    appid INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    last_modified INTEGER DEFAULT 0,
    price_change_number INTEGER DEFAULT 0
  );


  CREATE TABLE IF NOT EXISTS game_cache (
    appid INTEGER PRIMARY KEY,
    name TEXT,
    image TEXT,
    is_free INTEGER DEFAULT 0,
    currency TEXT,
    initial_price INTEGER,
    final_price INTEGER,
    discount INTEGER DEFAULT 0,
    checked_at INTEGER
  );


  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    username TEXT NOT NULL
      UNIQUE COLLATE NOCASE,

    email TEXT NOT NULL
      UNIQUE COLLATE NOCASE,

    password_hash TEXT NOT NULL,

    created_at INTEGER NOT NULL
  );


  CREATE TABLE IF NOT EXISTS watchlist (
    user_id INTEGER NOT NULL,
    appid INTEGER NOT NULL,

    target_price INTEGER,

    created_at INTEGER NOT NULL,

    PRIMARY KEY (
      user_id,
      appid
    ),

    FOREIGN KEY(user_id)
      REFERENCES users(id)
      ON DELETE CASCADE
  );


  CREATE TABLE IF NOT EXISTS price_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    appid INTEGER NOT NULL,

    final_price INTEGER,
    discount INTEGER,

    checked_at INTEGER NOT NULL
  );


  CREATE INDEX IF NOT EXISTS idx_catalog_name
  ON catalog(name);


  CREATE INDEX IF NOT EXISTS idx_cache_price
  ON game_cache(final_price);


  CREATE INDEX IF NOT EXISTS idx_cache_discount
  ON game_cache(discount);


  CREATE INDEX IF NOT EXISTS idx_history_appid
  ON price_history(appid);
`);


// ======================================================
// MIGRACJA GAME CACHE
// ======================================================

const cacheColumns =
  db.prepare(`
    PRAGMA table_info(game_cache)
  `).all();


if (
  !cacheColumns.some(
    column =>
      column.name === "metacritic_score"
  )
) {

  db.exec(`
    ALTER TABLE game_cache
    ADD COLUMN metacritic_score INTEGER
  `);

}


const detailColumns = [
  ["short_description", "TEXT"],
  ["developers", "TEXT"],
  ["publishers", "TEXT"],
  ["genres", "TEXT"],
  ["release_date", "TEXT"],
  ["coming_soon", "INTEGER DEFAULT 0"],
  ["platforms", "TEXT"],
  ["recommendations", "INTEGER"]
];


for (const [name, type] of detailColumns) {

  if (
    !cacheColumns.some(
      column => column.name === name
    )
  ) {

    db.exec(`
      ALTER TABLE game_cache
      ADD COLUMN ${name} ${type}
    `);

  }

}


// ======================================================
// MIGRACJA USERS - EMAIL VERIFICATION
// ======================================================

const userColumns =
  db.prepare(`
    PRAGMA table_info(users)
  `).all();


if (
  !userColumns.some(
    column =>
      column.name === "email_verified"
  )
) {

  db.exec(`
    ALTER TABLE users
    ADD COLUMN email_verified INTEGER DEFAULT 0
  `);

}


if (
  !userColumns.some(
    column =>
      column.name === "verification_token"
  )
) {

  db.exec(`
    ALTER TABLE users
    ADD COLUMN verification_token TEXT
  `);

}


if (
  !userColumns.some(
    column =>
      column.name === "verification_expires"
  )
) {

  db.exec(`
    ALTER TABLE users
    ADD COLUMN verification_expires INTEGER
  `);

}


// ======================================================
// EXPRESS
// ======================================================

app.use(express.json());

app.get(
  ["/login.html", "/account.html"],
  (req, res) => {
    res.redirect(
      "/coming-soon.html"
    );
  }
);

app.use(
  express.static(
    path.join(
      __dirname,
      "public"
    )
  )
);


// ======================================================
// SESJE
// ======================================================

app.use(
  session({

    store:
      new SQLiteStore({
        client: db,

        expired: {
          clear: true,
          intervalMs:
            15 * 60 * 1000
        }
      }),

    secret:
      SESSION_SECRET,

    resave:
      false,

    saveUninitialized:
      false,

    cookie: {
      httpOnly: true,

      sameSite:
        "lax",

      secure:
        process.env.NODE_ENV ===
        "production",

      maxAge:
        30 *
        24 *
        60 *
        60 *
        1000
    }

  })
);


// ======================================================
// NODEMAILER
// ======================================================

let transporter = null;


if (SMTP_CONFIGURED) {

  transporter =
    nodemailer.createTransport({

      host:
        process.env.SMTP_HOST,

      port:
        Number(
          process.env.SMTP_PORT
        ),

      secure:
        process.env.SMTP_SECURE ===
        "true",

      auth: {
        user:
          process.env.SMTP_USER,

        pass:
          process.env.SMTP_PASS
      }

    });

}


// ======================================================
// TOKEN WERYFIKACYJNY
// ======================================================

function createVerificationToken() {

  const token =
    crypto
      .randomBytes(32)
      .toString("hex");


  const tokenHash =
    crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");


  return {
    token,
    tokenHash
  };

}


// ======================================================
// WYSYŁANIE EMAILA
// ======================================================

async function sendVerificationEmail(
  email,
  username,
  token
) {

  if (!transporter) {

    throw new Error(
      "SMTP nie jest skonfigurowane."
    );

  }


  const link =
    `${BASE_URL}/api/auth/verify-email?token=${encodeURIComponent(token)}`;


  await transporter.sendMail({

    from:
      `"GameDeals" <${process.env.SMTP_USER}>`,

    to:
      email,

    subject:
      "Potwierdź adres e-mail - GameDeals",

    text: `
Cześć ${username}!

Dzięki za rejestrację w GameDeals.

Potwierdź swój adres e-mail:
${link}

Link jest ważny przez 24 godziny.

Jeśli to nie Ty zakładałeś konto, zignoruj tę wiadomość.
    `,


    html: `
      <!DOCTYPE html>

      <html lang="pl">

      <body
        style="
          margin:0;
          padding:30px;
          background:#080b12;
          color:#f8fafc;
          font-family:Arial,sans-serif;
        "
      >

        <div
          style="
            max-width:600px;
            margin:auto;
            background:#111722;
            border:1px solid #263247;
            border-radius:16px;
            padding:32px;
          "
        >

          <h1
            style="
              margin-top:0;
            "
          >
            🎮 Game<span
              style="
                color:#22c55e;
              "
            >Deals</span>
          </h1>


          <h2>
            Cześć ${escapeEmailHtml(username)}!
          </h2>


          <p
            style="
              color:#cbd5e1;
              line-height:1.6;
            "
          >
            Dzięki za utworzenie konta.
            Kliknij poniższy przycisk,
            aby potwierdzić swój adres e-mail.
          </p>


          <a
            href="${link}"

            style="
              display:inline-block;
              margin:20px 0;
              padding:14px 22px;
              background:#22c55e;
              color:#052e16;
              text-decoration:none;
              font-weight:bold;
              border-radius:9px;
            "
          >
            ✅ Potwierdź adres e-mail
          </a>


          <p
            style="
              color:#94a3b8;
              font-size:14px;
            "
          >
            Link jest ważny przez 24 godziny.
          </p>


          <p
            style="
              color:#64748b;
              font-size:13px;
            "
          >
            Jeśli nie zakładałeś konta
            w GameDeals, zignoruj tę wiadomość.
          </p>

        </div>

      </body>

      </html>
    `

  });

}


function escapeEmailHtml(text) {

  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}


// ======================================================
// RATE LIMIT AUTH
// ======================================================

const authLimiter =
  rateLimit({

    windowMs:
      15 * 60 * 1000,

    limit:
      30,

    standardHeaders:
      true,

    legacyHeaders:
      false,

    message: {
      error:
        "Za dużo prób. Spróbuj ponownie później."
    }

  });


// ======================================================
// REQUIRE AUTH
// ======================================================

function requireAuth(
  req,
  res,
  next
) {

  if (
    !req.session.userId
  ) {

    return res
      .status(401)
      .json({
        error:
          "Musisz się zalogować."
      });

  }


  next();

}


// ======================================================
// REGISTER
// ======================================================

app.post(
  "/api/auth/register",

  authLimiter,

  async (req, res) => {

    let newUserId = null;


    try {

      const username =
        String(
          req.body.username || ""
        ).trim();


      const email =
        String(
          req.body.email || ""
        )
          .trim()
          .toLowerCase();


      const password =
        String(
          req.body.password || ""
        );


      if (
        !/^[\p{L}\p{N}_-]{3,24}$/u
          .test(username)
      ) {

        return res
          .status(400)
          .json({
            error:
              "Nazwa użytkownika musi mieć 3–24 znaki."
          });

      }


      if (
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/
          .test(email)
      ) {

        return res
          .status(400)
          .json({
            error:
              "Podaj poprawny adres e-mail."
          });

      }


      if (
        password.length < 8
      ) {

        return res
          .status(400)
          .json({
            error:
              "Hasło musi mieć co najmniej 8 znaków."
          });

      }


      const existing =
        db.prepare(`

          SELECT
            id,
            email_verified

          FROM users

          WHERE
            username = ?
            OR email = ?

        `).get(
          username,
          email
        );


      if (existing) {

        return res
          .status(409)
          .json({
            error:
              "Taka nazwa użytkownika lub e-mail już istnieje."
          });

      }


      if (!SMTP_CONFIGURED) {

        return res
          .status(500)
          .json({
            error:
              "Wysyłanie e-maili nie jest jeszcze skonfigurowane."
          });

      }


      const passwordHash =
        await bcrypt.hash(
          password,
          12
        );


      const {
        token,
        tokenHash
      } =
        createVerificationToken();


      const verificationExpires =
        Date.now() +
        24 *
        60 *
        60 *
        1000;


      const result =
        db.prepare(`

          INSERT INTO users (

            username,
            email,
            password_hash,

            created_at,

            email_verified,

            verification_token,
            verification_expires

          )

          VALUES (
            ?, ?, ?, ?, ?, ?, ?
          )

        `).run(

          username,
          email,
          passwordHash,

          Date.now(),

          0,

          tokenHash,
          verificationExpires

        );


      newUserId =
        Number(
          result.lastInsertRowid
        );


      try {

        await sendVerificationEmail(
          email,
          username,
          token
        );

      }

      catch (emailError) {

        db.prepare(`

          DELETE FROM users

          WHERE id = ?

        `).run(
          newUserId
        );


        console.error(
          "EMAIL:",
          emailError.message
        );


        return res
          .status(500)
          .json({
            error:
              "Nie udało się wysłać wiadomości aktywacyjnej. Sprawdź konfigurację SMTP."
          });

      }


      res.json({

        ok: true,

        message:
          "Konto utworzone. Sprawdź skrzynkę e-mail i kliknij link aktywacyjny."

      });

    }

    catch (error) {

      console.error(
        "REGISTER:",
        error
      );


      res
        .status(500)
        .json({
          error:
            "Nie udało się utworzyć konta."
        });

    }

  }
);


// ======================================================
// VERIFY EMAIL
// ======================================================

app.get(
  "/api/auth/verify-email",

  (req, res) => {

    const token =
      String(
        req.query.token || ""
      );


    if (!token) {

      return res.redirect(
        "/login.html?verification=invalid"
      );

    }


    const tokenHash =
      crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");


    const user =
      db.prepare(`

        SELECT
          id,
          verification_expires

        FROM users

        WHERE
          verification_token = ?

      `).get(
        tokenHash
      );


    if (!user) {

      return res.redirect(
        "/login.html?verification=invalid"
      );

    }


    if (
      !user.verification_expires ||
      Date.now() >
      user.verification_expires
    ) {

      return res.redirect(
        "/login.html?verification=expired"
      );

    }


    db.prepare(`

      UPDATE users

      SET
        email_verified = 1,

        verification_token = NULL,

        verification_expires = NULL

      WHERE id = ?

    `).run(
      user.id
    );


    res.redirect(
      "/login.html?verification=success"
    );

  }
);


// ======================================================
// RESEND VERIFICATION
// ======================================================

app.post(
  "/api/auth/resend-verification",

  authLimiter,

  async (req, res) => {

    const email =
      String(
        req.body.email || ""
      )
        .trim()
        .toLowerCase();


    const genericMessage =
      "Jeśli konto istnieje i nie zostało jeszcze potwierdzone, wysłaliśmy nowy link.";


    if (!email) {

      return res.json({
        ok: true,
        message:
          genericMessage
      });

    }


    const user =
      db.prepare(`

        SELECT
          id,
          username,
          email,
          email_verified

        FROM users

        WHERE email = ?

      `).get(
        email
      );


    if (
      !user ||
      user.email_verified
    ) {

      return res.json({
        ok: true,
        message:
          genericMessage
      });

    }


    try {

      const {
        token,
        tokenHash
      } =
        createVerificationToken();


      const expires =
        Date.now() +
        24 *
        60 *
        60 *
        1000;


      db.prepare(`

        UPDATE users

        SET
          verification_token = ?,
          verification_expires = ?

        WHERE id = ?

      `).run(
        tokenHash,
        expires,
        user.id
      );


      await sendVerificationEmail(
        user.email,
        user.username,
        token
      );


      res.json({
        ok: true,
        message:
          genericMessage
      });

    }

    catch (error) {

      console.error(
        "RESEND EMAIL:",
        error.message
      );


      res
        .status(500)
        .json({
          error:
            "Nie udało się wysłać wiadomości."
        });

    }

  }
);


// ======================================================
// LOGIN
// ======================================================

app.post(
  "/api/auth/login",

  authLimiter,

  async (req, res) => {

    const login =
      String(
        req.body.login || ""
      ).trim();


    const password =
      String(
        req.body.password || ""
      );


    if (
      !login ||
      !password
    ) {

      return res
        .status(400)
        .json({
          error:
            "Podaj login i hasło."
        });

    }


    const user =
      db.prepare(`

        SELECT *

        FROM users

        WHERE
          username = ?
          OR email = ?

      `).get(
        login,
        login.toLowerCase()
      );


    if (!user) {

      return res
        .status(401)
        .json({
          error:
            "Nieprawidłowy login lub hasło."
        });

    }


    const correct =
      await bcrypt.compare(
        password,
        user.password_hash
      );


    if (!correct) {

      return res
        .status(401)
        .json({
          error:
            "Nieprawidłowy login lub hasło."
        });

    }


    if (
      !user.email_verified
    ) {

      return res
        .status(403)
        .json({
          error:
            "Najpierw potwierdź adres e-mail."
        });

    }


    req.session.regenerate(
      error => {

        if (error) {

          return res
            .status(500)
            .json({
              error:
                "Błąd sesji."
            });

        }


        req.session.userId =
          user.id;


        res.json({

          ok: true,

          user: {
            id:
              user.id,

            username:
              user.username,

            email:
              user.email
          }

        });

      }
    );

  }
);


// ======================================================
// LOGOUT
// ======================================================

app.post(
  "/api/auth/logout",

  (req, res) => {

    req.session.destroy(
      error => {

        if (error) {

          return res
            .status(500)
            .json({
              error:
                "Nie udało się wylogować."
            });

        }


        res.clearCookie(
          "connect.sid"
        );


        res.json({
          ok: true
        });

      }
    );

  }
);


// ======================================================
// ME
// ======================================================

app.get(
  "/api/auth/me",

  (req, res) => {

    if (
      !req.session.userId
    ) {

      return res.json({
        loggedIn:
          false
      });

    }


    const user =
      db.prepare(`

        SELECT
          id,
          username,
          email,
          created_at,
          email_verified

        FROM users

        WHERE id = ?

      `).get(
        req.session.userId
      );


    if (!user) {

      return res.json({
        loggedIn:
          false
      });

    }


    res.json({

      loggedIn:
        true,

      user: {
        id:
          user.id,

        username:
          user.username,

        email:
          user.email,

        emailVerified:
          Boolean(
            user.email_verified
          ),

        createdAt:
          user.created_at
      }

    });

  }
);


// ======================================================
// WATCHLIST
// ======================================================

app.get(
  "/api/watchlist",

  requireAuth,

  (req, res) => {

    const games =
      db.prepare(`

        SELECT

          w.appid,
          w.target_price,
          w.created_at,

          g.name,
          g.image,
          g.initial_price,
          g.final_price,
          g.discount

        FROM watchlist w

        LEFT JOIN game_cache g
          ON g.appid = w.appid

        WHERE
          w.user_id = ?

        ORDER BY
          w.created_at DESC

      `).all(
        req.session.userId
      );


    res.json(games);

  }
);


app.post(
  "/api/watchlist/:appid",

  requireAuth,

  (req, res) => {

    const appid =
      Number(
        req.params.appid
      );


    if (
      !Number.isInteger(appid)
    ) {

      return res
        .status(400)
        .json({
          error:
            "Niepoprawne AppID."
        });

    }


    let targetPrice =
      null;


    if (
      req.body.targetPrice !==
        undefined &&

      req.body.targetPrice !==
        null &&

      req.body.targetPrice !==
        ""
    ) {

      const price =
        Number(
          req.body.targetPrice
        );


      if (
        !Number.isFinite(price) ||
        price < 0
      ) {

        return res
          .status(400)
          .json({
            error:
              "Niepoprawna cena docelowa."
          });

      }


      targetPrice =
        Math.round(
          price * 100
        );

    }


    db.prepare(`

      INSERT INTO watchlist (
        user_id,
        appid,
        target_price,
        created_at
      )

      VALUES (?, ?, ?, ?)

      ON CONFLICT(
        user_id,
        appid
      )

      DO UPDATE SET
        target_price =
          excluded.target_price

    `).run(

      req.session.userId,
      appid,
      targetPrice,
      Date.now()

    );


    res.json({
      ok: true
    });

  }
);


app.delete(
  "/api/watchlist/:appid",

  requireAuth,

  (req, res) => {

    db.prepare(`

      DELETE FROM watchlist

      WHERE
        user_id = ?
        AND appid = ?

    `).run(

      req.session.userId,

      Number(
        req.params.appid
      )

    );


    res.json({
      ok: true
    });

  }
);


// ======================================================
// STEAM - STATUS
// ======================================================

let catalogLoading =
  false;

let scannerRunning =
  false;


let catalogCount =
  db.prepare(`

    SELECT COUNT(*) AS count

    FROM catalog

  `).get().count;


let catalogReady =
  catalogCount > 0;


// ======================================================
// STEAM KATALOG
// ======================================================

async function fetchCatalogPage(
  lastAppId = 0
) {

  const params =
    new URLSearchParams({

      include_games:
        "true",

      include_dlc:
        "false",

      include_software:
        "false",

      include_videos:
        "false",

      include_hardware:
        "false",

      last_appid:
        String(lastAppId),

      max_results:
        "50000"

    });


  const url =
    "https://api.steampowered.com/" +
    "IStoreService/GetAppList/v1/?" +
    params.toString();


  const response =
    await fetch(url, {

      headers: {

        "x-webapi-key":
          STEAM_API_KEY,

        "Accept":
          "application/json",

        "User-Agent":
          "GameDeals/6.0"

      }

    });


  const text =
    await response.text();


  if (!response.ok) {

    throw new Error(
      `Steam HTTP ${response.status}: ` +
      text.substring(0, 200)
    );

  }


  return JSON.parse(text);

}


// ======================================================
// SYNC KATALOG
// ======================================================

async function syncSteamCatalog() {

  if (catalogLoading) {
    return;
  }


  if (!STEAM_API_KEY) {
    return;
  }


  catalogLoading =
    true;


  try {

    let lastAppId =
      0;


    const insert =
      db.prepare(`

        INSERT INTO catalog (
          appid,
          name,
          last_modified,
          price_change_number
        )

        VALUES (?, ?, ?, ?)

        ON CONFLICT(appid)
        DO UPDATE SET

          name =
            excluded.name,

          last_modified =
            excluded.last_modified,

          price_change_number =
            excluded.price_change_number

      `);


    const transaction =
      db.transaction(
        games => {

          for (
            const game of games
          ) {

            if (
              !game.name ||
              !game.name.trim()
            ) {
              continue;
            }


            insert.run(

              game.appid,

              game.name,

              game.last_modified || 0,

              game.price_change_number || 0

            );

          }

        }
      );


    while (true) {

      const data =
        await fetchCatalogPage(
          lastAppId
        );


      const games =
        data.response?.apps || [];


      if (
        games.length === 0
      ) {
        break;
      }


      transaction(games);


      console.log(
        `📚 +${games.length} gier`
      );


      const previous =
        lastAppId;


      lastAppId =
        games[
          games.length - 1
        ].appid;


      if (
        previous === lastAppId
      ) {
        break;
      }


      if (
        games.length < 50000
      ) {
        break;
      }

    }


    catalogCount =
      db.prepare(`

        SELECT COUNT(*) AS count

        FROM catalog

      `).get().count;


    catalogReady =
      catalogCount > 0;


    console.log(
      `🎮 ${catalogCount.toLocaleString("pl-PL")} gier w katalogu`
    );

  }

  catch (error) {

    console.error(
      "❌ Katalog:",
      error.message
    );

  }

  finally {

    catalogLoading =
      false;

  }

}


// ======================================================
// CACHE GAME
// ======================================================

function cacheRowToGame(row) {

  if (!row) {
    return null;
  }


  return {

    appid:
      row.appid,

    name:
      row.name,

    image:
      row.image,

    isFree:
      Boolean(
        row.is_free
      ),

    metacritic:
      row.metacritic_score,

    description:
      row.short_description || "",

    developers:
      parseStoredList(row.developers),

    publishers:
      parseStoredList(row.publishers),

    genres:
      parseStoredList(row.genres),

    releaseDate:
      row.release_date || null,

    comingSoon:
      Boolean(row.coming_soon),

    platforms:
      parseStoredList(row.platforms),

    recommendations:
      row.recommendations ?? null,

    price:

      row.final_price !== null

        ? {

            currency:
              row.currency,

            initial:
              row.initial_price,

            final:
              row.final_price,

            discount:
              row.discount || 0

          }

        : null

  };

}


function parseStoredList(value) {

  if (!value) {
    return [];
  }


  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  }
  catch {
    return [];
  }

}


// ======================================================
// PRICE HISTORY
// ======================================================

function savePriceHistory(
  appid,
  price
) {

  if (!price) {
    return;
  }


  const previous =
    db.prepare(`

      SELECT
        final_price,
        discount

      FROM price_history

      WHERE appid = ?

      ORDER BY checked_at DESC

      LIMIT 1

    `).get(appid);


  if (
    previous &&
    previous.final_price ===
      price.final &&
    previous.discount ===
      price.discount
  ) {

    return;

  }


  db.prepare(`

    INSERT INTO price_history (
      appid,
      final_price,
      discount,
      checked_at
    )

    VALUES (?, ?, ?, ?)

  `).run(

    appid,
    price.final,
    price.discount,
    Date.now()

  );

}


// ======================================================
// GAME DETAILS
// ======================================================

async function getGameDetails(
  appid,
  fallbackName,
  force = false
) {

  const cached =
    db.prepare(`

      SELECT *

      FROM game_cache

      WHERE appid = ?

    `).get(appid);


  const CACHE_TIME =
    30 * 60 * 1000;


  if (
    !force &&
    cached &&
    cached.checked_at &&
    Date.now() -
      cached.checked_at <
      CACHE_TIME
  ) {

    return cacheRowToGame(
      cached
    );

  }


  try {

    const url =
      "https://store.steampowered.com/api/appdetails" +
      "?appids=" +
      encodeURIComponent(appid) +
      "&cc=pl" +
      "&l=polish";


    const response =
      await fetch(url);


    const data =
      await response.json();


    const result =
      data[appid];


    if (
      !result ||
      !result.success
    ) {

      db.prepare(`

        INSERT INTO game_cache (
          appid,
          name,
          checked_at
        )

        VALUES (?, ?, ?)

        ON CONFLICT(appid)
        DO UPDATE SET
          checked_at =
            excluded.checked_at

      `).run(

        appid,
        fallbackName,
        Date.now()

      );


      return {

        appid:
          Number(appid),

        name:
          fallbackName,

        image:
          null,

        isFree:
          false,

        metacritic:
          null,

        price:
          null

      };

    }


    const steamGame =
      result.data;


    const priceData =
      steamGame.price_overview;


    const price =
      priceData

        ? {

            currency:
              priceData.currency,

            initial:
              priceData.initial,

            final:
              priceData.final,

            discount:
              priceData.discount_percent || 0

          }

        : steamGame.is_free

          ? {

              currency:
                "PLN",

              initial:
                0,

              final:
                0,

              discount:
                0

            }

          : null;


    const game = {

      appid:
        Number(appid),

      name:
        steamGame.name ||
        fallbackName,

      image:
        steamGame.header_image ||
        null,

      isFree:
        steamGame.is_free ===
        true,

      metacritic:
        steamGame.metacritic
          ?.score ??
        null,

      description:
        steamGame.short_description || "",

      developers:
        steamGame.developers || [],

      publishers:
        steamGame.publishers || [],

      genres:
        (steamGame.genres || []).map(
          genre => genre.description
        ),

      releaseDate:
        steamGame.release_date?.date || null,

      comingSoon:
        steamGame.release_date?.coming_soon === true,

      platforms:
        Object.entries(
          steamGame.platforms || {}
        )
          .filter(([, enabled]) => enabled)
          .map(([platform]) => platform),

      recommendations:
        steamGame.recommendations?.total ?? null,

      price

    };


    db.prepare(`

      INSERT INTO game_cache (

        appid,
        name,
        image,
        is_free,

        currency,
        initial_price,
        final_price,
        discount,

        checked_at,
        metacritic_score,
        short_description,
        developers,
        publishers,
        genres,
        release_date,
        coming_soon,
        platforms,
        recommendations

      )

      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?
      )

      ON CONFLICT(appid)
      DO UPDATE SET

        name =
          excluded.name,

        image =
          excluded.image,

        is_free =
          excluded.is_free,

        currency =
          excluded.currency,

        initial_price =
          excluded.initial_price,

        final_price =
          excluded.final_price,

        discount =
          excluded.discount,

        checked_at =
          excluded.checked_at,

        metacritic_score =
          excluded.metacritic_score,

        short_description =
          excluded.short_description,

        developers =
          excluded.developers,

        publishers =
          excluded.publishers,

        genres =
          excluded.genres,

        release_date =
          excluded.release_date,

        coming_soon =
          excluded.coming_soon,

        platforms =
          excluded.platforms,

        recommendations =
          excluded.recommendations

    `).run(

      game.appid,
      game.name,
      game.image,

      game.isFree
        ? 1
        : 0,

      price?.currency ??
        null,

      price?.initial ??
        null,

      price?.final ??
        null,

      price?.discount ??
        0,

      Date.now(),

      game.metacritic,
      game.description,
      JSON.stringify(game.developers),
      JSON.stringify(game.publishers),
      JSON.stringify(game.genres),
      game.releaseDate,
      game.comingSoon ? 1 : 0,
      JSON.stringify(game.platforms),
      game.recommendations

    );


    savePriceHistory(
      game.appid,
      price
    );


    return game;

  }

  catch (error) {

    console.log(
      `⚠ ${appid}: ${error.message}`
    );


    return {

      appid:
        Number(appid),

      name:
        fallbackName,

      image:
        null,

      isFree:
        false,

      metacritic:
        null,

      price:
        null

    };

  }

}


// ======================================================
// SLEEP
// ======================================================

function sleep(ms) {

  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        ms
      )
  );

}


// ======================================================
// BACKGROUND SCANNER
// ======================================================

async function backgroundScanner() {

  if (
    scannerRunning ||
    !catalogReady
  ) {
    return;
  }


  scannerRunning =
    true;


  console.log(
    "🔎 Skaner cen uruchomiony"
  );


  while (
    scannerRunning
  ) {

    const row =
      db.prepare(`

        SELECT
          c.appid,
          c.name

        FROM catalog c

        LEFT JOIN game_cache g
          ON g.appid = c.appid

        WHERE
          g.appid IS NULL

        ORDER BY
          c.appid

        LIMIT 1

      `).get();


    if (!row) {

      scannerRunning =
        false;

      break;

    }


    await getGameDetails(
      row.appid,
      row.name,
      true
    );


    await sleep(800);

  }

}


// ======================================================
// RANKING
// ======================================================

function getRankedGames(
  sort,
  page,
  limit
) {

  let where =
    "WHERE g.checked_at IS NOT NULL";


  let order =
    "ORDER BY c.name COLLATE NOCASE ASC";


  if (
    sort ===
    "price_asc"
  ) {

    where +=
      " AND g.final_price > 0";

    order =
      "ORDER BY g.final_price ASC";

  }


  if (
    sort ===
    "price_desc"
  ) {

    where +=
      " AND g.final_price > 0";

    order =
      "ORDER BY g.final_price DESC";

  }


  if (
    sort ===
    "discount"
  ) {

    where +=
      " AND g.discount > 0";

    order =
      "ORDER BY g.discount DESC, g.final_price ASC";

  }


  if (
    sort ===
    "rating"
  ) {

    where +=
      " AND g.metacritic_score IS NOT NULL";

    order =
      "ORDER BY g.metacritic_score DESC";

  }


  const total =
    db.prepare(`

      SELECT COUNT(*) AS count

      FROM catalog c

      JOIN game_cache g
        ON g.appid = c.appid

      ${where}

    `).get().count;


  const totalPages =
    Math.max(
      1,
      Math.ceil(
        total / limit
      )
    );


  page =
    Math.min(
      Math.max(page, 1),
      totalPages
    );


  const rows =
    db.prepare(`

      SELECT g.*

      FROM catalog c

      JOIN game_cache g
        ON g.appid = c.appid

      ${where}

      ${order}

      LIMIT ?
      OFFSET ?

    `).all(

      limit,

      (page - 1) *
      limit

    );


  return {

    games:
      rows.map(
        cacheRowToGame
      ),

    total,
    totalPages,
    page

  };

}


// ======================================================
// API GAMES
// ======================================================

app.get(
  "/api/games",

  async (req, res) => {

    let page =
      Number(
        req.query.page
      ) || 1;


    const limit =
      Math.min(
        Number(
          req.query.limit
        ) || 6,
        12
      );


    const sort =
      String(
        req.query.sort ||
        "all"
      );


    if (
      sort !== "all"
    ) {

      const ranking =
        getRankedGames(
          sort,
          page,
          limit
        );


      return res.json({

        loading:
          false,

        page:
          ranking.page,

        totalPages:
          ranking.totalPages,

        totalGames:
          ranking.total,

        games:
          ranking.games

      });

    }


    const totalGames =
      catalogCount;


    const totalPages =
      Math.ceil(
        totalGames /
        limit
      );


    page =
      Math.min(
        Math.max(
          page,
          1
        ),
        totalPages
      );


    const rows =
      db.prepare(`

        SELECT
          appid,
          name

        FROM catalog

        ORDER BY
          name COLLATE NOCASE

        LIMIT ?
        OFFSET ?

      `).all(

        limit,

        (page - 1) *
        limit

      );


    const games =
      await Promise.all(

        rows.map(
          row =>
            getGameDetails(
              row.appid,
              row.name
            )
        )

      );


    res.json({

      loading:
        false,

      page,
      totalPages,
      totalGames,
      games

    });

  }
);


// ======================================================
// SEARCH
// ======================================================

app.get(
  "/api/search",

  async (req, res) => {

    const query =
      String(
        req.query.q || ""
      ).trim();


    if (
      query.length < 2
    ) {

      return res.json([]);

    }


    const rows =
      db.prepare(`

        SELECT
          appid,
          name

        FROM catalog

        WHERE
          name LIKE ?

        ORDER BY name

        LIMIT 18

      `).all(
        `%${query}%`
      );


    const games =
      await Promise.all(

        rows.map(
          row =>
            getGameDetails(
              row.appid,
              row.name
            )
        )

      );


    res.json(games);

  }
);


// ======================================================
// STATUS
// ======================================================

app.get(
  "/api/status",

  (req, res) => {

    const indexed =
      db.prepare(`

        SELECT COUNT(*) AS count

        FROM game_cache

      `).get().count;


    const deals =
      db.prepare(`

        SELECT COUNT(*) AS count

        FROM game_cache

        WHERE discount > 0

      `).get().count;


    res.json({

      catalog:
        catalogCount,

      indexed,
      deals,

      percent:

        catalogCount > 0

          ? Math.round(
              indexed /
              catalogCount *
              100
            )

          : 0

    });

  }
);


// ======================================================
// START
// ======================================================

app.listen(
  PORT,
  "0.0.0.0",

  async () => {

    console.log("");
    console.log(
      "🎮 GameDeals 6.0 działa!"
    );

    console.log(
      `➡ http://localhost:${PORT}`
    );

    console.log("");


    if (SMTP_CONFIGURED) {

      console.log(
        `📧 SMTP: ${process.env.SMTP_USER}`
      );

    }

    else {

      console.log(
        "⚠ SMTP nie jest skonfigurowane"
      );

    }


    if (!catalogReady) {

      await syncSteamCatalog();

    }

    else {

      console.log(
        `📚 ${catalogCount.toLocaleString("pl-PL")} gier`
      );

    }


    setTimeout(
      backgroundScanner,
      3000
    );

  }
);


// ======================================================
// GAME PAGE
// ======================================================

app.get(
  "/api/game/:appid",

  async (req, res) => {

    const appid = Number(req.params.appid);


    if (!Number.isInteger(appid) || appid <= 0) {
      return res.status(400).json({
        error: "Nieprawidłowy identyfikator gry."
      });
    }


    const catalogGame = db.prepare(`
      SELECT appid, name
      FROM catalog
      WHERE appid = ?
    `).get(appid);


    if (!catalogGame) {
      return res.status(404).json({
        error: "Nie znaleziono gry w katalogu GameDeals."
      });
    }


    const cached = db.prepare(`
      SELECT short_description
      FROM game_cache
      WHERE appid = ?
    `).get(appid);


    const game = await getGameDetails(
      appid,
      catalogGame.name,
      !cached?.short_description
    );


    const history = db.prepare(`
      SELECT final_price, discount, checked_at
      FROM price_history
      WHERE appid = ?
      ORDER BY checked_at ASC
      LIMIT 100
    `).all(appid).map(entry => ({
      price: entry.final_price,
      discount: entry.discount || 0,
      checkedAt: entry.checked_at
    }));


    res.json({ game, history });

  }
);
