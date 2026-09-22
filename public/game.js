const params = new URLSearchParams(window.location.search);
const appid = Number(params.get("id"));

const loadingBox = document.getElementById("gameLoading");
const errorBox = document.getElementById("gameError");
const details = document.getElementById("gameDetails");

document.getElementById("currentYear").textContent = new Date().getFullYear();

function formatPrice(price) {
  return (price / 100).toFixed(2).replace(".", ",") + " zł";
}

function priceMarkup(game) {
  if (game.isFree || game.price?.final === 0) {
    return '<span class="free-price">Darmowa</span>';
  }

  if (!game.price) {
    return '<span class="no-price">Cena niedostępna</span>';
  }

  const oldPrice = game.price.discount > 0
    ? `<span class="old-price">${formatPrice(game.price.initial)}</span>`
    : "";

  return `${oldPrice}<span class="price">${formatPrice(game.price.final)}</span>`;
}

function buildVerdict(game, history) {
  const parts = [];

  if (game.price?.discount >= 60) {
    parts.push(`Rabat ${game.price.discount}% jest wysoki i zdecydowanie zasługuje na uwagę.`);
  } else if (game.price?.discount > 0) {
    parts.push(`Obniżka ${game.price.discount}% jest zauważalna, ale warto zestawić ją z ceną końcową.`);
  } else {
    parts.push("Obecnie nie widzimy aktywnej obniżki, więc zakup nie wymaga pośpiechu.");
  }

  if (game.price?.final > 0 && game.price.final <= 5000) {
    parts.push(`Cena ${formatPrice(game.price.final)} mieści się w popularnym budżecie do 50 zł.`);
  }

  if (game.metacritic >= 80) {
    parts.push(`Ocena Metacritic ${game.metacritic}/100 wskazuje na bardzo dobry odbiór gry.`);
  } else if (game.metacritic) {
    parts.push(`Ocena Metacritic wynosi ${game.metacritic}/100 — potraktuj ją jako jeden z kilku sygnałów jakości.`);
  }

  if (history.length > 1 && game.price) {
    const earlierPrices = history.slice(0, -1).map(item => item.price).filter(Number.isFinite);
    const previousLow = earlierPrices.length ? Math.min(...earlierPrices) : null;

    if (previousLow !== null && game.price.final < previousLow) {
      parts.push("To najniższa cena spośród zmian zapisanych dotąd przez GameDeals.");
    } else if (previousLow !== null && game.price.final === previousLow) {
      parts.push("Aktualna cena dorównuje najniższej wartości zapisanej w naszej historii.");
    }
  }

  parts.push("Ostateczną decyzję oprzyj też na gatunku, wymaganiach i tym, czy planujesz zagrać w najbliższym czasie.");
  return parts.join(" ");
}

function addFact(label, value) {
  if (!value) return;

  const list = document.getElementById("gameFacts");
  const term = document.createElement("dt");
  const description = document.createElement("dd");
  term.textContent = label;
  description.textContent = value;
  list.append(term, description);
}

function renderHistory(history) {
  const chart = document.getElementById("historyChart");
  const empty = document.getElementById("historyEmpty");

  if (!history.length) {
    empty.classList.remove("hidden");
    return;
  }

  const prices = history.map(item => item.price).filter(Number.isFinite);
  const max = Math.max(...prices, 1);

  history.slice(-12).forEach(item => {
    const row = document.createElement("div");
    row.className = "history-row";

    const date = document.createElement("time");
    date.dateTime = new Date(item.checkedAt).toISOString();
    date.textContent = new Intl.DateTimeFormat("pl-PL", { dateStyle: "medium" }).format(item.checkedAt);

    const track = document.createElement("div");
    track.className = "history-track";
    const bar = document.createElement("span");
    bar.style.width = `${Math.max(4, item.price / max * 100)}%`;
    track.appendChild(bar);

    const price = document.createElement("strong");
    price.textContent = formatPrice(item.price);
    row.append(date, track, price);
    chart.appendChild(row);
  });
}

function renderGame(game, history) {
  document.title = `${game.name} - cena i historia | GameDeals`;
  document.querySelector('meta[name="description"]').content =
    `${game.name}: aktualna cena, rabat, szczegóły i historia zmian ceny w GameDeals.`;

  const image = document.getElementById("gameImage");
  image.src = game.image || `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appid}/header.jpg`;
  image.alt = `Okładka gry ${game.name}`;
  image.addEventListener("error", () => image.closest(".game-detail-image").classList.add("image-missing"));

  document.getElementById("gameTitle").textContent = game.name;
  document.getElementById("gameDescription").textContent =
    game.description || "Steam nie udostępnił krótkiego opisu tej gry.";
  document.getElementById("gamePrice").innerHTML = priceMarkup(game);
  document.getElementById("steamLink").href = `https://store.steampowered.com/app/${game.appid}`;
  document.getElementById("gameVerdict").textContent = buildVerdict(game, history);

  const discount = document.getElementById("gameDiscount");
  if (game.price?.discount > 0) {
    discount.textContent = `-${game.price.discount}%`;
    discount.classList.remove("hidden");
  }

  const tags = document.getElementById("gameTags");
  (game.genres || []).slice(0, 5).forEach(genre => {
    const tag = document.createElement("span");
    tag.textContent = genre;
    tags.appendChild(tag);
  });

  addFact("Premiera", game.comingSoon ? "Wkrótce" : game.releaseDate);
  addFact("Producent", (game.developers || []).join(", "));
  addFact("Wydawca", (game.publishers || []).join(", "));
  addFact("Platformy", (game.platforms || []).map(name => name === "windows" ? "Windows" : name === "mac" ? "macOS" : "Linux").join(", "));
  addFact("Metacritic", game.metacritic ? `${game.metacritic}/100` : null);
  addFact("Rekomendacje Steam", game.recommendations?.toLocaleString("pl-PL"));

  renderHistory(history);
  loadingBox.classList.add("hidden");
  details.classList.remove("hidden");
}

async function loadGame() {
  if (!Number.isInteger(appid) || appid <= 0) {
    loadingBox.classList.add("hidden");
    errorBox.textContent = "Nieprawidłowy adres strony gry.";
    errorBox.classList.remove("hidden");
    return;
  }

  try {
    const response = await fetch(`/api/game/${appid}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Nie udało się znaleźć gry.");
    }

    renderGame(data.game, data.history);
  } catch (error) {
    loadingBox.classList.add("hidden");
    errorBox.textContent = `❌ ${error.message}`;
    errorBox.classList.remove("hidden");
  }
}

loadGame();
