async function loadAccount() {

  const response =
    await fetch(
      "/api/auth/me"
    );


  const data =
    await response.json();


  if (
    !data.loggedIn
  ) {

    window.location.href =
      "/login.html";

    return;

  }


  document
    .getElementById(
      "username"
    )
    .textContent =
      data.user.username;


  document
    .getElementById(
      "email"
    )
    .textContent =
      data.user.email;


  document
    .getElementById(
      "created"
    )
    .textContent =
      "Konto utworzone: " +
      new Date(
        data.user.createdAt
      ).toLocaleDateString(
        "pl-PL"
      );


  loadWatchlist();

}


async function loadWatchlist() {

  const response =
    await fetch(
      "/api/watchlist"
    );


  if (!response.ok) {
    return;
  }


  const games =
    await response.json();


  const container =
    document.getElementById(
      "watchlist"
    );


  container.innerHTML =
    "";


  if (
    games.length === 0
  ) {

    container.innerHTML = `

      <div class="empty-watchlist">

        <div class="empty-icon">
          ❤️
        </div>

        <h3>
          Jeszcze niczego nie obserwujesz
        </h3>

        <p>
          Niedługo dodamy przycisk
          „Obserwuj” na stronie każdej gry.
        </p>

        <a
          href="/"
          class="account-button"
        >
          Przeglądaj gry
        </a>

      </div>

    `;

    return;

  }


  games.forEach(
    game => {

      const item =
        document.createElement(
          "div"
        );


      let price =
        "Brak ceny";


      if (
        game.final_price !==
        null
      ) {

        price =
          (
            game.final_price /
            100
          )
            .toFixed(2)
            .replace(
              ".",
              ","
            ) +
          " zł";

      }


      item.className =
        "watch-item";


      item.innerHTML = `

        <img
          src="${game.image || ""}"
          alt=""
        >

        <div>

          <strong>
            ${game.name || "Gra"}
          </strong>

          <div class="watch-price">
            ${price}
          </div>

        </div>

      `;


      container.appendChild(
        item
      );

    }
  );

}


document
  .getElementById(
    "logoutButton"
  )
  .addEventListener(
    "click",

    async () => {

      await fetch(
        "/api/auth/logout",
        {
          method:
            "POST"
        }
      );


      window.location.href =
        "/";

    }

  );


loadAccount();