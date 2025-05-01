const express = require("express");
const cloudinary = require("cloudinary").v2;

const coordinatorRouter = express.Router();

const {
  getTeachers,
  getAddTeacher,
  postAddTeacher,
  getTeacherDetails,
  getTeacherReport,
  getLectureDetails,
} = require("../controllers/coordinatorController");

const { TeacherStorage } = require("../cloudConfig.js");
const multer = require('multer');
const upload = multer({ storage: TeacherStorage });

const Teacher = require("../models/teacher.js");
const Coordinator = require("../models/coordinator.js");
const TeacherReport = require("../models/teacherReport.js");
const CoordReport = require("../models/coordinatorReport.js");

// Add authentication middleware
const isAuthenticated = (req, res, next) => {
  if (req.isAuthenticated() && req.user.constructor.modelName === 'Coordinator') {
    return next();
  }
  res.redirect("/auth/login/coordinator");
};

// Apply middleware to all coordinator routes
coordinatorRouter.use(isAuthenticated);

coordinatorRouter.get("/coordHome", async (req, res) => {
  const { username } = req.user;
  const currUser = await Coordinator.findOne({ username }).populate("teachers");
  res.render("coordinator/coordHome", { currUser, currentPage: "coordHome" });
});

coordinatorRouter.get("/addTeacher", (req, res) => {
  res.render("coordinator/addTeacher", { currentPage: "addTeacher" });
});

coordinatorRouter.post("/addTeacher", upload.single('photo'), async (req, res) => {
  const currUser = req.user;
  let { teacherName, password } = req.body;
  let { path, fieldname } = req.file;
  try {
    const newTeacher = new Teacher({ picture: { path, fieldname }, username: teacherName });
    const registeredTeacher = await Teacher.register(newTeacher, password);
    currUser.teachers.push(registeredTeacher);
    await currUser.save();
    res.redirect("/coordinator/coordHome");
  } catch (error) {
    res.send(error);
  }
});

coordinatorRouter.get("/teacherDetails/:id", async (req, res) => {
  const currUser = req.user;
  const currTeacher = await Teacher.findById(req.params.id);
  const teacherReports = await TeacherReport.find({ teacher: req.params.id });
  res.render("coordinator/teacherDetails", {
    currUser,
    teacher: currTeacher,
    lectures: teacherReports,
    currentPage: "teacherDetails",
  });
});

coordinatorRouter.get("/delete/:id", async (req, res) => {
  try {
    const teacherId = req.params.id;
    const currUser = req.user;

    // Remove teacher reference from coordinator's teachers array
    currUser.teachers = currUser.teachers.filter(
      (teacher) => teacher.toString() != teacherId
    );
    const newUser = await currUser.save();

    if (newUser) {
      // Delete the teacher
      const delTeacher = await Teacher.findByIdAndDelete(teacherId);
      if (delTeacher && delTeacher.picture) {
        // Delete profile image from Cloudinary
        const publicId = delTeacher.picture.path.split('/').pop().split('.')[0];
        await cloudinary.uploader.destroy(`Teachers/${publicId}`);

        // First find all reports that will be deleted
        const reportsToDelete = await TeacherReport.find({ teacher: delTeacher._id });

        // Delete the reports
        await TeacherReport.deleteMany({ teacher: delTeacher._id });

        // Remove reports from coordinator's current day report
        if (newUser.coordReport && newUser.coordReport.teacherReports) {
          const reportIds = reportsToDelete.map(report => report._id.toString());
          newUser.coordReport.teacherReports = newUser.coordReport.teacherReports.filter(
            lecture => !reportIds.includes(lecture.tReportId.toString())
          );
          await newUser.save();
        }
      }
    }

    res.redirect("/coordinator/coordHome");
  } catch (error) {
    console.error(error);
    res.status(500).send("Error deleting teacher");
  }
});

coordinatorRouter.get("/reportadd/:id1/:id2", async (req, res) => {
  const currUser = req.user;
  const teacherId = req.params.id1;
  const teacherReportId = req.params.id2;

  const lecDetails = await TeacherReport.findById(teacherReportId).populate("teacher");
  const { teacher } = lecDetails;
  currUser.coordReport.teacherReports.push({
    tReportId: teacherReportId,
    teacher_name: teacher.username,
  });

  const today = new Date();
  const offset = today.getTimezoneOffset();
  const localDate = new Date(today.getTime() - (offset * 60 * 1000));
  currUser.coordReport.date = localDate.toISOString().split('T')[0];
  const updatedUser = await currUser.save();

  if (updatedUser) {
    res.redirect("/coordinator/report");
  } else {
    res.redirect(`/teacherDetails/${teacherId}`);
  }
});

coordinatorRouter.get("/report", async (req, res) => {
  const currUser = req.user;
  await currUser.populate('coordReport.teacherReports.tReportId');

  res.render("coordinator/report", {
    currUser,
    currentPage: "teacherReport",
  });
});

coordinatorRouter.get("/teacherDetails/:id1/delete/:id2", async (req, res) => {
  const currUser = req.user;
  const teacherId = req.params.id1;
  const teacherReportId = req.params.id2;
  const delReport = await TeacherReport.findByIdAndDelete(teacherReportId);
  if (delReport) {
    const publicId1 = delReport.entry_image.path.split('/').pop().split('.')[0];
    await cloudinary.uploader.destroy(`Lectures/${publicId1}`);

    for (const exitImage of delReport.exit_images) {
      const exitImageId = exitImage.path.split('/').pop().split('.')[0];
      await cloudinary.uploader.destroy(`Lectures/${exitImageId}`);
    }
  }

  // Remove report from the daily coordinator report if present
  if (delReport && currUser.coordReport && currUser.coordReport.teacherReports) {
    currUser.coordReport.teacherReports = currUser.coordReport.teacherReports.filter(
      (lecture) => lecture.tReportId.toString() !== teacherReportId
    );
    await currUser.save();
  }

  // Remove report reference from all coordinator reports
  if (delReport) {
    await CoordReport.updateMany(
      { teacherReports: { $in: [teacherReportId] } },
      { $pull: { teacherReports: teacherReportId } }
    );

    // Delete coordinator reports with empty teacherReports array 
    await CoordReport.deleteMany({ teacherReports: { $size: 0 } });
  }

  res.redirect(`/coordinator/teacherDetails/${teacherId}`);
});

coordinatorRouter.get("/teacherDetails/:id/clearReports", async (req, res) => {
  try {
    const currUser = req.user;
    const teacherId = req.params.id;

    // First fetch all reports for this teacher
    const reports = await TeacherReport.find({ teacher: teacherId });

    // Delete images from Cloudinary for each report
    for (const report of reports) {
      if (report.entry_image && report.entry_image.path) {
        const publicId1 = report.entry_image.path.split('/').pop().split('.')[0];
        await cloudinary.uploader.destroy(`Lectures/${publicId1}`);
      }

      if (report.exit_images) {
        for (const exitImage of report.exit_images) {
          const exitImageId = exitImage.path.split('/').pop().split('.')[0];
          await cloudinary.uploader.destroy(`Lectures/${exitImageId}`);
        }
      }

      // Remove report from the daily coordinator report if present
      currUser.coordReport.teacherReports = currUser.coordReport.teacherReports.filter(
        (lecture) => lecture.tReportId.toString() !== report._id.toString()
      );
      await currUser.save();

      // Remove report references from coordinator reports
      await CoordReport.updateMany(
        { teacherReports: { $in: [report._id] } },
        { $pull: { teacherReports: report._id } }
      );
    }

    // Delete coordinator reports with empty teacherReports array 
    await CoordReport.deleteMany({ teacherReports: { $size: 0 } });

    // Finally delete all reports from database
    await TeacherReport.deleteMany({ teacher: teacherId });

    res.redirect(`/coordinator/teacherDetails/${teacherId}`);
  } catch (error) {
    console.error("Error clearing reports:", error);
    res.status(500).send("Error clearing reports");
  }
});

coordinatorRouter.get("/lectureDetails/:id", async (req, res) => {
  const teacherReportId = req.params.id;
  const currUser = req.user;

  const lecture = await TeacherReport.findById(teacherReportId);

  res.render("coordinator/lectureDetails", {
    currUser,
    lecture,
    currentPage: "CoordLectureDetails",
  });
});

coordinatorRouter.get("/createCoordinatorReport", async (req, res) => {
  const currUser = req.user;
  const num = currUser.coordReport.teacherReports.length;
  if (!currUser.coordReport.teacherReports || num === 0) {
    return res.status(400).send("No teacher reports available to create a coordinator report.");
  }

  const newCoordReport = new CoordReport({
    coordinator: currUser._id,
    date: currUser.coordReport.date,
  });

  for (let i = 0; i < num; i++) {
    newCoordReport.teacherReports.push(currUser.coordReport.teacherReports[i].tReportId);
  }

  const finalReport = await newCoordReport.save();
  if (finalReport) {
    currUser.coordReport.date = null;
    currUser.coordReport.teacherReports = [];
    await currUser.save();

    res.redirect("/coordinator/coordHome");
  } else {
    res.redirect("/coordinator/report");
  }
});

coordinatorRouter.get("/assign/:id", async (req, res) => {
  const teacherId = req.params.id;
  const teacher = await Teacher.findById(teacherId);
  res.render("coordinator/assignTeacher", { teacher, teacherId });
});

coordinatorRouter.post("/assignTeacher/:id", async (req, res) => {
  const currUser = req.user;
  const teacherId = req.params.id;
  const { coordName } = req.body;

  currUser.teachers = currUser.teachers.filter((teacher) => teacher.toString() !== teacherId);
  await currUser.save();

  const newCoord = await Coordinator.findOne({ username: coordName });
  if (newCoord) {
    newCoord.teachers.push(teacherId);
    await newCoord.save();
    res.redirect("/coordinator/coordHome");
  } else {
    res.redirect(`/coordinator/assign/${teacherId}`);
  }
});

coordinatorRouter.get("/removereport/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const currUser = req.user;
    // console.log(id + "     " + currUser.coordReport.teacherReports[0]._id);
    currUser.coordReport.teacherReports = currUser.coordReport.teacherReports.filter((lecture) => lecture._id.toString() !== id);
    await currUser.save();
    res.redirect("/coordinator/report");
  } catch (err) {
    console.log("Encountered an error: " + err);
  }
});

module.exports = coordinatorRouter;
