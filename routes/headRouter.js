const express = require("express");
const cloudinary = require("cloudinary").v2;
const ExcelJS = require("exceljs");
const axios = require("axios");
const archiver = require("archiver");

const headRouter = express.Router();
const {
  getCoordinators,
  getAddCoordinator,
  postAddCoordinator,
  getCoordinatorReport,
  getLectureDetails,
} = require("../controllers/headController");

const { CoordinatorStorage } = require("../cloudConfig.js");
const multer = require("multer");
const upload = multer({ storage: CoordinatorStorage });

const Head = require("../models/head.js");
const Coordinator = require("../models/coordinator.js");
const TeacherReport = require("../models/teacherReport.js");
const CoordReport = require("../models/coordinatorReport.js");
const Teacher = require("../models/teacher.js");

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
  if (req.isAuthenticated() && req.user.constructor.modelName === "Head") {
    return next();
  }
  res.redirect("/auth/login/head");
};

// Apply middleware to all coordinator routes
headRouter.use(isAuthenticated);

headRouter.get("/headHome", async (req, res) => {
  const { username } = req.user;
  const currUser = await Head.findOne({ username }).populate("coordinators");
  res.render("head/headHome", { currUser, currentPage: "headHome" });
});

headRouter.get("/addCoordinator", async (req, res) => {
  const { username } = req.user;
  const currUser = await Head.findOne({ username }).populate("coordinators");
  res.render("head/addCoordinator", {
    currUser,
    currentPage: "addCoordinator",
  });
});

headRouter.post("/addCoordinator", upload.single("photo"), async (req, res) => {
  const currUser = req.user;
  let { coordinatorName, password } = req.body;

  // Handle optional file upload
  let picture = { path: "", fieldname: "" };
  if (req.file) {
    picture = { path: req.file.path, fieldname: req.file.fieldname };
  }

  try {
    const newCoord = new Coordinator({ picture, username: coordinatorName });
    const registeredCoord = await Coordinator.register(newCoord, password);
    currUser.coordinators.push(registeredCoord);
    await currUser.save();
    res.redirect("/head/headHome");
  } catch (error) {
    res.send(error);
  }
});

headRouter.get("/delete/:id", async (req, res) => {
  try {
    const coordId = req.params.id;
    const currUser = req.user;

    // Remove coordinator reference from coordinator's teachers array
    currUser.coordinators = currUser.coordinators.filter(
      (coordinator) => coordinator.toString() != coordId
    );
    const newUser = await currUser.save();

    if (newUser) {
      // Delete the teacher
      const delCoord = await Coordinator.findByIdAndDelete(coordId);
      if (delCoord && delCoord.picture) {
        // Delete image from Cloudinary
        const publicId = delCoord.picture.path.split("/").pop().split(".")[0];
        await cloudinary.uploader.destroy(`Coordinators/${publicId}`);

        // Delete the respective CoordinatorReports
        const delReports = await CoordReport.deleteMany({
          coordinator: delCoord._id,
        });
      }
    }

    res.redirect("/head/headHome");
  } catch (error) {
    console.error(error);
    res.status(500).send("Error deleting Coordinator");
  }
});

// Reset all coordinator and teacher reports from head account
headRouter.post("/reset-all-reports", async (req, res) => {
  try {
    const head = await Head.findById(req.user._id).populate({
      path: "coordinators",
      populate: { path: "teachers" },
    });

    if (!head || !head.coordinators || head.coordinators.length === 0) {
      return res.json({ success: true, message: "No coordinators to reset" });
    }

    const now = new Date();
    let totalReports = 0;
    let totalCoordinators = 0;
    let totalTeachers = 0;

    for (const coordinator of head.coordinators) {
      const teacherIds = (coordinator.teachers || []).map((t) => t._id);
      totalTeachers += teacherIds.length;

      const reports = await TeacherReport.find({
        teacher: { $in: teacherIds },
      });
      totalReports += reports.length;

      for (const report of reports) {
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
      }

      await CoordReport.deleteMany({ coordinator: coordinator._id });
      await TeacherReport.deleteMany({ teacher: { $in: teacherIds } });

      for (const teacherId of teacherIds) {
        const teacher = await Teacher.findById(teacherId);
        if (!teacher) continue;

        if (teacher.attendancePhotos && teacher.attendancePhotos.length > 0) {
          for (const attendancePhoto of teacher.attendancePhotos) {
            if (attendancePhoto.photo && attendancePhoto.photo.path) {
              const publicId = attendancePhoto.photo.path
                .split("/")
                .pop()
                .split(".")[0];
              try {
                await cloudinary.uploader.destroy(
                  `TeacherAttendance/${publicId}`
                );
              } catch (error) {
                console.error("Error deleting attendance photo:", error);
              }
            }
          }
        }

        teacher.attendancePhotos = [];
        teacher.lastAttendanceResetDate = now;
        await teacher.save();
      }

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
              await cloudinary.uploader.destroy(
                `TeacherAttendance/${publicId}`
              );
            } catch (error) {
              console.error(
                "Error deleting coordinator attendance photo:",
                error
              );
            }
          }
        }
      }

      coordinator.attendancePhotos = [];
      coordinator.lastAttendanceResetDate = now;
      coordinator.lastReportClearDate = now;
      await coordinator.save();

      totalCoordinators += 1;
    }

    res.json({
      success: true,
      message: `Reset completed for ${totalCoordinators} coordinators`,
      deletedReports: totalReports,
      affectedTeachers: totalTeachers,
    });
  } catch (error) {
    console.error("Error resetting all reports:", error);
    res.status(500).json({ error: "Failed to reset reports" });
  }
});

headRouter.get("/coordinatorReport/:id", async (req, res) => {
  const currUser = req.user;
  const coordinatorId = req.params.id;

  const currCoord = await Coordinator.findById(coordinatorId);

  const coordReports = await CoordReport.find({
    coordinator: coordinatorId,
  }).populate({
    path: "teacherReports",
    populate: {
      path: "teacher",
    },
  });

  // Calculate coordinator attendance (x/y format)
  const attendancePhotos = currCoord.attendancePhotos || [];
  const attendanceCount = attendancePhotos.length; // x

  // y = calendar days since coordinator cleared all reports
  let totalDays = 0; // y
  if (currCoord.lastReportClearDate) {
    const resetDate = getISTStartOfDay(currCoord.lastReportClearDate);
    const today = getISTStartOfDay(new Date());
    const diffTime = today - resetDate;
    totalDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  } else if (currCoord.lastAttendanceResetDate) {
    const resetDate = getISTStartOfDay(currCoord.lastAttendanceResetDate);
    const today = getISTStartOfDay(new Date());
    const diffTime = today - resetDate;
    totalDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  }

  const coordinatorAttendance = {
    total: totalDays,
    present: attendanceCount,
  };

  res.render("head/coordinatorReport", {
    currUser,
    coordReports,
    currCoord,
    coordinatorAttendance,
    currentPage: "coordinatorReport",
  });
});

// View coordinator's attendance photos
headRouter.get("/coordinatorReport/:id/photos", async (req, res) => {
  const currUser = req.user;
  const coordinatorId = req.params.id;

  const currCoord = await Coordinator.findById(coordinatorId);

  if (!currCoord) {
    return res.status(404).render("404");
  }

  const attendancePhotos = currCoord.attendancePhotos || [];

  res.render("head/coordinatorAttendancePhotos", {
    currUser,
    currCoord,
    attendancePhotos,
    currentPage: "coordinatorReport",
  });
});

// View teachers under a coordinator
headRouter.get("/coordinatorTeachers/:id", async (req, res) => {
  const currUser = req.user;
  const coordinatorId = req.params.id;

  const currCoord = await Coordinator.findById(coordinatorId).populate(
    "teachers"
  );

  res.render("head/coordinatorTeachers", {
    currUser,
    coordinator: currCoord,
    currCoord,
    currentPage: "coordinatorTeachers",
  });
});

// View teacher attendance statistics from head perspective
headRouter.get("/teacherAttendance/:id", async (req, res) => {
  const currUser = req.user;
  const teacherId = req.params.id;

  const teacher = await Teacher.findById(teacherId).populate("students");

  // Fetch coordinator from teacher's data (find coordinator that has this teacher)
  const currCoord = await Coordinator.findOne({ teachers: teacherId });

  const reports = await TeacherReport.find({ teacher: teacherId })
    .populate("studentAttendance.student")
    .sort({ date: -1 });

  // Teacher attendance based on uploaded attendance photos (x/y)
  const attendancePhotos = teacher.attendancePhotos || [];
  const attendanceCount = attendancePhotos.length; // x

  // y = calendar days since coordinator cleared all reports
  let totalDays = 0; // y
  if (currCoord && currCoord.lastReportClearDate) {
    const resetDate = getISTStartOfDay(currCoord.lastReportClearDate);
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

  res.render("head/teacherAttendance", {
    currUser,
    teacher,
    currCoord,
    teacherAttendance,
    studentAttendanceData,
    reports,
    currentPage: "teacherAttendance",
  });
});

// View teacher's attendance photos
headRouter.get("/teacherAttendance/:id/photos", async (req, res) => {
  const currUser = req.user;
  const teacherId = req.params.id;

  const teacher = await Teacher.findById(teacherId);

  if (!teacher) {
    return res.status(404).render("404");
  }

  const attendancePhotos = teacher.attendancePhotos || [];
  const attendanceCount = attendancePhotos.length;

  // Calculate total days
  let totalDays = 0;
  if (teacher.lastAttendanceResetDate) {
    const resetDate = getISTStartOfDay(teacher.lastAttendanceResetDate);
    const today = getISTStartOfDay(new Date());
    const diffTime = today - resetDate;
    totalDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  }

  res.render("coordinator/attendancePhotos", {
    currUser,
    teacher,
    attendancePhotos,
    attendanceCount,
    totalDays,
    currentPage: "teacherAttendance",
  });
});

headRouter.get("/lectureDetails/:id", async (req, res) => {
  const currUser = req.user;
  const lectureId = req.params.id;
  const lecture = await TeacherReport.findById(lectureId).populate("teacher");

  res.render("head/lectureDetails", {
    currUser,
    lecture,
    currentPage: "HeadLectureDetails",
  });
});

headRouter.get("/export-daily-reports", async (req, res) => {
  try {
    // Get today's date in YYYY-MM-DD format
    const today = new Date();
    const offset = today.getTimezoneOffset();
    const localDate = new Date(today.getTime() - offset * 60 * 1000);
    const todayStr = localDate.toISOString().split("T")[0];

    // Create workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Daily Reports");

    // Set up headers
    worksheet.columns = [
      { header: "Coordinator", key: "coordinator", width: 20 },
      { header: "Teacher", key: "teacher", width: 20 },
      { header: "Date", key: "date", width: 15 },
      { header: "Time", key: "time", width: 15 },
      { header: "Address", key: "address", width: 30 },
      { header: "Attendance", key: "attendance", width: 15 },
      { header: "Activity", key: "activity", width: 40 },
    ];

    worksheet.getRow(1).font = { bold: true };

    // Get all coordinator reports for today with populated references
    const coordReports = await CoordReport.find({
      date: {
        $gte: new Date(todayStr),
        $lt: new Date(todayStr + "T23:59:59.999Z"),
      },
    })
      .populate({
        path: "coordinator",
        select: "username",
      })
      .populate({
        path: "teacherReports",
        populate: {
          path: "teacher",
          select: "username",
        },
      });

    // Add data rows
    coordReports.forEach((coordReport) => {
      coordReport.teacherReports.forEach((teacherReport) => {
        worksheet.addRow({
          coordinator: coordReport.coordinator.username,
          teacher: teacherReport.teacher.username,
          date: teacherReport.date.toLocaleDateString(),
          time: teacherReport.time.toLocaleTimeString(),
          address: teacherReport.address,
          attendance: teacherReport.attendance,
          activity: teacherReport.activity,
        });
      });
    });

    // Set response headers
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=coordinator-reports-${todayStr}.xlsx`
    );

    // Write to response
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Error exporting reports:", error);
    res.status(500).send("Error exporting reports");
  }
});

headRouter.get("/export-all-reports", async (req, res) => {
  try {
    // Create workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("All Reports");

    // Set up headers
    worksheet.columns = [
      { header: "Coordinator", key: "coordinator", width: 20 },
      { header: "Teacher", key: "teacher", width: 20 },
      { header: "Date", key: "date", width: 15 },
      { header: "Time", key: "time", width: 15 },
      { header: "Address", key: "address", width: 30 },
      { header: "Attendance", key: "attendance", width: 15 },
      { header: "Activity", key: "activity", width: 40 },
    ];

    worksheet.getRow(1).font = { bold: true };

    // Get all coordinator reports with populated references
    const coordReports = await CoordReport.find({})
      .populate({
        path: "coordinator",
        select: "username",
      })
      .populate({
        path: "teacherReports",
        populate: {
          path: "teacher",
          select: "username",
        },
      });

    // Add data rows
    coordReports.forEach((coordReport) => {
      coordReport.teacherReports.forEach((teacherReport) => {
        worksheet.addRow({
          coordinator: coordReport.coordinator.username,
          teacher: teacherReport.teacher.username,
          date: teacherReport.date.toLocaleDateString(),
          time: teacherReport.time.toLocaleTimeString(),
          address: teacherReport.address,
          attendance: teacherReport.attendance,
          activity: teacherReport.activity,
        });
      });
    });

    // Set response headers
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=coordinator-reports.xlsx`
    );

    // Write to response
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Error exporting reports:", error);
    res.status(500).send("Error exporting reports");
  }
});

// Export daily attendance report
headRouter.get("/export-daily-attendance", async (req, res) => {
  try {
    // Get today's date in YYYY-MM-DD format
    const today = new Date();
    const offset = today.getTimezoneOffset();
    const localDate = new Date(today.getTime() - offset * 60 * 1000);
    const todayStr = localDate.toISOString().split("T")[0];

    // Create workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Daily Attendance");

    // Set up headers
    worksheet.columns = [
      { header: "Coordinators", key: "coordinator", width: 20 },
      { header: "Present", key: "coordPresent", width: 12 },
      { header: "Teachers", key: "teacher", width: 20 },
      { header: "Present", key: "teacherPresent", width: 12 },
      { header: "Students", key: "student", width: 20 },
      { header: "Present", key: "studentPresent", width: 12 },
    ];

    worksheet.getRow(1).font = { bold: true };

    // Get head user with all coordinators
    const head = await Head.findById(req.user._id).populate({
      path: "coordinators",
      populate: { path: "teachers", populate: { path: "students" } },
    });

    let currentRow = 2; // Start after header

    // Process each coordinator
    for (const coordinator of head.coordinators) {
      // Check coordinator attendance for today
      const coordAttendanceToday = coordinator.attendancePhotos?.some(
        (photo) => {
          const photoDate = new Date(photo.date);
          return photoDate.toISOString().split("T")[0] === todayStr;
        }
      );

      let coordStartRow = currentRow;
      let totalStudentsForCoord = 0;

      // Process each teacher under this coordinator
      for (const teacher of coordinator.teachers) {
        // Check teacher attendance for today
        const teacherAttendanceToday = teacher.attendancePhotos?.some(
          (photo) => {
            const photoDate = new Date(photo.date);
            return photoDate.toISOString().split("T")[0] === todayStr;
          }
        );

        let teacherStartRow = currentRow;

        // Get today's reports for this teacher
        const todayReports = await TeacherReport.find({
          teacher: teacher._id,
          date: {
            $gte: new Date(todayStr),
            $lt: new Date(todayStr + "T23:59:59.999Z"),
          },
        }).populate("studentAttendance.student");

        // Build student attendance map for today
        const studentAttendanceMap = {};
        todayReports.forEach((report) => {
          report.studentAttendance?.forEach((sa) => {
            if (sa.student) {
              if (!studentAttendanceMap[sa.student._id.toString()]) {
                studentAttendanceMap[sa.student._id.toString()] = {
                  student: sa.student,
                  present: sa.present,
                };
              }
            }
          });
        });

        const students = teacher.students || [];
        const studentCount = students.length || 1; // At least 1 row per teacher

        // Add rows for each student
        if (students.length > 0) {
          for (const student of students) {
            const attendance = studentAttendanceMap[student._id.toString()];
            worksheet.addRow({
              coordinator: "",
              coordPresent: "",
              teacher: "",
              teacherPresent: "",
              student: student.name,
              studentPresent: attendance?.present ? "Yes" : "No",
            });
            currentRow++;
            totalStudentsForCoord++;
          }
        } else {
          // No students, add one empty row
          worksheet.addRow({
            coordinator: "",
            coordPresent: "",
            teacher: "",
            teacherPresent: "",
            student: "No students",
            studentPresent: "N/A",
          });
          currentRow++;
          totalStudentsForCoord++;
        }

        // Merge teacher cells
        if (currentRow - teacherStartRow > 1) {
          worksheet.mergeCells(teacherStartRow, 3, currentRow - 1, 3); // Teachers column
          worksheet.mergeCells(teacherStartRow, 4, currentRow - 1, 4); // Teacher Present column
        }
        worksheet.getCell(teacherStartRow, 3).value = teacher.username;
        worksheet.getCell(teacherStartRow, 4).value = teacherAttendanceToday
          ? "Yes"
          : "No";
      }

      // Merge coordinator cells
      if (currentRow - coordStartRow > 1) {
        worksheet.mergeCells(coordStartRow, 1, currentRow - 1, 1); // Coordinators column
        worksheet.mergeCells(coordStartRow, 2, currentRow - 1, 2); // Coordinator Present column
      }
      worksheet.getCell(coordStartRow, 1).value = coordinator.username;
      worksheet.getCell(coordStartRow, 2).value = coordAttendanceToday
        ? "Yes"
        : "No";
    }

    // Set alignment for all cells
    worksheet.eachRow((row, rowNumber) => {
      row.eachCell((cell) => {
        cell.alignment = { vertical: "middle", horizontal: "center" };
      });
    });

    // Set response headers
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=daily-attendance-${todayStr}.xlsx`
    );

    // Write to response
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Error exporting daily attendance:", error);
    res.status(500).send("Error exporting daily attendance");
  }
});

// Export all attendance report
headRouter.get("/export-all-attendance", async (req, res) => {
  try {
    // Create workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("All Attendance");

    // Set up headers
    worksheet.columns = [
      { header: "Coordinators", key: "coordinator", width: 20 },
      { header: "Attendance", key: "coordAttendance", width: 15 },
      { header: "Teachers", key: "teacher", width: 20 },
      { header: "Attendance", key: "teacherAttendance", width: 15 },
      { header: "Students", key: "student", width: 20 },
      { header: "Attendance", key: "studentAttendance", width: 15 },
    ];

    worksheet.getRow(1).font = { bold: true };

    // Get head user with all coordinators
    const head = await Head.findById(req.user._id).populate({
      path: "coordinators",
      populate: { path: "teachers", populate: { path: "students" } },
    });

    let currentRow = 2; // Start after header

    // Process each coordinator
    for (const coordinator of head.coordinators) {
      // Calculate coordinator attendance
      const coordAttendanceCount = coordinator.attendancePhotos?.length || 0;

      // Calculate total days since last reset
      let coordTotalDays = 0;
      if (coordinator.lastReportClearDate) {
        const resetDate = getISTStartOfDay(coordinator.lastReportClearDate);
        const today = getISTStartOfDay(new Date());
        const diffTime = today - resetDate;
        coordTotalDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      } else if (coordinator.lastAttendanceResetDate) {
        const resetDate = getISTStartOfDay(coordinator.lastAttendanceResetDate);
        const today = getISTStartOfDay(new Date());
        const diffTime = today - resetDate;
        coordTotalDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      }

      const coordAttendance = `${coordAttendanceCount}/${coordTotalDays}`;

      let coordStartRow = currentRow;
      let totalStudentsForCoord = 0;

      // Process each teacher under this coordinator
      for (const teacher of coordinator.teachers) {
        // Calculate teacher attendance
        const teacherAttendanceCount = teacher.attendancePhotos?.length || 0;

        // Calculate teacher total days
        let teacherTotalDays = 0;
        if (coordinator.lastReportClearDate) {
          const resetDate = getISTStartOfDay(coordinator.lastReportClearDate);
          const today = getISTStartOfDay(new Date());
          const diffTime = today - resetDate;
          teacherTotalDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        } else if (teacher.lastAttendanceResetDate) {
          const resetDate = getISTStartOfDay(teacher.lastAttendanceResetDate);
          const today = getISTStartOfDay(new Date());
          const diffTime = today - resetDate;
          teacherTotalDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        }

        const teacherAttendance = `${teacherAttendanceCount}/${teacherTotalDays}`;

        let teacherStartRow = currentRow;

        // Get all reports for this teacher
        const allReports = await TeacherReport.find({
          teacher: teacher._id,
        }).populate("studentAttendance.student");

        // Build student attendance statistics
        const studentAttendanceMap = {};
        allReports.forEach((report) => {
          report.studentAttendance?.forEach((sa) => {
            if (sa.student) {
              const studentId = sa.student._id.toString();
              if (!studentAttendanceMap[studentId]) {
                studentAttendanceMap[studentId] = {
                  student: sa.student,
                  totalClasses: 0,
                  presentCount: 0,
                };
              }
              studentAttendanceMap[studentId].totalClasses++;
              if (sa.present) {
                studentAttendanceMap[studentId].presentCount++;
              }
            }
          });
        });

        const students = teacher.students || [];
        const studentCount = students.length || 1; // At least 1 row per teacher

        // Add rows for each student
        if (students.length > 0) {
          for (const student of students) {
            const stats = studentAttendanceMap[student._id.toString()];
            const studentAttendanceStr = stats
              ? `${stats.presentCount}/${stats.totalClasses}`
              : "0/0";

            worksheet.addRow({
              coordinator: "",
              coordAttendance: "",
              teacher: "",
              teacherAttendance: "",
              student: student.name,
              studentAttendance: studentAttendanceStr,
            });
            currentRow++;
            totalStudentsForCoord++;
          }
        } else {
          // No students, add one empty row
          worksheet.addRow({
            coordinator: "",
            coordAttendance: "",
            teacher: "",
            teacherAttendance: "",
            student: "No students",
            studentAttendance: "N/A",
          });
          currentRow++;
          totalStudentsForCoord++;
        }

        // Merge teacher cells
        if (currentRow - teacherStartRow > 1) {
          worksheet.mergeCells(teacherStartRow, 3, currentRow - 1, 3); // Teachers column
          worksheet.mergeCells(teacherStartRow, 4, currentRow - 1, 4); // Teacher Attendance column
        }
        worksheet.getCell(teacherStartRow, 3).value = teacher.username;
        worksheet.getCell(teacherStartRow, 4).value = teacherAttendance;
      }

      // Merge coordinator cells
      if (currentRow - coordStartRow > 1) {
        worksheet.mergeCells(coordStartRow, 1, currentRow - 1, 1); // Coordinators column
        worksheet.mergeCells(coordStartRow, 2, currentRow - 1, 2); // Coordinator Attendance column
      }
      worksheet.getCell(coordStartRow, 1).value = coordinator.username;
      worksheet.getCell(coordStartRow, 2).value = coordAttendance;
    }

    // Set alignment for all cells
    worksheet.eachRow((row, rowNumber) => {
      row.eachCell((cell) => {
        cell.alignment = { vertical: "middle", horizontal: "center" };
      });
    });

    // Set response headers
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=all-attendance-report.xlsx`
    );

    // Write to response
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Error exporting all attendance:", error);
    res.status(500).send("Error exporting all attendance");
  }
});

// Download all attendance photos as a ZIP
headRouter.post("/download-all-attendance-photos", async (req, res) => {
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
headRouter.get("/attendance-photos/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    let user;

    // Try to find as coordinator first, then as teacher
    user = await Coordinator.findById(userId);
    if (!user) {
      user = await Teacher.findById(userId);
    }

    if (!user || !user.attendancePhotos) {
      return res.json([]);
    }

    const photos = user.attendancePhotos.map((photo) => ({
      date: photo.date,
      photo: photo.photo,
      username: user.username,
    }));

    res.json(photos);
  } catch (error) {
    console.error("Error fetching attendance photos:", error);
    res.status(500).json({ error: "Failed to fetch attendance photos" });
  }
});

// Download image endpoint for head users
headRouter.post("/download-image", async (req, res) => {
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

module.exports = headRouter;
