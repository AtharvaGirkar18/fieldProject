const path = require("path");
const fs = require("fs");

// Load translation files
const translations = {
  en: require(path.join(__dirname, "../locales/en.json")),
  hi: require(path.join(__dirname, "../locales/hi.json")),
};

/**
 * Middleware to add translation function to res.locals
 */
function translationMiddleware(req, res, next) {
  const locale = req.cookies.locale || req.query.lang || "en";

  // Set the locale
  res.locals.locale = locale;

  // Add translation function that uses JSON files
  res.locals.__ = function (text) {
    // Look up translation in the locale file
    if (translations[locale] && translations[locale][text]) {
      return translations[locale][text];
    }

    // If translation not found, return original text
    return text;
  };

  next();
}

module.exports = {
  translationMiddleware,
};
