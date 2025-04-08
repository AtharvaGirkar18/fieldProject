const cloudinary = require('cloudinary').v2;
const {CloudinaryStorage} = require('multer-storage-cloudinary');

cloudinary.config({
    cloud_name: process.env.CLOUD_NAME,
    api_key: process.env.API_KEY,
    api_secret: process.env.API_SECRET
});

const TeacherStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: 'Teachers',
      allowedFormats: ["png", "jpg", "jpeg"]
    },
  });

const CoordinatorStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
    folder: 'Coordinators',
    allowedFormats: ["png", "jpg", "jpeg"]
    },
});

const HeadStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
    folder: 'Heads',
    allowedFormats: ["png", "jpg", "jpeg"]
    },
});

const LectureStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
    folder: 'Lectures',
    allowedFormats: ['png', 'jpg', 'jpeg'], 
    },
});

module.exports = {
    cloudinary,
    TeacherStorage,
    CoordinatorStorage,
    HeadStorage,  
    LectureStorage,
}