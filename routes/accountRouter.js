const express = require("express");
const accountRouter = express.Router();
const Teacher = require("../models/teacher");
const Coordinator = require("../models/coordinator");
const Head = require("../models/head");
const {
  TeacherStorage,
  CoordinatorStorage,
  HeadStorage,
} = require("../cloudConfig");
const multer = require("multer");

// Middleware to check if user is authenticated
const isLoggedIn = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect("/");
};

// Middleware to determine user role and storage
const getUserModelAndStorage = (req) => {
  const role = req.user.constructor.modelName;
  let Model, storage;

  switch (role) {
    case "Teacher":
      Model = Teacher;
      storage = TeacherStorage;
      break;
    case "Coordinator":
      Model = Coordinator;
      storage = CoordinatorStorage;
      break;
    case "Head":
      Model = Head;
      storage = HeadStorage;
      break;
    default:
      throw new Error("Invalid user role");
  }

  return { Model, storage, role };
};

// GET account settings page
accountRouter.get("/settings", isLoggedIn, async (req, res) => {
  try {
    const { Model } = getUserModelAndStorage(req);
    const currUser = await Model.findById(req.user._id);

    res.render("accountSettings", {
      currUser,
      currentPage: "accountSettings",
      error: null,
      success: null,
    });
  } catch (error) {
    console.error("Error loading account settings:", error);
    res.redirect("/");
  }
});

// POST update profile picture
accountRouter.post("/update-picture", isLoggedIn, async (req, res) => {
  try {
    const { Model, storage } = getUserModelAndStorage(req);
    const upload = multer({ storage }).single("photo");

    upload(req, res, async (err) => {
      if (err) {
        const currUser = await Model.findById(req.user._id);
        return res.render("accountSettings", {
          currUser,
          currentPage: "accountSettings",
          error: "Error uploading file",
          success: null,
        });
      }

      if (!req.file) {
        const currUser = await Model.findById(req.user._id);
        return res.render("accountSettings", {
          currUser,
          currentPage: "accountSettings",
          error: "Please select an image file",
          success: null,
        });
      }

      const { path, fieldname } = req.file;
      await Model.findByIdAndUpdate(req.user._id, {
        picture: { fieldname, path },
      });

      const currUser = await Model.findById(req.user._id);
      res.render("accountSettings", {
        currUser,
        currentPage: "accountSettings",
        error: null,
        success: "Profile picture updated successfully!",
      });
    });
  } catch (error) {
    console.error("Error updating profile picture:", error);
    const { Model } = getUserModelAndStorage(req);
    const currUser = await Model.findById(req.user._id);
    res.render("accountSettings", {
      currUser,
      currentPage: "accountSettings",
      error: "An error occurred while updating your profile picture",
      success: null,
    });
  }
});

// POST update username
accountRouter.post("/update-username", isLoggedIn, async (req, res) => {
  try {
    const { Model } = getUserModelAndStorage(req);
    const { newUsername } = req.body;

    if (!newUsername || newUsername.trim() === "") {
      const currUser = await Model.findById(req.user._id);
      return res.render("accountSettings", {
        currUser,
        currentPage: "accountSettings",
        error: "Username cannot be empty",
        success: null,
      });
    }

    // Check if username already exists
    const existingUser = await Model.findOne({ username: newUsername });
    if (
      existingUser &&
      existingUser._id.toString() !== req.user._id.toString()
    ) {
      const currUser = await Model.findById(req.user._id);
      return res.render("accountSettings", {
        currUser,
        currentPage: "accountSettings",
        error: "Username already taken",
        success: null,
      });
    }

    await Model.findByIdAndUpdate(req.user._id, { username: newUsername });

    const currUser = await Model.findById(req.user._id);
    res.render("accountSettings", {
      currUser,
      currentPage: "accountSettings",
      error: null,
      success: "Username updated successfully!",
    });
  } catch (error) {
    console.error("Error updating username:", error);
    const { Model } = getUserModelAndStorage(req);
    const currUser = await Model.findById(req.user._id);
    res.render("accountSettings", {
      currUser,
      currentPage: "accountSettings",
      error: "An error occurred while updating your username",
      success: null,
    });
  }
});

// POST update password
accountRouter.post("/update-password", isLoggedIn, async (req, res) => {
  try {
    const { Model } = getUserModelAndStorage(req);
    const { oldPassword, newPassword, confirmPassword } = req.body;

    if (newPassword !== confirmPassword) {
      const currUser = await Model.findById(req.user._id);
      return res.render("accountSettings", {
        currUser,
        currentPage: "accountSettings",
        error: "New passwords do not match",
        success: null,
      });
    }

    if (newPassword.length < 6) {
      const currUser = await Model.findById(req.user._id);
      return res.render("accountSettings", {
        currUser,
        currentPage: "accountSettings",
        error: "Password must be at least 6 characters long",
        success: null,
      });
    }

    const user = await Model.findById(req.user._id);

    // Change password using passport-local-mongoose method
    user.changePassword(oldPassword, newPassword, async (err) => {
      const currUser = await Model.findById(req.user._id);

      if (err) {
        console.error("Password change error:", err);
        return res.render("accountSettings", {
          currUser,
          currentPage: "accountSettings",
          error: err.message || "Incorrect current password",
          success: null,
        });
      }

      res.render("accountSettings", {
        currUser,
        currentPage: "accountSettings",
        error: null,
        success: "Password changed successfully!",
      });
    });
  } catch (error) {
    console.error("Error changing password:", error);
    const { Model } = getUserModelAndStorage(req);
    const currUser = await Model.findById(req.user._id);
    res.render("accountSettings", {
      currUser,
      currentPage: "accountSettings",
      error: "An error occurred while changing your password",
      success: null,
    });
  }
});

module.exports = accountRouter;
