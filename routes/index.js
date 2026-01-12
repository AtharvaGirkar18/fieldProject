const express = require("express");
const router = express.Router();

// POST route for setting the language
router.post("/set-language", (req, res) => {
  const lang = req.body.lang || "en";
  res.cookie("locale", lang);
  res.redirect("back"); // Go back to previous page
});

// Root route (index page)
router.get("/", (req, res) => {
  const locale = req.cookies.locale || "en";
  res.render("index", { currentPage: "index", locale });
});

module.exports = router;
