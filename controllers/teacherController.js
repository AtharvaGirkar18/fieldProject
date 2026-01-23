const Teacher = require("../models/teacher.js");
const Student = require("../models/student.js");
const TeacherReport = require("../models/teacherReport.js");
const Coordinator = require("../models/coordinator.js");

// Helper function to get IST date (UTC+5:30)
const getISTDate = () => {
  const now = new Date();
  // Convert to IST by adding 5 hours 30 minutes
  const istOffset = 5.5 * 60 * 60 * 1000; // 5.5 hours in milliseconds
  const istTime = new Date(now.getTime() + istOffset);
  return istTime;
};

// Helper function to get start of day in IST
const getISTStartOfDay = (date) => {
  const d = new Date(date);
  // Get IST time
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

// Render teacher home page
module.exports.renderHome = async (req, res) => {
  try {
    const teacher = await Teacher.findById(req.user._id).populate("students");

    // Fetch all reports for this teacher with populated student data
    const reports = await TeacherReport.find({ teacher: req.user._id })
      .populate("studentAttendance.student")
      .sort({ date: -1 });

    // Get coordinator to check last report clear date
    const coordinator = await Coordinator.findOne({ teachers: req.user._id });

    // Calculate teacher attendance based on photos uploaded
    const attendancePhotos = teacher.attendancePhotos || [];
    const attendanceCount = attendancePhotos.length;

    // Calculate total days since last reset (using IST timezone)
    let totalDays = 0;
    if (coordinator && coordinator.lastReportClearDate) {
      const resetDate = getISTStartOfDay(coordinator.lastReportClearDate);
      const today = getISTStartOfDay(new Date());
      const diffTime = today - resetDate;
      totalDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    } else if (teacher.lastAttendanceResetDate) {
      const resetDate = getISTStartOfDay(teacher.lastAttendanceResetDate);
      const today = getISTStartOfDay(new Date());
      const diffTime = today - resetDate;
      totalDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    }

    // Calculate each student's attendance
    const studentAttendanceMap = {};
    teacher.students.forEach((student) => {
      studentAttendanceMap[student._id.toString()] = {
        student: student,
        totalClasses: 0,
        presentCount: 0,
        percentage: 0,
      };
    });

    // Count attendance for each student
    reports.forEach((report) => {
      report.studentAttendance.forEach((attendance) => {
        // Skip if student was deleted
        if (!attendance.student) {
          return;
        }
        const studentId = attendance.student._id.toString();
        if (studentAttendanceMap[studentId]) {
          studentAttendanceMap[studentId].totalClasses++;
          if (attendance.present) {
            studentAttendanceMap[studentId].presentCount++;
          }
        }
      });
    });

    // Calculate percentages
    Object.keys(studentAttendanceMap).forEach((studentId) => {
      const data = studentAttendanceMap[studentId];
      if (data.totalClasses > 0) {
        data.percentage = (
          (data.presentCount / data.totalClasses) *
          100
        ).toFixed(1);
      }
    });

    const studentAttendanceData = Object.values(studentAttendanceMap);

    res.render("teacher/home", {
      currUser: teacher,
      currentPage: "home",
      locale: req.cookies.locale || "en",
      teacherAttendance: {
        total: totalDays,
        present: attendanceCount,
      },
      studentAttendanceData: studentAttendanceData,
      reports: reports,
    });
  } catch (error) {
    console.error("Error loading teacher home:", error);
    res.status(500).send("Error loading home page");
  }
};

// Render add student page
module.exports.renderAddStudent = (req, res) => {
  res.render("teacher/addStudent", {
    currUser: req.user,
    username: req.user.username,
    path: req.user.picture.path,
    currentPage: "addStudent",
    locale: req.cookies.locale || "en",
  });
};

// Handle add student form submission
module.exports.addStudent = async (req, res) => {
  try {
    const { name } = req.body;
    const teacherId = req.user._id;

    // Check current number of active students
    const teacher = await Teacher.findById(teacherId).populate("students");
    const activeStudentCount = teacher.students.filter(
      (student) => student.active !== false,
    ).length;

    // Enforce 50 student limit
    if (activeStudentCount >= 50) {
      return res
        .status(400)
        .send("Maximum student limit reached. You can only have 50 students.");
    }

    // Create new student
    const newStudent = new Student({
      name: name,
      teacher: teacherId,
      active: true,
    });

    const savedStudent = await newStudent.save();

    // Add student to teacher's students array
    await Teacher.findByIdAndUpdate(teacherId, {
      $push: { students: savedStudent._id },
    });

    res.redirect("/teacher/home");
  } catch (error) {
    console.error("Error adding student:", error);
    res.status(500).send("Error adding student");
  }
};

// Render teacher report page (lecture submission)
module.exports.renderReport = async (req, res) => {
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
    console.error("Error loading teacher report:", error);
    res.status(500).send("Error loading report page");
  }
};

// Render teacher attendance page
module.exports.renderAttendance = async (req, res) => {
  try {
    const teacher = await Teacher.findById(req.user._id);
    const coordinator = await Coordinator.findOne({ teachers: req.user._id });

    // Get attendance photos sorted by date (latest first)
    const attendancePhotos = teacher.attendancePhotos
      ? teacher.attendancePhotos.sort(
          (a, b) => new Date(b.date) - new Date(a.date),
        )
      : [];

    // Calculate total days since last reset (using IST timezone)
    let totalDays = 0;
    if (coordinator && coordinator.lastReportClearDate) {
      const resetDate = getISTStartOfDay(coordinator.lastReportClearDate);
      const today = getISTStartOfDay(new Date());
      const diffTime = today - resetDate;
      totalDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    } else if (teacher.lastAttendanceResetDate) {
      const resetDate = getISTStartOfDay(teacher.lastAttendanceResetDate);
      const today = getISTStartOfDay(new Date());
      const diffTime = today - resetDate;
      totalDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    }

    res.render("teacher/attendance", {
      currUser: teacher,
      username: req.user.username,
      path: req.user.picture.path,
      currentPage: "attendance",
      locale: req.cookies.locale || "en",
      attendancePhotos: attendancePhotos,
      attendanceCount: attendancePhotos.length,
      totalDays: totalDays,
    });
  } catch (error) {
    console.error("Error loading attendance page:", error);
    res.status(500).send("Error loading attendance page");
  }
};

// Helper function to reverse geocode coordinates to address
const getAddressFromCoordinates = async (latitude, longitude) => {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
    );
    const data = await response.json();

    // Return address or coordinates if address not found
    if (data.address) {
      // Try to build a readable address with more precision
      const addressParts = [];

      // Add street-level details first (most specific)
      if (data.address.house_number)
        addressParts.push(data.address.house_number);
      if (data.address.road) addressParts.push(data.address.road);
      if (data.address.neighbourhood)
        addressParts.push(data.address.neighbourhood);
      if (data.address.suburb) addressParts.push(data.address.suburb);

      // Then add area details
      if (data.address.city) addressParts.push(data.address.city);
      if (data.address.district && data.address.district !== data.address.city)
        addressParts.push(data.address.district);
      if (data.address.state) addressParts.push(data.address.state);
      if (data.address.country) addressParts.push(data.address.country);

      if (addressParts.length > 0) {
        const readableAddress = addressParts.join(", ");
        // If address is detailed enough, use it; otherwise append coordinates
        if (addressParts.length > 2) {
          return readableAddress;
        } else {
          // For addresses with few parts, add precise coordinates
          return `${readableAddress} (${latitude.toFixed(6)}, ${longitude.toFixed(6)})`;
        }
      }
    }
    // Fallback to precise coordinates if no address found
    return `Location: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
  } catch (error) {
    console.error("Geocoding error:", error);
    return `Location: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
  }
};

// Handle attendance photo upload
module.exports.uploadAttendance = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send("Photo is required");
    }

    const teacherId = req.user._id;
    const { latitude, longitude } = req.body;

    // Get human-readable address from coordinates
    let location = null;
    if (latitude && longitude) {
      const address = await getAddressFromCoordinates(
        parseFloat(latitude),
        parseFloat(longitude),
      );
      location = {
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        address: address,
      };
    }

    const attendancePhoto = {
      date: new Date(),
      photo: {
        fieldname: req.file.fieldname,
        path: req.file.path,
      },
      location: location,
    };

    await Teacher.findByIdAndUpdate(teacherId, {
      $push: { attendancePhotos: attendancePhoto },
    });

    res.redirect("/teacher/attendance");
  } catch (error) {
    console.error("Error uploading attendance:", error);
    res.status(500).send("Error uploading attendance");
  }
};

// Render delete student page
module.exports.renderDeleteStudent = async (req, res) => {
  try {
    const teacher = await Teacher.findById(req.user._id).populate("students");

    // Filter out students that are marked as deleted (active: false)
    const activeStudents = teacher.students.filter(
      (student) => student.active !== false,
    );

    res.render("teacher/deleteStudent", {
      currUser: req.user,
      username: req.user.username,
      path: req.user.picture.path,
      currentPage: "deleteStudent",
      locale: req.cookies.locale || "en",
      students: activeStudents,
    });
  } catch (error) {
    console.error("Error loading delete student page:", error);
    res.status(500).send("Error loading page");
  }
};

// Handle student deletion (soft delete with 30-day cleanup)
module.exports.deleteStudent = async (req, res) => {
  try {
    const { studentId } = req.params;
    const teacherId = req.user._id;

    // Soft delete - mark student as inactive and record deletion date
    await Student.findByIdAndUpdate(studentId, {
      active: false,
      deletedAt: new Date(),
    });

    // Remove student from teacher's active students array
    await Teacher.findByIdAndUpdate(teacherId, {
      $pull: { students: studentId },
    });

    // Clean up students deleted more than 30 days ago
    await cleanupOldDeletedStudents();

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting student:", error);
    res.status(500).json({ success: false, error: "Error deleting student" });
  }
};

// Helper function to permanently delete students after 30 days
const cleanupOldDeletedStudents = async () => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Find and delete students that were marked deleted more than 30 days ago
    const result = await Student.deleteMany({
      active: false,
      deletedAt: { $lte: thirtyDaysAgo, $ne: null },
    });

    if (result.deletedCount > 0) {
      console.log(
        `Cleaned up ${result.deletedCount} students deleted more than 30 days ago`,
      );
    }
  } catch (error) {
    console.error("Error cleaning up old deleted students:", error);
  }
};
