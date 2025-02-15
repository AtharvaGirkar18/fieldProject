const express = require("express");

const headRouter = express.Router();
const {
  getCoordinators,
  getAddCoordinator,
  postAddCoordinator,
  getCoordinatorReport,
  getLectureDetails,
} = require("../controllers/headController");

headRouter.get("/headHome", getCoordinators);
headRouter.get("/addCoordinator", getAddCoordinator);
headRouter.post("/headHome", postAddCoordinator);
headRouter.get("/coordinatorReport/:id", getCoordinatorReport);
headRouter.get("/lectureDetails/:id", getLectureDetails);

module.exports = headRouter;
