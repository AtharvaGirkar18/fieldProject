const express = require("express");
const { getLoginPage, postLogin } = require("../controllers/authController");

const authRouter = express.Router();

// GET login page (with role)
authRouter.get("/login", getLoginPage);

// POST login form submission
authRouter.post("/login", postLogin);

module.exports = authRouter;
