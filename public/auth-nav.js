async function updateAccountNav() {

  const link =
    document.getElementById(
      "accountNav"
    );


  if (!link) {
    return;
  }


  try {

    const response =
      await fetch(
        "/api/auth/me"
      );


    const data =
      await response.json();


    if (
      data.loggedIn
    ) {

      link.textContent =
        `👤 ${data.user.username}`;

      link.href =
        "/account.html";

    }

    else {

      link.textContent =
        "👤 Zaloguj";

      link.href =
        "/login.html";

    }

  }

  catch {}

}


updateAccountNav();