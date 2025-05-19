// ========================
// Admin Login Handling
// ========================
document.addEventListener("DOMContentLoaded", function () {
  const adminForm = document.getElementById("adminLoginForm");
  if (adminForm) {
    adminForm.addEventListener("submit", async function (event) {
      event.preventDefault();

      const email = document.getElementById("adminEmail").value.trim();
      const password = document.getElementById("adminPassword").value.trim();

      const response = await fetch("/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const result = await response.json();

      if (response.ok) {
        localStorage.setItem("adminToken", result.token);
        window.location.href = "/admin-dashboard.html";
      } else {
        alert(result.message || "Login failed. Please try again.");
      }
    });
  }

  // ========================
  // Contact Form Handling
  // ========================
  const contactForm = document.getElementById("contactForm");
  if (contactForm) {
    contactForm.addEventListener("submit", function (event) {
      event.preventDefault();

      const name = document.getElementById("name").value.trim();
      const email = document.getElementById("email").value.trim();
      const message = document.getElementById("message").value.trim();
      const responseMessage = document.getElementById("responseMessage");

      if (!name || !email || !message) {
        responseMessage.textContent = "Please fill in all fields.";
        responseMessage.style.color = "red";
        return;
      }

      // Example: log to console, or send to backend later
      console.log("Contact Form Submitted:", { name, email, message });

      responseMessage.textContent = "Thank you for contacting us!";
      responseMessage.style.color = "green";

      // Optional: clear the form
      contactForm.reset();
    });
  }
});
