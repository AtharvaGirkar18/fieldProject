const express = require("express");
const cloudinary = require("cloudinary").v2;

const { getLoginPage, postLogin } = require("../controllers/authController");
const passport = require("passport");

const authRouter = express.Router();
const Head = require("../models/head.js");

const {HeadStorage} = require("../cloudConfig.js");
const multer = require('multer');
const upload = multer({storage: HeadStorage}); 

// GET login page (with role)
authRouter.get("/login/teacher", (req, res) => {
    res.render("auth/authTeacher", { error: null });
});

authRouter.get("/login/coordinator", (req, res) => {
    res.render("auth/authCoordinator", { error: null });
});

authRouter.get("/login/head", (req, res) => {
    res.render("auth/authHead", { error: null });
});

// POST login form submission
authRouter.post("/login/teacher", passport.authenticate("teacher", {failureRedirect: "/login/teacher"}), (req, res) => {
    req.session.save((err) => {
        if (err) {
            return res.redirect("/");
        }
        res.redirect("/teacher/lecture");
    });
});

authRouter.post("/login/coordinator", passport.authenticate("coordinator", {failureRedirect: "/login/coordinator"}), (req, res) => {
    req.session.save((err) => {
        if (err) {
            return res.redirect("/");
        }
        res.redirect("/coordinator/coordHome");
    });
});

authRouter.post("/login/head", passport.authenticate("head", {failureRedirect: "/login/head"}), (req, res) => {
    req.session.save((err) => {
        if (err) {
            return res.redirect("/");
        }
        res.redirect("/head/headHome");
    });
});

authRouter.get("/newHead", (req, res) => {
    res.render("auth/addHead", { currentPage: "addHead" });
});

authRouter.post("/newHead", upload.single('photo'), async (req, res) => {
    let {headName, password} = req.body;
    let {path, fieldname} = req.file;
    try {
        const newHead = new Head({picture: {fieldname: fieldname, path: path}, username: headName});
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

module.exports = authRouter;
