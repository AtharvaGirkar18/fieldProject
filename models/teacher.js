const mongoose = require("mongoose");
const passportLocalMongoose = require("passport-local-mongoose");

const teacherSchema = new mongoose.Schema({
    picture: {
        fieldname: {
            type: String,
        },
        path: {
            type: String,
            set: (link) => link === "" ? "https://cdn-icons-png.flaticon.com/512/2784/2784488.png" : link,
        }        
    }
});
teacherSchema.plugin(passportLocalMongoose);

const Teacher = mongoose.model("Teacher", teacherSchema);

module.exports = Teacher;