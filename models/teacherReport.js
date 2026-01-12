const mongoose = require("mongoose");
const { Schema } = mongoose;
const Teacher = require("./teacher.js");

const teacherReportSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true,
  },
  time: {
    type: Date,
  },
  address: {
    type: String,
  },
  attendance: {
    type: String,
    min: 0,
  },
  attendanceCount: {
    type: Number,
    default: 0,
    min: 0,
  },
  teacherPresent: {
    type: Boolean,
    default: true,
  },
  studentAttendance: [
    {
      student: {
        type: Schema.Types.ObjectId,
        ref: "Student",
      },
      present: { type: Boolean, default: false },
    },
  ],
  activity: {
    type: String,
  },
  images: [
    {
      fieldname: {
        type: String,
      },
      path: {
        type: String,
        set: (link) =>
          link === ""
            ? "https://www.shutterstock.com/image-vector/sign-entry-exit-premises-pointer-260nw-1067407328.jpg"
            : link,
      },
    },
  ],
  teacher: {
    type: Schema.Types.ObjectId,
    ref: Teacher,
    required: true,
  },
});

const TeacherReport = mongoose.model("TeacherReport", teacherReportSchema);

module.exports = TeacherReport;
