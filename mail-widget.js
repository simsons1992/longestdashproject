// Opens a new email via a mailto: link. This hands off to whatever the OS
// has set as the default mail handler — for it to actually be Outlook
// desktop, Outlook needs to be that machine's default mail app.

const DEFAULT_SUBJECT = "Veho priekšapmaksas rēķins";
const DEFAULT_BODY = "Labdien, nosūtam priekšapmaksas rēķinu par pasūtījumu:";

function initMailWidget() {
  const button = document.getElementById("compose-email-btn");
  if (!button) return;

  button.addEventListener("click", () => {
    const subject = encodeURIComponent(DEFAULT_SUBJECT);
    const body = encodeURIComponent(DEFAULT_BODY);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  });
}

export { initMailWidget };