const mongoose = require("mongoose");
const passportLocalMongoose = require("passport-local-mongoose");

const { Schema } = mongoose;

const teacherSchema = new mongoose.Schema({
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
  students: [
    {
      type: Schema.Types.ObjectId,
      ref: "Student",
    },
  ],
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
      },
    },
  ],
  lastAttendanceResetDate: {
    type: Date,
    default: null,
  },
});
teacherSchema.plugin(passportLocalMongoose);

const Teacher = mongoose.model("Teacher", teacherSchema);

module.exports = Teacher;
