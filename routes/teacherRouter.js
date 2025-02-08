const express = require("express");

const teacherRouter = express.Router();

const { getSubmitLec } = require("../controllers/teacherController");

teacherRouter.get("/lecture", getSubmitLec);

module.exports = teacherRouter;
