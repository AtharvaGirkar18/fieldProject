const express = require("express");

const teacherRouter = express.Router();
const Teacher = require("../models/teacher.js");
const TeacherReport = require("../models/teacherReport.js");
const teacherController = require("../controllers/teacherController.js");

const { LectureStorage, AttendanceStorage } = require("../cloudConfig.js");
const multer = require("multer");
const upload = multer({ storage: LectureStorage, limits: { files: 5 } });
const attendanceUpload = multer({ storage: AttendanceStorage });

// Add authentication middleware
const isAuthenticated = (req, res, next) => {
  if (req.isAuthenticated() && req.user.constructor.modelName === "Teacher") {
    return next();
  }
  res.redirect("/auth/login/teacher");
};

// Apply middleware to all teacher routes
teacherRouter.use(isAuthenticated);

// Home routes
teacherRouter.get("/home", teacherController.renderHome);

// Add student routes
teacherRouter.get("/addStudent", teacherController.renderAddStudent);
teacherRouter.post("/add-student", teacherController.addStudent);

// Delete student routes
teacherRouter.get("/deleteStudent", teacherController.renderDeleteStudent);
teacherRouter.delete(
  "/delete-student/:studentId",
  teacherController.deleteStudent,
);

// Attendance routes
teacherRouter.get("/attendance", teacherController.renderAttendance);
teacherRouter.post(
  "/attendance/upload",
  attendanceUpload.single("attendancePhoto"),
  teacherController.uploadAttendance,
);

// Report routes
teacherRouter.get("/report", teacherController.renderReport);

teacherRouter.get("/lecture", async (req, res) => {
  try {
    const { username, picture } = req.user;
    const path = picture.path;
    const teacher = await Teacher.findById(req.user._id).populate("students");

    res.render("teacher/lecture", {
      username,
      path,
      currentPage: "lecture",
      students: teacher.students || [],
      locale: req.cookies.locale || "en",
    });
  } catch (error) {
    console.error("Error loading lecture page:", error);
    res.status(500).send("Error loading page");
  }
});

teacherRouter.post(
  "/lecture",
  upload.fields([{ name: "images", maxCount: 5 }]),
  async (req, res) => {
    try {
      if (!req.files || !req.files.images || req.files.images.length === 0) {
        return res.status(400).send("At least one image is required");
      }

      const {
        date,
        time,
        address,
        attendance,
        activity,
        teacherPresent,
        studentAttendance,
      } = req.body;
      const { username, _id: teacherId } = req.user;

      const teacher = await Teacher.findOne({ username }).populate("students");
      if (!teacher) {
        return res.status(404).send("Teacher not found");
      }

      // Process student attendance
      const studentAttendanceArray = [];
      const presentStudentIds = Array.isArray(studentAttendance)
        ? studentAttendance
        : studentAttendance
          ? [studentAttendance]
          : [];

      // Create attendance records for all students
      teacher.students.forEach((student) => {
        studentAttendanceArray.push({
          student: student._id,
          present: presentStudentIds.includes(student._id.toString()),
        });
      });

      const report = {
        date: new Date(date),
        time: new Date(`${date}T${time}`),
        address,
        attendance,
        attendanceCount: presentStudentIds.length,
        teacherPresent: teacherPresent === "on",
        studentAttendance: studentAttendanceArray,
        activity,
        images: req.files.images.map((file) => ({
          fieldname: file.fieldname,
          path: file.path,
        })),
        teacher: teacher._id,
      };

      const newReport = new TeacherReport(report);
      const savedReport = await newReport.save();

      if (savedReport) {
        res.redirect("/teacher/home");
      } else {
        res.redirect("/teacher/lecture");
      }
    } catch (error) {
      console.error("Error submitting lecture report:", error);
      res.status(500).send("Error submitting report");
    }
  },
);

module.exports = teacherRouter;
