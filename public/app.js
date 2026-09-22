const LIMIT = 6;


const gamesGrid =
  document.getElementById(
    "gamesGrid"
  );


const pagination =
  document.getElementById(
    "pagination"
  );


const statusBox =
  document.getElementById(
    "status"
  );


const catalogInfo =
  document.getElementById(
    "catalogInfo"
  );


const searchInput =
  document.getElementById(
    "searchInput"
  );


const searchButton =
  document.getElementById(
    "searchButton"
  );


const sectionTitle =
  document.getElementById(
    "sectionTitle"
  );


const sectionDescription =
  document.getElementById(
    "sectionDescription"
  );


const backToCatalog =
  document.getElementById(
    "backToCatalog"
  );


const rankingButtons =
  document.querySelectorAll(
    ".ranking-button"
  );


let currentPage = 1;

let totalPages = 1;

let currentSort = "all";

let searchMode = false;


// ======================================================
// NAZWY RANKINGÓW
// ======================================================

const sortNames = {

  all:
    "🎮 Wszystkie gry",

  price_asc:
    "💸 Najtańsze gry",

  price_desc:
    "💎 Najdroższe gry",

  discount:
    "🔥 Największe przeceny",

  rating:
    "⭐ Najlepiej oceniane"

};


// ======================================================
// CENA
// ======================================================

function formatPrice(
  price
) {

  return (
    price / 100
  )
    .toFixed(2)
    .replace(".", ",") +
    " zł";

}


// ======================================================
// HTML ESCAPE
// ======================================================

function escapeHtml(text) {

  const div =
    document.createElement(
      "div"
    );

  div.textContent =
    text || "";

  return div.innerHTML;

}


// ======================================================
// KARTA
// ======================================================

function createGameCard(
  game
) {

  const card =
    document.createElement(
      "article"
    );


  card.className =
    "game-card";


  let priceHTML = "";


  if (
    game.isFree ||
    game.price?.final === 0
  ) {

    priceHTML = `

      <div class="free-price">
        Darmowa
      </div>

    `;

  }

  else if (
    game.price
  ) {

    if (
      game.price.discount > 0
    ) {

      priceHTML = `

        <div class="price-row">

          <span class="old-price">

            ${formatPrice(
              game.price.initial
            )}

          </span>

          <span class="price">

            ${formatPrice(
              game.price.final
            )}

          </span>

        </div>

      `;

    }

    else {

      priceHTML = `

        <div class="price-row">

          <span class="price">

            ${formatPrice(
              game.price.final
            )}

          </span>

        </div>

      `;

    }

  }

  else {

    priceHTML = `

      <div class="no-price">
        Brak ceny
      </div>

    `;

  }


  const discountHTML =

    game.price &&
    game.price.discount > 0

      ? `

        <div class="discount">

          -${game.price.discount}%

        </div>

      `

      : "";


  const ratingHTML =

    game.metacritic

      ? `

        <div class="metacritic">

          ⭐ Metacritic:
          ${game.metacritic}/100

        </div>

      `

      : "";


  const image =
    game.image ||

    `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appid}/header.jpg`;


  card.innerHTML = `

    <div class="game-image">

      <img
        src="${image}"
        alt="${escapeHtml(
          game.name
        )}"
        loading="lazy"
      >

      ${discountHTML}

    </div>


    <div class="game-body">


      <h3 class="game-name">

        ${escapeHtml(
          game.name
        )}

      </h3>


      ${priceHTML}

      ${ratingHTML}


      <div class="card-actions">
        <a
          class="details-button"
          href="/game.html?id=${game.appid}"
        >
          Szczegóły i historia
        </a>

        <a
          class="steam-button"
          href="https://store.steampowered.com/app/${game.appid}"
          target="_blank"
          rel="noopener noreferrer"
        >
          Steam ↗
        </a>
      </div>


    </div>

  `;


  const imageElement =
    card.querySelector(
      "img"
    );


  imageElement.addEventListener(
    "error",
    () => {

      imageElement.style.display =
        "none";

    }
  );


  return card;

}


// ======================================================
// RENDER
// ======================================================

function renderGames(
  games
) {

  gamesGrid.innerHTML =
    "";


  for (
    const game of games
  ) {

    gamesGrid.appendChild(
      createGameCard(
        game
      )
    );

  }

}


// ======================================================
// PAGE BUTTON
// ======================================================

function addPageButton(
  number
) {

  const button =
    document.createElement(
      "button"
    );


  button.className =
    "page-button";


  button.textContent =
    number;


  if (
    number === currentPage
  ) {

    button.classList.add(
      "active"
    );

  }


  button.addEventListener(
    "click",
    () => {

      loadPage(
        number
      );

    }
  );


  pagination.appendChild(
    button
  );

}


// ======================================================
// ...
// ======================================================

function addDots() {

  const dots =
    document.createElement(
      "span"
    );


  dots.className =
    "page-dots";


  dots.textContent =
    "...";


  pagination.appendChild(
    dots
  );

}


// ======================================================
// PAGINATION
// ======================================================

function renderPagination() {

  pagination.innerHTML =
    "";


  if (
    totalPages <= 1
  ) {
    return;
  }


  const previous =
    document.createElement(
      "button"
    );


  previous.className =
    "page-button";


  previous.textContent =
    "‹";


  previous.disabled =
    currentPage === 1;


  previous.onclick =
    () => {

      if (
        currentPage > 1
      ) {

        loadPage(
          currentPage - 1
        );

      }

    };


  pagination.appendChild(
    previous
  );


  addPageButton(1);


  if (
    currentPage > 4
  ) {

    addDots();

  }


  const start =
    Math.max(
      2,
      currentPage - 2
    );


  const end =
    Math.min(
      totalPages - 1,
      currentPage + 2
    );


  for (
    let page = start;
    page <= end;
    page++
  ) {

    addPageButton(
      page
    );

  }


  if (
    currentPage <
    totalPages - 3
  ) {

    addDots();

  }


  if (
    totalPages > 1
  ) {

    addPageButton(
      totalPages
    );

  }


  const next =
    document.createElement(
      "button"
    );


  next.className =
    "page-button";


  next.textContent =
    "›";


  next.disabled =
    currentPage ===
    totalPages;


  next.onclick =
    () => {

      if (
        currentPage <
        totalPages
      ) {

        loadPage(
          currentPage + 1
        );

      }

    };


  pagination.appendChild(
    next
  );

}


// ======================================================
// LOAD PAGE
// ======================================================

async function loadPage(
  page = 1
) {

  searchMode =
    false;


  currentPage =
    page;


  gamesGrid.innerHTML =
    "";


  pagination.innerHTML =
    "";


  statusBox.classList.remove(
    "hidden"
  );


  statusBox.textContent =
    "⏳ Pobieram gry...";


  sectionTitle.textContent =
    sortNames[currentSort];


  if (
    currentSort === "all"
  ) {

    sectionDescription.textContent =
      "Cały katalog Steam.";

  }

  else {

    sectionDescription.textContent =
      "Ranking obejmuje gry, które GameDeals zdążył już sprawdzić.";

  }


  backToCatalog.classList.add(
    "hidden"
  );


  try {

    const response =
      await fetch(

        `/api/games?page=${page}&limit=${LIMIT}&sort=${currentSort}`

      );


    const data =
      await response.json();


    currentPage =
      data.page;


    totalPages =
      data.totalPages;


    statusBox.classList.add(
      "hidden"
    );


    if (
      data.games.length === 0
    ) {

      statusBox.classList.remove(
        "hidden"
      );


      statusBox.textContent =
        "⏳ Skaner jeszcze zbiera dane do tego rankingu.";


      return;

    }


    renderGames(
      data.games
    );


    renderPagination();


  }

  catch {

    statusBox.textContent =
      "❌ Nie udało się pobrać gier.";

  }

}


// ======================================================
// SEARCH
// ======================================================

async function searchGames() {

  const query =
    searchInput.value.trim();


  if (
    query.length < 2
  ) {
    return;
  }


  searchMode =
    true;


  gamesGrid.innerHTML =
    "";


  pagination.innerHTML =
    "";


  statusBox.classList.remove(
    "hidden"
  );


  statusBox.textContent =
    "🔎 Szukam...";


  sectionTitle.textContent =
    `🔎 ${query}`;


  sectionDescription.textContent =
    "Wyniki wyszukiwania";


  backToCatalog.classList.remove(
    "hidden"
  );


  try {

    const response =
      await fetch(

        "/api/search?q=" +

        encodeURIComponent(
          query
        )

      );


    const games =
      await response.json();


    if (
      games.length === 0
    ) {

      statusBox.textContent =
        "Nie znaleziono gry.";

      return;

    }


    statusBox.classList.add(
      "hidden"
    );


    renderGames(
      games
    );

  }

  catch {

    statusBox.textContent =
      "❌ Błąd wyszukiwania.";

  }

}


// ======================================================
// STATUS SKANERA
// ======================================================

async function loadStatus() {

  try {

    const response =
      await fetch(
        "/api/status"
      );


    const data =
      await response.json();


    catalogInfo.innerHTML =

      `🎮 ${data.catalog.toLocaleString("pl-PL")} gier w katalogu
       • 🔍 sprawdzono ${data.indexed.toLocaleString("pl-PL")}
       • 🔥 ${data.deals.toLocaleString("pl-PL")} promocji
       • ${data.percent}% przeskanowane`;

  }

  catch {

    catalogInfo.textContent =
      "GameDeals działa";

  }

}


// ======================================================
// RANKING BUTTONS
// ======================================================

rankingButtons.forEach(
  button => {

    button.addEventListener(
      "click",

      () => {

        rankingButtons.forEach(
          b =>
            b.classList.remove(
              "active"
            )
        );


        button.classList.add(
          "active"
        );


        currentSort =
          button.dataset.sort;


        currentPage =
          1;


        loadPage(1);

      }

    );

  }
);


// ======================================================
// EVENTY
// ======================================================

searchButton.addEventListener(
  "click",
  searchGames
);


searchInput.addEventListener(
  "keydown",

  event => {

    if (
      event.key === "Enter"
    ) {

      searchGames();

    }

  }
);


backToCatalog.addEventListener(
  "click",

  () => {

    searchInput.value =
      "";

    loadPage(1);

  }
);


// ======================================================
// START
// ======================================================

loadPage(1);

loadStatus();


// aktualizujemy licznik skanera
// co 5 sekund

setInterval(
  loadStatus,
  5000
);
