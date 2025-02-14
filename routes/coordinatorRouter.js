const express = require("express");

const coordinatorRouter = express.Router();

const {
  getTeachers,
  getAddTeacher,
  postAddTeacher,
  getTeacherDetails,
  getTeacherReport,
  getLectureDetails,
} = require("../controllers/coordinatorController");

coordinatorRouter.get("/coordHome", getTeachers);

coordinatorRouter.get("/addTeacher", getAddTeacher);
coordinatorRouter.post("/coordHome", postAddTeacher);

coordinatorRouter.get("/teacherDetails/:id", getTeacherDetails);

coordinatorRouter.get("/report/:id", getTeacherReport);

coordinatorRouter.get("/lectureDetails/:id", getLectureDetails);

module.exports = coordinatorRouter;
