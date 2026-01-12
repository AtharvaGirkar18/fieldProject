const express = require("express");
const cloudinary = require("cloudinary").v2;

const { getLoginPage, postLogin } = require("../controllers/authController");
const passport = require("passport");

const authRouter = express.Router();
const Head = require("../models/head.js");

const { HeadStorage } = require("../cloudConfig.js");
const multer = require("multer");
const upload = multer({ storage: HeadStorage });

// GET login page (with role)
authRouter.get("/login/teacher", (req, res) => {
  const locale = req.cookies.locale || "en";
  res.render("auth/authTeacher", { error: null, locale });
});

authRouter.get("/login/coordinator", (req, res) => {
  const locale = req.cookies.locale || "en";
  res.render("auth/authCoordinator", { error: null, locale });
});

authRouter.get("/login/head", (req, res) => {
  const locale = req.cookies.locale || "en";
  res.render("auth/authHead", { error: null, locale });
});

// POST login form submission
authRouter.post("/login/teacher", (req, res, next) => {
  passport.authenticate("teacher", (err, user, info) => {
    if (err) {
      return next(err);
    }
    if (!user) {
      const locale = req.cookies.locale || "en";
      return res.render("auth/authTeacher", {
        error: "Invalid username or password",
        locale,
      });
    }
    req.logIn(user, (err) => {
      if (err) {
        return next(err);
      }
      req.session.save((err) => {
        if (err) {
          return res.redirect("/");
        }
        return res.redirect("/teacher/home");
      });
    });
  })(req, res, next);
});

authRouter.post("/login/coordinator", (req, res, next) => {
  passport.authenticate("coordinator", (err, user, info) => {
    if (err) {
      return next(err);
    }
    if (!user) {
      const locale = req.cookies.locale || "en";
      return res.render("auth/authCoordinator", {
        error: "Invalid username or password",
        locale,
      });
    }
    req.logIn(user, (err) => {
      if (err) {
        return next(err);
      }
      req.session.save((err) => {
        if (err) {
          return res.redirect("/");
        }
        return res.redirect("/coordinator/coordHome");
      });
    });
  })(req, res, next);
});

authRouter.post("/login/head", (req, res, next) => {
  passport.authenticate("head", (err, user, info) => {
    if (err) {
      return next(err);
    }
    if (!user) {
      const locale = req.cookies.locale || "en";
      return res.render("auth/authHead", {
        error: "Invalid username or password",
        locale,
      });
    }
    req.logIn(user, (err) => {
      if (err) {
        return next(err);
      }
      req.session.save((err) => {
        if (err) {
          return res.redirect("/");
        }
        return res.redirect("/head/headHome");
      });
    });
  })(req, res, next);
});

authRouter.get("/newHead", (req, res) => {
  res.render("auth/addHead", { currentPage: "addHead" });
});

authRouter.post("/newHead", upload.single("photo"), async (req, res) => {
  let { headName, password } = req.body;

  // Handle optional file upload with default picture
  let picture = { path: "", fieldname: "" };
  if (req.file) {
    picture = { path: req.file.path, fieldname: req.file.fieldname };
  }

  try {
    const newHead = new Head({
      picture: picture,
      username: headName,
    });
    const registeredHead = await Head.register(newHead, password);
    if (registeredHead) {
      res.redirect("/");
    } else {
      res.redirect("/auth/newhead");
    }
  } catch (error) {
    console.error("Error registering Head:", error);
  }
});

// Logout route
authRouter.get("/logout", (req, res) => {
  req.logout((err) => {
    if (err) {
      console.error("Logout error:", err);
      return res.redirect("/");
    }
    req.session.destroy((err) => {
      if (err) {
        console.error("Session destroy error:", err);
      }
      res.redirect("/");
    });
  });
});

module.exports = authRouter;
