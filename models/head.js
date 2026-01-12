const mongoose = require("mongoose");
const {Schema} = mongoose;
const Coordinator = require("./coordinator.js");
const passportLocalMongoose = require("passport-local-mongoose");

const headSchema = new mongoose.Schema({
    picture: {
        fieldname: {
            type: String,
        },
        path: {
            type: String,
            set: (link) => link === "" ? "https://cdn-icons-png.flaticon.com/512/2784/2784488.png" : link,
        }        
    },
    coordinators: [{
        type: Schema.Types.ObjectId,
        ref: Coordinator
    }]
});
headSchema.plugin(passportLocalMongoose);

const Head = mongoose.model("Head", headSchema);

module.exports = Head;