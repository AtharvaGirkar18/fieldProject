const express = require("express");
const cloudinary = require("cloudinary").v2;

const coordinatorRouter = express.Router();
const axios = require("axios");
const archiver = require("archiver");

const {
  getTeachers,
  getAddTeacher,
  postAddTeacher,
  getTeacherDetails,
  getTeacherReport,
  getLectureDetails,
} = require("../controllers/coordinatorController");

const { TeacherStorage, AttendanceStorage } = require("../cloudConfig.js");
const multer = require("multer");
const upload = multer({ storage: TeacherStorage });
const attendanceUpload = multer({ storage: AttendanceStorage });

const Teacher = require("../models/teacher.js");
const Coordinator = require("../models/coordinator.js");
const TeacherReport = require("../models/teacherReport.js");
const CoordReport = require("../models/coordinatorReport.js");

// Helper function to get start of day in IST
const getISTStartOfDay = (date) => {
  const d = new Date(date);
  // Get IST time (UTC+5:30)
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(d.getTime() + istOffset);
  // Set to start of day in UTC representation
  const year = istTime.getUTCFullYear();
  const month = istTime.getUTCMonth();
  const day = istTime.getUTCDate();
  // Create date at midnight IST
  const startOfDay = new Date(Date.UTC(year, month, day) - istOffset);
  return startOfDay;
};

// Add authentication middleware
const isAuthenticated = (req, res, next) => {
  if (
    req.isAuthenticated() &&
    req.user.constructor.modelName === "Coordinator"
  ) {
    return next();
  }
  res.redirect("/auth/login/coordinator");
};

// Apply middleware to all coordinator routes
coordinatorRouter.use(isAuthenticated);

coordinatorRouter.get("/coordHome", async (req, res) => {
  const { username } = req.user;
  const currUser = await Coordinator.findOne({ username }).populate("teachers");

  // Calculate coordinator attendance
  const attendancePhotos = currUser.attendancePhotos || [];
  const attendanceCount = attendancePhotos.length;

  // Calculate total days since last reset (using IST timezone)
  let totalDays = 0;
  if (currUser.lastReportClearDate) {
    const resetDate = getISTStartOfDay(currUser.lastReportClearDate);
    const today = getISTStartOfDay(new Date());
    const diffTime = today - resetDate;
    totalDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  } else if (currUser.lastAttendanceResetDate) {
    const resetDate = getISTStartOfDay(currUser.lastAttendanceResetDate);
    const today = getISTStartOfDay(new Date());
    const diffTime = today - resetDate;
    totalDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  }

  res.render("coordinator/coordHome", {
    currUser,
    currentPage: "coordHome",
    coordinatorAttendance: {
      total: totalDays,
      present: attendanceCount,
    },
  });
});

// Coordinator attendance routes
coordinatorRouter.get("/myAttendance", async (req, res) => {
  try {
    const coordinator = await Coordinator.findById(req.user._id);

    // Get attendance photos sorted by date (latest first)
    const attendancePhotos = coordinator.attendancePhotos
      ? coordinator.attendancePhotos.sort(
          (a, b) => new Date(b.date) - new Date(a.date)
        )
      : [];

    // Calculate total days since last reset (using IST timezone)
    let totalDays = 0;
    if (coordinator.lastReportClearDate) {
      const resetDate = getISTStartOfDay(coordinator.lastReportClearDate);
      const today = getISTStartOfDay(new Date());
      const diffTime = today - resetDate;
      totalDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    } else if (coordinator.lastAttendanceResetDate) {
      const resetDate = getISTStartOfDay(coordinator.lastAttendanceResetDate);
      const today = getISTStartOfDay(new Date());
      const diffTime = today - resetDate;
      totalDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    }

    res.render("coordinator/myAttendance", {
      currUser: coordinator,
      username: req.user.username,
      path: req.user.picture.path,
      currentPage: "myAttendance",
      attendancePhotos: attendancePhotos,
      attendanceCount: attendancePhotos.length,
      totalDays: totalDays,
    });
  } catch (error) {
    console.error("Error loading attendance page:", error);
    res.status(500).send("Error loading attendance page");
  }
});

coordinatorRouter.post(
  "/myAttendance/upload",
  attendanceUpload.single("attendancePhoto"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).send("Photo is required");
      }

      const coordinatorId = req.user._id;

      const attendancePhoto = {
        date: new Date(),
        photo: {
          fieldname: req.file.fieldname,
          path: req.file.path,
        },
      };

      await Coordinator.findByIdAndUpdate(coordinatorId, {
        $push: { attendancePhotos: attendancePhoto },
      });

      res.redirect("/coordinator/myAttendance");
    } catch (error) {
      console.error("Error uploading attendance:", error);
      res.status(500).send("Error uploading attendance");
    }
  }
);

coordinatorRouter.get("/addTeacher", async (req, res) => {
  const { username } = req.user;
  const currUser = await Coordinator.findOne({ username }).populate("teachers");
  res.render("coordinator/addTeacher", { currUser, currentPage: "addTeacher" });
});

coordinatorRouter.post(
  "/addTeacher",
  upload.single("photo"),
  async (req, res) => {
    const currUser = req.user;
    let { teacherName, password } = req.body;

    // Handle optional file upload
    let picture = { path: "", fieldname: "" };
    if (req.file) {
      picture = { path: req.file.path, fieldname: req.file.fieldname };
    }

    try {
      const newTeacher = new Teacher({ picture, username: teacherName });
      const registeredTeacher = await Teacher.register(newTeacher, password);
      currUser.teachers.push(registeredTeacher);
      await currUser.save();
      res.redirect("/coordinator/coordHome");
    } catch (error) {
      res.send(error);
    }
  }
);

coordinatorRouter.get("/teacherDetails/:id", async (req, res) => {
  const currUser = req.user;
  const teacherId = req.params.id;

  const currTeacher = await Teacher.findById(teacherId).populate("students");

  // Fetch all reports for this teacher, latest first
  const allReports = await TeacherReport.find({ teacher: teacherId })
    .populate("studentAttendance.student")
    .sort({ date: -1 });

  res.render("coordinator/teacherDetails", {
    currUser,
    teacher: currTeacher,
    reports: allReports,
    currentPage: "teacherDetails",
  });
});

// Attendance statistics page for a teacher
coordinatorRouter.get("/attendance/:id", async (req, res) => {
  const teacherId = req.params.id;

  const teacher = await Teacher.findById(teacherId).populate("students");
  const reports = await TeacherReport.find({ teacher: teacherId })
    .populate("studentAttendance.student")
    .sort({ date: -1 });

  // Teacher attendance based on uploaded attendance photos (x/y)
  const attendancePhotos = teacher.attendancePhotos || [];
  const attendanceCount = attendancePhotos.length; // x

  // y = calendar days since coordinator cleared all reports (using IST timezone)
  let totalDays = 0; // y
  if (req.user && req.user.lastReportClearDate) {
    const resetDate = getISTStartOfDay(req.user.lastReportClearDate);
    const today = getISTStartOfDay(new Date());
    const diffTime = today - resetDate;
    totalDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  } else if (teacher.lastAttendanceResetDate) {
    const resetDate = getISTStartOfDay(teacher.lastAttendanceResetDate);
    const today = getISTStartOfDay(new Date());
    const diffTime = today - resetDate;
    totalDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  }

  const teacherAttendance = {
    total: totalDays,
    present: attendanceCount,
  };

  const studentAttendanceMap = {};
  (teacher.students || []).forEach((student) => {
    studentAttendanceMap[student._id.toString()] = {
      student,
      totalClasses: 0,
      presentCount: 0,
      percentage: 0,
    };
  });

  reports.forEach((report) => {
    report.studentAttendance.forEach((attendance) => {
      const studentId = attendance.student?._id?.toString();
      if (studentAttendanceMap[studentId]) {
        studentAttendanceMap[studentId].totalClasses += 1;
        if (attendance.present)
          studentAttendanceMap[studentId].presentCount += 1;
      }
    });
  });

  const studentAttendanceData = Object.values(studentAttendanceMap).map(
    (data) => {
      if (data.totalClasses > 0) {
        data.percentage = (
          (data.presentCount / data.totalClasses) *
          100
        ).toFixed(1);
      }
      return data;
    }
  );

  res.render("coordinator/attendance", {
    currUser: req.user,
    teacher,
    teacherAttendance,
    studentAttendanceData,
    reports,
    currentPage: "attendance",
  });
});

// View attendance photos (read-only) for a teacher
coordinatorRouter.get("/attendance/:id/photos", async (req, res) => {
  try {
    const teacherId = req.params.id;
    const teacher = await Teacher.findById(teacherId);
    if (!teacher) return res.status(404).send("Teacher not found");

    // Photos latest first
    const attendancePhotos = (teacher.attendancePhotos || []).sort(
      (a, b) => new Date(b.date) - new Date(a.date)
    );

    // y = calendar days since coordinator cleared reports (using IST timezone)
    let totalDays = 0;
    if (req.user && req.user.lastReportClearDate) {
      const resetDate = getISTStartOfDay(req.user.lastReportClearDate);
      const today = getISTStartOfDay(new Date());
      totalDays = Math.floor((today - resetDate) / (1000 * 60 * 60 * 24));
    } else if (teacher.lastAttendanceResetDate) {
      const resetDate = getISTStartOfDay(teacher.lastAttendanceResetDate);
      const today = getISTStartOfDay(new Date());
      totalDays = Math.floor((today - resetDate) / (1000 * 60 * 60 * 24));
    }

    res.render("coordinator/attendancePhotos", {
      currUser: req.user,
      teacher,
      attendancePhotos,
      attendanceCount: attendancePhotos.length,
      totalDays,
      currentPage: "attendance",
    });
  } catch (e) {
    console.error("Error loading attendance photos:", e);
    res.status(500).send("Error loading attendance photos");
  }
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
        const publicId = delTeacher.picture.path.split("/").pop().split(".")[0];
        await cloudinary.uploader.destroy(`Teachers/${publicId}`);

        // First find all reports that will be deleted
        const reportsToDelete = await TeacherReport.find({
          teacher: delTeacher._id,
        });

        // Delete the reports
        await TeacherReport.deleteMany({ teacher: delTeacher._id });

        // Remove reports from coordinator's current day report
        if (newUser.coordReport && newUser.coordReport.teacherReports) {
          const reportIds = reportsToDelete.map((report) =>
            report._id.toString()
          );
          newUser.coordReport.teacherReports =
            newUser.coordReport.teacherReports.filter(
              (lecture) => !reportIds.includes(lecture.tReportId.toString())
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

  const lecDetails = await TeacherReport.findById(teacherReportId).populate(
    "teacher"
  );
  const { teacher } = lecDetails;
  currUser.coordReport.teacherReports.push({
    tReportId: teacherReportId,
    teacher_name: teacher.username,
  });

  const today = new Date();
  const offset = today.getTimezoneOffset();
  const localDate = new Date(today.getTime() - offset * 60 * 1000);
  currUser.coordReport.date = localDate.toISOString().split("T")[0];
  const updatedUser = await currUser.save();

  if (updatedUser) {
    res.redirect("/coordinator/report");
  } else {
    res.redirect(`/teacherDetails/${teacherId}`);
  }
});

coordinatorRouter.get("/report", async (req, res) => {
  const currUser = req.user;
  await currUser.populate("coordReport.teacherReports.tReportId");

  // Clean up null references (deleted reports)
  if (currUser.coordReport && currUser.coordReport.teacherReports) {
    currUser.coordReport.teacherReports =
      currUser.coordReport.teacherReports.filter(
        (lecture) => lecture.tReportId !== null
      );
    await currUser.save();
  }

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
    // Delete all images from Cloudinary
    if (delReport.images && delReport.images.length > 0) {
      for (const image of delReport.images) {
        if (image.path) {
          const publicId = image.path.split("/").pop().split(".")[0];
          await cloudinary.uploader.destroy(`Lectures/${publicId}`);
        }
      }
    }
  }

  // Remove report from the daily coordinator report if present
  if (
    delReport &&
    currUser.coordReport &&
    currUser.coordReport.teacherReports
  ) {
    currUser.coordReport.teacherReports =
      currUser.coordReport.teacherReports.filter(
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
      if (report.images && report.images.length > 0) {
        for (const image of report.images) {
          if (image.path) {
            const publicId = image.path.split("/").pop().split(".")[0];
            await cloudinary.uploader.destroy(`Lectures/${publicId}`);
          }
        }
      }

      // Remove report from the daily coordinator report if present
      currUser.coordReport.teacherReports =
        currUser.coordReport.teacherReports.filter(
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

    // Update coordinator's lastReportClearDate
    currUser.lastReportClearDate = new Date();
    await currUser.save();

    // Reset teacher's attendance photos and set reset date
    const teacher = await Teacher.findById(teacherId);
    if (teacher) {
      // Delete attendance photos from Cloudinary
      if (teacher.attendancePhotos && teacher.attendancePhotos.length > 0) {
        for (const attendancePhoto of teacher.attendancePhotos) {
          if (attendancePhoto.photo && attendancePhoto.photo.path) {
            const publicId = attendancePhoto.photo.path
              .split("/")
              .pop()
              .split(".")[0];
            await cloudinary.uploader.destroy(`TeacherAttendance/${publicId}`);
          }
        }
      }

      teacher.attendancePhotos = [];
      teacher.lastAttendanceResetDate = new Date();
      await teacher.save();
    }

    res.redirect(`/coordinator/teacherDetails/${teacherId}`);
  } catch (error) {
    console.error("Error clearing reports:", error);
    res.status(500).send("Error clearing reports");
  }
});

coordinatorRouter.get("/lectureDetails/:id", async (req, res) => {
  const teacherReportId = req.params.id;
  const currUser = req.user;

  const lecture = await TeacherReport.findById(teacherReportId).populate(
    "studentAttendance.student"
  );

  res.render("coordinator/lectureDetails", {
    currUser,
    lecture,
    currentPage: "CoordLectureDetails",
  });
});

// Return image URLs for a report (used by folder picker save)
coordinatorRouter.get("/report-images/:id", async (req, res) => {
  try {
    const reportId = req.params.id;
    const report = await TeacherReport.findById(reportId);
    if (!report) {
      return res.status(404).json({ error: "Report not found" });
    }
    const images = Array.isArray(report.images)
      ? report.images.map((img) => img.path)
      : [];
    res.json({ images });
  } catch (err) {
    console.error("Error fetching report images:", err.message);
    res.status(500).json({ error: "Failed to fetch images" });
  }
});

coordinatorRouter.get("/createCoordinatorReport", async (req, res) => {
  const currUser = req.user;
  const num = currUser.coordReport.teacherReports.length;
  if (!currUser.coordReport.teacherReports || num === 0) {
    return res
      .status(400)
      .send("No teacher reports available to create a coordinator report.");
  }

  const newCoordReport = new CoordReport({
    coordinator: currUser._id,
    date: currUser.coordReport.date,
  });

  for (let i = 0; i < num; i++) {
    newCoordReport.teacherReports.push(
      currUser.coordReport.teacherReports[i].tReportId
    );
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
  const { username } = req.user;
  const currUser = await Coordinator.findOne({ username }).populate("teachers");
  const teacherId = req.params.id;
  const teacher = await Teacher.findById(teacherId);
  res.render("coordinator/assignTeacher", {
    currUser,
    teacher,
    teacherId,
    currentPage: "assignTeacher",
  });
});

coordinatorRouter.post("/assignTeacher/:id", async (req, res) => {
  try {
    const currUser = req.user;
    const teacherId = req.params.id;
    const { coordName } = req.body;

    // Find the new coordinator
    const newCoord = await Coordinator.findOne({ username: coordName });
    if (!newCoord) {
      return res.redirect(`/coordinator/assign/${teacherId}`);
    }

    // Get all teacher reports for this teacher
    const teacherReports = await TeacherReport.find({ teacher: teacherId });
    const reportIds = teacherReports.map((report) => report._id);

    // Update all CoordReport documents that reference these teacher reports
    // Remove these reports from current coordinator's CoordReports
    await CoordReport.updateMany(
      {
        coordinator: currUser._id,
        teacherReports: { $in: reportIds },
      },
      {
        $pull: { teacherReports: { $in: reportIds } },
      }
    );

    // Delete empty CoordReports for current coordinator
    await CoordReport.deleteMany({
      coordinator: currUser._id,
      teacherReports: { $size: 0 },
    });

    // Create or update CoordReports for new coordinator with these teacher reports
    // Group reports by date to maintain proper structure
    const reportsByDate = {};
    for (const report of teacherReports) {
      const dateKey = report.date.toISOString().split("T")[0];
      if (!reportsByDate[dateKey]) {
        reportsByDate[dateKey] = [];
      }
      reportsByDate[dateKey].push(report._id);
    }

    // Create/update coordinator reports for each date
    for (const [dateStr, reports] of Object.entries(reportsByDate)) {
      const reportDate = new Date(dateStr);

      // Find existing CoordReport for this date
      let coordReport = await CoordReport.findOne({
        coordinator: newCoord._id,
        date: {
          $gte: new Date(reportDate.setHours(0, 0, 0, 0)),
          $lt: new Date(reportDate.setHours(23, 59, 59, 999)),
        },
      });

      if (coordReport) {
        // Add reports to existing CoordReport
        coordReport.teacherReports.push(...reports);
        await coordReport.save();
      } else {
        // Create new CoordReport
        coordReport = new CoordReport({
          coordinator: newCoord._id,
          date: reportDate,
          teacherReports: reports,
        });
        await coordReport.save();
      }
    }

    // Remove teacher reports from current coordinator's daily report (coordReport field)
    if (currUser.coordReport && currUser.coordReport.teacherReports) {
      currUser.coordReport.teacherReports =
        currUser.coordReport.teacherReports.filter(
          (lecture) =>
            !reportIds.some(
              (id) => id.toString() === lecture.tReportId?.toString()
            )
        );
    }

    // Remove teacher from current coordinator
    currUser.teachers = currUser.teachers.filter(
      (teacher) => teacher.toString() !== teacherId
    );
    await currUser.save();

    // Add teacher to new coordinator
    newCoord.teachers.push(teacherId);
    await newCoord.save();

    res.redirect("/coordinator/coordHome");
  } catch (error) {
    console.error("Error assigning teacher:", error);
    res.status(500).send("Error assigning teacher");
  }
});

coordinatorRouter.get("/removereport/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const currUser = req.user;
    // console.log(id + "     " + currUser.coordReport.teacherReports[0]._id);
    currUser.coordReport.teacherReports =
      currUser.coordReport.teacherReports.filter(
        (lecture) => lecture._id.toString() !== id
      );
    await currUser.save();
    res.redirect("/coordinator/report");
  } catch (err) {
    console.log("Encountered an error: " + err);
  }
});

// Download single image
coordinatorRouter.post("/download-image", async (req, res) => {
  try {
    const { imageUrl, fileName } = req.body;

    if (!imageUrl || !fileName) {
      return res.status(400).json({ error: "Missing imageUrl or fileName" });
    }

    const response = await axios.get(imageUrl, { responseType: "stream" });

    res.setHeader(
      "Content-Type",
      response.headers["content-type"] || "application/octet-stream"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

    response.data.pipe(res);
  } catch (error) {
    console.error("Error downloading image:", error.message);
    res.status(500).json({ error: "Failed to download image" });
  }
});

// Download all report images as a ZIP
coordinatorRouter.post("/download-all-report-images", async (req, res) => {
  try {
    const { reportId, address, date } = req.body;
    if (!reportId || !address || !date) {
      return res
        .status(400)
        .json({ error: "Missing reportId, address, or date" });
    }

    const report = await TeacherReport.findById(reportId);
    if (!report) {
      return res.status(404).json({ error: "Report not found" });
    }

    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${address}_${date}_images.zip"`
    );

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.on("error", (err) => {
      console.error("Archiver error:", err.message);
      res.status(500).end();
    });
    archive.pipe(res);

    // Add all images
    if (Array.isArray(report.images)) {
      for (let i = 0; i < report.images.length; i++) {
        const img = report.images[i];
        if (img && img.path) {
          const imgResp = await axios.get(img.path, {
            responseType: "stream",
          });
          archive.append(imgResp.data, {
            name: `${address}_${date}_image_${i + 1}.jpg`,
          });
        }
      }
    }

    archive.finalize();
  } catch (error) {
    console.error("Failed to build ZIP:", error.message);
    res.status(500).json({ error: "Failed to download images" });
  }
});

// Reject/Delete a teacher report and reset attendance
coordinatorRouter.post("/reject-report/:reportId", async (req, res) => {
  try {
    const reportId = req.params.reportId;
    const report = await TeacherReport.findById(reportId);

    if (!report) {
      return res.status(404).json({ error: "Report not found" });
    }

    // Delete all images from Cloudinary
    if (report.images && report.images.length > 0) {
      for (const image of report.images) {
        if (image.path) {
          const publicId = image.path.split("/").pop().split(".")[0];
          try {
            await cloudinary.uploader.destroy(`Lectures/${publicId}`);
          } catch (error) {
            console.error("Error deleting image from Cloudinary:", error);
          }
        }
      }
    }

    // Remove report from coordinator reports
    await CoordReport.updateMany(
      { teacherReports: { $in: [reportId] } },
      { $pull: { teacherReports: reportId } }
    );

    // Delete coordinator reports with empty teacherReports array
    await CoordReport.deleteMany({ teacherReports: { $size: 0 } });

    // Delete the teacher report
    await TeacherReport.findByIdAndDelete(reportId);

    res.json({
      success: true,
      message: "Report rejected and attendance reset",
    });
  } catch (error) {
    console.error("Error rejecting report:", error);
    res.status(500).json({ error: "Failed to reject report" });
  }
});

// Delete all reports for a coordinator
coordinatorRouter.post("/delete-all-reports", async (req, res) => {
  try {
    const currUser = req.user;

    // Get all teachers for this coordinator
    const coordinator = await Coordinator.findById(currUser._id).populate(
      "teachers"
    );

    if (
      !coordinator ||
      !coordinator.teachers ||
      coordinator.teachers.length === 0
    ) {
      return res.json({
        success: true,
        message: "No teachers to delete reports for",
      });
    }

    const teacherIds = coordinator.teachers.map((t) => t._id);

    // Find all teacher reports for these teachers
    const reports = await TeacherReport.find({ teacher: { $in: teacherIds } });

    console.log(`Found ${reports.length} reports to delete`);

    // Delete all images from Cloudinary
    for (const report of reports) {
      // Delete all images
      if (report.images && report.images.length > 0) {
        for (const image of report.images) {
          if (image.path) {
            const publicId = image.path.split("/").pop().split(".")[0];
            try {
              await cloudinary.uploader.destroy(`Lectures/${publicId}`);
              console.log(`Deleted image: Lectures/${publicId}`);
            } catch (error) {
              console.error(
                `Error deleting image Lectures/${publicId}:`,
                error
              );
            }
          }
        }
      }
    }

    // Delete all coordinator reports for this coordinator
    await CoordReport.deleteMany({ coordinator: currUser._id });
    console.log(`Deleted all coordinator reports`);

    // Delete all teacher reports for these teachers
    const reportIds = reports.map((r) => r._id);
    await TeacherReport.deleteMany({ _id: { $in: reportIds } });
    console.log(`Deleted all teacher reports`);

    // Update coordinator's lastReportClearDate to reset attendance tracking
    coordinator.lastReportClearDate = new Date();
    await coordinator.save();
    console.log(`Updated coordinator lastReportClearDate`);

    // Reset all teachers' attendance photos and dates
    for (const teacher of coordinator.teachers) {
      const teacherDoc = await Teacher.findById(teacher._id);
      if (teacherDoc) {
        // Delete attendance photos from Cloudinary
        if (
          teacherDoc.attendancePhotos &&
          teacherDoc.attendancePhotos.length > 0
        ) {
          for (const attendancePhoto of teacherDoc.attendancePhotos) {
            if (attendancePhoto.photo && attendancePhoto.photo.path) {
              const publicId = attendancePhoto.photo.path
                .split("/")
                .pop()
                .split(".")[0];
              try {
                await cloudinary.uploader.destroy(
                  `TeacherAttendance/${publicId}`
                );
                console.log(
                  `Deleted teacher attendance photo: TeacherAttendance/${publicId}`
                );
              } catch (error) {
                console.error(`Error deleting attendance photo:`, error);
              }
            }
          }
        }
        teacherDoc.attendancePhotos = [];
        teacherDoc.lastAttendanceResetDate = new Date();
        await teacherDoc.save();
        console.log(`Reset attendance for teacher ${teacher.username}`);
      }
    }

    // Reset coordinator's own attendance photos
    if (
      coordinator.attendancePhotos &&
      coordinator.attendancePhotos.length > 0
    ) {
      for (const attendancePhoto of coordinator.attendancePhotos) {
        if (attendancePhoto.photo && attendancePhoto.photo.path) {
          const publicId = attendancePhoto.photo.path
            .split("/")
            .pop()
            .split(".")[0];
          try {
            await cloudinary.uploader.destroy(`TeacherAttendance/${publicId}`);
            console.log(
              `Deleted coordinator attendance photo: TeacherAttendance/${publicId}`
            );
          } catch (error) {
            console.error(
              `Error deleting coordinator attendance photo:`,
              error
            );
          }
        }
      }
      coordinator.attendancePhotos = [];
      coordinator.lastAttendanceResetDate = new Date();
      await coordinator.save();
      console.log(`Reset coordinator's own attendance`);
    }

    res.json({
      success: true,
      message: `Successfully deleted ${reports.length} reports and reset all attendance tracking`,
      deletedCount: reports.length,
    });
  } catch (error) {
    console.error("Error deleting all reports:", error);
    res.status(500).json({ error: "Failed to delete all reports" });
  }
});

// Download all attendance photos as a ZIP
coordinatorRouter.post("/download-all-attendance-photos", async (req, res) => {
  try {
    const { userId, userType } = req.body;
    if (!userId || !userType) {
      return res.status(400).json({ error: "Missing userId or userType" });
    }

    let user;
    if (userType === "teacher") {
      user = await Teacher.findById(userId);
    } else if (userType === "coordinator") {
      user = await Coordinator.findById(userId);
    } else {
      return res.status(400).json({ error: "Invalid userType" });
    }

    if (!user || !user.attendancePhotos || user.attendancePhotos.length === 0) {
      return res.status(404).json({ error: "No attendance photos found" });
    }

    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${user.username}_attendance_photos.zip"`
    );

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.on("error", (err) => {
      console.error("Archiver error:", err.message);
      res.status(500).end();
    });
    archive.pipe(res);

    // Add each attendance photo with date appended to filename
    for (let i = 0; i < user.attendancePhotos.length; i++) {
      const photo = user.attendancePhotos[i];
      if (photo && photo.photo && photo.photo.path) {
        try {
          const photoResp = await axios.get(photo.photo.path, {
            responseType: "stream",
          });

          // Format date as YYYY-MM-DD_HH-MM-SS
          const photoDate = new Date(photo.date);
          const dateStr = photoDate
            .toLocaleDateString("en-CA")
            .replace(/\//g, "-");
          const timeStr = photoDate
            .toLocaleTimeString("en-GB", { hour12: false })
            .replace(/:/g, "-");

          archive.append(photoResp.data, {
            name: `${user.username}_${dateStr}_${timeStr}_${i + 1}.jpg`,
          });
        } catch (error) {
          console.error(
            `Error downloading attendance photo ${i}:`,
            error.message
          );
        }
      }
    }

    archive.finalize();
  } catch (error) {
    console.error("Failed to build attendance photos ZIP:", error.message);
    res.status(500).json({ error: "Failed to download attendance photos" });
  }
});

// Get attendance photos list for folder picker
coordinatorRouter.get("/attendance-photos/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const teacher = await Teacher.findById(userId);

    if (!teacher || !teacher.attendancePhotos) {
      return res.json([]);
    }

    const photos = teacher.attendancePhotos.map((photo) => ({
      date: photo.date,
      photo: photo.photo,
      username: teacher.username,
    }));

    res.json(photos);
  } catch (error) {
    console.error("Error fetching attendance photos:", error);
    res.status(500).json({ error: "Failed to fetch attendance photos" });
  }
});

module.exports = coordinatorRouter;
