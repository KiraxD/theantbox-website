const navLinks = Array.from(document.querySelectorAll("[data-view-target]"));
const panels = Array.from(document.querySelectorAll(".panel-view"));
const jumpButtons = Array.from(document.querySelectorAll("[data-view-jump]"));
const sidebar = document.getElementById("sidebar");
const sidebarToggle = document.getElementById("sidebar-toggle");
const todayLabel = document.getElementById("today-label");
const clockLabel = document.getElementById("clock-label");
const globalSearch = document.getElementById("global-search");
const searchableItems = Array.from(document.querySelectorAll(".searchable"));
const attendanceToggle = document.getElementById("attendance-toggle");
const attendanceStatus = document.getElementById("attendance-status");
const attendanceNote = document.getElementById("attendance-note");

function setActiveView(viewName) {
  navLinks.forEach((link) => {
    link.classList.toggle("is-active", link.dataset.viewTarget === viewName);
  });

  panels.forEach((panel) => {
    panel.classList.toggle("is-visible", panel.dataset.view === viewName);
  });

  window.location.hash = viewName;
}

function syncClock() {
  const now = new Date();
  todayLabel.textContent = now.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
  clockLabel.textContent = now.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function runSearch(term) {
  const query = term.trim().toLowerCase();

  searchableItems.forEach((item) => {
    const text = item.textContent.toLowerCase();
    const shouldHide = query && !text.includes(query);
    item.classList.toggle("is-hidden-by-search", shouldHide);
  });
}

function toggleAttendance() {
  const checkedIn = attendanceToggle.dataset.state === "in";
  const now = new Date();

  if (checkedIn) {
    attendanceToggle.dataset.state = "out";
    attendanceToggle.textContent = "Check in";
    attendanceStatus.textContent = "Checked out";
    attendanceNote.textContent = `Checked out at ${now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}.`;
    return;
  }

  attendanceToggle.dataset.state = "in";
  attendanceToggle.textContent = "Check out";
  attendanceStatus.textContent = "Checked in";
  attendanceNote.textContent = `Checked in at ${now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}.`;
}

navLinks.forEach((link) => {
  link.addEventListener("click", () => {
    setActiveView(link.dataset.viewTarget);

    if (window.innerWidth <= 1180) {
      sidebar.classList.remove("is-open");
      sidebarToggle.setAttribute("aria-expanded", "false");
    }
  });
});

jumpButtons.forEach((button) => {
  button.addEventListener("click", () => setActiveView(button.dataset.viewJump));
});

sidebarToggle?.addEventListener("click", () => {
  const isOpen = sidebar.classList.toggle("is-open");
  sidebarToggle.setAttribute("aria-expanded", String(isOpen));
});

globalSearch?.addEventListener("input", (event) => {
  runSearch(event.target.value);
});

attendanceToggle?.addEventListener("click", toggleAttendance);

const initialView = window.location.hash.replace("#", "") || "overview";
setActiveView(
  navLinks.some((link) => link.dataset.viewTarget === initialView) ? initialView : "overview"
);
syncClock();
setInterval(syncClock, 1000);
