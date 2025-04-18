const express = require("express");
const router = express.Router();

// POST route for setting the language
router.post("/set-language", (req, res) => {
  const lang = req.body.lang || "en";
  res.cookie("locale", lang); // Must match i18n cookie name
  res.setLocale(lang); // Applies to current request
  res.redirect("back"); // Go back to previous page
});

// Root route (index page)
router.get("/", (req, res) => {
  res.render("index", { currentPage: "index", locale: req.getLocale() });
});

module.exports = router;
