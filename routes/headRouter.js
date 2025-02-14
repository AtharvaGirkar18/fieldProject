const express = require("express");

const headRouter = express.Router();
const {
  getCoordinators,
  getAddCoordinator,
  postAddCoordinator,
  getCoordinatorReport,
} = require("../controllers/headController");

headRouter.get("/headHome", getCoordinators);
headRouter.get("/addCoordinator", getAddCoordinator);
headRouter.post("/headHome", postAddCoordinator);
headRouter.get("/coordinatorReport/:id", getCoordinatorReport);

module.exports = headRouter;
