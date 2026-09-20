const loginTab =
  document.getElementById(
    "loginTab"
  );

const registerTab =
  document.getElementById(
    "registerTab"
  );

const loginPanel =
  document.getElementById(
    "loginPanel"
  );

const registerPanel =
  document.getElementById(
    "registerPanel"
  );

const loginMessage =
  document.getElementById(
    "loginMessage"
  );

const registerMessage =
  document.getElementById(
    "registerMessage"
  );


// ======================================================
// PARAMETRY Z LINKU AKTYWACYJNEGO
// ======================================================

const params =
  new URLSearchParams(
    window.location.search
  );


const verification =
  params.get(
    "verification"
  );


if (
  verification ===
  "success"
) {

  loginMessage.textContent =
    "✅ E-mail został potwierdzony. Możesz się zalogować.";

  loginMessage.classList.add(
    "success"
  );

}


if (
  verification ===
  "expired"
) {

  loginMessage.textContent =
    "⌛ Link aktywacyjny wygasł. Wyślij nowy link poniżej.";

}


if (
  verification ===
  "invalid"
) {

  loginMessage.textContent =
    "❌ Link aktywacyjny jest nieprawidłowy.";

}


// ======================================================
// TABS
// ======================================================

loginTab.addEventListener(
  "click",

  () => {

    loginTab.classList.add(
      "active"
    );

    registerTab.classList.remove(
      "active"
    );

    loginPanel.classList.remove(
      "hidden"
    );

    registerPanel.classList.add(
      "hidden"
    );

  }
);


registerTab.addEventListener(
  "click",

  () => {

    registerTab.classList.add(
      "active"
    );

    loginTab.classList.remove(
      "active"
    );

    registerPanel.classList.remove(
      "hidden"
    );

    loginPanel.classList.add(
      "hidden"
    );

  }
);


// ======================================================
// LOGIN
// ======================================================

document
  .getElementById(
    "loginForm"
  )
  .addEventListener(
    "submit",

    async event => {

      event.preventDefault();


      loginMessage.classList.remove(
        "success"
      );


      loginMessage.textContent =
        "⏳ Logowanie...";


      try {

        const response =
          await fetch(
            "/api/auth/login",
            {

              method:
                "POST",

              headers: {
                "Content-Type":
                  "application/json"
              },

              body:
                JSON.stringify({

                  login:
                    document
                      .getElementById(
                        "login"
                      )
                      .value,

                  password:
                    document
                      .getElementById(
                        "loginPassword"
                      )
                      .value

                })

            }
          );


        const data =
          await response.json();


        if (!response.ok) {

          loginMessage.textContent =
            "❌ " +
            data.error;

          return;

        }


        window.location.href =
          "/account.html";

      }

      catch {

        loginMessage.textContent =
          "❌ Błąd połączenia z serwerem.";

      }

    }
  );


// ======================================================
// REGISTER
// ======================================================

document
  .getElementById(
    "registerForm"
  )
  .addEventListener(
    "submit",

    async event => {

      event.preventDefault();


      registerMessage
        .classList
        .remove(
          "success"
        );


      registerMessage.textContent =
        "⏳ Tworzę konto i wysyłam e-mail...";


      try {

        const response =
          await fetch(
            "/api/auth/register",
            {

              method:
                "POST",

              headers: {
                "Content-Type":
                  "application/json"
              },

              body:
                JSON.stringify({

                  username:
                    document
                      .getElementById(
                        "registerUsername"
                      )
                      .value,

                  email:
                    document
                      .getElementById(
                        "registerEmail"
                      )
                      .value,

                  password:
                    document
                      .getElementById(
                        "registerPassword"
                      )
                      .value

                })

            }
          );


        const data =
          await response.json();


        if (!response.ok) {

          registerMessage.textContent =
            "❌ " +
            data.error;

          return;

        }


        registerMessage
          .classList
          .add(
            "success"
          );


        registerMessage.textContent =
          "✅ " +
          data.message;


        document
          .getElementById(
            "registerForm"
          )
          .reset();

      }

      catch {

        registerMessage.textContent =
          "❌ Błąd połączenia z serwerem.";

      }

    }
  );


// ======================================================
// RESEND VERIFICATION
// ======================================================

const resendForm =
  document.getElementById(
    "resendForm"
  );


if (resendForm) {

  resendForm.addEventListener(
    "submit",

    async event => {

      event.preventDefault();


      const message =
        document.getElementById(
          "resendMessage"
        );


      message.textContent =
        "⏳ Wysyłam...";


      try {

        const response =
          await fetch(
            "/api/auth/resend-verification",
            {

              method:
                "POST",

              headers: {
                "Content-Type":
                  "application/json"
              },

              body:
                JSON.stringify({

                  email:
                    document
                      .getElementById(
                        "resendEmail"
                      )
                      .value

                })

            }
          );


        const data =
          await response.json();


        if (!response.ok) {

          message.textContent =
            "❌ " +
            data.error;

          return;

        }


        message.classList.add(
          "success"
        );


        message.textContent =
          "✅ " +
          data.message;

      }

      catch {

        message.textContent =
          "❌ Błąd połączenia.";

      }

    }
  );

}


// ======================================================
// JEŚLI JUŻ ZALOGOWANY
// ======================================================

async function checkLogin() {

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

      window.location.href =
        "/account.html";

    }

  }

  catch {}

}


checkLogin();