const mongoose = require("mongoose");
const { Schema } = mongoose;
const Teacher = require("./teacher.js");
const passportLocalMongoose = require("passport-local-mongoose");
const TeacherReport = require("./teacherReport.js");

const coordinatorSchema = new mongoose.Schema({
  picture: {
    fieldname: {
      type: String,
    },
    path: {
      type: String,
      set: (link) =>
        link === ""
          ? "https://cdn-icons-png.flaticon.com/512/2784/2784488.png"
          : link,
    },
  },
  teachers: [
    {
      type: Schema.Types.ObjectId,
      ref: Teacher,
    },
  ],
  coordReport: {
    date: {
      type: Date,
    },
    teacherReports: [
      {
        _id: {
          type: Schema.Types.ObjectId,
          default: () => new mongoose.Types.ObjectId(),
        },
        tReportId: {
          type: Schema.Types.ObjectId,
          ref: TeacherReport,
        },
        teacher_name: {
          type: String,
        },
      },
    ],
  },
  lastReportClearDate: {
    type: Date,
    default: Date.now,
  },
  attendancePhotos: [
    {
      date: {
        type: Date,
        default: Date.now,
      },
      photo: {
        fieldname: {
          type: String,
        },
        path: {
          type: String,
        },
      },
      location: {
        latitude: Number,
        longitude: Number,
        address: String,
      },
    },
  ],
  lastAttendanceResetDate: {
    type: Date,
    default: null,
  },
});
coordinatorSchema.plugin(passportLocalMongoose);

const Coordinator = mongoose.model("Coordinator", coordinatorSchema);

module.exports = Coordinator;
